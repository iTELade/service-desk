import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fixture} from './fixture.mjs';
import {migrateV8} from '../lib/migration-v8.mjs';

const source=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
function addUser(f,email,{ssoOnly=1,github=true}={}){
  const id=Number(f.db.prepare("INSERT INTO users(email,name,username,password,role,must_change,active,sso_only,created_at) VALUES(?,?,?,?, 'customer',0,1,?,?)").run(email,email,email.split('@')[0],'!test',ssoOnly,new Date().toISOString()).lastInsertRowid);
  if(github){const provider=Number(f.db.prepare("INSERT INTO sso_providers(name,issuer,client_id,secret,config,enabled) VALUES('GitHub','https://github.com/','x','x','{}',1)").run().lastInsertRowid);f.db.prepare('INSERT INTO sso_subjects(provider_id,subject,user_id) VALUES(?,?,?)').run(provider,String(1000+id),id);}
  return f.db.prepare('SELECT * FROM users WHERE id=?').get(id);
}

test('public GitHub project is readable publicly but write access is GitHub-authenticated and project-scoped',()=>{const f=fixture();try{migrateV8(f.db);const pub=f.projects.create({key:'PUB',name:'Public GitHub',project_type:'external',portal_access:'public_github'},f.admin),normal=f.projects.create({key:'SEC',name:'Authenticated portal',project_type:'external',portal_access:'authenticated'},f.admin),gh=addUser(f,'gh@example.test'),plain=addUser(f,'plain@example.test',{github:false,ssoOnly:0});assert.equal(f.projects.publicReadable(f.projects.project(pub.id)),true);assert.equal(f.projects.publicReadable(f.projects.project(normal.id)),false);assert.equal(f.projects.canPortal(gh,f.projects.project(pub.id)),true);assert.equal(f.projects.canPortal(gh,f.projects.project(normal.id)),false);assert.equal(f.projects.canPortal(plain,f.projects.project(pub.id)),false);assert.equal(f.projects.canPortal(plain,f.projects.project(normal.id)),true);f.db.prepare("INSERT INTO project_members(project_id,user_id,role) VALUES(?,?,'requester')").run(normal.id,gh.id);assert.equal(f.projects.canPortal(gh,f.projects.project(normal.id)),true);}finally{f.close();}});

test('public GitHub portal exposes read-only anonymous API and GitHub login UI without public write endpoint',()=>{const server=source('server.mjs'),app=source('public/app.js'),projects=source('lib/projects.mjs');assert.match(projects,/public_github/);assert.match(server,/publicPortal=pathname\.match/);assert.match(server,/c\.internal=0/);assert.doesNotMatch(server,/method==='POST'&&publicPortal/);assert.match(app,/Zaloguj przez GitHub, aby utworzyć zgłoszenie/);assert.match(app,/Zaloguj przez GitHub, aby skomentować/);assert.match(app,/publicProjectTicketView/);});
