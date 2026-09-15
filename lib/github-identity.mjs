import {randomBytes,createHash} from 'node:crypto';
import {fail,now,text,boolean,txFor} from './core.mjs';
import {secretStore} from './secrets.mjs';
import {parts,username} from './usernames.mjs';

const hash=v=>createHash('sha256').update(String(v)).digest('hex');
const placeholderEmail=id=>`github-${id}@identity.github.invalid`;

export function createGithubIdentity(db,projects,{origin,dataDir,clock=Date.now,fetcher=fetch}={}){
  const tx=txFor(db),secrets=secretStore(dataDir);
  const admin=u=>{if(u?.role!=='admin')fail(403,'Wymagany Global Administrator.');};
  const configRow=()=>db.prepare('SELECT * FROM github_identity_config WHERE id=1').get();
  const output=r=>({enabled:Boolean(r.enabled),client_id:r.client_id,has_secret:Boolean(r.secret),version:r.version,callback_url:origin+'/api/github/login/callback'});

  function settings(u){admin(u);return output(configRow());}
  function publicConfig(){const r=configRow();return {enabled:Boolean(r?.enabled&&r.client_id&&r.secret),callback_url:origin+'/api/github/login/callback'};}
  function save(b,u){
    admin(u);const old=configRow();if(Number(b.version)!==old.version)fail(409,'Konfiguracja logowania GitHub została zmieniona.');
    const clientId=text(String(b.client_id||''),'GitHub OAuth Client ID',b.enabled?1:0,300);
    const secret=b.client_secret?secrets.seal(text(b.client_secret,'GitHub OAuth Client Secret',1,4000)):old.secret;
    if(b.enabled&&!secret)fail(400,'Uzupełnij GitHub OAuth Client Secret.');
    db.prepare('UPDATE github_identity_config SET client_id=?,secret=?,enabled=?,version=version+1,updated_at=? WHERE id=1').run(clientId,secret,Number(boolean(Boolean(b.enabled),'GitHub OAuth aktywne')),now());
    projects.audit(null,u,'github.identity_configured',{enabled:Boolean(b.enabled)});return output(configRow());
  }

  function uniqueUsername(login){
    const candidate=String(login||'github').toLowerCase().replace(/[^a-z0-9._-]/g,'').slice(0,80);
    if(candidate.length>=2&&!db.prepare('SELECT id FROM users WHERE username=?').get(candidate))return candidate;
    return username(db,candidate.replace(/[^a-z0-9]/g,'')||'github','user');
  }
  function usableEmail(value){
    value=String(value||'').trim().toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)?value:null;
  }
  function mapped(githubId){return db.prepare('SELECT g.*,u.* FROM github_identities g JOIN users u ON u.id=g.user_id WHERE g.github_user_id=?').get(Number(githubId));}

  function provisionIssue(issue,profile,projectId){
    const githubId=Number(issue?.user?.id);const login=String(issue?.user?.login||'').trim();
    if(!Number.isSafeInteger(githubId)||githubId<=0||!login)fail(502,'GitHub nie zwrócił stabilnej tożsamości autora zgłoszenia.');
    const existing=mapped(githubId);
    if(existing){
      db.prepare('UPDATE github_identities SET github_login=?,updated_at=? WHERE github_user_id=?').run(login,now(),githubId);
      db.prepare("INSERT OR IGNORE INTO project_members(project_id,user_id,role) VALUES(?,?,'requester')").run(projectId,existing.user_id);
      return db.prepare('SELECT * FROM users WHERE id=?').get(existing.user_id);
    }
    const display=text(String(profile?.name||login),'Nazwa użytkownika GitHub',1,100),name=parts(display),publicEmail=usableEmail(profile?.email);
    const email=publicEmail&&!db.prepare('SELECT id FROM users WHERE email=?').get(publicEmail)?publicEmail:placeholderEmail(githubId);
    return tx(()=>{
      const id=Number(db.prepare(`INSERT INTO users(email,name,first_name,last_name,username,password,role,must_change,registration_state,email_verified,sso_only,created_at)
        VALUES(?,?,?,?,?,'!github','customer',0,'active',?,1,?)`).run(email,(name.first_name+' '+name.last_name).trim()||login,name.first_name||login,name.last_name,uniqueUsername(login),Number(Boolean(publicEmail&&email===publicEmail)),now()).lastInsertRowid);
      db.prepare('INSERT INTO github_identities(github_user_id,github_login,user_id,created_at,updated_at) VALUES(?,?,?,?,?)').run(githubId,login,id,now(),now());
      db.prepare("INSERT OR IGNORE INTO project_members(project_id,user_id,role) VALUES(?,?,'requester')").run(projectId,id);
      const user=db.prepare('SELECT * FROM users WHERE id=?').get(id);projects.audit(projectId,user,'github.account_created',{github_user_id:githubId,github_login:login,email_public:Boolean(publicEmail)});return user;
    });
  }

  async function begin(){
    const cfg=configRow();if(!cfg?.enabled||!cfg.client_id||!cfg.secret)fail(404,'Logowanie GitHub nie jest skonfigurowane.');
    const state=randomBytes(32).toString('hex'),browser=randomBytes(32).toString('hex');
    db.prepare('DELETE FROM github_oauth_states WHERE expires_at<?').run(clock());
    db.prepare('INSERT INTO github_oauth_states(state,payload,expires_at) VALUES(?,?,?)').run(hash(state),secrets.seal(JSON.stringify({state,browser:hash(browser),version:cfg.version})),clock()+600000);
    const url=new URL('https://github.com/login/oauth/authorize');url.searchParams.set('client_id',cfg.client_id);url.searchParams.set('redirect_uri',origin+'/api/github/login/callback');url.searchParams.set('scope','read:user user:email');url.searchParams.set('state',state);return {url:url.href,browser};
  }
  async function request(url,options={}){
    const res=await fetcher(url,{...options,headers:{Accept:'application/json','User-Agent':'iTELade-Service-Desk',...(options.headers||{})},signal:AbortSignal.timeout(10000)});
    const raw=await res.text();let body={};try{body=raw?JSON.parse(raw):{};}catch{body={};}
    if(!res.ok)fail(502,`GitHub OAuth ${res.status}: ${String(raw).slice(0,180)}`);return body;
  }
  async function callback(url,browser){
    const state=url.searchParams.get('state'),code=url.searchParams.get('code');if(!state||!code||!browser)fail(400,'Brak lub nieprawidłowa sesja logowania GitHub.');
    const r=db.prepare('SELECT * FROM github_oauth_states WHERE state=? AND expires_at>?').get(hash(state),clock());if(!r)fail(400,'Sesja logowania GitHub wygasła lub została wykorzystana.');
    const saved=JSON.parse(secrets.open(r.payload));if(saved.state!==state||saved.browser!==hash(browser))fail(403,'Odpowiedź GitHub nie należy do tej przeglądarki.');db.prepare('DELETE FROM github_oauth_states WHERE state=?').run(r.state);
    const cfg=configRow();if(!cfg?.enabled||cfg.version!==saved.version)fail(409,'Konfiguracja GitHub OAuth zmieniła się. Rozpocznij logowanie ponownie.');
    const token=await request('https://github.com/login/oauth/access_token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:cfg.client_id,client_secret:secrets.open(cfg.secret),code,redirect_uri:origin+'/api/github/login/callback',state}).toString()});
    if(!token.access_token)fail(403,'GitHub nie zwrócił tokenu logowania.');const auth={Authorization:`Bearer ${token.access_token}`};
    const profile=await request('https://api.github.com/user',{headers:auth});const githubId=Number(profile.id);if(!Number.isSafeInteger(githubId)||githubId<=0)fail(403,'GitHub nie zwrócił identyfikatora użytkownika.');
    const identity=mapped(githubId);if(!identity)fail(403,'To konto GitHub nie ma jeszcze zgłoszenia w Service Desk. Utwórz Issue w połączonym repozytorium.');
    let verifiedEmail=null;try{const emails=await request('https://api.github.com/user/emails',{headers:auth});verifiedEmail=Array.isArray(emails)?emails.find(x=>x.primary&&x.verified)?.email||emails.find(x=>x.verified)?.email:null;}catch{}
    const mail=usableEmail(verifiedEmail);if(mail&&!db.prepare('SELECT id FROM users WHERE email=? AND id<>?').get(mail,identity.user_id))db.prepare('UPDATE users SET email=?,email_verified=1,version=version+1 WHERE id=?').run(mail,identity.user_id);
    db.prepare('UPDATE github_identities SET github_login=?,updated_at=? WHERE github_user_id=?').run(text(String(profile.login||identity.github_login),'GitHub login',1,100),now(),githubId);
    const user=db.prepare('SELECT * FROM users WHERE id=?').get(identity.user_id);if(!user?.active||!user.directory_active||user.registration_state!=='active'||user.account_kind!=='human')fail(403,'Konto Service Desk jest wyłączone.');projects.audit(null,user,'github.login',{github_user_id:githubId});return user;
  }

  return {settings,save,publicConfig,provisionIssue,begin,callback};
}
