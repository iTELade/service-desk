from pathlib import Path
import json,re

def replace(path,old,new,count=None):
    p=Path(path); s=p.read_text()
    if old not in s: raise SystemExit(f'anchor missing in {path}: {old[:100]!r}')
    s=s.replace(old,new, count if count is not None else -1)
    p.write_text(s)

# Version and package metadata.
Path('lib/version.mjs').write_text("export const VERSION='1.1.0';\nexport const SCHEMA_VERSION=8;\n")
p=json.loads(Path('package.json').read_text()); p['version']='1.1.0'; Path('package.json').write_text(json.dumps(p,ensure_ascii=False,indent=2)+'\n')
lock=json.loads(Path('package-lock.json').read_text()); lock['version']='1.1.0'; lock['packages']['']['version']='1.1.0'; Path('package-lock.json').write_text(json.dumps(lock,ensure_ascii=False,indent=2)+'\n')
replace('public/index.html','1.0.8','1.1.0')
for t in Path('tests').glob('*.mjs'):
    s=t.read_text()
    if '1.0.8' in s: t.write_text(s.replace('1.0.8','1.1.0'))

# Email intake: new channels accept unknown senders by default. Existing explicit false remains respected.
replace('lib/mail.mjs',"allow_new_senders:boolean(c.allow_new_senders??false,'Nowi nadawcy')","allow_new_senders:boolean(c.allow_new_senders??true,'Nowi nadawcy')")
replace('lib/mail.mjs',"function enqueue(channel,to,subject,body,ticketId=null,internal=false){\n    const messageId=","function enqueue(channel,to,subject,body,ticketId=null,internal=false){\n    if(String(to||'').toLowerCase().endsWith('.invalid'))return;\n    const messageId=")

