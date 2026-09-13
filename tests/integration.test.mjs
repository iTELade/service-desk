import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

const root=dirname(dirname(fileURLToPath(import.meta.url)));
const dataDir=mkdtempSync(join(tmpdir(),'itelade-desk-test-'));
let child, base, logs='';
const initial='Test-only-initial-Password-2026';
const permanent='Test-only-new-Password-2026';
const env={...process.env,SMTP_HOST:'',SMTP_PORT:'',SMTP_USER:'',SMTP_PASS:'',SMTP_FROM_EMAIL:'',SMTP_SECURE:'',NODE_ENV:'test',DATA_DIR:dataDir,BOOTSTRAP_ADMIN_EMAIL:'admin@example.test',BOOTSTRAP_ADMIN_PASSWORD:initial,HOST:'127.0.0.1',PORT:'0',APP_URL:'http://localhost:3000'};
async function start(){
  child=spawn(process.execPath,['server.mjs'],{cwd:root,env,stdio:['ignore','pipe','pipe']});
  child.stderr.on('data',c=>logs+=c);
  base=await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('Start timeout: '+logs)),10000);
    child.once('exit',code=>{clearTimeout(timer);reject(new Error('Server exit '+code+': '+logs));});
    child.stdout.on('data',c=>{logs+=c;const match=String(c).match(/porcie (\d+)/);if(match){clearTimeout(timer);resolve('http://127.0.0.1:'+match[1]);}});
  });
}
async function stop(){if(child && child.exitCode===null){child.kill('SIGTERM');await once(child,'exit');}}
class Client{
  cookie='';csrf='';user=null;
  async call(path,method='GET',data,overrides={}){
    const response=await fetch(base+'/api'+path,{method,headers:{'Content-Type':'application/json',Origin:env.APP_URL,Cookie:this.cookie,'X-CSRF-Token':this.csrf,...overrides},...(data===undefined?{}:{body:JSON.stringify(data)})});
    if(response.headers.has('set-cookie'))this.cookie=response.headers.get('set-cookie').split(';')[0];
    const value=await response.json();return {status:response.status,data:value,headers:response.headers};
  }
  async login(email,password=initial){const r=await this.call('/login','POST',{email,password});assert.equal(r.status,200,JSON.stringify(r.data));this.csrf=r.data.csrf;this.user=r.data.user;return r;}
  async rotate(){const r=await this.call('/password','POST',{current_password:initial,new_password:permanent});assert.equal(r.status,200);}
}
const admin=new Client(), agent=new Client(), alice=new Client(), bob=new Client();
let key, agentId, projectId;
before(start);
after(async()=>{await stop();rmSync(dataDir,{recursive:true,force:true});});

test('Uwierzytelnianie, wymuszona zmiana hasła i ochrona CSRF',async()=>{
  assert.equal((await fetch(base+'/healthz')).status,200);
  const page=await fetch(base+'/');assert.equal(page.status,200);assert.match(page.headers.get('content-security-policy'),/script-src 'self'/);
  assert.match(await page.text(),/Service Desk/);
  for(const asset of ['/app.js','/app.css','/favicon.svg'])assert.equal((await fetch(base+asset)).status,200);
  assert.equal((await admin.call('/meta')).status,401);
  assert.equal((await admin.call('/login','POST',{email:'admin@example.test',password:initial},{Origin:'https://wrong.example'})).status,403);
  assert.equal((await admin.call('/login','POST',{email:'admin@example.test',password:'wrong'})).status,401);
  const logged=await admin.login('admin@example.test');
  assert.match(logged.headers.get('set-cookie'),/HttpOnly/);
  assert.match(logged.headers.get('set-cookie'),/SameSite=Lax/);
  assert.equal((await admin.call('/meta')).status,403);
  assert.equal((await admin.call('/password','POST',{current_password:initial,new_password:permanent},{'X-CSRF-Token':'wrong'})).status,403);
  await admin.rotate();
  assert.equal((await admin.call('/meta')).status,200);
  assert.equal((await admin.call('/password','POST',{current_password:permanent,new_password:'short'})).status,400);
});

test('Role, tworzenie użytkowników i projekty obsługi / software',async()=>{
  for(const [name,email,role] of [['Agent','agent@example.test','agent'],['Alice','alice@example.test','customer'],['Bob','bob@example.test','customer']]){
    assert.equal((await admin.call('/users','POST',{name,email,role,password:initial})).status,201);
  }
  const users=(await admin.call('/users')).data;
  agentId=users.find(u=>u.role==='agent').id;
  assert.ok(users.every(u=>!Object.hasOwn(u,'password')));
  for(const [client,email] of [[agent,'agent@example.test'],[alice,'alice@example.test'],[bob,'bob@example.test']]){await client.login(email);await client.rotate();}
  assert.equal((await agent.call('/users')).status,403);
  assert.equal((await alice.call('/users')).status,403);
  assert.equal((await alice.call('/projects/1/agents')).status,404);
  assert.equal((await admin.call('/projects/1/members','POST',{user_id:agentId,role:'agent'})).status,200);
  const software={key:'DEV',name:'Rozwój',description:'Projekt wewnętrzny',project_type:'internal'};
  assert.equal((await alice.call('/projects','POST',software)).status,403);
  assert.equal((await admin.call('/projects','POST',software)).status,201);
  assert.equal((await admin.call('/projects','POST',software)).status,409);
  projectId=(await admin.call('/meta')).data.projects.find(p=>p.key==='DEV').id;
  assert.ok(!(await alice.call('/meta')).data.projects.find(p=>p.key==='DEV'));
  assert.equal((await admin.call('/projects/'+projectId+'/members','POST',{user_id:agentId,role:'agent'})).status,200);
});

