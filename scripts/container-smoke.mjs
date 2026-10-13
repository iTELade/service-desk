// Runs inside an isolated CI container and volume, never against a deployed instance.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { VERSION, SCHEMA_VERSION } from '../lib/version.mjs';
const base='http://127.0.0.1:3000',data=process.env.DATA_DIR||'/app/data';let cookie='',csrf='';
async function api(path,body){const r=await fetch(base+'/api'+path,{method:body?'POST':'GET',headers:{Origin:base,Cookie:cookie,'X-CSRF-Token':csrf,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});if(r.headers.has('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];const value=await r.json();assert.ok(r.ok,path+' failed: '+r.status);return value;}
let health;for(let i=0;i<40;i++){try{const r=await fetch(base+'/healthz');health=await r.json();if(r.ok)break;}catch{}await new Promise(r=>setTimeout(r,500));}
assert.equal(health?.status,'ok');assert.equal(health.version,VERSION);assert.equal(health.schema,SCHEMA_VERSION);
const restart=process.argv.includes('--restart'),password='Container-only-test-password-2026',email='container@x.test';
if(!restart)await api('/setup',{token:readFileSync(join(data,'setup-token'),'utf8').trim(),company_name:'Container QA',brand_name:'Container QA',first_name:'Container',last_name:'QA',email,password});
const session=await api('/login',{email,password});assert.ok(session.csrf);csrf=session.csrf;
if(!restart){const p=await api('/projects',{key:'CON',name:'Container persistence',project_type:'internal'});await api('/tickets',{project_id:p.id,title:'Persistent container ticket',description:'Isolated acceptance fixture',type:'request',priority:'P3'});}
const ticket=await api('/tickets/CON-1');assert.equal(ticket.ticket.title,'Persistent container ticket');
for(const asset of ['/pdfjs/pdf.mjs','/pdfjs/pdf.worker.mjs','/platform.js','/passkeys.js']){const r=await fetch(base+asset);assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/javascript/);assert.ok((await r.text()).length>100);assert.match(r.headers.get('content-security-policy'),/worker-src 'self'/);}
if(restart){const backup=join(data,'container-smoke-backup.sqlite');execFileSync(process.execPath,['scripts/backup.mjs',backup],{stdio:'pipe'});assert.deepEqual(readFileSync(backup+'.master.key'),readFileSync(join(data,'master.key')));const db=new DatabaseSync(backup);try{assert.equal(db.prepare('PRAGMA user_version').get().user_version,SCHEMA_VERSION);assert.equal(db.prepare('SELECT title FROM tickets WHERE key=?').get('CON-1').title,'Persistent container ticket');assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);}finally{db.close();}}
console.log(`Container ${process.arch}: ${restart?'restart, persistence and backup':'startup, authentication and application assets'} passed.`);
