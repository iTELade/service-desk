import {txFor} from './core.mjs';

export function migrateV9(db){
  const version=db.prepare('PRAGMA user_version').get().user_version;
  if(version===9)return;
  if(version!==8)throw new Error('Migracja v9 wymaga bazy v8.');
  txFor(db)(()=>{
    db.exec(`
      CREATE TABLE ui_preferences(
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        sidebar_collapsed INTEGER NOT NULL DEFAULT 0 CHECK(sidebar_collapsed IN (0,1)),
        density TEXT NOT NULL DEFAULT 'comfortable' CHECK(density IN ('comfortable','compact')),
        locale TEXT NOT NULL DEFAULT 'pl',
        home_route TEXT NOT NULL DEFAULT '#/queue',
        version INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE project_service_settings(
        project_id INTEGER PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
        config TEXT NOT NULL DEFAULT '{}',
        version INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE integration_health(
        integration_key TEXT PRIMARY KEY,
        state TEXT NOT NULL DEFAULT 'unknown' CHECK(state IN ('unknown','connected','warning','error','disabled')),
        message TEXT NOT NULL DEFAULT '',
        latency_ms INTEGER,
        details TEXT NOT NULL DEFAULT '{}',
        checked_at TEXT,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE service_catalog_categories(
        id INTEGER PRIMARY KEY,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        icon TEXT NOT NULL DEFAULT 'service',
        sort_order INTEGER NOT NULL DEFAULT 10,
        enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(project_id,name)
      );
      CREATE INDEX idx_catalog_categories_project ON service_catalog_categories(project_id,sort_order,id);
      CREATE TABLE service_catalog_category_types(
        category_id INTEGER NOT NULL REFERENCES service_catalog_categories(id) ON DELETE CASCADE,
        request_type_id INTEGER NOT NULL REFERENCES request_types(id) ON DELETE CASCADE,
        sort_order INTEGER NOT NULL DEFAULT 10,
        PRIMARY KEY(category_id,request_type_id)
      );
      ALTER TABLE v8_saved_views ADD COLUMN columns TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE v8_saved_views ADD COLUMN sort_key TEXT NOT NULL DEFAULT 'updated_at';
      ALTER TABLE v8_saved_views ADD COLUMN sort_dir TEXT NOT NULL DEFAULT 'desc' CHECK(sort_dir IN ('asc','desc'));
      ALTER TABLE v8_saved_views ADD COLUMN density TEXT NOT NULL DEFAULT 'comfortable' CHECK(density IN ('comfortable','compact'));
    `);
    const stamp=new Date().toISOString();
    const saveProject=db.prepare('INSERT INTO project_service_settings(project_id,config,updated_at) VALUES(?,?,?)');
    const addCategory=db.prepare("INSERT INTO service_catalog_categories(project_id,name,description,icon,sort_order,created_at,updated_at) VALUES(?,?,?,?,10,?,?)");
    const mapType=db.prepare('INSERT OR IGNORE INTO service_catalog_category_types(category_id,request_type_id,sort_order) VALUES(?,?,?)');
    for(const p of db.prepare('SELECT * FROM projects').all()){
      saveProject.run(p.id,JSON.stringify({
        portal:{access:p.portal_access||'members',slug:p.portal_slug||null,title:p.portal_title||p.name,description:p.portal_description||''},
        requests:{number_padding:Number(p.number_padding||0)},
        navigation:{show_knowledge:true,show_assets:true,show_reports:true},
        workspace:{default_view:'queue',density:'comfortable'}
      }),stamp);
      if(p.project_type==='external'){
        const categoryId=Number(addCategory.run(p.id,'Ogólne','Najczęściej używane typy zgłoszeń','service',stamp,stamp).lastInsertRowid);
        const types=db.prepare('SELECT id FROM request_types WHERE project_id=? AND enabled=1 AND portal_visible=1 ORDER BY sort_order,id').all(p.id);
        types.forEach((row,index)=>mapType.run(categoryId,row.id,(index+1)*10));
      }
    }
    const health=db.prepare('INSERT INTO integration_health(integration_key,state,updated_at) VALUES(?,?,?)');
    for(const key of ['directory','sso','smtp','github','updater'])health.run(key,'unknown',stamp);
    db.exec('PRAGMA user_version=9; PRAGMA optimize;');
  });
}
