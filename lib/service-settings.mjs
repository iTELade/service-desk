import {now,fail,txFor} from './core.mjs';
const exists=db=>Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE name='project_service_settings'").get());
const parse=v=>{try{return JSON.parse(v||'{}');}catch{return {};}};
// Keep migrated configuration and existing project APIs in one transaction.
export function syncServiceSettings(db,p){
  if(!exists(db))return;
  const legacy=parse(p.settings),config={...legacy,portal:{access:p.portal_access,slug:p.portal_slug,title:p.portal_title||p.name,description:p.portal_description||'',...legacy.portal},requests:{number_padding:p.number_padding},navigation:{show_knowledge:true,show_assets:true,show_reports:true},workspace:{default_view:'queue',density:'comfortable'}};
  db.prepare('INSERT INTO project_service_settings(project_id,config,updated_at) VALUES(?,?,?) ON CONFLICT(project_id) DO UPDATE SET config=excluded.config,version=version+1,updated_at=excluded.updated_at WHERE config<>excluded.config').run(p.id,JSON.stringify(config),now());
  if(p.project_type!=='external')return;
  if(!db.prepare('SELECT id FROM service_catalog_categories WHERE project_id=?').get(p.id))db.prepare("INSERT INTO service_catalog_categories(project_id,name,created_at,updated_at) VALUES(?,'Ogólne',?,?)").run(p.id,now(),now());
  const category=db.prepare('SELECT id FROM service_catalog_categories WHERE project_id=? ORDER BY sort_order,id LIMIT 1').get(p.id);
  db.prepare('INSERT OR IGNORE INTO service_catalog_category_types(category_id,request_type_id,sort_order) SELECT ?,id,sort_order FROM request_types WHERE project_id=? AND enabled=1 AND portal_visible=1 AND id NOT IN (SELECT request_type_id FROM service_catalog_category_types)').run(category.id,p.id);
}
export function createServiceSettings(db,projects){
  const tx=txFor(db);
  for(const p of db.prepare('SELECT * FROM projects').all())syncServiceSettings(db,p);
  function preferences(u,b){
    const old=db.prepare('SELECT * FROM ui_preferences WHERE user_id=?').get(u.id)||{user_id:u.id,sidebar_collapsed:0,density:'comfortable',locale:'pl',home_route:u.role==='customer'?'#/portal':'#/queue',version:0};
    if(!b)return old;
    if(b.version!==undefined&&b.version!==old.version)fail(409,'Preferences changed. Refresh and retry.');
    const v={...old,...b};
    if(![0,1,false,true].includes(v.sidebar_collapsed)||!['comfortable','compact'].includes(v.density)||!['pl','en','de'].includes(v.locale)||!['#/queue','#/board','#/portal','#/projects'].includes(v.home_route))fail(400,'Invalid UI preferences.');
    db.prepare('INSERT INTO ui_preferences(user_id,sidebar_collapsed,density,locale,home_route,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET sidebar_collapsed=excluded.sidebar_collapsed,density=excluded.density,locale=excluded.locale,home_route=excluded.home_route,version=version+1,updated_at=excluded.updated_at').run(u.id,Number(v.sidebar_collapsed),v.density,v.locale,v.home_route,now());
    return preferences(u);
  }
  function catalog(u,projectId){
    const p=projects.project(Number(projectId));if(!p||(!projects.canWork(u,p)&&!projects.canPortal(u,p)))fail(404,'Project not found.');
    syncServiceSettings(db,p);
    return db.prepare('SELECT * FROM service_catalog_categories WHERE project_id=? AND enabled=1 ORDER BY sort_order,id').all(p.id).map(c=>({...c,request_types:db.prepare('SELECT r.id,r.name,r.description FROM request_types r JOIN service_catalog_category_types m ON m.request_type_id=r.id WHERE m.category_id=? AND r.project_id=? AND r.enabled=1 AND r.portal_visible=1 ORDER BY m.sort_order,r.id').all(c.id,p.id)}));
  }
  function project(u,id,b){
    const p=projects.requireProject(id,u,Boolean(b));syncServiceSettings(db,p);
    if(b){if(b.version!==p.version)fail(409,'Project changed. Refresh and retry.');return tx(()=>projects.update(id,b,u));}
    const row=db.prepare('SELECT * FROM project_service_settings WHERE project_id=?').get(p.id);return {...row,config:parse(row.config),project_version:p.version};
  }
  function health(u){
    if(u.role!=='admin')fail(403,'Administrator required.');
    // Unknown means no successful connectivity probe; configuration alone is not health.
    return db.prepare('SELECT * FROM integration_health ORDER BY integration_key').all().map(r=>({...r,details:parse(r.details)}));
  }
  return {preferences,catalog,project,health};
}

export function recordIntegrationHealth(db,key,state,message='',latency=null,details={}){
  if(!db.prepare("SELECT 1 FROM sqlite_master WHERE name='integration_health'").get())return;
  if(!['unknown','connected','warning','error','disabled'].includes(state))throw Error('Invalid integration health state');
  const stamp=now();db.prepare('INSERT INTO integration_health(integration_key,state,message,latency_ms,details,checked_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(integration_key) DO UPDATE SET state=excluded.state,message=excluded.message,latency_ms=excluded.latency_ms,details=excluded.details,checked_at=excluded.checked_at,updated_at=excluded.updated_at').run(key,state,message,latency,JSON.stringify(details),state==='unknown'||state==='disabled'?null:stamp,stamp);
}
