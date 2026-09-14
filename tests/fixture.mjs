import {migrateV7} from '../lib/migration-v7.mjs';
import {migrateV6} from '../lib/migration-v6.mjs';
import {migrateV5} from '../lib/migration-v5.mjs';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {migrateV2,migrateV3,migrateV4} from '../lib/migrations.mjs';
import {createProjects} from '../lib/projects.mjs';
// Schemat v1 pozostaje w serwerze jako pierwsza, niezmienna migracja.
export function legacyDb(){
  const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON;');
  const sql=readFileSync(new URL('../server.mjs',import.meta.url),'utf8').match(/db\.exec\(`(BEGIN IMMEDIATE;[\s\S]*?COMMIT;)`\);/)[1];
  db.exec(sql);
  db.prepare("INSERT INTO users(id,email,name,password,role,must_change,created_at) VALUES(1,'admin@example.test','Admin','TEST-ONLY','admin',0,?)").run(new Date().toISOString());
  return db;
}
export function fixture(){
  const db=legacyDb();migrateV2(db);migrateV3(db);migrateV4(db);migrateV5(db);migrateV6(db);migrateV7(db);const projects=createProjects(db),admin=db.prepare('SELECT * FROM users WHERE id=1').get();
  const dataDir=mkdtempSync(join(tmpdir(),'itelade-unit-'));
  return {db,projects,admin,dataDir,close(){db.close();rmSync(dataDir,{recursive:true,force:true});}};
}
