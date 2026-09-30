import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {migrateV9} from '../lib/migration-v9.mjs';

test('schema 9 migrates schema 8 data and seeds 2.0 workspace metadata',()=>{
  const db=new DatabaseSync(':memory:');
  db.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE users(id INTEGER PRIMARY KEY);
    CREATE TABLE projects(id INTEGER PRIMARY KEY,name TEXT,key TEXT,project_type TEXT,portal_access TEXT,portal_slug TEXT,portal_title TEXT,portal_description TEXT,number_padding INTEGER);
    CREATE TABLE request_types(id INTEGER PRIMARY KEY,project_id INTEGER,enabled INTEGER,portal_visible INTEGER,sort_order INTEGER);
    CREATE TABLE v8_saved_views(id INTEGER PRIMARY KEY,owner_id INTEGER,name TEXT,project_id INTEGER,filters TEXT,shared INTEGER,is_default INTEGER,version INTEGER,created_at TEXT,updated_at TEXT);
    INSERT INTO users VALUES(1);
    INSERT INTO projects VALUES(1,'Centrum Wsparcia','CW','external','authenticated','cw','Centrum Wsparcia','Portal',5);
    INSERT INTO request_types VALUES(10,1,1,1,10);
    INSERT INTO v8_saved_views VALUES(1,1,'Moja kolejka',1,'{}',0,1,1,datetime('now'),datetime('now'));
    PRAGMA user_version=8;
  `);
  migrateV9(db);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version,9);
  const settings=db.prepare('SELECT * FROM project_service_settings WHERE project_id=1').get();
  assert.equal(JSON.parse(settings.config).portal.slug,'cw');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM service_catalog_categories').get().n,1);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM service_catalog_category_types').get().n,1);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM integration_health').get().n,5);
  const view=db.prepare('SELECT columns,sort_key,sort_dir,density FROM v8_saved_views WHERE id=1').get();
  assert.deepEqual({...view},{columns:'[]',sort_key:'updated_at',sort_dir:'desc',density:'comfortable'});
});