# GitHub import: actual GitHub author becomes reporter. Configured account remains technical creator/fallback.
p=Path('lib/v8.mjs'); s=p.read_text()
s=s.replace("import {randomBytes} from 'node:crypto';","import {randomBytes,createHash} from 'node:crypto';")
s=s.replace("import {now,fail,text,integer,boolean,txFor} from './core.mjs';","import {now,fail,text,email,integer,boolean,txFor} from './core.mjs';\nimport {username,parts} from './usernames.mjs';")
s=s.replace("export function createV8(db,{projects,desk,workflows,catalog,dataDir,origin,fetcher=fetch}){","export function createV8(db,{projects,desk,workflows,catalog,accounts,dataDir,origin,fetcher=fetch}){")
pattern=r"  function createGithubTicket\(c,issue\)\{[\s\S]*?\n  \}\n  async function finalizeGithub"
new="""  function githubSsoProvider(){
    return db.prepare(\"SELECT * FROM sso_providers WHERE enabled=1 AND lower(rtrim(issuer,'/'))='https://github.com' ORDER BY id LIMIT 1\").get();
  }
  function githubName(profile,login){const n=parts(String(profile?.name||login||'GitHub user').slice(0,100));return {first:n.first_name||String(login||'GitHub').slice(0,60),last:n.last_name,name:(n.first_name+' '+n.last_name).trim()||String(login||'GitHub user')};}
  async function githubIssueReporter(c,issue,p,serviceActor){
    const githubId=Number(issue?.user?.id),login=String(issue?.user?.login||'').trim();
    if(!Number.isSafeInteger(githubId)||githubId<=0||!login)return serviceActor;
    const provider=githubSsoProvider();
    if(provider){
      const mapped=db.prepare('SELECT u.* FROM sso_subjects s JOIN users u ON u.id=s.user_id WHERE s.provider_id=? AND s.subject=?').get(provider.id,String(githubId));
      if(mapped){if(!mapped.active||!mapped.directory_active||mapped.account_kind!=='human'||mapped.registration_state!=='active')throw new Error('GitHub author is mapped to a disabled Service Desk account.');db.prepare(\"INSERT OR IGNORE INTO project_members(project_id,user_id,role) VALUES(?,?,'requester')\").run(p.id,mapped.id);return mapped;}
    }
    const profile=await githubRequest(c,`/users/${encodeURIComponent(login)}`);let publicEmail=null;try{if(profile?.email)publicEmail=email(profile.email);}catch{}
    const collision=publicEmail?db.prepare('SELECT id FROM users WHERE email=?').get(publicEmail):null,n=githubName(profile,login),un=username(db,n.first,n.last),stamp=now();
    let id;
    if(provider){
      const address=publicEmail&&!collision?publicEmail:`github-${githubId}@users.noreply.invalid`;
      id=Number(db.prepare(\"INSERT INTO users(email,name,first_name,last_name,username,password,role,must_change,registration_state,email_verified,sso_only,created_at) VALUES(?,?,?,?,?,'!github','customer',0,'active',?,1,?)\").run(address,n.name,n.first,n.last,un,Number(Boolean(publicEmail&&!collision)),stamp).lastInsertRowid);
      db.prepare('INSERT INTO sso_subjects(provider_id,subject,user_id) VALUES(?,?,?)').run(provider.id,String(githubId),id);
    }else{
      if(!accounts?.settings?.().smtp_configured||!publicEmail||collision)throw new Error('Nie można utworzyć dostępu autora GitHub. Skonfiguruj dostawcę SSO GitHub (issuer https://github.com) albo SMTP i publiczny, unikalny e-mail autora GitHub.');
      id=Number(db.prepare(\"INSERT INTO users(email,name,first_name,last_name,username,password,role,must_change,registration_state,email_verified,sso_only,created_at) VALUES(?,?,?,?,?,'!invited','customer',0,'pending_email',0,0,?)\").run(publicEmail,n.name,n.first,n.last,un,stamp).lastInsertRowid);
      const token=randomBytes(32).toString('hex');db.prepare(\"INSERT INTO identity_tokens VALUES(?,?,'invite','{}',?,0)\").run(createHash('sha256').update(token).digest('hex'),id,Date.now()+48*3600000);
      accounts.queue(publicEmail,'Dostęp do '+accounts.settings().brand_name,'Twoje zgłoszenie GitHub zostało przeniesione do Service Desk. Ustaw hasło i aktywuj konto:\\n'+origin+'/#/invite/'+token);
    }
    db.prepare(\"INSERT OR IGNORE INTO project_members(project_id,user_id,role) VALUES(?,?,'requester')\").run(p.id,id);
    const user=db.prepare('SELECT * FROM users WHERE id=?').get(id);projects.audit(p.id,serviceActor,'github.account_provisioned',{user_id:id,github_user_id:githubId,github_login:login,login_method:provider?'github_sso':'email_invite'});return user;
  }
  async function createGithubTicket(c,issue){
    const p=projects.project(c.project_id),serviceActor=db.prepare('SELECT * FROM users WHERE id=?').get(c.reporter_id),form=db.prepare('SELECT * FROM request_types WHERE id=?').get(c.request_type_id);
    if(!p||!serviceActor||!form)throw new Error('GitHub integration references missing project, reporter or request type.');
    const reporter=await githubIssueReporter(c,issue,p,serviceActor);
    const description=`GitHub source: ${c.owner}/${c.repo}#${issue.number}\\nGitHub issue ID: ${issue.id}\\nGitHub issue: ${issue.html_url}\\nAuthor: @${issue.user?.login||'unknown'}\\n\\n${issue.body||''}`.slice(0,20000);
    const prepared=catalog.prepare(p,{title:String(issue.title||'GitHub issue').slice(0,200),description,priority:githubPriority(c,issue),request_type_id:form.id,request_type_version:form.version,custom_values:{}},false);
    const n=p.next_number;if(n>2000000000)throw new Error('Project numbering exhausted.');const stamp=now(),initial=workflows.start(p);
    return tx(()=>{db.prepare('UPDATE projects SET next_number=next_number+1,version=version+1 WHERE id=?').run(p.id);
      const id=Number(db.prepare(`INSERT INTO tickets(project_id,key,number,title,description,type,priority,status,workflow_status,reporter_id,created_by,created_at,updated_at,request_type_id,form_snapshot,custom_values,origin) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'github')`).run(p.id,projects.issueKey(p,n),n,prepared.title,prepared.description,prepared.type,prepared.priority,initial.category,initial.key,reporter.id,serviceActor.id,stamp,stamp,prepared.id,prepared.snapshot,prepared.values).lastInsertRowid);
      const t=desk.ticket(id);workflows.run(t,'ticket_created',serviceActor);projects.audit(p.id,serviceActor,'github.issue_imported',{ticket_id:id,reporter_id:reporter.id,github_user_id:issue.user?.id,issue_id:issue.id,issue_number:issue.number,issue_url:issue.html_url,repository:`${c.owner}/${c.repo}`});return t;});
  }
  async function finalizeGithub"""
s2,nsub=re.subn(pattern,lambda _m:new,s,count=1)
if nsub!=1: raise SystemExit('createGithubTicket block not found')
s2=s2.replace('let t;try{t=createGithubTicket(c,issue);}','let t;try{t=await createGithubTicket(c,issue);}')
p.write_text(s2)

