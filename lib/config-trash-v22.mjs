import { fail, integer, now, text, txFor } from './core.mjs';
import { portableBlueprint } from './project-blueprints.mjs';

// Recycle configuration objects without activating them or executing connector jobs.
// A purged entry remains as a minimal tombstone; its content and revisions are erased.
export function createConfigurationTrash(db, { projects }) {
  db.exec("CREATE TABLE IF NOT EXISTS recycle_policy_v22(id INTEGER PRIMARY KEY CHECK(id=1),retention_days INTEGER NOT NULL CHECK(retention_days BETWEEN 1 AND 365),version INTEGER NOT NULL DEFAULT 1)");
  db.prepare('INSERT OR IGNORE INTO recycle_policy_v22(id,retention_days,version) VALUES(1,30,1)').run();
  const tx=txFor(db);
  const admin=u=>{if(u.role!=='admin')fail(403,'Operacja wymaga administratora.');};
  const tables={blueprint:'project_blueprints',draft:'project_drafts'};
  const policy=(b,u)=>{
    admin(u);
    const p=db.prepare('SELECT retention_days,version FROM recycle_policy_v22 WHERE id=1').get();
    if(!b)return p;
    integer(b.retention_days,'Retencja kosza w dniach',1,365);
    if(b.version!==p.version)fail(409,'Polityka retencji została zmieniona.');
    db.prepare('UPDATE recycle_policy_v22 SET retention_days=?,version=version+1 WHERE id=1').run(b.retention_days);
    projects.audit(null,u,'recycle.policy_changed',{old_days:p.retention_days,new_days:b.retention_days});
    return db.prepare('SELECT retention_days,version FROM recycle_policy_v22 WHERE id=1').get();
  };
  function trash(kind,id,b,u){
    admin(u);
    const table=tables[kind];if(!table)fail(400,'Nieznany typ konfiguracji.');
    integer(id,'Konfiguracja');
    return tx(()=>{
      const row=db.prepare('SELECT * FROM '+table+' WHERE id=?').get(id);
      if(!row||kind==='blueprint'&&row.deleted_at)fail(404,'Konfiguracja niedostępna.');
      if(kind==='draft'&&row.activated_at)fail(409,'Aktywowany draft nie może zostać usunięty.');
      if(row.version!==b.version)fail(409,'Konfiguracja zmieniła się.');
      if(b.confirm_name!==row.name)fail(400,'Potwierdź pełną nazwę konfiguracji.');
      const days=policy(null,u).retention_days;
      const expiry=new Date(Date.now()+days*86400000).toISOString();
      const entry=Number(db.prepare('INSERT INTO recycle_entries(kind,resource_id,project_id,snapshot,deleted_by,created_at,expires_at) VALUES(?,?,NULL,?,?,?,?)').run(kind,row.id,JSON.stringify(row),u.id,now(),expiry).lastInsertRowid);
      db.prepare('DELETE FROM '+table+' WHERE id=?').run(row.id);
      projects.audit(null,u,'configuration.recycled',{kind,resource_id:row.id,recycle_id:entry,expires_at:expiry});
      return {id:entry,kind,expires_at:expiry};
    });
  }
  function restore(id,b,u){
    admin(u);integer(id,'Wpis kosza');
    return tx(()=>{
      const entry=db.prepare('SELECT * FROM recycle_entries WHERE id=? AND restored_at IS NULL AND purged_at IS NULL').get(id);
      if(!entry||!tables[entry.kind])fail(404,'Konfiguracja w koszu niedostępna.');
      if(entry.expires_at<now())fail(409,'Wpis wygasł.');
      const row=JSON.parse(entry.snapshot);
      if(b.confirm_name!==row.name)fail(400,'Potwierdź pełną nazwę konfiguracji.');
      if(db.prepare('SELECT 1 FROM '+tables[entry.kind]+' WHERE id=?').get(row.id))fail(409,'Identyfikator konfiguracji jest już zajęty.');
      portableBlueprint(JSON.parse(row.config));
      if(entry.kind==='blueprint')
        db.prepare('INSERT INTO project_blueprints(id,name,config,version,created_by,created_at,deleted_at) VALUES(?,?,?,?,?,?,?)').run(row.id,row.name,row.config,row.version,row.created_by,row.created_at,null);
      else
        db.prepare('INSERT INTO project_drafts(id,name,config,version,created_by,created_at,activated_at,project_ids) VALUES(?,?,?,?,?,?,?,?)').run(row.id,row.name,row.config,row.version,row.created_by,row.created_at,null,row.project_ids);
      db.prepare('UPDATE recycle_entries SET restored_at=? WHERE id=?').run(now(),entry.id);
      projects.audit(null,u,'configuration.restored',{kind:entry.kind,resource_id:row.id,recycle_id:entry.id,activated:false,jobs_resumed:false});
      return {kind:entry.kind,id:row.id,activated:false,jobs_resumed:false};
    });
  }
  function purge(id,b,u){
    admin(u);integer(id,'Wpis kosza');
    if(b.confirm_purge!=='USUŃ NA STAŁE')fail(400,'Wpisz USUŃ NA STAŁE.');
    return tx(()=>{
      const entry=db.prepare('SELECT * FROM recycle_entries WHERE id=? AND restored_at IS NULL AND purged_at IS NULL').get(id);
      if(!entry)fail(404,'Wpis niedostępny.');
      // Ticket deletion requires deleting or anonymizing its linked rows first.
      // Rejecting is safer than pretending that a soft-deleted ticket was erased.
      if(!tables[entry.kind])fail(409,'Trwałe usuwanie zgłoszenia z relacjami wymaga oddzielnej procedury.');
      const row=JSON.parse(entry.snapshot);
      if(b.confirm_name!==row.name)fail(400,'Potwierdź pełną nazwę konfiguracji.');
      db.prepare('DELETE FROM project_blueprint_revisions WHERE kind=? AND resource_id=?').run(entry.kind,entry.resource_id);
      db.prepare("UPDATE recycle_entries SET snapshot='{}',purged_at=? WHERE id=?").run(now(),entry.id);
      projects.audit(null,u,'configuration.purged',{kind:entry.kind,resource_id:entry.resource_id,recycle_id:entry.id});
      return {purged:true,id:entry.id,kind:entry.kind};
    });
  }
  return {policy,trash,restore,purge};
}
