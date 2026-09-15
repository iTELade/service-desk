import {readFileSync,writeFileSync} from 'node:fs';
const read=p=>readFileSync(p,'utf8');
const write=(p,s)=>writeFileSync(p,s);
function once(s,from,to,label){const n=s.split(from).length-1;if(n!==1)throw new Error(`${label}: expected one match, got ${n}`);return s.replace(from,to);}

let p=read('lib/projects.mjs');
p=once(p,
"  const githubIdentity=user=>Boolean(user&&db.prepare(\"SELECT 1 FROM sso_subjects s JOIN sso_providers p ON p.id=s.provider_id WHERE s.user_id=? AND p.enabled=1 AND lower(rtrim(p.issuer,'/'))='https://github.com' LIMIT 1\").get(user.id));\n  const publicReadable=p=>Boolean(p&&p.project_type==='external'&&p.portal_access==='public_github'&&!p.archived);",
"  const githubIdentity=user=>Boolean(user&&db.prepare(\"SELECT 1 FROM sso_subjects s JOIN sso_providers p ON p.id=s.provider_id WHERE s.user_id=? AND p.enabled=1 AND lower(rtrim(p.issuer,'/'))='https://github.com' LIMIT 1\").get(user.id));\n  const projectSettings=p=>{try{return JSON.parse(p?.settings||'{}');}catch{return {};}};\n  const publicReadable=p=>Boolean(p&&p.project_type==='external'&&projectSettings(p).public_github===true&&!p.archived);",
'public flag storage');
p=once(p,
"    if(p.portal_access==='public_github')return githubIdentity(user);\n    if(p.portal_access==='internal')return Boolean(user.is_internal);",
"    if(publicReadable(p))return githubIdentity(user);\n    if(p.portal_access==='internal')return Boolean(user.is_internal);",
'public access check');
p=once(p,
"    out.portal_access=choice(out.portal_access??'members',['members','internal','authenticated','public_github'],'dostęp do portalu');",
"    const requestedPortal=b.portal_access??(old&&projectSettings(old).public_github?'public_github':out.portal_access??'members');\n    const publicGithub=out.project_type==='external'&&requestedPortal==='public_github';\n    out.portal_access=choice(publicGithub?'members':requestedPortal,['members','internal','authenticated'],'dostęp do portalu');\n    let projectCfg=projectSettings(old||out);projectCfg={...projectCfg,public_github:publicGithub};out.settings=JSON.stringify(projectCfg);",
'public access persistence');
p=once(p,
"  const fields=['key','name','description','project_type','portal_access','portal_slug','portal_title','portal_description','next_number','number_padding','request_types','sla_policy','archived','module_type'];",
"  const fields=['key','name','description','project_type','portal_access','portal_slug','portal_title','portal_description','next_number','number_padding','request_types','sla_policy','archived','module_type','settings'];",
'settings persistence');
p=once(p,
"    return {...p,project_type:p.module_type==='assets'?'assets':p.project_type,settings:JSON.parse(p.settings||'{}'),workflow_statuses:workflow.statuses,request_types:JSON.parse(p.request_types),sla_policy:JSON.parse(p.sla_policy),archived:Boolean(p.archived),can_work:canWork(user,p),can_manage:canManage(user,p),can_request:canPortal(user,p)&&!p.archived&&Boolean(db.prepare('SELECT id FROM request_types WHERE project_id=? AND enabled=1 AND portal_visible=1 LIMIT 1').get(p.id)),member_role:memberRole(user,p)};",
"    return {...p,project_type:p.module_type==='assets'?'assets':p.project_type,portal_access:publicReadable(p)?'public_github':p.portal_access,settings:projectSettings(p),workflow_statuses:workflow.statuses,request_types:JSON.parse(p.request_types),sla_policy:JSON.parse(p.sla_policy),archived:Boolean(p.archived),can_work:canWork(user,p),can_manage:canManage(user,p),can_request:canPortal(user,p)&&!p.archived&&Boolean(db.prepare('SELECT id FROM request_types WHERE project_id=? AND enabled=1 AND portal_visible=1 LIMIT 1').get(p.id)),member_role:memberRole(user,p)};",
'public access view');
write('lib/projects.mjs',p);

let t=read('tests/public-github-project.test.mjs');
t=t.replace("assert.match(server,/\\/api\\/public\\/portals/);","assert.match(server,/publicPortal=pathname\\.match/);");
write('tests/public-github-project.test.mjs',t);

for(const file of ['tests/settings-center-race.test.mjs','tests/settings-route-regression.test.mjs','tests/settings-static-assets.test.mjs']){
  let s=read(file);s=s.replaceAll('1.1.0','1.1.1').replaceAll('1\\.1\\.0','1\\.1\\.1');write(file,s);
}
console.log('Applied schema-compatible 1.1.1 follow-up patches.');