# UI wording.
p=Path('public/settings-center.js'); s=p.read_text(); s=s.replace('Reporter / service account','Konto techniczne / twórca importu'); p.write_text(s)

Path('tests/github-auto-account.test.mjs').write_text(r'''import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {migrateV8} from '../lib/migration-v8.mjs';
import {createCatalog} from '../lib/catalog.mjs';
import {createWorkflows} from '../lib/workflows.mjs';
import {createDesk} from '../lib/desk.mjs';
import {createV8} from '../lib/v8.mjs';
function response(code,value){return {ok:code>=200&&code<300,status:code,async text(){return JSON.stringify(value);}};}
function setup(){const f=fixture();migrateV8(f.db);const catalog=createCatalog(f.db,f.projects),workflows=createWorkflows(f.db,f.projects),desk=createDesk(f.db,f.projects,catalog,workflows);const p=f.projects.create({key:'GHA',name:'GitHub Auto',project_type:'external',portal_access:'authenticated'},f.admin),rt=f.db.prepare('SELECT * FROM request_types WHERE project_id=? AND enabled=1 ORDER BY id LIMIT 1').get(p.id);f.db.prepare("INSERT INTO sso_providers(name,issuer,client_id,secret,config,enabled) VALUES('GitHub','https://github.com/','client','secret','{\"auto_create\":false,\"allowed_domains\":[],\"provider_type\":\"github\"}',1)").run();let closed=0,commented=0;const issue={id:9001,number:77,title:'Broken login',body:'Please fix',html_url:'https://github.com/acme/widget/issues/77',labels:[],user:{id:12345,login:'alice'}};const fetcher=async(url,opt={})=>{if(url.includes('/issues?'))return response(200,[issue]);if(url.endsWith('/users/alice'))return response(200,{id:12345,login:'alice',name:'Alice Example',email:null});if(url.endsWith('/issues/77/comments')){commented++;return response(201,{});}if(url.endsWith('/issues/77')&&opt.method==='PATCH'){closed++;return response(200,{});}return response(200,{full_name:'acme/widget'});};const v8=createV8(f.db,{projects:f.projects,desk,workflows,catalog,accounts:{settings:()=>({smtp_configured:false})},dataDir:f.dataDir,origin:'https://desk.example.test',fetcher});const body={name:'GitHub intake',owner:'acme',repo:'widget',project_id:p.id,request_type_id:rt.id,reporter_id:f.admin.id,token:'github-token-test',label_priority:{},comment_template:'Moved: {ticket_url}',poll_minutes:5,enabled:true};return Promise.resolve(v8.handle('POST','/api/desk/v8/github',f.admin,new URLSearchParams(),async()=>body)).then(()=>({...f,p,rt,v8,workflows,getCounts:()=>({closed,commented}),close(){workflows.automation.stop();f.close();}}));}
test('GitHub Issue auto-creates a customer account mapped to immutable GitHub user id',async()=>{const f=await setup();try{await f.v8.background();const map=f.db.prepare("SELECT s.subject,u.* FROM sso_subjects s JOIN sso_providers p ON p.id=s.provider_id JOIN users u ON u.id=s.user_id WHERE p.issuer='https://github.com/'").get();assert.equal(map.subject,'12345');assert.equal(map.role,'customer');assert.equal(map.sso_only,1);assert.equal(map.registration_state,'active');assert.match(map.email,/\.invalid$/);const ticket=f.db.prepare("SELECT * FROM tickets WHERE origin='github'").get();assert.equal(ticket.reporter_id,map.id);assert.equal(ticket.created_by,f.admin.id);assert.ok(f.db.prepare("SELECT 1 FROM project_members WHERE project_id=? AND user_id=? AND role='requester'").get(f.p.id,map.id));assert.deepEqual(f.getCounts(),{closed:1,commented:1});}finally{f.close();}});
''')
Path('tests/github-oauth.test.mjs').write_text(r'''import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {createSso} from '../lib/sso.mjs';
test('GitHub OAuth provider logs in an account pre-provisioned by GitHub Issues and refreshes verified email',async()=>{const f=fixture();try{let calls=[];const fetcher=async(url,opt={})=>{calls.push(url);if(url.includes('/login/oauth/access_token'))return {ok:true,status:200,async text(){return JSON.stringify({access_token:'oauth-token'});}};if(url.endsWith('/user/emails'))return {ok:true,status:200,async text(){return JSON.stringify([{email:'alice@example.test',primary:true,verified:true}]);}};if(url.endsWith('/user'))return {ok:true,status:200,async text(){return JSON.stringify({id:12345,login:'alice',name:'Alice Example'});}};throw Error('unexpected '+url);};const sso=createSso(f.db,f.projects,{origin:'https://desk.example.test',dataDir:f.dataDir,fetcher});const provider=sso.save(null,{name:'GitHub',issuer:'https://github.com',client_id:'client-id',client_secret:'client-secret',enabled:true,config:{auto_create:false,allowed_domains:[]}},f.admin);const id=Number(f.db.prepare("INSERT INTO users(email,name,first_name,last_name,username,password,role,must_change,sso_only,email_verified,created_at) VALUES('github-12345@users.noreply.invalid','Alice Example','Alice','Example','alicegh','!github','customer',0,1,0,?)").run(new Date().toISOString()).lastInsertRowid);f.db.prepare('INSERT INTO sso_subjects(provider_id,subject,user_id) VALUES(?,?,?)').run(provider.id,'12345',id);const start=await sso.begin(provider.id),auth=new URL(start.url);assert.equal(auth.hostname,'github.com');assert.match(auth.searchParams.get('scope'),/user:email/);const callback=new URL('https://desk.example.test/api/sso/callback');callback.searchParams.set('state',auth.searchParams.get('state'));callback.searchParams.set('code','code-1');const u=await sso.callback(callback,start.browser);assert.equal(u.id,id);assert.equal(f.db.prepare('SELECT email FROM users WHERE id=?').get(id).email,'alice@example.test');assert.ok(calls.some(x=>x.endsWith('/user/emails')));}finally{f.close();}});
''')
Path('tests/mail-auto-account-1.1.test.mjs').write_text(r'''import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('1.1 email intake defaults new-sender account provisioning on and keeps one-time invite flow',()=>{const src=readFileSync(new URL('../lib/mail.mjs',import.meta.url),'utf8');assert.match(src,/allow_new_senders:boolean\(c\.allow_new_senders\?\?true/);assert.match(src,/pending_email/);assert.match(src,/identity_tokens VALUES\(\?,\?,'invite'/);assert.match(src,/\/#\/invite\//);});
''')

