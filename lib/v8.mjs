import {randomBytes} from 'node:crypto';
import {now,fail,text,integer,boolean,txFor} from './core.mjs';
import {secretStore} from './secrets.mjs';
import {VERSION} from './version.mjs';

const CAPABILITIES=[
  'users.read','users.manage','projects.read','projects.manage','directory.manage','settings.manage',
  'assets.manage','approvals.manage','audit.read','integrations.manage','reports.read','queues.manage'
];
const ALL=new Set(CAPABILITIES);

export function createV8(db,{projects,desk,workflows,catalog,dataDir,origin,fetcher=fetch}){
  const tx=txFor(db),secrets=secretStore(dataDir);
  let timer=null,busy=false;

  const parse=(v,fallback)=>{try{return JSON.parse(v);}catch{return fallback;}};
  const admin=u=>{if(u.role!=='admin')fail(403,'Global Administrator required.');};
  const staff=u=>{if(!['admin','agent'].includes(u.role))fail(403,'Agent or Global Administrator required.');};
  const managedProjectIds=u=>u.role==='admin'?projects.list(u).map(p=>p.id):projects.list(u).filter(p=>p.can_manage).map(p=>p.id);
  const fixedRole=u=>{
    if(u.role==='admin')return 'global_administrator';
    if(projects.list(u).some(p=>p.can_manage))return 'project_manager';
    if(u.role==='agent')return 'agent';
    return 'customer';
  };
  function effectivePermissions(u){
    const role=fixedRole(u);
    if(role==='global_administrator')return [...ALL];
    if(role==='project_manager')return ['projects.read','projects.manage','queues.manage','approvals.manage','reports.read'];
    if(role==='agent')return ['projects.read','queues.manage'];
    return [];
  }
  function requirePermission(u,p){if(!effectivePermissions(u).includes(p))fail(403,'Capability not available for this fixed role: '+p);}
  function audit(u,action,details={},projectId=null){
    db.prepare('INSERT INTO audit_events(project_id,actor_id,action,details,created_at) VALUES(?,?,?,?,?)')
      .run(projectId,u?.id??null,action,JSON.stringify(details),now());
  }

  function listViews(u){
    return db.prepare(`SELECT v.*,u.name owner_name FROM v8_saved_views v JOIN users u ON u.id=v.owner_id
      WHERE v.owner_id=? OR v.shared=1 ORDER BY v.is_default DESC,v.name`).all(u.id)
      .map(v=>({...v,filters:parse(v.filters,{})}));
  }
  function saveView(id,b,u){
    requirePermission(u,'queues.manage');
    const old=id?db.prepare('SELECT * FROM v8_saved_views WHERE id=?').get(id):null;
    if(old&&old.owner_id!==u.id&&u.role!=='admin')fail(403,'Only owner or administrator may edit this view.');
    if(b.delete){if(!old)fail(404,'View not found.');db.prepare('DELETE FROM v8_saved_views WHERE id=?').run(id);return {ok:true};}
    const filters=b.filters&&typeof b.filters==='object'&&!Array.isArray(b.filters)?b.filters:{};
    const shared=Number(boolean(Boolean(b.shared),'shared')),isDefault=Number(boolean(Boolean(b.is_default),'default'));
    return tx(()=>{
      if(isDefault)db.prepare('UPDATE v8_saved_views SET is_default=0 WHERE owner_id=?').run(u.id);
      if(old)db.prepare('UPDATE v8_saved_views SET name=?,project_id=?,filters=?,shared=?,is_default=?,version=version+1,updated_at=? WHERE id=?')
        .run(text(b.name,'View name',2,100),b.project_id?integer(Number(b.project_id),'Project'):null,JSON.stringify(filters),shared,isDefault,now(),id);
      else id=Number(db.prepare('INSERT INTO v8_saved_views(owner_id,name,project_id,filters,shared,is_default,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)')
        .run(u.id,text(b.name,'View name',2,100),b.project_id?integer(Number(b.project_id),'Project'):null,JSON.stringify(filters),shared,isDefault,now(),now()).lastInsertRowid);
      audit(u,'queue.view_saved',{view_id:id,shared:Boolean(shared)});
      return listViews(u).find(x=>x.id===id);
    });
  }

  function dashboard(u){
    staff(u);const visible=projects.list(u).filter(p=>p.can_work&&p.project_type!=='assets').map(p=>p.id);
    if(!visible.length)return {projects:0,open:0,unassigned:0,waiting:0,sla_at_risk:0,recent:[]};
    const placeholders=visible.map(()=>'?').join(',');
    const base=`project_id IN (${placeholders}) AND deleted_at IS NULL AND archived_at IS NULL`;
    const count=where=>db.prepare(`SELECT COUNT(*) n FROM tickets WHERE ${base} AND ${where}`).get(...visible).n;
    const recent=db.prepare(`SELECT key,title,priority,workflow_status,updated_at FROM tickets WHERE ${base} ORDER BY updated_at DESC LIMIT 10`).all(...visible);
    return {projects:visible.length,open:count("status NOT IN ('resolved','closed')"),unassigned:count("assignee_id IS NULL AND status NOT IN ('resolved','closed')"),waiting:count("status='waiting'"),sla_at_risk:0,recent};
  }

  function auditRows(u,q){
    requirePermission(u,'audit.read');
    const where=[],args=[];
    if(q.get('project')){where.push('a.project_id=?');args.push(Number(q.get('project')));}
    if(q.get('actor')){where.push('a.actor_id=?');args.push(Number(q.get('actor')));}
    if(q.get('action')){where.push('a.action LIKE ?');args.push('%'+q.get('action')+'%');}
    if(q.get('from')){where.push('a.created_at>=?');args.push(q.get('from'));}
    if(q.get('to')){where.push('a.created_at<=?');args.push(q.get('to'));}
    if(q.get('q')){where.push('(a.action LIKE ? OR a.details LIKE ?)');args.push('%'+q.get('q')+'%','%'+q.get('q')+'%');}
    const rows=db.prepare(`SELECT a.*,u.name actor_name,p.key project_key FROM audit_events a
      LEFT JOIN users u ON u.id=a.actor_id LEFT JOIN projects p ON p.id=a.project_id
      ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY a.id DESC LIMIT 1000`).all(...args);
    return rows.map(r=>({...r,details:parse(r.details,{})}));
  }

  function schemes(u){
    requirePermission(u,'approvals.manage');
    const visible=new Set(managedProjectIds(u));
    return db.prepare('SELECT * FROM v8_approval_schemes ORDER BY project_id,name').all().filter(r=>visible.has(r.project_id)).map(r=>({...r,stages:parse(r.stages,[])}));
  }
  function saveScheme(id,b,u){
    requirePermission(u,'approvals.manage');
    const p=projects.requireProject(integer(Number(b.project_id),'Project'),u,true);
    if(!Array.isArray(b.stages)||!b.stages.length||b.stages.length>10)fail(400,'Approval scheme requires 1-10 stages.');
    const normalized=b.stages.map((s,i)=>{
      if(!['any','all'].includes(s.mode))fail(400,'Invalid approval mode at stage '+(i+1));
      if(!Array.isArray(s.approvers)||!s.approvers.length)fail(400,'Each stage requires approvers.');
      return {name:text(s.name||`Stage ${i+1}`,'Stage name',1,100),mode:s.mode,approvers:s.approvers.map(a=>{
        if(a.type==='user')return {type:'user',id:integer(Number(a.id),'Approver')};
        if(a.type==='global_role'&&['admin','agent'].includes(a.value))return {type:'global_role',value:a.value};
        if(a.type==='project_role'&&['manager','agent'].includes(a.value))return {type:'project_role',value:a.value};
        fail(400,'Invalid approver.');
      })};
    });
    const old=id?db.prepare('SELECT * FROM v8_approval_schemes WHERE id=?').get(id):null;if(id&&!old)fail(404,'Scheme not found.');
    if(b.delete){db.prepare('UPDATE v8_approval_schemes SET enabled=0,version=version+1,updated_at=? WHERE id=?').run(now(),id);return {ok:true};}
    if(old)db.prepare('UPDATE v8_approval_schemes SET name=?,project_id=?,request_type_id=?,stages=?,enabled=?,version=version+1,updated_at=? WHERE id=?')
      .run(text(b.name,'Scheme name',2,100),p.id,b.request_type_id?Number(b.request_type_id):null,JSON.stringify(normalized),Number(Boolean(b.enabled)),now(),id);
    else id=Number(db.prepare('INSERT INTO v8_approval_schemes(project_id,request_type_id,name,stages,enabled,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
      .run(p.id,b.request_type_id?Number(b.request_type_id):null,text(b.name,'Scheme name',2,100),JSON.stringify(normalized),Number(Boolean(b.enabled)),now(),now()).lastInsertRowid);
    audit(u,'approval.scheme_saved',{scheme_id:id,project_id:p.id},p.id);return schemes(u).find(x=>x.id===id);
  }
  function approvalInstances(u){
    staff(u);
    return db.prepare(`SELECT i.*,s.name scheme_name,t.key ticket_key,t.title ticket_title,s.stages,p.name project_name
      FROM v8_approval_instances i JOIN v8_approval_schemes s ON s.id=i.scheme_id
      JOIN tickets t ON t.id=i.ticket_id JOIN projects p ON p.id=t.project_id ORDER BY i.id DESC LIMIT 500`).all()
      .filter(r=>projects.canRead(u,projects.project(db.prepare('SELECT project_id FROM tickets WHERE id=?').get(r.ticket_id).project_id),db.prepare('SELECT * FROM tickets WHERE id=?').get(r.ticket_id)))
      .map(r=>({...r,stages:parse(r.stages,[]),decisions:db.prepare('SELECT d.*,u.name user_name FROM v8_approval_decisions d JOIN users u ON u.id=d.user_id WHERE instance_id=? ORDER BY id').all(r.id)}));
  }
  function approverMatches(entry,u,ticket){
    if(entry.type==='user')return Number(entry.id)===u.id;
    if(entry.type==='global_role')return u.role===entry.value||(entry.value==='agent'&&u.role==='admin');
    if(entry.type==='project_role'){
      if(u.role==='admin')return true;
      const m=db.prepare('SELECT role FROM project_members WHERE project_id=? AND user_id=? ORDER BY CASE role WHEN "manager" THEN 3 WHEN "agent" THEN 2 ELSE 1 END DESC LIMIT 1').get(ticket.project_id,u.id);
      return m?.role===entry.value||(entry.value==='agent'&&m?.role==='manager');
    }
    return false;
  }
  function decide(instanceId,b,u){
    const inst=db.prepare('SELECT * FROM v8_approval_instances WHERE id=?').get(integer(instanceId,'Approval'));if(!inst)fail(404,'Approval not found.');
    if(inst.state!=='pending')fail(409,'Approval is already completed.');
    const scheme=db.prepare('SELECT * FROM v8_approval_schemes WHERE id=?').get(inst.scheme_id),stages=parse(scheme.stages,[]),stage=stages[inst.stage_index],ticket=db.prepare('SELECT * FROM tickets WHERE id=?').get(inst.ticket_id);
    if(!stage||!stage.approvers.some(a=>approverMatches(a,u,ticket)))fail(403,'You are not an approver for this stage.');
    const decision=b.decision==='approved'?'approved':b.decision==='rejected'?'rejected':null;if(!decision)fail(400,'Invalid decision.');
    db.prepare('INSERT INTO v8_approval_decisions(instance_id,stage_index,user_id,decision,comment,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(instance_id,stage_index,user_id) DO UPDATE SET decision=excluded.decision,comment=excluded.comment,created_at=excluded.created_at')
      .run(inst.id,inst.stage_index,u.id,decision,text(String(b.comment||''),'Comment',0,2000),now());
    if(decision==='rejected'){db.prepare("UPDATE v8_approval_instances SET state='rejected',updated_at=? WHERE id=?").run(now(),inst.id);audit(u,'approval.rejected',{instance_id:inst.id,ticket_id:ticket.id},ticket.project_id);return {state:'rejected'};}
    const decisions=db.prepare('SELECT * FROM v8_approval_decisions WHERE instance_id=? AND stage_index=? AND decision="approved"').all(inst.id,inst.stage_index);
    const complete=stage.mode==='any'?decisions.length>0:stage.approvers.every(a=>decisions.some(d=>approverMatches(a,db.prepare('SELECT * FROM users WHERE id=?').get(d.user_id),ticket)));
    if(complete){
      if(inst.stage_index+1>=stages.length){db.prepare("UPDATE v8_approval_instances SET state='approved',updated_at=? WHERE id=?").run(now(),inst.id);audit(u,'approval.approved',{instance_id:inst.id,ticket_id:ticket.id},ticket.project_id);}
      else db.prepare('UPDATE v8_approval_instances SET stage_index=stage_index+1,updated_at=? WHERE id=?').run(now(),inst.id);
    }
    return approvalInstances(u).find(x=>x.id===inst.id);
  }
  function reconcileApprovals(){
    for(const s of db.prepare('SELECT * FROM v8_approval_schemes WHERE enabled=1').all()){
      const sql=`SELECT id FROM tickets WHERE project_id=? AND deleted_at IS NULL ${s.request_type_id?'AND request_type_id=?':''}`;
      const rows=db.prepare(sql).all(...(s.request_type_id?[s.project_id,s.request_type_id]:[s.project_id]));
      for(const t of rows)db.prepare('INSERT OR IGNORE INTO v8_approval_instances(scheme_id,ticket_id,created_at,updated_at) VALUES(?,?,?,?)').run(s.id,t.id,now(),now());
    }
  }

  function organizations(u){
    admin(u);
    return db.prepare('SELECT * FROM organizations ORDER BY name').all().map(o=>({...o,
      domains:db.prepare('SELECT domain,verified FROM v8_org_domains WHERE organization_id=? ORDER BY domain').all(o.id),
      contacts:db.prepare('SELECT c.user_id,c.notify,u.name,u.email FROM v8_org_contacts c JOIN users u ON u.id=c.user_id WHERE c.organization_id=?').all(o.id)
    }));
  }
  function saveOrganizationExtras(id,b,u){
    admin(u);
    if(!db.prepare('SELECT id FROM organizations WHERE id=?').get(id))fail(404,'Organization not found.');
    if(!Array.isArray(b.domains)||!Array.isArray(b.contacts))fail(400,'Invalid organization data.');
    tx(()=>{
      db.prepare('DELETE FROM v8_org_domains WHERE organization_id=?').run(id);
      for(const raw of b.domains){const d=text(String(raw),'Domain',3,253).toLowerCase();if(!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(d))fail(400,'Invalid domain: '+d);db.prepare('INSERT INTO v8_org_domains VALUES(?,?,1)').run(id,d);}
      db.prepare('DELETE FROM v8_org_contacts WHERE organization_id=?').run(id);
      for(const uid of new Set(b.contacts.map(Number)))db.prepare('INSERT INTO v8_org_contacts VALUES(?,?,1)').run(id,uid);
      audit(u,'organization.directory_rules_saved',{organization_id:id,domains:b.domains,contacts:b.contacts});
    });reconcileOrganizations();return organizations(u).find(x=>x.id===id);
  }
  function reconcileOrganizations(){
    for(const o of db.prepare('SELECT id FROM organizations').all()){
      const domains=db.prepare('SELECT domain FROM v8_org_domains WHERE organization_id=? AND verified=1').all(o.id).map(x=>x.domain.toLowerCase());
      const wanted=new Map();
      if(domains.length)for(const u of db.prepare("SELECT id,email FROM users WHERE account_kind='human' AND active=1").all()){
        const domain=String(u.email).split('@')[1]?.toLowerCase();if(domains.includes(domain))wanted.set(u.id,domain);
      }
      const tracked=db.prepare('SELECT user_id FROM v8_org_auto_members WHERE organization_id=?').all(o.id).map(x=>x.user_id);
      for(const uid of tracked)if(!wanted.has(uid)){db.prepare('DELETE FROM v8_org_auto_members WHERE organization_id=? AND user_id=?').run(o.id,uid);db.prepare('DELETE FROM organization_members WHERE organization_id=? AND user_id=?').run(o.id,uid);}
      for(const [uid,domain] of wanted){db.prepare('INSERT OR IGNORE INTO organization_members VALUES(?,?)').run(o.id,uid);db.prepare('INSERT INTO v8_org_auto_members VALUES(?,?,?) ON CONFLICT(organization_id,user_id) DO UPDATE SET domain=excluded.domain').run(o.id,uid,domain);}
    }
  }

  function assetList(u){
    admin(u);
    return db.prepare('SELECT a.*,m.lifecycle,m.purchase_date,m.warranty_until,m.replacement_date,m.vendor,m.purchase_ref,m.location,m.notes FROM assets a LEFT JOIN v8_asset_meta m ON m.asset_id=a.id ORDER BY a.asset_key').all().map(a=>({...a,
      data:parse(a.data,{}),
      relations:db.prepare(`SELECT r.*,pa.asset_key parent_key,pa.name parent_name,ca.asset_key child_key,ca.name child_name FROM v8_asset_relationships r JOIN assets pa ON pa.id=r.parent_asset_id JOIN assets ca ON ca.id=r.child_asset_id WHERE r.parent_asset_id=? OR r.child_asset_id=? ORDER BY r.id`).all(a.id,a.id)
    }));
  }
  function saveAssetMeta(id,b,u){
    admin(u);const a=db.prepare('SELECT * FROM assets WHERE id=?').get(integer(id,'Asset'));if(!a)fail(404,'Asset not found.');
    const lifecycle=['ordered','in_stock','assigned','repair','retired','disposed'].includes(b.lifecycle)?b.lifecycle:'in_stock';
    const old=db.prepare('SELECT * FROM v8_asset_meta WHERE asset_id=?').get(a.id);
    db.prepare(`INSERT INTO v8_asset_meta(asset_id,lifecycle,purchase_date,warranty_until,replacement_date,vendor,purchase_ref,location,notes,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(asset_id) DO UPDATE SET lifecycle=excluded.lifecycle,purchase_date=excluded.purchase_date,warranty_until=excluded.warranty_until,replacement_date=excluded.replacement_date,vendor=excluded.vendor,purchase_ref=excluded.purchase_ref,location=excluded.location,notes=excluded.notes,updated_at=excluded.updated_at`)
      .run(a.id,lifecycle,b.purchase_date||null,b.warranty_until||null,b.replacement_date||null,text(String(b.vendor||''),'Vendor',0,200),text(String(b.purchase_ref||''),'Purchase ref',0,200),text(String(b.location||''),'Location',0,200),text(String(b.notes||''),'Notes',0,4000),now());
    db.prepare('INSERT INTO v8_asset_history(asset_id,actor_id,event,details,created_at) VALUES(?,?,?,?,?)').run(a.id,u.id,'asset.meta_updated',JSON.stringify({before:old||null,after:b}),now());
    audit(u,'asset.lifecycle_updated',{asset_id:a.id,lifecycle},a.project_id);return assetList(u).find(x=>x.id===a.id);
  }
  function relation(b,u){
    admin(u);const parent=integer(Number(b.parent_asset_id),'Parent asset'),child=integer(Number(b.child_asset_id),'Child asset');
    if(b.delete){db.prepare('DELETE FROM v8_asset_relationships WHERE id=?').run(integer(Number(b.id),'Relationship'));return {ok:true};}
    const kind=text(String(b.kind||'related'),'Relationship',1,100);
    db.prepare('INSERT OR IGNORE INTO v8_asset_relationships(parent_asset_id,child_asset_id,kind,created_at) VALUES(?,?,?,?)').run(parent,child,kind,now());
    db.prepare('INSERT INTO v8_asset_history(asset_id,actor_id,event,details,created_at) VALUES(?,?,?,?,?)').run(parent,u.id,'asset.relationship_added',JSON.stringify({child_asset_id:child,kind}),now());
    return {ok:true};
  }

  function githubList(u){
    admin(u);
    return db.prepare(`SELECT g.id,g.name,g.owner,g.repo,g.project_id,g.request_type_id,g.reporter_id,g.enabled,1 auto_close,g.comment_template,g.label_priority,g.poll_minutes,g.last_poll,g.last_error,g.version,g.created_at,g.updated_at,
      p.name project_name,rt.name request_type_name,usr.name reporter_name,
      (SELECT MAX(created_at) FROM v8_github_runs r WHERE r.integration_id=g.id AND r.status='success') last_success
      FROM v8_github_integrations g JOIN projects p ON p.id=g.project_id JOIN request_types rt ON rt.id=g.request_type_id JOIN users usr ON usr.id=g.reporter_id ORDER BY g.id`).all().map(r=>({...r,label_priority:parse(r.label_priority,{})}));
  }
  function githubOptions(u,projectId){
    admin(u);const p=projects.requireProject(integer(Number(projectId),'Project'),u,true);
    return {request_types:db.prepare('SELECT id,name,version FROM request_types WHERE project_id=? AND enabled=1 ORDER BY name').all(p.id),reporters:db.prepare("SELECT id,name,email,role,account_kind FROM users WHERE active=1 AND role IN ('admin','agent') ORDER BY name,email").all()};
  }
  function saveGithub(id,b,u){
    admin(u);
    const p=projects.requireProject(integer(Number(b.project_id),'Project'),u,true),form=db.prepare('SELECT * FROM request_types WHERE id=? AND project_id=? AND enabled=1').get(integer(Number(b.request_type_id),'Request type'),p.id),reporter=db.prepare("SELECT * FROM users WHERE id=? AND active=1 AND role IN ('admin','agent')").get(integer(Number(b.reporter_id),'Reporter'));
    if(!form||!reporter)fail(400,'Invalid request type or reporter/service account.');
    const old=id?db.prepare('SELECT * FROM v8_github_integrations WHERE id=?').get(id):null;if(id&&!old)fail(404,'Integration not found.');
    const token=b.token?secrets.seal(text(b.token,'GitHub token',10,1000)):old?.token_secret;if(!token)fail(400,'GitHub token required.');
    const tpl=text(String(b.comment_template||'Thank you for your report. It has been transferred to iTELade Service Desk.\n\nService Desk ticket: {ticket_url}\n\nThis GitHub issue is being closed because further handling will continue in Service Desk.'),'Comment template',10,4000);
    const priorities=b.label_priority&&typeof b.label_priority==='object'&&!Array.isArray(b.label_priority)?b.label_priority:{};
    for(const value of Object.values(priorities))if(!['P1','P2','P3','P4'].includes(value))fail(400,'Priority mapping values must be P1-P4.');
    const owner=text(b.owner,'Owner',1,100),repo=text(b.repo,'Repository',1,100),name=text(b.name,'Name',2,100),enabled=Number(Boolean(b.enabled)),poll=integer(Number(b.poll_minutes||5),'Poll minutes',1,60);
    if(old)db.prepare(`UPDATE v8_github_integrations SET name=?,owner=?,repo=?,project_id=?,request_type_id=?,reporter_id=?,token_secret=?,enabled=?,auto_close=1,comment_template=?,label_priority=?,poll_minutes=?,version=version+1,updated_at=? WHERE id=?`).run(name,owner,repo,p.id,form.id,reporter.id,token,enabled,tpl,JSON.stringify(priorities),poll,now(),id);
    else id=Number(db.prepare(`INSERT INTO v8_github_integrations(name,owner,repo,project_id,request_type_id,reporter_id,token_secret,enabled,auto_close,comment_template,label_priority,poll_minutes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,1,?,?,?,?,?)`).run(name,owner,repo,p.id,form.id,reporter.id,token,enabled,tpl,JSON.stringify(priorities),poll,now(),now()).lastInsertRowid);
    audit(u,'github.integration_saved',{integration_id:id,repository:`${owner}/${repo}`,auto_close:true});return githubList(u).find(x=>x.id===id);
  }
  function toggleGithub(id,b,u){admin(u);const row=db.prepare('SELECT id FROM v8_github_integrations WHERE id=?').get(integer(id,'Integration'));if(!row)fail(404,'Integration not found.');db.prepare('UPDATE v8_github_integrations SET enabled=?,auto_close=1,version=version+1,updated_at=? WHERE id=?').run(Number(Boolean(b.enabled)),now(),id);audit(u,'github.integration_toggled',{integration_id:id,enabled:Boolean(b.enabled)});return githubList(u).find(x=>x.id===id);}
  function deleteGithub(id,u){admin(u);const row=db.prepare('SELECT id,owner,repo FROM v8_github_integrations WHERE id=?').get(integer(id,'Integration'));if(!row)fail(404,'Integration not found.');db.prepare('DELETE FROM v8_github_integrations WHERE id=?').run(id);audit(u,'github.integration_deleted',{integration_id:id,repository:`${row.owner}/${row.repo}`});return {ok:true};}
  async function githubRequest(c,path,options={}){
    const token=secrets.open(c.token_secret),res=await fetcher('https://api.github.com'+path,{...options,headers:{Accept:'application/vnd.github+json','User-Agent':`iTELade-Service-Desk/${VERSION}`,'X-GitHub-Api-Version':'2022-11-28',Authorization:'Bearer '+token,'Content-Type':'application/json',...(options.headers||{})},signal:AbortSignal.timeout(10000)});
    const body=await res.text();if(!res.ok)throw new Error(`GitHub ${res.status}: ${body.slice(0,180)}`);return body?JSON.parse(body):{};
  }
  async function testGithub(id,u){admin(u);const c=db.prepare('SELECT * FROM v8_github_integrations WHERE id=?').get(integer(id,'Integration'));if(!c)fail(404,'Integration not found.');const repo=await githubRequest(c,`/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}`);return {ok:true,repository:repo.full_name||c.owner+'/'+c.repo,private:Boolean(repo.private)};}
  function githubPriority(c,issue){const map=parse(c.label_priority,{});for(const l of issue.labels||[]){const name=typeof l==='string'?l:l.name;if(map[name]&&['P1','P2','P3','P4'].includes(map[name]))return map[name];}return 'P3';}
  function createGithubTicket(c,issue){
    const p=projects.project(c.project_id),actor=db.prepare('SELECT * FROM users WHERE id=?').get(c.reporter_id),form=db.prepare('SELECT * FROM request_types WHERE id=?').get(c.request_type_id);
    if(!p||!actor||!form)throw new Error('GitHub integration references missing project, reporter or request type.');
    const description=`GitHub source: ${c.owner}/${c.repo}#${issue.number}\nGitHub issue ID: ${issue.id}\nGitHub issue: ${issue.html_url}\nAuthor: @${issue.user?.login||'unknown'}\n\n${issue.body||''}`.slice(0,20000);
    const prepared=catalog.prepare(p,{title:String(issue.title||'GitHub issue').slice(0,200),description,priority:githubPriority(c,issue),request_type_id:form.id,request_type_version:form.version,custom_values:{}},false);
    const n=p.next_number;if(n>2000000000)throw new Error('Project numbering exhausted.');const stamp=now(),initial=workflows.start(p);
    return tx(()=>{db.prepare('UPDATE projects SET next_number=next_number+1,version=version+1 WHERE id=?').run(p.id);
      const id=Number(db.prepare(`INSERT INTO tickets(project_id,key,number,title,description,type,priority,status,workflow_status,reporter_id,created_by,created_at,updated_at,request_type_id,form_snapshot,custom_values,origin) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'github')`).run(p.id,projects.issueKey(p,n),n,prepared.title,prepared.description,prepared.type,prepared.priority,initial.category,initial.key,actor.id,actor.id,stamp,stamp,prepared.id,prepared.snapshot,prepared.values).lastInsertRowid);
      const t=desk.ticket(id);workflows.run(t,'ticket_created',actor);projects.audit(p.id,actor,'github.issue_imported',{ticket_id:id,issue_id:issue.id,issue_number:issue.number,issue_url:issue.html_url,repository:`${c.owner}/${c.repo}`});return t;});
  }
  async function finalizeGithub(c,link){
    const ticket=desk.ticket(link.ticket_id),comment=c.comment_template.replaceAll('{ticket_key}',ticket.key).replaceAll('{ticket_url}',origin+'/#/ticket/'+encodeURIComponent(ticket.key));
    if(link.status==='ticket_created'){
      await githubRequest(c,`/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}/issues/${link.issue_number}/comments`,{method:'POST',body:JSON.stringify({body:comment})});
      db.prepare("UPDATE v8_github_links SET status='commented',last_error=NULL,updated_at=? WHERE id=?").run(now(),link.id);link={...link,status:'commented'};
    }
    await githubRequest(c,`/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}/issues/${link.issue_number}`,{method:'PATCH',body:JSON.stringify({state:'closed'})});
    db.prepare("UPDATE v8_github_links SET status='done',last_error=NULL,updated_at=? WHERE id=?").run(now(),link.id);
  }
  async function pollGithubIntegration(c){
    const run=Number(db.prepare('INSERT INTO v8_github_runs(integration_id,status,detail,created_at) VALUES(?,?,?,?)').run(c.id,'running','Polling '+c.owner+'/'+c.repo,now()).lastInsertRowid);let imported=0,completed=0,pending=0;
    try{
      for(const link of db.prepare("SELECT * FROM v8_github_links WHERE integration_id=? AND status<>'done' ORDER BY id LIMIT 20").all(c.id)){try{await finalizeGithub(c,link);completed++;}catch(e){pending++;db.prepare("UPDATE v8_github_links SET last_error=?,updated_at=? WHERE id=?").run(String(e.message).slice(0,500),now(),link.id);}}
      const issues=await githubRequest(c,`/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}/issues?state=open&sort=created&direction=asc&per_page=50`);
      for(const issue of issues){if(issue.pull_request)continue;if(db.prepare('SELECT id FROM v8_github_links WHERE integration_id=? AND issue_id=?').get(c.id,issue.id))continue;
        let t;try{t=createGithubTicket(c,issue);}catch(e){pending++;continue;}
        imported++;const id=Number(db.prepare('INSERT INTO v8_github_links(integration_id,issue_id,issue_number,issue_url,ticket_id,status,created_at,updated_at) VALUES(?,?,?,?,?,"ticket_created",?,?)').run(c.id,issue.id,issue.number,issue.html_url,t.id,now(),now()).lastInsertRowid);
        try{await finalizeGithub(c,db.prepare('SELECT * FROM v8_github_links WHERE id=?').get(id));completed++;}catch(e){pending++;db.prepare('UPDATE v8_github_links SET last_error=?,updated_at=? WHERE id=?').run(String(e.message).slice(0,500),now(),id);}
      }
      const detail=`Imported ${imported}; completed ${completed}; pending ${pending}`;db.prepare('UPDATE v8_github_integrations SET last_poll=?,last_error=? WHERE id=?').run(Date.now(),pending?'One or more transfers require retry.':null,c.id);db.prepare('UPDATE v8_github_runs SET status=?,detail=? WHERE id=?').run(pending?'partial':'success',detail,run);
    }catch(e){db.prepare('UPDATE v8_github_integrations SET last_poll=?,last_error=? WHERE id=?').run(Date.now(),String(e.message).slice(0,500),c.id);db.prepare('UPDATE v8_github_runs SET status=?,detail=? WHERE id=?').run('failed',String(e.message).slice(0,500),run);}
  }
  async function background(){
    if(busy)return;busy=true;try{
      reconcileApprovals();reconcileOrganizations();
      for(const c of db.prepare('SELECT * FROM v8_github_integrations WHERE enabled=1').all())if(Date.now()-c.last_poll>=c.poll_minutes*60000)await pollGithubIntegration(c);
    }finally{busy=false;}
  }

  async function handle(method,path,u,query,read){
    if(!path.startsWith('/api/desk/v8/'))return null;
    const b=method==='GET'?{}:await read(),parts=path.slice('/api/desk/v8/'.length).split('/'),resource=parts[0],id=parts[1]?Number(parts[1]):null,action=parts[2];let value;
    if(resource==='summary'){staff(u);value={version:VERSION,role:fixedRole(u),permissions:effectivePermissions(u),dashboard:dashboard(u),features:{sla:true,inbound_email:true,webhooks:true,audit:true,saved_views:true,approvals:true,organizations:true,assets:true,github:true}};}
    else if(resource==='roles')fail(404,'Custom global roles are not supported.');
    else if(resource==='permissions')value={role:fixedRole(u),permissions:effectivePermissions(u)};
    else if(resource==='views')value=method==='GET'?listViews(u):saveView(id,b,u);
    else if(resource==='dashboard')value=dashboard(u);
    else if(resource==='audit'){admin(u);value=auditRows(u,query);if(query.get('format')==='csv'){const esc=x=>`"${String(x??'').replaceAll('"','""')}"`;value={content_type:'text/csv',filename:'service-desk-audit.csv',data:['id,created_at,actor,project,action,details',...value.map(r=>[r.id,r.created_at,r.actor_name||'',r.project_key||'',r.action,JSON.stringify(r.details)].map(esc).join(','))].join('\n')};}}
    else if(resource==='approval-schemes')value=method==='GET'?schemes(u):saveScheme(id,b,u);
    else if(resource==='approvals')value=method==='GET'?approvalInstances(u):decide(id,b,u);
    else if(resource==='organizations')value=method==='GET'?organizations(u):saveOrganizationExtras(id,b,u);
    else if(resource==='assets')value=method==='GET'?assetList(u):saveAssetMeta(id,b,u);
    else if(resource==='asset-relations')value=relation(b,u);
    else if(resource==='github-options')value=githubOptions(u,query.get('project_id'));
    else if(resource==='github'){if(method==='GET')value=githubList(u);else if(action==='toggle')value=toggleGithub(id,b,u);else if(action==='delete')value=deleteGithub(id,u);else if(action==='test')value=await testGithub(id,u);else value=saveGithub(id,b,u);}
    else if(resource==='github-runs'){admin(u);value=db.prepare(`SELECT r.*,g.name integration_name,g.owner,g.repo FROM v8_github_runs r LEFT JOIN v8_github_integrations g ON g.id=r.integration_id ORDER BY r.id DESC LIMIT 100`).all();}
    else fail(404,'Unknown Service Desk administration resource.');
    return {status:200,value};
  }
  return {handle,effectivePermissions,fixedRole,background,start(){timer=setInterval(()=>void background(),15000).unref();void background();},stop(){if(timer)clearInterval(timer);}};
}
