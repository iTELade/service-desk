import {now,fail,txFor,text,integer,boolean,choice} from './core.mjs';
export function createSync(db,projects,desk,workflows){
  const tx=txFor(db),output=r=>({...r,enabled:Boolean(r.enabled),config:JSON.parse(r.config)});
  const actor=r=>db.prepare('SELECT * FROM users WHERE id=?').get(JSON.parse(r.config).author_id);
  function configs(u){return db.prepare('SELECT * FROM sync_configs ORDER BY name').all().filter(r=>projects.canManage(u,projects.project(r.source_project))&&projects.canManage(u,projects.project(r.target_project))).map(output);}
  function save(id,b,u){
    const old=id?db.prepare('SELECT * FROM sync_configs WHERE id=?').get(id):null;if(id&&(!old||b.version!==old.version))fail(409,'Konfiguracja synchronizacji zmieniła się.');
    const source=projects.requireProject(integer(b.source_project,'Projekt źródłowy'),u,true),target=projects.requireProject(integer(b.target_project,'Projekt docelowy'),u,true);
    if(old){projects.requireProject(old.source_project,u,true);projects.requireProject(old.target_project,u,true);if(old.source_project!==source.id||old.target_project!==target.id)fail(400,'Dla innej pary projektów utwórz nową konfigurację.');}
    if(source.id===target.id||source.module_type==='assets'||target.module_type==='assets')fail(400,'Wybierz dwa różne projekty zgłoszeń.');
    const c=b.config||{},a=db.prepare('SELECT * FROM users WHERE id=?').get(integer(c.author_id,'Autor odpowiedzi'));
    if(!a?.active||!a.directory_active||a.registration_state!=='active'||!projects.canWork(a,source)||!projects.canWork(a,target))fail(400,'Autor komentarzy musi mieć dostęp zespołowy do obu projektów.');
    const map=(input,from,to)=>{if(!Array.isArray(input)||input.length>100)fail(400,'Podaj listę mapowania statusów.');const seen=new Set();return input.map(m=>{const f=choice(m.from,workflows.get(from).statuses.map(s=>s.key),'Status źródłowy'),t=choice(m.to,workflows.get(to).statuses.map(s=>s.key),'Status docelowy');if(seen.has(f))fail(400,'Status źródłowy może mieć jedno mapowanie.');seen.add(f);return {from:f,to:t};});};
    const cfg={author_id:a.id,comments:choice(c.comments||'to_source',['none','both','to_source','to_target'],'Kierunek komentarzy'),internal_notes:boolean(c.internal_notes??false,'Synchronizacja notatek'),to_target:map(c.to_target||[],source.id,target.id),to_source:map(c.to_source||[],target.id,source.id),request_type_id:c.request_type_id===null||c.request_type_id===undefined?null:integer(c.request_type_id,'Formularz docelowy')};
    if(cfg.request_type_id&&!db.prepare('SELECT id FROM request_types WHERE id=? AND project_id=? AND enabled=1').get(cfg.request_type_id,target.id))fail(400,'Formularz docelowy musi być aktywny i należeć do projektu.');
    return tx(()=>{const name=text(b.name,'Nazwa przycisku przekazania',2,100),enabled=Number(boolean(b.enabled??true,'Aktywny plugin'));let saved=id;if(old)db.prepare('UPDATE sync_configs SET name=?,config=?,enabled=?,version=version+1 WHERE id=?').run(name,JSON.stringify(cfg),enabled,id);else saved=Number(db.prepare('INSERT INTO sync_configs(name,source_project,target_project,config,enabled) VALUES(?,?,?,?,?)').run(name,source.id,target.id,JSON.stringify(cfg),enabled).lastInsertRowid);projects.audit(source.id,u,'sync.configured',{config_id:saved,author_id:a.id});return output(db.prepare('SELECT * FROM sync_configs WHERE id=?').get(saved));});
  }
  function available(t,u){if(!projects.canWork(u,projects.project(t.project_id)))return [];return db.prepare('SELECT * FROM sync_configs WHERE source_project=? AND enabled=1 ORDER BY name').all(t.project_id).filter(r=>projects.canWork(u,projects.project(r.target_project))).map(r=>({id:r.id,name:r.name,target_project:r.target_project,existing:db.prepare('SELECT t.key FROM sync_pairs s JOIN tickets t ON t.id=s.target_id WHERE s.config_id=? AND s.source_id=?').get(r.id,t.id)?.key||null}));}
  function transfer(id,configId,u,b={}){return tx(()=>{const t=desk.requireTicket(id,u),r=db.prepare('SELECT * FROM sync_configs WHERE id=? AND source_project=? AND enabled=1').get(integer(configId,'Synchronizacja'),t.project_id);if(!r)fail(404,'Konfiguracja synchronizacji niedostępna.');const p=projects.requireProject(r.target_project,u),c=JSON.parse(r.config),existing=db.prepare('SELECT target_id FROM sync_pairs WHERE config_id=? AND source_id=?').get(r.id,t.id);if(existing){const target=desk.ticket(existing.target_id);if(target.deleted_at)fail(409,'Poprzednio przekazane zgłoszenie zostało usunięte.');db.prepare('UPDATE sync_pairs SET enabled=1 WHERE config_id=? AND source_id=?').run(r.id,t.id);desk.link(t.id,target.id,'sync',u);return target;}
    desk.reporter(p,t.reporter_id,u);const copy=desk.copy(t,p,u,{...b,request_type_id:b.request_type_id||c.request_type_id,origin:'sync'});
    const pairId=Number(db.prepare('INSERT INTO sync_pairs(config_id,source_id,target_id,created_at) VALUES(?,?,?,?)').run(r.id,t.id,copy.id,now()).lastInsertRowid);
    // Existing conversation is copied once, with original author retained in the staff audit.
    for(const comment of db.prepare('SELECT * FROM comments WHERE ticket_id=? ORDER BY id').all(t.id))if(!comment.internal||c.internal_notes)copyComment({id:pairId,source_id:t.id,target_id:copy.id},r,comment,copy,true);
    applyStatus(r,copy,c.to_target.find(m=>m.from===t.workflow_status)?.to,t);
    projects.audit(t.project_id,u,'sync.transferred',{source_id:t.id,target_id:copy.id,config_id:r.id});return desk.ticket(copy.id);
  });}
  function copyComment(pair,r,c,target,initial=false){
    if(db.prepare('SELECT 1 FROM sync_deliveries WHERE pair_id=? AND comment_id=?').get(pair.id,c.id))return;
    if(target.status==='closed')return;const a=actor(r);if(!a?.active||!a.directory_active||!projects.canWork(a,projects.project(target.project_id)))fail(409,'Autor synchronizacji utracił dostęp.');
    const id=Number(db.prepare("INSERT INTO comments(ticket_id,author_id,actual_actor_id,body,internal,origin,source_comment_id,created_at) VALUES(?,?,?,?,?,'sync',?,?)").run(target.id,a.id,c.actual_actor_id||c.author_id,c.body,c.internal,c.id,now()).lastInsertRowid);
    db.prepare('INSERT INTO sync_deliveries(pair_id,comment_id,copied_id) VALUES(?,?,?)').run(pair.id,c.id,id);
    if(!initial&&!c.internal)db.prepare('UPDATE tickets SET first_response_at=COALESCE(first_response_at,?),updated_at=?,version=version+1 WHERE id=?').run(now(),now(),target.id);
    projects.audit(target.project_id,a,'sync.comment',{source_comment_id:c.id,comment_id:id,original_author_id:c.author_id,actual_actor_id:c.actual_actor_id||c.author_id,display_author_id:a.id});
  }
  function applyStatus(r,target,key,source){
    if(!key||target.workflow_status===key||target.status==='closed')return;const w=workflows.get(target.project_id),s=w.statuses.find(s=>s.key===key);if(!s||!w.transitions.some(t=>t.from===target.workflow_status&&t.to===key&&t.actor!=='customer'))fail(409,'Mapowanie synchronizacji wymaga dozwolonego przejścia w projekcie docelowym.');
    const a=actor(r);if(!a?.active||!projects.canWork(a,projects.project(target.project_id)))fail(409,'Autor synchronizacji utracił dostęp.');
    db.prepare("UPDATE tickets SET workflow_status=?,status=?,resolution_text=?,resolved_at=?,updated_at=?,version=version+1,change_source='sync' WHERE id=?").run(s.key,s.category,source.resolution_text||target.resolution_text,['resolved','closed'].includes(s.category)?target.resolved_at||now():null,now(),target.id);
    projects.audit(target.project_id,a,'sync.status',{source_id:source.id,target_id:target.id,from:target.workflow_status,to:key});workflows.automation.onChange(target,a);
  }
  function process(event){if(JSON.parse(event.payload).origin==='sync')return;const t=desk.ticket(event.ticket_id);if(!t||t.deleted_at||t.archived_at)return;
    for(const pair of db.prepare('SELECT s.*,c.config,c.enabled,c.source_project,c.target_project FROM sync_pairs s JOIN sync_configs c ON c.id=s.config_id WHERE (s.source_id=? OR s.target_id=?) AND c.enabled=1 AND s.enabled=1').all(t.id,t.id)){
      const c=JSON.parse(pair.config),forward=pair.source_id===t.id,target=desk.ticket(forward?pair.target_id:pair.source_id);
      if(!target||target.deleted_at||target.archived_at||projects.project(target.project_id).archived)continue;
      if(event.event==='status_changed')applyStatus(pair,target,(forward?c.to_target:c.to_source).find(m=>m.from===JSON.parse(event.payload).to)?.to,t);
      if(event.event==='comment_added'&&(c.comments==='both'||c.comments===(forward?'to_target':'to_source'))){const comment=db.prepare('SELECT * FROM comments WHERE id=?').get(JSON.parse(event.payload).comment_id);if(comment&&(!comment.internal||c.internal_notes))copyComment(pair,pair,comment,target);}
    }
  }
  return {configs,save,available,transfer,process};
}