Path('RELEASE_NOTES_1.1.0.md').write_text("""# Service Desk 1.1.0

## Automatic requester accounts

- Inbound email can automatically create a customer account for an unknown sender, add project membership, create the ticket under that requester and send a one-time account invitation. New mail channels enable this behavior by default; domain/project access restrictions remain enforced.
- GitHub Issues now use the actual GitHub author as the Service Desk reporter. The configured account remains the technical creator/fallback so audit history still records the integration actor.
- With a GitHub SSO provider configured using issuer `https://github.com`, a first Issue automatically provisions a passwordless customer account mapped to the immutable GitHub user ID. The customer signs in with GitHub from the normal Service Desk login page.
- If GitHub SSO is not configured, a public unique GitHub email plus working SMTP can be used to send a one-time local account invitation. If neither secure login path is available, the Issue is left open and the integration reports the configuration error instead of creating an unusable account.

## GitHub OAuth

The existing SSO provider screen now accepts `https://github.com` as a GitHub OAuth provider. Configure a GitHub OAuth App with callback URL `<APP_URL>/api/sso/callback`, Client ID and Client Secret. The login flow requests `read:user user:email` and links by immutable GitHub user ID, never by email alone.

Database schema remains **8**. No migration is required.
""")
ch=Path('CHANGELOG.md'); ch.write_text('## 1.1.0\n\n- Automatic requester account provisioning for inbound email and GitHub Issues.\n- GitHub OAuth login through the existing SSO provider model (`https://github.com`).\n- GitHub-imported tickets keep the integration account as `created_by` while the actual GitHub author becomes `reporter_id`.\n\n'+ch.read_text())
readme=Path('README.md'); readme.write_text(readme.read_text()+'''\n\n### Automatic requester provisioning (1.1)\n\nInbound email and GitHub Issues can create missing customer accounts automatically. Email-created accounts receive a one-time invitation. GitHub-created accounts are preferably mapped to a GitHub OAuth SSO provider configured with issuer `https://github.com`; the OAuth App callback is `<APP_URL>/api/sso/callback`. GitHub identities are linked by immutable numeric user ID, not by email address.\n''')
modules=Path('MODULES.md'); modules.write_text(modules.read_text()+'''\n\n## GitHub OAuth for imported requesters (1.1)\n\nTo let people whose account was created from a GitHub Issue sign in directly, create an SSO provider with issuer `https://github.com`, the OAuth App Client ID/Secret, and callback `<APP_URL>/api/sso/callback`. Service Desk maps the GitHub numeric user ID into `sso_subjects`; email is only refreshed after GitHub returns a verified address during OAuth login.\n''')
