import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {VERSION,SCHEMA_VERSION} from '../lib/version.mjs';
const base='http://127.0.0.1:3000',origin=new URL(process.env.APP_URL).origin;
assert.notEqual(process.getuid(),0,'Container must run without root');
assert.equal(VERSION,process.env.DESK_EXPECTED_VERSION);
let cookie='',csrf='';
async function api(path,data){const r=await fetch(base+path,{method:data?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie,'X-CSRF-Token':csrf},...(data?{body:JSON.stringify(data)}:{})});if(r.headers.has('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];const value=await r.json();assert.ok(r.ok,path+' returned '+r.status);return value;}
const health=await api('/healthz');assert.equal(health.status,'ok');assert.equal(health.version,VERSION);assert.equal(health.schema,SCHEMA_VERSION);assert.equal((await api('/api/public-config')).setup_required,true);
const password=randomBytes(24).toString('hex');await api('/api/setup',{token:readFileSync('/app/data/setup-token','utf8').trim(),brand_name:'Container QA',company_name:'Container QA',first_name:'QA',last_name:'Admin',email:'qa@example.test',password});const login=await api('/api/login',{email:'qa@example.test',password});csrf=login.csrf;assert.equal(login.user.role,'admin');
const project=await api('/api/projects',{key:'QA',name:'Container QA Service',project_type:'external',portal_access:'authenticated'});const ticket=await api('/api/tickets',{project_id:project.id,title:'Container smoke ticket',description:'Synthetic release gate',type:'incident',priority:'P3'});assert.equal(ticket.key,'QA-1');await api('/api/tickets/'+ticket.key+'/comments',{body:'Internal smoke note',internal:true});const detail=await api('/api/tickets/'+ticket.key);assert.ok(detail.comments.some(c=>c.internal));
const db=new DatabaseSync('/app/data/desk.sqlite',{readOnly:true});assert.equal(db.prepare('PRAGMA user_version').get().user_version,SCHEMA_VERSION);assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);assert.ok(db.prepare('SELECT * FROM project_service_settings WHERE project_id=?').get(project.id));db.close();assert.equal(readFileSync('/app/data/master.key').length,32);assert.equal(statSync('/app/data/master.key').mode&0o777,0o600);
console.log('Published container smoke passed: '+VERSION+' / schema '+SCHEMA_VERSION+' / fresh setup / ticket / integrity / non-root.');