test('Klient tworzy zgłoszenie, inne konto nie ma do niego dostępu',async()=>{
  const payload={project_id:1,title:'Błąd logowania <img src=x onerror=alert(1)>',description:'Kontrolowana treść testowa: nie można się zalogować.',priority:'P1',type:'incident',assignee_id:agentId};
  const created=await alice.call('/tickets','POST',payload);assert.equal(created.status,201);key=created.data.key;
  const t=(await alice.call('/tickets/'+key)).data.ticket;
  assert.equal(t.key,'IT-1');assert.equal(t.assignee_id,null);assert.equal(t.reporter_id,alice.user.id);
  assert.equal(Date.parse(t.resolution_due_at)-Date.parse(t.created_at),8*3600000);
  assert.equal((await alice.call('/tickets')).data.total,1);
  assert.equal((await bob.call('/tickets')).data.total,0);
  assert.equal((await bob.call('/stats')).data.open,0);
  for(const method of ['GET','PATCH'])assert.equal((await bob.call('/tickets/'+key,method,method==='PATCH'?{version:1,status:'open'}:undefined)).status,404);
  assert.equal((await bob.call('/tickets/'+key+'/comments','POST',{body:'Nieautoryzowana wiadomość'})).status,404);
  assert.equal((await alice.call('/tickets','POST',{...payload,project_id:projectId})).status,403);
  assert.equal((await alice.call('/tickets','POST',{...payload,priority:'INVALID'})).status,400);
  assert.equal((await alice.call('/tickets/'+key,'PATCH',{version:t.version,assignee_id:agentId})).status,403);
  assert.equal((await alice.call('/tickets/'+key,'PATCH',{version:t.version,status:'in_progress'})).status,403);
  assert.equal((await agent.call('/tickets?q='+encodeURIComponent("' OR 1=1 --"))).data.total,0);
});

test('Notatki wewnętrzne pozostają prywatne; pierwsza odpowiedź i workflow',async()=>{
  assert.equal((await alice.call('/tickets/'+key+'/comments','POST',{body:'Ukryta próba',internal:true})).status,403);
  assert.equal((await agent.call('/tickets/'+key+'/comments','POST',{body:'SECRET_INTERNAL_NOTE',internal:true})).status,201);
  let visible=await alice.call('/tickets/'+key);
  assert.ok(!JSON.stringify(visible.data).includes('SECRET_INTERNAL_NOTE'));
  assert.equal(visible.data.ticket.first_response_at,null);
  assert.equal((await agent.call('/tickets/'+key)).data.comments.length,1);
  assert.equal((await agent.call('/tickets/'+key+'/comments','POST',{body:'Odpowiedź publiczna',internal:false})).status,201);
  visible=await alice.call('/tickets/'+key);assert.equal(visible.data.comments.length,1);assert.ok(visible.data.ticket.first_response_at);
  assert.equal((await agent.call('/tickets/'+key,'PATCH',{version:visible.data.ticket.version,status:'waiting',assignee_id:agentId})).status,200);
  assert.equal((await alice.call('/tickets/'+key+'/comments','POST',{body:'Klient przesyła uzupełnienie'})).status,201);
  assert.equal((await agent.call('/tickets/'+key)).data.ticket.status,'open');
});

test('Dwie równoczesne zmiany nie nadpisują się bez ostrzeżenia',async()=>{
  const {version}=(await agent.call('/tickets/'+key)).data.ticket;
  const results=await Promise.all([
    agent.call('/tickets/'+key,'PATCH',{version,status:'in_progress'}),
    admin.call('/tickets/'+key,'PATCH',{version,status:'waiting'})
  ]);
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
  assert.equal((await agent.call('/tickets/'+key)).data.ticket.version,version+1);
});

test('Rozwiązanie i ostateczne zamknięcie, bez ponownego otwarcia',async()=>{
  let t=(await agent.call('/tickets/'+key)).data.ticket;
  assert.equal((await agent.call('/tickets/'+key,'PATCH',{version:t.version,status:'resolved'})).status,200);
  t=(await alice.call('/tickets/'+key)).data.ticket;assert.ok(t.resolved_at);
  assert.equal((await alice.call('/tickets/'+key,'PATCH',{version:t.version,status:'closed'})).status,200);
  assert.equal((await alice.call('/tickets/'+key+'/comments','POST',{body:'Próba po zamknięciu'})).status,409);
  t=(await alice.call('/tickets/'+key)).data.ticket;
  assert.equal((await alice.call('/tickets/'+key,'PATCH',{version:t.version,status:'open'})).status,403);
  assert.ok((await alice.call('/tickets/'+key)).data.ticket.closed_at);
  assert.equal((await agent.call('/tickets','POST',{project_id:projectId,title:'Błąd aplikacji',description:'Zadanie programistyczne.',type:'bug',priority:'P3',assignee_id:agentId})).status,201);
  assert.equal((await bob.call('/tickets/DEV-1')).status,404);
});

