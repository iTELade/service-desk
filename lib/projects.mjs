import { now,fail,txFor,text,choice,integer,boolean,defaultSla,validateSla,roleRank } from './core.mjs';
import {seedRequestTypes} from './catalog.mjs';
import {seedWorkflow} from './workflows.mjs';
export function createProjects(db){
  const tx=txFor(db);
  const project=id=>db.prepare('SELECT * FROM projects WHERE id=?').get(id);
  const audit=(id,user,action,details)=>db.prepare('INSERT INTO audit_events(project_id,actor_id,action,details,created_at) VALUES(?,?,?,?,?)').run(id,user?.id??null,action,JSON.stringify(details),now());
  function memberRole(user,p){
    if(user.role==='admin')return 'manager';
    const rows=db.prepare('SELECT role FROM project_members WHERE project_id=? AND user_id=?').all(p.id,user.id);
    return rows.sort((a,b)=>roleRank[b.role]-roleRank[a.role])[0]?.role || null;
  }
  function canWork(user,p){return user.role==='admin'||(user.role==='agent'&&['manager','agent'].includes(memberRole(user,p)));}
  function canManage(user,p){return user.role==='admin'||(user.role==='agent'&&memberRole(user,p)==='manager');}
  const githubIdentity=user=>Boolean(user&&db.prepare("SELECT 1 FROM sso_subjects s JOIN sso_providers p ON p.id=s.provider_id WHERE s.user_id=? AND p.enabled=1 AND lower(rtrim(p.issuer,'/'))='https://github.com' LIMIT 1").get(user.id));
  const projectSettings=p=>{try{return JSON.parse(p?.settings||'{}');}catch{return {};}};
  const publicReadable=p=>Boolean(p&&p.project_type==='external'&&projectSettings(p).public_github===true&&!p.archived);
  function canPortal(user,p){
    if(p.project_type!=='external')return false;
    if(user.role==='admin')return true;
    if(canWork(user,p))return true;
    if(publicReadable(p))return githubIdentity(user);
    if(p.portal_access==='internal')return Boolean(user.is_internal);
    if(p.portal_access==='authenticated'){
      if(user.sso_only&&githubIdentity(user))return Boolean(memberRole(user,p));
      return true;
    }
    return Boolean(memberRole(user,p)||db.prepare('SELECT 1 FROM organization_members m JOIN project_organizations po ON po.organization_id=m.organization_id WHERE m.user_id=? AND po.project_id=?').get(user.id,p.id));
  }
  const organizationAccess=(user,p,t)=>Boolean(t.organization_id&&db.prepare('SELECT o.id FROM organizations o JOIN organization_members m ON m.organization_id=o.id JOIN project_organizations po ON po.organization_id=o.id WHERE o.id=? AND m.user_id=? AND po.project_id=? AND o.share_tickets=1').get(t.organization_id,user.id,p.id));
  const canRead=(user,p,t)=>Boolean(t&&p&&!t.deleted_at&&(canWork(user,p)||(publicReadable(p)&&githubIdentity(user))||((t.reporter_id===user.id||organizationAccess(user,p,t))&&canPortal(user,p))));
  function requireProject(id,user,management=false){
    const p=project(integer(Number(id),'Projekt'));
    if(!p||!(management?canManage(user,p):canWork(user,p)))fail(404,'Nie znaleziono projektu.');
    return p;
  }
  function view(p,user){
    const workflow=JSON.parse(db.prepare('SELECT config FROM project_workflows WHERE project_id=?').get(p.id).config);
    return {...p,project_type:p.module_type==='assets'?'assets':p.project_type,portal_access:publicReadable(p)?'public_github':p.portal_access,settings:projectSettings(p),workflow_statuses:workflow.statuses,request_types:JSON.parse(p.request_types),sla_policy:JSON.parse(p.sla_policy),archived:Boolean(p.archived),can_work:canWork(user,p),can_manage:canManage(user,p),can_request:canPortal(user,p)&&!p.archived&&Boolean(db.prepare('SELECT id FROM request_types WHERE project_id=? AND enabled=1 AND portal_visible=1 LIMIT 1').get(p.id)),member_role:memberRole(user,p)};
  }
  function list(user){return db.prepare('SELECT * FROM projects ORDER BY archived,name').all().filter(p=>canWork(user,p)||canPortal(user,p)).map(p=>view(p,user));}
  function ticketScope(user,{own=false}={}){
    const visible=list(user), work=own?[]:visible.filter(p=>p.can_work).map(p=>p.id), portal=visible.filter(p=>canPortal(user,p)).map(p=>p.id);
    return {sql:`(t.project_id IN (${work.join(',')||'NULL'}) OR ((t.reporter_id=? OR EXISTS(SELECT 1 FROM organization_members om JOIN organizations o ON o.id=om.organization_id JOIN project_organizations po ON po.organization_id=o.id WHERE om.user_id=? AND o.share_tickets=1 AND o.id=t.organization_id AND po.project_id=t.project_id)) AND t.project_id IN (${portal.join(',')||'NULL'})))`,values:[user.id,user.id]};
  }
  function config(b,old){
    const out={...old,...b};
    out.key=text(out.key,'Klucz projektu',2,10).toUpperCase();
    if(!/^[A-Z][A-Z0-9]{1,9}$/.test(out.key))fail(400,'Klucz: 2–10 liter A–Z i cyfr, zaczynając od litery.');
    out.name=text(out.name,'Nazwa projektu',2,100);
    out.description=text(out.description??'','Opis',0,2000);
    out.project_type=choice(b.project_type??(old?.module_type==='assets'?'assets':out.project_type)??'external',['internal','external','assets'],'typ projektu');
    out.module_type=out.project_type==='assets'?'assets':'tickets';if(old&&old.module_type!==out.module_type)fail(409,'Katalog urządzeń i projekt zgłoszeń mają odrębny typ. Utwórz nowy projekt.');if(out.project_type==='assets')out.project_type='internal';
    const requestedPortal=b.portal_access??(old&&projectSettings(old).public_github?'public_github':out.portal_access??'members');
    const publicGithub=out.project_type==='external'&&requestedPortal==='public_github';
    out.portal_access=choice(publicGithub?'members':requestedPortal,['members','internal','authenticated'],'dostęp do portalu');
    let projectCfg=projectSettings(old||out);projectCfg={...projectCfg,public_github:publicGithub};out.settings=JSON.stringify(projectCfg);
    out.portal_slug=text(out.portal_slug??out.key.toLowerCase(),'Adres portalu',2,60).toLowerCase();
    if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(out.portal_slug))fail(400,'Adres portalu może zawierać małe litery, cyfry i pojedyncze myślniki.');
    out.portal_title=text(out.portal_title??out.name,'Nagłówek portalu',2,120);
    out.portal_description=text(out.portal_description??'','Opis portalu',0,3000);
    out.next_number=integer(out.next_number??1,'Następny numer',1,2000000000);
    out.number_padding=integer(out.number_padding??0,'Długość numeru',0,10);
    out.archived=Number(b.archived===undefined?Boolean(old?.archived):boolean(b.archived,'Archiwum'));
    let rt=out.request_types??['incident','request'];if(typeof rt==='string'&&old)rt=JSON.parse(rt);
    if(!Array.isArray(rt)||!rt.length||rt.some(v=>!['incident','request'].includes(v)))fail(400,'Wybierz co najmniej jeden typ formularza: incydent lub wniosek.');
    out.request_types=JSON.stringify([...new Set(rt)]);
    let sla=out.sla_policy??defaultSla;if(typeof sla==='string'&&old)sla=JSON.parse(sla);
    out.sla_policy=JSON.stringify(validateSla(sla));
    const owner=db.prepare('SELECT project_id FROM project_keys WHERE key=?').get(out.key);
    if(owner&&owner.project_id!==old?.id)fail(409,'Klucz jest zarezerwowany przez inny projekt, również w jego historii.');
    const slugOwner=db.prepare('SELECT id FROM projects WHERE portal_slug=?').get(out.portal_slug);
    if(slugOwner&&slugOwner.id!==old?.id)fail(409,'Ten adres portalu jest już zajęty.');
    if(old&&(out.key!==old.key||out.number_padding!==old.number_padding))fail(409,'Klucz i format numeracji są niezmienne po utworzeniu projektu.');
    if(old){const max=Math.max(db.prepare('SELECT COALESCE(MAX(number),0) n FROM tickets WHERE project_id=?').get(old.id).n,db.prepare("SELECT COALESCE(MAX(CAST(substr(asset_key,instr(asset_key,'-')+1) AS INTEGER)),0) n FROM assets WHERE project_id=?").get(old.id).n);if(out.next_number<=max)fail(409,`Następny numer musi być większy niż ${max}.`);}
    return out;
  }
  const fields=['key','name','description','project_type','portal_access','portal_slug','portal_title','portal_description','next_number','number_padding','request_types','sla_policy','archived','module_type','settings'];
  const issueKey=(p,n)=>`${p.key}-${String(n).padStart(p.number_padding,'0')}`;
  function create(b,user){
    if(user.role!=='admin')fail(403,'Projekt tworzy administrator.');
    const c=config(b);
    return tx(()=>{
      const result=db.prepare(`INSERT INTO projects(${fields.join(',')},kind,created_at) VALUES(${fields.map(()=>'?').join(',')},?,?)`).run(...fields.map(k=>c[k]),c.project_type==='external'?'service':'software',now());
      const id=Number(result.lastInsertRowid);
      seedRequestTypes(db,project(id));seedWorkflow(db,id);
      const template=db.prepare('SELECT id,config FROM workflow_templates ORDER BY is_default DESC,id LIMIT 1').get();if(template)db.prepare('UPDATE project_workflows SET config=? WHERE project_id=?').run(template.config,id);if(template)db.prepare('UPDATE projects SET workflow_template_id=? WHERE id=?').run(template.id,id);
      db.prepare("INSERT INTO project_members(project_id,user_id,role) SELECT ?,id,'agent' FROM users WHERE username IN ('desk.bot','itelade.bot')").run(id);
      db.prepare('INSERT INTO project_keys(key,project_id) VALUES(?,?)').run(c.key,id);
      db.prepare("INSERT INTO project_members(project_id,user_id,role) VALUES(?,?,'manager')").run(id,user.id);
      audit(id,user,'project.created',{key:c.key,type:c.project_type});
      return view(project(id),user);
    });
  }
  function update(id,b,user){
    const old=requireProject(id,user,true);
    if(b.version!==old.version)fail(409,'Ustawienia projektu zmieniły się. Odśwież i spróbuj ponownie.');
    const c=config(b,old);
    if(c.project_type==='internal'&&old.project_type==='external'&&db.prepare("SELECT id FROM tickets WHERE project_id=? AND reporter_id IN (SELECT id FROM users WHERE role='customer') LIMIT 1").get(old.id))fail(409,'Projekt ma zgłoszenia klientów. Zamiast usuwać portal, ogranicz jego dostęp do pracowników lub członków.');
    return tx(()=>{
      db.prepare(`UPDATE projects SET ${fields.map(k=>k+'=?').join(',')},kind=?,version=version+1 WHERE id=?`).run(...fields.map(k=>c[k]),c.project_type==='external'?'service':'software',old.id);
      db.prepare('INSERT OR IGNORE INTO project_keys(key,project_id) VALUES(?,?)').run(c.key,old.id);
      if(Object.hasOwn(b,'request_types'))for(const type of ['incident','request'])db.prepare('UPDATE request_types SET portal_visible=?,version=version+1,updated_at=? WHERE project_id=? AND system_key=?').run(Number(c.project_type==='external'&&JSON.parse(c.request_types).includes(type)),now(),old.id,type);
      if(c.project_type==='internal')db.prepare('UPDATE request_types SET portal_visible=0,version=version+1,updated_at=? WHERE project_id=? AND portal_visible=1').run(now(),old.id);
      audit(old.id,user,'project.updated',{changes:fields.filter(k=>old[k]!==c[k]).map(k=>({field:k,before:old[k],after:c[k]})),rekeyed:0});
      return view(project(old.id),user);
    });
  }
  function members(id,user){
    const p=requireProject(id,user,true);
    return db.prepare(`SELECT m.*,u.name,u.email,u.auth_source,u.role global_role,u.active,u.directory_active,u.is_internal
      FROM project_members m JOIN users u ON u.id=m.user_id WHERE m.project_id=? ORDER BY u.name,m.source`).all(p.id);
  }
  function clearAssignments(userId){
    const u=db.prepare('SELECT * FROM users WHERE id=?').get(userId);
    for(const t of db.prepare('SELECT id,project_id FROM tickets WHERE assignee_id=?').all(userId)){
      if(!u?.active||!u?.directory_active||u.registration_state!=='active'||!canWork(u,project(t.project_id))){
        db.prepare('UPDATE tickets SET assignee_id=NULL,version=version+1,updated_at=? WHERE id=?').run(now(),t.id);
      }
    }
  }
  function setMember(id,userId,role,user){
    const p=requireProject(id,user,true), target=db.prepare('SELECT * FROM users WHERE id=?').get(integer(Number(userId),'Użytkownik'));
    if(!target)fail(404,'Nie znaleziono konta.');
    if(role!==null)choice(role,['manager','agent','requester'],'rola w projekcie');
    if(['manager','agent'].includes(role)&&!['admin','agent'].includes(target.role))fail(400,'Obsługę projektu przypisz kontu z rolą agenta lub administratora.');
    if(p.project_type==='internal'&&role==='requester')fail(400,'Projekt wewnętrzny nie ma roli klienta.');
    if(target.id===user.id&&user.role!=='admin'&&role!=='manager')fail(400,'Zmianę Twojej roli kierownika musi wykonać inny kierownik lub administrator.');
    tx(()=>{
      if(role===null)db.prepare("DELETE FROM project_members WHERE project_id=? AND user_id=? AND source='manual'").run(p.id,target.id);
      else db.prepare("INSERT INTO project_members(project_id,user_id,role,source) VALUES(?,?,?,'manual') ON CONFLICT(project_id,user_id,source) DO UPDATE SET role=excluded.role").run(p.id,target.id,role);
      clearAssignments(target.id);
      db.prepare('UPDATE projects SET version=version+1 WHERE id=?').run(p.id);
      audit(p.id,user,'membership.updated',{user_id:target.id,role,source:'manual'});
    });
  }
  function candidates(id,user,q=''){
    requireProject(id,user,true);q=text(q,'Wyszukiwanie',0,100);
    const pattern='%'+q.replace(/[\\%_]/g,'\\$&')+'%';
    return db.prepare("SELECT id,name,email,role,is_internal,auth_source FROM users WHERE active=1 AND directory_active=1 AND registration_state='active' AND (name LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\') ORDER BY name LIMIT 50").all(pattern,pattern);
  }
  function agents(p,user){
    if(!canWork(user,p))return [];
    return db.prepare("SELECT id,name,account_kind,username FROM users WHERE active=1 AND directory_active=1 AND registration_state='active' AND (role='admin' OR (role='agent' AND id IN (SELECT user_id FROM project_members WHERE project_id=? AND role IN ('manager','agent')))) ORDER BY name").all(p.id);
  }
  return {project,view,list,canWork,canManage,canPortal,canRead,githubIdentity,publicReadable,requireProject,ticketScope,create,update,members,setMember,candidates,agents,issueKey,audit,clearAssignments};
}
