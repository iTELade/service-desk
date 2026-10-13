import { VERSION, SCHEMA_VERSION } from '../lib/version.mjs';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, copyFileSync, symlinkSync, rmSync } from 'node:fs';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { DatabaseSync } from 'node:sqlite';
import { secretStore } from '../lib/secrets.mjs';

const root=dirname(dirname(fileURLToPath(import.meta.url))), baseline='09d73ecd43161b6b4d80f2d3823a390ab43296bd', scratch=mkdtempSync(join(tmpdir(),'desk22-upgrade-'));
const oldRoot=join(scratch,'old'), dataDir=join(scratch,'data'), preBackup=join(scratch,'pre.sqlite'), postBackup=join(scratch,'post.sqlite');
mkdirSync(oldRoot);mkdirSync(dataDir);
const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
const base='http://127.0.0.1:'+port, password='Upgrade-fixture-password-2026', smtpSecret='upgrade-fixture-secret';
let server,cookie='',csrf='';
async function start(code,volume){
  cookie='';csrf='';let stderr='';
  server=spawn(process.execPath,[join(code,'server.mjs')],{cwd:code,env:{...process.env,NODE_ENV:'test',APP_URL:base,HOST:'127.0.0.1',PORT:String(port),DATA_DIR:volume},stdio:['ignore','pipe','pipe']});
  server.stderr.on('data',c=>stderr=(stderr+c).slice(-6000));
  await new Promise((res,rej)=>{const timeout=setTimeout(()=>rej(Error('Upgrade server startup timed out.')),15000);server.once('exit',()=>{clearTimeout(timeout);rej(Error('Upgrade server exited: '+stderr));});server.stdout.on('data',c=>{if(String(c).includes('porcie')){clearTimeout(timeout);res();}});});
}
async function stop(){if(server&&!server.killed&&server.exitCode===null&&server.signalCode===null){const exited=once(server,'exit');server.kill('SIGTERM');await exited;}server=null;}
async function api(path,data,method='POST'){
  const r=await fetch(base+path,{method:data===undefined?'GET':method,headers:{Origin:base,'Content-Type':'application/json',Cookie:cookie,'X-CSRF-Token':csrf},...(data===undefined?{}:{body:JSON.stringify(data)})});
  if(r.headers.has('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];const value=await r.json();assert.ok(r.ok,path+': HTTP '+r.status);return value;
}
async function login(){const r=await api('/api/login',{email:'upgrade@example.test',password});csrf=r.csrf;assert.equal(r.user.role,'admin');}
function inspect(volume,schema){const db=new DatabaseSync(join(volume,'desk.sqlite'),{readOnly:true});try{assert.equal(db.prepare('PRAGMA user_version').get().user_version,schema);assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(secretStore(volume).open(db.prepare('SELECT secret FROM smtp_settings WHERE id=1').get().secret),smtpSecret);}finally{db.close();}}
function backup(volume,destination){execFileSync(process.execPath,[join(root,'scripts/backup.mjs'),destination],{env:{...process.env,DATA_DIR:volume},stdio:'pipe'});assert.equal(readFileSync(destination+'.master.key').length,32);}
function restore(file,name){const volume=join(scratch,name);mkdirSync(volume);copyFileSync(file,join(volume,'desk.sqlite'));copyFileSync(file+'.master.key',join(volume,'master.key'));return volume;}
try{
  const archive=execFileSync('git',['archive',baseline],{cwd:root,maxBuffer:40*1024*1024});execFileSync('tar',['-xf','-','-C',oldRoot],{input:archive});symlinkSync(resolve(root,'node_modules'),join(oldRoot,'node_modules'),'dir');
  await start(oldRoot,dataDir);assert.deepEqual(await api('/healthz'),{status:'ok',version:'2.1.0',schema:10});
  await api('/api/setup',{token:readFileSync(join(dataDir,'setup-token'),'utf8').trim(),company_name:'Upgrade QA',brand_name:'Upgrade QA',first_name:'Upgrade',last_name:'QA',email:'upgrade@example.test',password});await login();
  const project=await api('/api/projects',{key:'UPG',name:'Upgrade project',project_type:'external',portal_access:'authenticated'}), created=await api('/api/tickets',{project_id:project.id,title:'Preserved ticket',description:'Pre-upgrade content',type:'incident',priority:'P3'});
  await api('/api/tickets/'+created.key+'/comments',{body:'Private pre-upgrade note',internal:true});
  const smtp=await api('/api/desk/smtp');await api('/api/desk/smtp',{...smtp,enabled:false,host:'smtp.example.test',user:'fixture',password:smtpSecret,from_email:'noreply@example.test',from_name:'Upgrade QA'});
  backup(dataDir,preBackup);await stop();inspect(dataDir,10);
  const key=readFileSync(join(dataDir,'master.key'));
  await start(root,dataDir);assert.deepEqual(await api('/healthz'),{status:'ok',version:VERSION,schema:SCHEMA_VERSION});await login();
  const detail=await api('/api/tickets/'+created.key);assert.equal(detail.ticket.description,'Pre-upgrade content');assert.ok(detail.comments.some(c=>c.internal&&c.body==='Private pre-upgrade note'));assert.ok(readFileSync(join(dataDir,'master.key')).equals(key));inspect(dataDir,SCHEMA_VERSION);
  const next=await api('/api/tickets',{project_id:project.id,title:'Post-upgrade ticket',description:'New content',type:'incident',priority:'P3'});assert.equal(next.key,'UPG-2');
  await api('/api/desk/plugins',{id:'upgrade.settings',name:'Upgrade settings',version:'1.0.0',capabilities:['admin.settings'],permissions:['ui.extension'],hooks:[{id:'config',kind:'admin.settings',label:'Config',fields:[{key:'secret',label:'Secret',type:'password',required:true}]}]});
  await api('/api/desk/v22/plugins/upgrade.settings/connector',{version:0,url:'https://fixture.example.test/execute',project_ids:[project.id],permissions:['ui.extension']});
  await api('/api/desk/v22/plugin-settings/upgrade.settings/0',{hook_id:'config',version:0,input:{secret:'post-upgrade-fixture-secret'}});backup(dataDir,postBackup);await stop();
  const post=restore(postBackup,'restore-new');await start(root,post);await login();inspect(post,SCHEMA_VERSION);assert.equal((await api('/api/desk/v22/plugin-settings/upgrade.settings/0'))[0].has_secret.secret,true);assert.equal((await api('/api/tickets/'+next.key)).ticket.key,'UPG-2');await stop();
  const pre=restore(preBackup,'rollback-old');await start(oldRoot,pre);await login();inspect(pre,10);assert.equal((await api('/api/tickets/'+created.key)).ticket.key,'UPG-1');await stop();
  console.log('2.1.0 → 2.2.0 upgrade, login, private history, numbering, encrypted secrets, backup/restore and pre-upgrade rollback passed.');
}finally{await stop();rmSync(scratch,{recursive:true,force:true});}