test('Trwałość po restarcie i spójna kopia bazy z aktywnym WAL',async()=>{
  const copy=join(dataDir,'backup.sqlite');
  execFileSync(process.execPath,['scripts/backup.mjs',copy],{cwd:root,env});
  const backup=new DatabaseSync(copy,{readOnly:true});
  assert.equal(backup.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  assert.equal(execFileSync(process.execPath,['-e',"const f=require('fs'); if(f.readFileSync(process.argv[1]).length!==32)process.exit(1)",copy+'.master.key']).length,0);
  assert.equal(backup.prepare('SELECT COUNT(*) n FROM tickets').get().n,2);backup.close();
  await stop();await start();
  const loaded=await alice.call('/tickets/'+key);assert.equal(loaded.status,200);assert.equal(loaded.data.ticket.key,key);
  assert.ok(!JSON.stringify(loaded.data).includes('SECRET_INTERNAL_NOTE'));
});

test('Dezaktywacja konta odbiera dostęp i usuwa przypisania',async()=>{
  const users=(await admin.call('/users')).data;
  assert.equal((await admin.call('/users/'+admin.user.id,'PATCH',{active:false,version:users.find(u=>u.id===admin.user.id).version})).status,400);
  assert.equal((await admin.call('/users/'+agentId,'PATCH',{active:false,version:users.find(u=>u.id===agentId).version})).status,200);
  assert.equal((await agent.call('/meta')).status,401);
  assert.equal((await agent.call('/login','POST',{email:'agent@example.test',password:permanent})).status,401);
  assert.equal((await admin.call('/tickets/'+key)).data.ticket.assignee_id,null);
  assert.equal((await admin.call('/tickets/DEV-1')).data.ticket.assignee_id,null);
});

test('Reset hasła unieważnia stare sesje i wymusza ponowną zmianę',async()=>{
  const reset='Temporary-reset-only-Password-2026';
  execFileSync(process.execPath,['scripts/reset-password.mjs'],{cwd:root,env,input:'alice@example.test\n'+reset+'\n'});
  assert.equal((await alice.call('/me')).status,401);
  await alice.login('alice@example.test',reset);
  assert.equal((await alice.call('/meta')).status,403);
  assert.equal((await alice.call('/password','POST',{current_password:reset,new_password:permanent})).status,200);
  assert.equal((await alice.call('/tickets')).data.total,1);
});

const requester=new Client(), outsiderAgent=new Client(), internalCustomer=new Client();
let v2project,v2key, outsiderId, memberClientId;
test('Rejestracja od pierwszego uruchomienia: oczekiwanie, zatwierdzenie i brak eskalacji roli',async()=>{
  const cfg=(await requester.call('/public-config')).data;assert.equal(cfg.registration_mode,'approval');
  const b={name:'Registered Client',email:'registered@example.test',password:permanent,role:'admin',is_internal:true};
  assert.equal((await requester.call('/register','POST',b,{Origin:'https://evil.test'})).status,403);
  assert.equal((await requester.call('/register','POST',b)).status,200);
  assert.equal((await requester.call('/login','POST',{email:b.email,password:b.password})).status,403);
  let u=(await admin.call('/users')).data.find(u=>u.email===b.email);memberClientId=u.id;assert.equal(u.role,'customer');assert.equal(u.is_internal,false);assert.equal(u.registration_state,'pending_approval');
  assert.ok(!(await admin.call('/projects/1/candidates')).data.find(c=>c.id===u.id));
  assert.equal((await alice.call('/users/'+u.id,'PATCH',{version:u.version,approve:true})).status,403);
  assert.equal((await admin.call('/users/'+u.id,'PATCH',{version:u.version,approve:true})).status,200);
  await requester.login(b.email,permanent);assert.equal((await requester.call('/tickets')).data.total,0);assert.equal((await requester.call('/users')).status,403);
  assert.equal((await requester.call('/ldap')).status,403);assert.equal((await requester.call('/settings')).status,403);
});
test('Projekt zewnętrzny dla członków izoluje konta, także agentów z innych projektów',async()=>{
  const created=await admin.call('/projects','POST',{key:'SUP',name:'Portal klienta SUP',project_type:'external',portal_access:'members',number_padding:4,next_number:10});assert.equal(created.status,201,JSON.stringify(created.data));v2project=created.data;
  assert.equal((await fetch(base+'/portal/'+v2project.portal_slug)).status,200);
  assert.equal((await requester.call('/portals/'+v2project.portal_slug)).status,404);
  const account=await admin.call('/users','POST',{name:'Outside Agent',email:'outsideagent@example.test',role:'agent',password:initial,is_internal:true});assert.equal(account.status,201);outsiderId=account.data.user.id;
  await outsiderAgent.login('outsideagent@example.test');await outsiderAgent.rotate();
  assert.ok(!(await outsiderAgent.call('/projects')).data.some(p=>p.id===v2project.id));
  assert.equal((await admin.call('/projects/'+v2project.id+'/members','POST',{user_id:memberClientId,role:'requester'})).status,200);
  assert.equal((await requester.call('/portals/'+v2project.portal_slug)).status,200);
  const payload={project_id:v2project.id,title:'Sprawa klienta',description:'Treść zgłoszenia klienta',type:'incident',priority:'P3'};
  const result=await requester.call('/tickets','POST',payload);assert.equal(result.status,201);v2key=result.data.key;assert.equal(v2key,'SUP-0010');
  for(const c of [outsiderAgent,alice,bob]){assert.equal((await c.call('/tickets/'+v2key)).status,404);assert.equal((await c.call('/tickets?project='+v2project.id)).data.total,0);assert.equal((await c.call('/stats?project='+v2project.id)).data.open,0);}
  assert.equal((await admin.call('/tickets/'+v2key,'PATCH',{version:1,assignee_id:outsiderId})).status,400);
  assert.equal((await requester.call('/tickets','POST',{...payload,type:'bug'})).status,400);
  assert.equal((await requester.call('/projects/'+v2project.id+'/members','POST',{user_id:memberClientId,role:'manager'})).status,404);
});
test('Agent zgłaszający w obcym projekcie nie widzi notatek wewnętrznych',async()=>{
  assert.equal((await admin.call('/projects/'+v2project.id+'/members','POST',{user_id:outsiderId,role:'requester'})).status,200);
  const r=await outsiderAgent.call('/tickets','POST',{project_id:v2project.id,title:'Moja sprawa jako klient',description:'Agent jest tutaj zgłaszającym.',type:'request',priority:'P3'});assert.equal(r.status,201);const ownKey=r.data.key;
  assert.equal((await admin.call('/tickets/'+ownKey+'/comments','POST',{body:'PROJECT_PRIVATE_SECRET',internal:true})).status,201);
  const own=await outsiderAgent.call('/tickets/'+ownKey);assert.equal(own.data.ticket.can_work,false);assert.ok(!JSON.stringify(own.data).includes('PROJECT_PRIVATE_SECRET'));assert.equal((await outsiderAgent.call('/tickets/'+ownKey+'/comments','POST',{body:'Próba notatki',internal:true})).status,403);
  assert.equal((await outsiderAgent.call('/tickets/'+v2key)).status,404);
  assert.equal((await admin.call('/projects/'+v2project.id+'/members','POST',{user_id:outsiderId,role:'manager'})).status,200);
  assert.equal((await outsiderAgent.call('/tickets/'+v2key)).status,200);
  assert.equal((await outsiderAgent.call('/projects/'+v2project.id+'/members','POST',{user_id:outsiderId,role:null})).status,400);
});
test('Portal wewnętrzny przyjmuje konta firmowe, nie wymaga roli agenta; projekty wewnętrzne nie mają portalu',async()=>{
  const c=await admin.call('/users','POST',{name:'Internal requester',email:'internal@example.test',role:'customer',is_internal:true,password:initial});assert.equal(c.status,201);await internalCustomer.login('internal@example.test');await internalCustomer.rotate();
  const p=(await admin.call('/projects','POST',{key:'HR',name:'Wnioski pracowników',project_type:'external',portal_access:'internal'})).data;
  assert.equal((await requester.call('/portals/'+p.portal_slug)).status,404);assert.equal((await internalCustomer.call('/portals/'+p.portal_slug)).status,200);
  assert.equal((await internalCustomer.call('/tickets','POST',{project_id:p.id,title:'Wniosek o dostęp',description:'Potrzebny dostęp do usługi.',type:'request',priority:'P3'})).status,201);
  const internal=(await admin.call('/projects','POST',{key:'OPS',name:'Wewnętrzne operacje',project_type:'internal'})).data;
  assert.equal((await admin.call('/portals/'+internal.portal_slug)).status,404);assert.equal((await internalCustomer.call('/tickets','POST',{project_id:internal.id,title:'Próba dostępu',description:'Brak członkostwa zespołu.',type:'task',priority:'P3'})).status,403);
  assert.equal((await admin.call('/projects/'+internal.id+'/members','POST',{user_id:internalCustomer.user.id,role:'requester'})).status,400);
});
test('Numeracja: równoczesne utworzenia są unikalne, klucz projektu jest niezmienny',async()=>{
  const results=await Promise.all(Array.from({length:12},(_,i)=>requester.call('/tickets','POST',{project_id:v2project.id,title:'Równoczesna sprawa '+i,description:'Test numeracji przy współbieżnym tworzeniu.',type:'incident',priority:'P3'})));
  assert.ok(results.every(r=>r.status===201));assert.equal(new Set(results.map(r=>r.data.key)).size,12);
  const old=(await admin.call('/projects/'+v2project.id)).data.project;
  for(const change of [{next_number:10},{key:'DESK'},{number_padding:5}])assert.equal((await admin.call('/projects/'+old.id,'PATCH',{version:old.version,...change})).status,409);
  const canonical=await requester.call('/tickets/'+v2key);assert.equal(canonical.status,200);assert.equal(canonical.data.ticket.key,v2key);
  assert.equal((await bob.call('/tickets/'+v2key)).status,404);
  assert.equal((await admin.call('/projects','POST',{key:'SUP',name:'Zajęty klucz'})).status,409);
  assert.equal((await admin.call('/projects/'+old.id)).data.project.key,old.key);
});
test('Zmiana konfiguracji projektu: walidacja SLA, formularze portalu i archiwum do odczytu',async()=>{
  let p=(await admin.call('/projects/'+v2project.id)).data.project;
  assert.equal((await outsiderAgent.call('/projects/'+p.id,'PATCH',{version:p.version,project_type:'internal'})).status,409);
  assert.equal((await admin.call('/projects/'+p.id,'PATCH',{version:p.version,sla_policy:{P1:[100,10]}})).status,400);
  let r=await admin.call('/projects/'+p.id,'PATCH',{version:p.version,request_types:['request'],sla_policy:{P1:[1,2],P2:[3,4],P3:[5,6],P4:[7,8]}});assert.equal(r.status,200);p=r.data;
  const t=(await requester.call('/tickets/'+v2key)).data.ticket;assert.equal(Date.parse(t.resolution_due_at)-Date.parse(t.created_at),6*60000);
  const body={project_id:p.id,title:'Niedostępny formularz',description:'Test ograniczenia formularza.',type:'incident',priority:'P3'};assert.equal((await requester.call('/tickets','POST',body)).status,400);
  assert.equal((await admin.call('/projects/'+p.id,'PATCH',{version:p.version,archived:true})).status,200);
  assert.equal((await requester.call('/tickets','POST',{...body,type:'request'})).status,409);
  assert.equal((await requester.call('/tickets/'+v2key+'/comments','POST',{body:'Zmiana w archiwum'})).status,409);
  assert.equal((await admin.call('/tickets/'+v2key,'PATCH',{version:t.version,status:'closed'})).status,409);
  assert.equal((await requester.call('/tickets/'+v2key)).status,200);
  p=(await admin.call('/projects/'+p.id)).data.project;assert.equal((await admin.call('/projects/'+p.id,'PATCH',{version:p.version,archived:false})).status,200);
});
test('Odebranie członkostwa od razu ogranicza istniejącą sesję i usuwa opiekuna',async()=>{
  const t=(await admin.call('/tickets/'+v2key)).data.ticket;
  assert.equal((await admin.call('/tickets/'+v2key,'PATCH',{version:t.version,assignee_id:outsiderId})).status,200);
  assert.equal((await admin.call('/projects/'+v2project.id+'/members','POST',{user_id:outsiderId,role:'requester'})).status,200);
  assert.equal((await outsiderAgent.call('/tickets/'+v2key)).status,404);assert.equal((await admin.call('/tickets/'+v2key)).data.ticket.assignee_id,null);
  assert.equal((await admin.call('/projects/'+v2project.id+'/members','POST',{user_id:memberClientId,role:null})).status,200);
  assert.equal((await requester.call('/tickets/'+v2key)).status,404);assert.equal((await requester.call('/portals/'+v2project.portal_slug)).status,404);
});
test('Ustawienia rejestracji i konfiguracja LDAP podlegają kontroli dostępu i wersji',async()=>{
  const s=(await admin.call('/settings')).data;
  assert.equal((await admin.call('/settings','PATCH',{...s,registration_mode:'email'})).status,400);
  assert.equal((await requester.call('/settings','PATCH',{...s,registration_mode:'closed'})).status,403);
  assert.equal((await admin.call('/settings','PATCH',{...s,registration_mode:'closed'})).status,200);
  assert.equal((await bob.call('/register','POST',{name:'Closed User',email:'closed@example.test',password:permanent})).status,403);
  assert.equal((await admin.call('/settings','PATCH',{...s,registration_mode:'approval'})).status,409);
  assert.equal((await requester.call('/ldap/preview','POST',{})).status,403);
  assert.equal((await admin.call('/ldap')).data.has_password,false);
  const configured=await admin.call('/ldap','PATCH',{version:0,config:{enabled:false},bind_password:'LDAP-test-secret-only'});assert.equal(configured.status,200);assert.equal(configured.data.has_password,true);assert.ok(!JSON.stringify(configured.data).includes('LDAP-test-secret-only'));
  assert.equal((await admin.call('/ldap/apply','POST',{preview_id:'invalid'})).status,503);
});

let customProject,customForm,customKey;
test('Wiele projektów i własne formularze: uprawnienia, pola wymagane, wersje i publikacja w portalu',async()=>{
  customProject=(await admin.call('/projects','POST',{key:'CUST',name:'Własny katalog',project_type:'external',portal_access:'authenticated'})).data;
  const id=customProject.id;
  const definition={name:'Dostęp do VPN',description:'Wniosek o dostęp do sieci',group_name:'Dostępy',base_type:'request',portal_visible:true,enabled:true,fields:[{key:'service',label:'Usługa',type:'select',required:true,options:['VPN','Poczta']},{key:'reason',label:'Uzasadnienie',type:'textarea',required:true},{key:'internal',label:'PRIVATE_FORM_LABEL',type:'text',visibility:'internal'}]};
  assert.equal((await alice.call('/projects/'+id+'/request-types','POST',definition)).status,404);
  let r=await admin.call('/projects/'+id+'/request-types','POST',definition);assert.equal(r.status,201,JSON.stringify(r.data));customForm=r.data;
  assert.ok(!JSON.stringify((await alice.call('/projects/'+id+'/request-types?surface=portal')).data).includes('PRIVATE_FORM_LABEL'));
  assert.equal((await alice.call('/projects/'+id+'/request-types?surface=manage')).status,404);
  const payload={project_id:id,title:'Potrzebny dostęp',description:'Praca zdalna w projekcie',request_type_id:customForm.id,request_type_version:customForm.version,priority:'P1',custom_values:{service:'VPN',reason:'Praca zdalna'}};
  assert.equal((await alice.call('/tickets','POST',{...payload,custom_values:{service:'VPN'}})).status,400);
  assert.equal((await alice.call('/tickets','POST',{...payload,custom_values:{...payload.custom_values,internal:'ATTACK'}})).status,403);
  assert.equal((await alice.call('/tickets','POST',{...payload,project_id:1})).status,400);
  assert.equal((await alice.call('/tickets','POST',{...payload,request_type_version:0})).status,409);
  r=await alice.call('/tickets','POST',payload);assert.equal(r.status,201,JSON.stringify(r.data));customKey=r.data.key;
  let t=(await admin.call('/tickets/'+customKey)).data.ticket;
  assert.equal(t.type,'request');assert.equal(t.priority,'P3');assert.equal(t.request_form.name,'Dostęp do VPN');
  assert.equal((await admin.call('/tickets/'+customKey,'PATCH',{version:t.version,custom_values:{internal:'PRIVATE_FORM_VALUE'}})).status,200);
  for(const path of ['/tickets/'+customKey,'/tickets?project='+id])assert.ok(!JSON.stringify((await alice.call(path)).data).includes('PRIVATE_FORM_'));
  t=(await alice.call('/tickets/'+customKey)).data.ticket;
  assert.equal((await alice.call('/tickets/'+customKey,'PATCH',{version:t.version,custom_values:{reason:'Nowe uzasadnienie'}})).status,200);
  t=(await admin.call('/tickets/'+customKey)).data.ticket;assert.equal(t.custom_values.internal,'PRIVATE_FORM_VALUE');assert.equal(t.custom_values.reason,'Nowe uzasadnienie');
});

test('Edytor formularzy zachowuje historyczny schemat i wartości; kopia i wyłączenie chronią istniejące sprawy',async()=>{
  let r=await admin.call('/projects/'+customProject.id+'/request-types/'+customForm.id,'PATCH',{version:customForm.version,name:'Nowy formularz VPN',fields:[{key:'new',label:'Nowe pole',type:'text',required:true}]});assert.equal(r.status,200);customForm=r.data;
  const historic=(await alice.call('/tickets/'+customKey)).data.ticket;assert.equal(historic.request_form.name,'Dostęp do VPN');assert.equal(historic.custom_values.service,'VPN');assert.ok(!historic.request_form.fields.some(f=>f.key==='new'));
  assert.equal((await alice.call('/tickets','POST',{project_id:customProject.id,title:'Test zmiany',description:'Opis nowego zgłoszenia',request_type_id:customForm.id,request_type_version:customForm.version})).status,400);
  r=await admin.call('/projects/'+customProject.id+'/request-types/'+customForm.id+'/clone','POST',{});assert.equal(r.status,201);assert.equal(r.data.enabled,false);assert.equal(r.data.portal_visible,false);
  assert.equal((await alice.call('/projects/'+customProject.id+'/request-types/'+customForm.id+'/clone','POST',{})).status,404);
  r=await admin.call('/projects/'+customProject.id+'/request-types/'+customForm.id,'PATCH',{version:customForm.version,enabled:false});assert.equal(r.status,200);
  assert.equal((await alice.call('/tickets','POST',{project_id:customProject.id,title:'Test wyłączenia',description:'Nie powinno powstać',request_type_id:customForm.id,request_type_version:r.data.version,custom_values:{new:'Dane'}})).status,400);
  assert.equal((await alice.call('/tickets/'+customKey)).status,200);
});

test('Własna mapa: odpowiedź klienta zmienia tylko wskazany status, ignoruje notatki i zapisuje historię bez zapętlenia',async()=>{
  const path='/projects/'+customProject.id+'/workflow',w=(await admin.call(path)).data;
  w.statuses.find(s=>s.key==='waiting').name='Czeka na odpowiedź klienta';w.statuses.push({key:'answered',name:'Udzielono odpowiedzi',category:'in_progress'});
  w.transitions=w.transitions.filter(t=>!(t.from==='open'&&t.to==='closed'));
  w.transitions.push({from:'waiting',to:'answered',actor:'team',name:'Klient odpowiedział'},{from:'answered',to:'waiting',actor:'team',name:'Poproś o uzupełnienie'},{from:'answered',to:'resolved',actor:'team',name:'Rozwiąż'});
  w.rules=[{name:'Odpowiedź klienta otrzymana',event:'customer_reply',from:'waiting',to:'answered',enabled:true},{name:'Bez kaskady',event:'customer_reply',from:'answered',to:'resolved',enabled:true}];
  assert.equal((await alice.call(path)).status,404);assert.equal((await alice.call(path,'PATCH',w)).status,404);
  let r=await admin.call(path,'PATCH',w);assert.equal(r.status,200,JSON.stringify(r.data));const version=r.data.version;
  assert.equal((await admin.call(path,'PATCH',w)).status,409);
  let t=(await admin.call('/tickets/'+customKey)).data.ticket;
  assert.equal((await admin.call('/tickets/'+customKey,'PATCH',{version:t.version,workflow_version:version,workflow_status:'closed'})).status,403);
  assert.equal((await admin.call('/tickets/'+customKey,'PATCH',{version:t.version,workflow_version:version,workflow_status:'waiting'})).status,200);
  assert.equal((await admin.call('/tickets/'+customKey+'/comments','POST',{body:'PRIVATE_AUTOMATION_NOTE',internal:true})).status,201);
  assert.equal((await admin.call('/tickets/'+customKey+'/comments','POST',{body:'Prosimy o uzupełnienie',internal:false})).status,201);
  t=(await alice.call('/tickets/'+customKey)).data.ticket;assert.equal(t.workflow_status,'waiting');assert.equal(t.status_name,'Czeka na odpowiedź klienta');
  assert.equal((await alice.call('/tickets/'+customKey,'PATCH',{version:t.version,workflow_version:version,workflow_status:'answered'})).status,403);
  assert.equal((await alice.call('/tickets/'+customKey+'/comments','POST',{body:'Przesyłam odpowiedź'})).status,201);
  const result=(await alice.call('/tickets/'+customKey)).data;t=result.ticket;
  assert.equal(t.workflow_status,'answered');assert.equal(t.status,'in_progress');assert.equal(t.status_name,'Udzielono odpowiedzi');assert.equal(t.resolved_at,null);
  assert.deepEqual(result.activity,[]);
  const staffHistory=(await admin.call('/tickets/'+customKey)).data.activity;
  assert.equal(staffHistory.filter(a=>a.body.startsWith('Automatyzacja')).length,1);
  assert.ok(staffHistory.some(a=>a.body.includes('Czeka na odpowiedź klienta → Udzielono odpowiedzi')));
  assert.ok(!JSON.stringify(result).includes('PRIVATE_AUTOMATION_NOTE'));
  assert.equal((await bob.call('/tickets/'+customKey+'/comments','POST',{body:'Nie moje zgłoszenie'})).status,404);
});

test('Filtry łączą projekt, status własny, klasyfikację, priorytet, opiekuna, zakres dat i uprawnienia',async()=>{
  const query=new URLSearchParams({project:customProject.id,state:customProject.id+':answered',status:'in_progress',type:'request',priority:'P3',assignee:'unassigned',q:'Potrzebny',created_from:'2020-01-01',created_to:'2099-12-31',sort:'created_asc'});
  let r=await alice.call('/tickets?'+query);assert.equal(r.status,200);assert.equal(r.data.total,1);assert.equal(r.data.tickets[0].key,customKey);
  assert.equal((await alice.call('/stats?'+query)).data.in_progress,1);
  assert.equal((await bob.call('/tickets?'+query)).data.total,0);
  query.set('project','1');assert.equal((await admin.call('/tickets?'+query)).data.total,0);
  for(const q of ['state=1:invalid%27','created_from=2026-02-30','sort=drop_table','assignee=NaN','created_from=2027-01-01&created_to=2026-01-01'])assert.equal((await admin.call('/tickets?'+q)).status,400);
  const all=(await admin.call('/tickets?sort=created_asc&limit=100')).data.tickets;assert.ok(new Set(all.map(t=>t.project_id)).size>1);
  for(let i=1;i<all.length;i++)assert.ok(all[i].created_at>=all[i-1].created_at);
});

test('Zmiana nazwy statusu zachowuje stan spraw; niedozwolone usunięcie i stara wersja mapy są blokowane',async()=>{
  const path='/projects/'+customProject.id+'/workflow';let w=(await admin.call(path)).data;
  const oldVersion=w.version;w.statuses.find(s=>s.key==='answered').name='Klient odpowiedział';
  assert.equal((await admin.call(path,'PATCH',w)).status,200);
  let t=(await admin.call('/tickets/'+customKey)).data.ticket;assert.equal(t.workflow_status,'answered');assert.equal(t.status_name,'Klient odpowiedział');
  assert.equal((await admin.call('/tickets/'+customKey,'PATCH',{version:t.version,workflow_version:oldVersion,workflow_status:'resolved'})).status,409);
  w=(await admin.call(path)).data;w.statuses=w.statuses.filter(s=>s.key!=='answered');w.transitions=w.transitions.filter(t=>t.from!=='answered'&&t.to!=='answered');w.rules=[];
  assert.equal((await admin.call(path,'PATCH',w)).status,409);
  const safe=(await admin.call(path)).data;safe.statuses.find(s=>s.key==='answered').category='resolved';assert.equal((await admin.call(path,'PATCH',safe)).status,409);
  assert.equal((await admin.call('/tickets/'+customKey)).data.ticket.resolved_at,null);
});

test('Reguły utworzenia i odpowiedzi zespołu działają transakcyjnie, a archiwum odrzuca edycję konfiguracji',async()=>{
  const p=(await admin.call('/projects','POST',{key:'AUTO',name:'Automatyczny obieg',project_type:'external',portal_access:'authenticated'})).data;
  let w=(await admin.call('/projects/'+p.id+'/workflow')).data;
  w.rules=[{name:'Nowa sprawa do realizacji',event:'ticket_created',from:'open',to:'in_progress',enabled:true},{name:'Po odpowiedzi czekamy',event:'agent_reply',from:'in_progress',to:'waiting',enabled:true}];
  assert.equal((await admin.call('/projects/'+p.id+'/workflow','PATCH',w)).status,200);
  const r=await alice.call('/tickets','POST',{project_id:p.id,title:'Nowa automatyczna sprawa',description:'Test obiegu od utworzenia',type:'request',priority:'P2'});assert.equal(r.status,201);
  const key=r.data.key;let t=(await admin.call('/tickets/'+key)).data.ticket;assert.equal(t.workflow_status,'in_progress');
  assert.equal((await admin.call('/tickets/'+key+'/comments','POST',{body:'Potrzebujemy dodatkowych danych'})).status,201);
  t=(await alice.call('/tickets/'+key)).data.ticket;assert.equal(t.workflow_status,'waiting');
  assert.equal((await alice.call('/tickets/'+key+'/comments','POST',{body:'Już przesyłam dane'})).status,201);
  assert.equal((await alice.call('/tickets/'+key)).data.ticket.workflow_status,'waiting');
  const fresh=(await admin.call('/projects/'+p.id)).data.project;assert.equal((await admin.call('/projects/'+p.id,'PATCH',{version:fresh.version,archived:true})).status,200);
  w=(await admin.call('/projects/'+p.id+'/workflow')).data;assert.equal((await admin.call('/projects/'+p.id+'/workflow','PATCH',w)).status,409);
  assert.equal((await admin.call('/projects/'+p.id+'/request-types','POST',{name:'Nowy formularz'})).status,409);
});

test('Automatyzacja HTTP: termin blokuje spóźniony komentarz i ponowne otwarcie klienta; historia dostępna tylko kierownikowi',async()=>{
  const p=(await admin.call('/projects','POST',{key:'AT',name:'Automatyzacja',project_type:'external',portal_access:'authenticated'})).data;
  const path='/projects/'+p.id+'/workflow',w=(await admin.call(path)).data;
  const rule=(id,event,from,actions,extra={})=>({id,name:id,event,from,actions,enabled:true,match:'all',conditions:[],...extra});
  w.rules=[
    rule('public-resolution','ticket_resolved','resolved',[{type:'comment',body:'Dzień dobry, {{ticket.key}} rozwiązana.',internal:false},{type:'comment',body:'PRIVATE_BOT_RESOLUTION',internal:true}]),
    rule('reply-reopen','customer_reply','resolved',[{type:'status',value:'open'}]),
    rule('timer-close','status_elapsed','resolved',[{type:'status',value:'closed'},{type:'lock'},{type:'comment',body:'Sprawa {{ticket.key}} zamknięta.',internal:false}],{after:{value:5,unit:'days'}})
  ];
  let r=await admin.call(path,'PATCH',w);assert.equal(r.status,200,JSON.stringify(r.data));
  const keys=[];for(let i=0;i<2;i++){
    const created=await alice.call('/tickets','POST',{project_id:p.id,title:'Problem testowy '+i,description:'Opis kontrolny',type:'incident',priority:'P3'});assert.equal(created.status,201);keys.push(created.data.key);
    const t=(await admin.call('/tickets/'+created.data.key)).data.ticket;
    assert.equal((await admin.call('/tickets/'+t.key,'PATCH',{version:t.version,workflow_version:t.workflow_version,workflow_status:'resolved'})).status,200);
  }
  const visible=(await alice.call('/tickets/'+keys[0])).data;assert.ok(visible.ticket.auto_close_at);assert.equal(visible.comments.length,1);assert.equal(visible.comments[0].author_name,'Automatyzacja');assert.equal(visible.comments[0].is_bot,1);assert.ok(!JSON.stringify(visible).includes('PRIVATE_BOT_RESOLUTION'));
  assert.equal((await alice.call('/tickets/'+keys[0]+'/comments','POST',{body:'Problem nadal występuje.'})).status,201);
  assert.equal((await alice.call('/tickets/'+keys[0])).data.ticket.status,'open');
  const sql=new DatabaseSync(join(dataDir,'desk.sqlite'));try{
    assert.equal(sql.prepare("SELECT COUNT(*) n FROM automation_jobs j JOIN tickets t ON t.id=j.ticket_id WHERE t.key=? AND j.status='queued'").get(keys[0]).n,0);
    sql.prepare("UPDATE automation_jobs SET due_at=? WHERE ticket_id=(SELECT id FROM tickets WHERE key=?) AND status='queued'").run(Date.now()-1,keys[1]);
  }finally{sql.close();}
  r=await alice.call('/tickets/'+keys[1]+'/comments','POST',{body:'LATE_MESSAGE_MUST_NOT_EXIST'});assert.equal(r.status,409,JSON.stringify(r.data));
  const closed=(await alice.call('/tickets/'+keys[1])).data;assert.equal(closed.ticket.status,'closed');assert.equal(closed.ticket.customer_reply_locked,true);assert.deepEqual(closed.ticket.transitions,[]);assert.ok(!JSON.stringify(closed).includes('LATE_MESSAGE_MUST_NOT_EXIST'));
  assert.equal((await alice.call('/tickets/'+keys[1],'PATCH',{version:closed.ticket.version,status:'open'})).status,403);
  assert.equal((await alice.call('/projects/'+p.id+'/automation')).status,404);assert.equal((await bob.call('/projects/'+p.id+'/automation/1/retry','POST',{})).status,404);
  const history=await admin.call('/projects/'+p.id+'/automation');assert.equal(history.status,200);assert.ok(history.data.runs.some(x=>x.rule_id==='timer-close'&&x.status==='done'));
  const staff=(await admin.call('/tickets/'+keys[1])).data;assert.ok(staff.comments.some(c=>c.body==='PRIVATE_BOT_RESOLUTION'));
  assert.equal((await admin.call('/tickets/'+keys[1],'PATCH',{version:staff.ticket.version,workflow_version:staff.ticket.workflow_version,workflow_status:'open'})).status,409);
  assert.equal((await alice.call('/tickets/'+keys[1]+'/comments','POST',{body:'Zespół nie może ponownie otworzyć sprawy.'})).status,409);
});

test('Automatyzacja HTTP po restarcie wykonuje zachowane zadanie i nie powiela komentarza',async()=>{
  const p=(await admin.call('/projects','POST',{key:'AR',name:'Restart automatyzacji',project_type:'external',portal_access:'authenticated'})).data;
  const path='/projects/'+p.id+'/workflow',w=(await admin.call(path)).data;
  w.rules=[{id:'restart-timer',name:'Restart timer',event:'status_elapsed',from:'resolved',enabled:true,match:'all',conditions:[],after:{value:5,unit:'days'},actions:[{type:'status',value:'closed'},{type:'lock'},{type:'comment',body:'RESTART_BOT_{{ticket.key}}',internal:false}]}];
  assert.equal((await admin.call(path,'PATCH',w)).status,200);
  const key=(await alice.call('/tickets','POST',{project_id:p.id,title:'Restart po rozwiązaniu',description:'Test trwałości',type:'incident',priority:'P3'})).data.key,t=(await admin.call('/tickets/'+key)).data.ticket;
  assert.equal((await admin.call('/tickets/'+key,'PATCH',{version:t.version,workflow_version:t.workflow_version,workflow_status:'resolved'})).status,200);
  await stop();const sql=new DatabaseSync(join(dataDir,'desk.sqlite'));try{sql.prepare("UPDATE automation_jobs SET due_at=? WHERE ticket_id=? AND status='queued'").run(Date.now()-1,t.id);}finally{sql.close();}
  await start();let result=(await alice.call('/tickets/'+key)).data;assert.equal(result.ticket.status,'closed');assert.equal(result.comments.filter(c=>c.body.startsWith('RESTART_BOT_')).length,1);
  await stop();await start();result=(await alice.call('/tickets/'+key)).data;assert.equal(result.comments.length,1);assert.equal(result.ticket.customer_reply_locked,true);
});

test('HTTP v5: faktyczny twórca, zmiana zgłaszającego, rozwiązanie i ostatecznie zamknięty portal',async()=>{
 const p=(await admin.call('/projects','POST',{key:'V5',name:'Obsługa nowych funkcji',project_type:'external',portal_access:'authenticated'})).data;
 let r=await admin.call('/tickets','POST',{project_id:p.id,title:'Zgłoszenie w imieniu klienta',description:'Opis przekazany zespołowi',type:'incident',priority:'P3',reporter_id:alice.user.id});assert.equal(r.status,201,JSON.stringify(r.data));const k=r.data.key;let detail=(await admin.call('/tickets/'+k)).data;assert.equal(detail.ticket.reporter_id,alice.user.id);assert.equal(detail.ticket.created_by,admin.user.id);assert.ok(detail.activity.some(a=>a.actor_name===admin.user.name));assert.equal((await alice.call('/tickets/'+k)).status,200);
 r=await admin.call('/tickets/'+k,'PATCH',{version:detail.ticket.version,reporter_id:bob.user.id});assert.equal(r.status,200,JSON.stringify(r.data));assert.equal((await alice.call('/tickets/'+k)).status,404);assert.equal((await bob.call('/tickets/'+k)).status,200);
 const current=(await admin.call('/projects/'+p.id)).data.project;r=await admin.call('/desk/projects/'+p.id+'/settings','PATCH',{version:current.version,resolution_required:true,resolution_statuses:['resolved']});assert.equal(r.status,200,JSON.stringify(r.data));detail=(await admin.call('/tickets/'+k)).data;
 const transition={version:detail.ticket.version,workflow_version:detail.ticket.workflow_version,workflow_status:'closed'};assert.equal((await admin.call('/tickets/'+k,'PATCH',transition)).status,400);r=await admin.call('/tickets/'+k,'PATCH',{...transition,resolution_text:'Przywrócono poprawne działanie konta.'});assert.equal(r.status,200,JSON.stringify(r.data));
 const closed=(await bob.call('/tickets/'+k)).data;assert.equal(closed.ticket.status,'closed');assert.deepEqual(closed.activity,[]);assert.deepEqual(closed.ticket.transitions,[]);assert.ok((await bob.call('/tickets?own=1')).data.tickets.some(t=>t.key===k));assert.equal((await bob.call('/tickets/'+k+'/comments','POST',{body:'Niedozwolona odpowiedź'})).status,409);assert.equal((await admin.call('/tickets/'+k+'/comments','POST',{body:'Agent też nie komentuje'})).status,409);
 assert.equal((await admin.call('/tickets/'+k,'PATCH',{version:closed.ticket.version,workflow_status:'open'})).status,409);assert.equal((await bob.call('/desk/tickets/'+closed.ticket.id)).status,404);
 const users=(await admin.call('/users')).data,bot=users.find(u=>u.account_kind==='service');assert.ok(bot);assert.equal((await new Client().call('/login','POST',{email:bot.email,password:initial})).status,401);assert.equal((await admin.call('/users/'+bot.id,'PATCH',{version:bot.version,role:'admin'})).status,400);
});
