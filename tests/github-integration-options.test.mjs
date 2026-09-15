import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fixture} from './fixture.mjs';
import {migrateV8} from '../lib/migration-v8.mjs';
import {createCatalog} from '../lib/catalog.mjs';
import {createWorkflows} from '../lib/workflows.mjs';
import {createDesk} from '../lib/desk.mjs';
import {createV8} from '../lib/v8.mjs';

function setup(){
  const f=fixture();migrateV8(f.db);
  const catalog=createCatalog(f.db,f.projects),workflows=createWorkflows(f.db,f.projects),desk=createDesk(f.db,f.projects,catalog,workflows);
  const p=f.projects.create({key:'GH8',name:'GitHub 1.0.8',project_type:'external',portal_access:'authenticated'},f.admin);
  const rt=f.db.prepare('SELECT * FROM request_types WHERE project_id=? AND enabled=1 ORDER BY id LIMIT 1').get(p.id);
  const v8=createV8(f.db,{projects:f.projects,desk,workflows,catalog,dataDir:f.dataDir,origin:'https://desk.example.test',fetcher:async()=>({ok:true,status:200,async text(){return '{}';}})});
  const call=async(method,path,body={},query='')=>(await v8.handle(method,path,f.admin,new URLSearchParams(query),async()=>body)).value;
  return {...f,p,rt,v8,call,close(){workflows.automation.stop();f.close();}};
}
function addUser(f,email,role='customer'){
  const id=Number(f.db.prepare("INSERT INTO users(email,name,username,password,role,must_change,active,created_at) VALUES(?,?,?,?,?,0,1,?)").run(email,email,email.split('@')[0],'TEST',role,new Date().toISOString()).lastInsertRowid);
  return f.db.prepare('SELECT * FROM users WHERE id=?').get(id);
}

test('GitHub reporter options include active customer and service accounts and exclude disabled accounts',async()=>{
  const f=setup();try{
    const customer=addUser(f,'github-customer-108@example.test','customer');
    const service=addUser(f,'github-service-108@example.test','agent');
    const disabled=addUser(f,'github-disabled-108@example.test','customer');
    f.db.prepare("UPDATE users SET account_kind='service' WHERE id=?").run(service.id);
    f.db.prepare('UPDATE users SET active=0 WHERE id=?').run(disabled.id);
    const opts=await f.call('GET','/api/desk/v8/github-options',{},'project_id='+f.p.id);
    assert.ok(opts.reporters.some(x=>x.id===customer.id));
    assert.ok(opts.reporters.some(x=>x.id===service.id&&x.account_kind==='service'));
    assert.ok(!opts.reporters.some(x=>x.id===disabled.id));
    const created=await f.call('POST','/api/desk/v8/github',{name:'GH intake',owner:'acme',repo:'widget',project_id:f.p.id,request_type_id:f.rt.id,reporter_id:customer.id,token:'github-token-for-tests',label_priority:{},comment_template:'Moved to {ticket_url}',poll_minutes:5,enabled:true});
    assert.equal(created.reporter_id,customer.id);
  }finally{f.close();}
});

test('GitHub project selector does not hide active project types',()=>{
  const ui=readFileSync(new URL('../public/settings-center.js',import.meta.url),'utf8');
  const start=ui.indexOf('async function renderGithub');
  const end=ui.indexOf('async function renderPlugins');
  assert.ok(start>=0&&end>start);
  const github=ui.slice(start,end);
  assert.match(github,/state\.meta\.projects\.filter\(p=>!p\.archived\)/);
  assert.doesNotMatch(github,/project_type!==['"]assets['"]/);
  assert.doesNotMatch(github,/p\.can_manage/);
});
