import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setup} from './v6-fixture.mjs';
import {legacyDb} from './fixture.mjs';
import {migrateV2,migrateV3,migrateV4} from '../lib/migrations.mjs';
import {migrateV5} from '../lib/migration-v5.mjs';
import {migrateV6} from '../lib/migration-v6.mjs';
import {migrateV7} from '../lib/migration-v7.mjs';
import {createMfa,totp,base32} from '../lib/mfa.mjs';
import {createMail} from '../lib/mail.mjs';
import {createMailTemplates} from '../lib/mail-templates.mjs';
import {createKnowledge} from '../lib/knowledge.mjs';
import {createUpdates,RELEASE_REPOSITORY} from '../lib/updates.mjs';
import {secretStore} from '../lib/secrets.mjs';
const member=(f,p,u,role='agent')=>f.db.prepare('INSERT INTO project_members(project_id,user_id,role) VALUES(?,?,?)').run(p.id,u.id,role);
const clearMail=f=>f.db.exec('DELETE FROM mail_outbox');
const recipients=f=>f.db.prepare('SELECT recipient FROM mail_outbox ORDER BY recipient').all().map(x=>x.recipient);

test('v7 migration preserves users, independent workflow and rules and is idempotent',()=>{
 const db=legacyDb();try{migrateV2(db);migrateV3(db);migrateV4(db);migrateV5(db);migrateV6(db);
 const before=db.prepare('SELECT id,config FROM workflow_templates LIMIT 1').get();
 db.prepare("INSERT INTO projects(id,key,name,kind,created_at) VALUES(1,'CW','Wsparcie','service','2026-01-01')").run();
 const config=JSON.parse(before.config);config.statuses[0].name='Niestandardowe';config.rules=[{name:'Zachowana reguła',event:'customer_reply',from:'waiting',to:'open',enabled:true}];
 db.prepare('INSERT INTO project_workflows(project_id,config) VALUES(1,?)').run(JSON.stringify(config));
 const oldUsers=db.prepare('SELECT id,email,password FROM users ORDER BY id').all();migrateV7(db);migrateV7(db);
 assert.deepEqual(db.prepare('SELECT id,email,password FROM users ORDER BY id').all(),oldUsers);
 assert.equal(db.prepare("SELECT COUNT(*) n FROM users WHERE account_kind='service'").get().n,0);
 const p=db.prepare('SELECT * FROM projects WHERE id=1').get(),map=JSON.parse(db.prepare('SELECT config FROM project_workflows WHERE project_id=1').get().config),template=JSON.parse(db.prepare('SELECT config FROM workflow_templates WHERE id=?').get(p.workflow_template_id).config);
 assert.deepEqual(map,config);assert.equal(template.statuses[0].name,'Niestandardowe');assert.deepEqual(template.rules,[]);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM mail_templates').get().n,4);assert.equal(db.prepare('PRAGMA user_version').get().user_version,7);assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{db.close();}
});

test('TOTP matches all RFC 6238 SHA1 test vectors',()=>{
 const key=base32(Buffer.from('12345678901234567890'));
 for(const [time,expected] of [[59,'94287082'],[1111111109,'07081804'],[1111111111,'14050471'],[1234567890,'89005924'],[2000000000,'69279037'],[20000000000,'65353130']])assert.equal(totp(key,Math.floor(time/30),8),expected);
});

test('2FA setup confirmation, encrypted secret, replay and recovery codes',()=>{
 const f=setup();try{const m=createMfa(f.db,{dataDir:f.dataDir,clock:f.clock}),s=m.setup(f.admin);assert.equal(m.status(f.admin).enabled,false);assert.ok(!f.db.prepare('SELECT secret FROM user_mfa').get().secret.includes(s.secret));
 assert.throws(()=>m.enable(f.admin,'invalid'),e=>e.status===400);const enabled=m.enable(f.admin,totp(s.secret,Math.floor(f.clock()/30000)));assert.equal(enabled.recovery_codes.length,10);assert.equal(m.status(f.admin).enabled,true);
 const c=m.challenge(f.admin);assert.throws(()=>m.verify(c,totp(s.secret,Math.floor(f.clock()/30000))),e=>e.status===401);f.advance(30000);assert.equal(m.verify(c,totp(s.secret,Math.floor(f.clock()/30000))).id,f.admin.id);assert.throws(()=>m.verify(c,enabled.recovery_codes[0]),e=>e.status===401);
 const d=m.challenge(f.admin);assert.equal(m.verify(d,enabled.recovery_codes[0]).id,f.admin.id);assert.equal(m.status(f.admin).recovery_remaining,9);assert.throws(()=>m.verify(m.challenge(f.admin),enabled.recovery_codes[0]),e=>e.status===401);
 m.disable(f.admin,enabled.recovery_codes[1]);assert.equal(m.status(f.admin).enabled,false);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM mfa_challenges').get().n,0);
 assert.deepEqual(f.db.prepare("SELECT action FROM audit_events WHERE action LIKE 'mfa.%' ORDER BY id").all().map(r=>r.action),['mfa.enabled','mfa.disabled']);
 }finally{f.close();}
});

test('2FA rejects expired, exhausted, inactive and changed-account challenges',()=>{
 const f=setup();try{const m=createMfa(f.db,{dataDir:f.dataDir,clock:f.clock}),s=m.setup(f.admin),codes=m.enable(f.admin,totp(s.secret,Math.floor(f.clock()/30000))).recovery_codes;
 let c=m.challenge(f.admin);for(let n=0;n<5;n++)assert.throws(()=>m.verify(c,'invalid'),e=>e.status===401);assert.throws(()=>m.verify(c,codes[0]),e=>e.status===401);
 c=m.challenge(f.admin);f.advance(300001);assert.throws(()=>m.verify(c,codes[0]),e=>e.status===401);
 c=m.challenge(f.admin);f.db.prepare('UPDATE users SET active=0 WHERE id=?').run(f.admin.id);assert.throws(()=>m.verify(c,codes[0]),e=>e.status===401);f.db.prepare('UPDATE users SET active=1,version=version+1 WHERE id=?').run(f.admin.id);assert.throws(()=>m.verify(c,codes[0]),e=>e.status===401);assert.equal(m.status(f.admin).recovery_remaining,10);
 }finally{f.close();}
});

test('Customer and agent updates select different recipients, excluding author and unauthorized people',()=>{
 const f=setup();try{const p=f.project('MAIL'),client=f.user('client@example.test'),a=f.user('assigned@example.test','agent'),w=f.user('watch@example.test','agent'),outside=f.user('outside@example.test','agent'),t=f.ticket(p,client);member(f,p,a);member(f,p,w);f.db.prepare('UPDATE tickets SET assignee_id=? WHERE id=?').run(a.id,t.id);f.ext.events();f.ext.lifecycle.watch(t.id,{watching:true},w);f.db.prepare('INSERT INTO ticket_watchers VALUES(?,?,?)').run(t.id,outside.id,new Date(f.clock()).toISOString());
 clearMail(f);f.comment(t,client,'Odpowiedź klienta');f.ext.events();assert.deepEqual(recipients(f),[f.admin.email,a.email,w.email].sort());
 clearMail(f);f.comment(t,a,'Odpowiedź zespołu');f.ext.events();assert.deepEqual(recipients(f),[f.admin.email,client.email,w.email].sort());
 clearMail(f);f.comment(t,a,'Poufna notatka',1);f.ext.events();assert.deepEqual(recipients(f),[f.admin.email,w.email].sort());
 }finally{f.close();}
});

test('Autowatch can be disabled per project and watcher identities stay private',()=>{
 const f=setup();try{let p=f.project('WATCH');const a=f.user('agent@example.test','agent'),c=f.user('client@example.test'),t=f.ticket(p,c);member(f,p,a);f.ext.events();f.comment(t,a,'Pierwsza odpowiedź');f.ext.events();assert.equal(f.desk.detail(t,a).watching,true);assert.ok(f.desk.detail(t,a).watchers.some(u=>u.id===a.id));assert.deepEqual(f.desk.detail(t,c).watchers,[]);assert.equal(f.desk.detail(t,c).watcher_count,0);
 f.ext.lifecycle.watch(t.id,{watching:false},a);p=f.projects.project(p.id);f.desk.saveSettings(p.id,{version:p.version,auto_watch:false},f.admin);f.comment(t,a,'Nie obserwuję automatycznie');f.ext.events();assert.equal(f.desk.detail(t,a).watching,false);f.ext.lifecycle.watch(t.id,{watching:true},a);assert.equal(f.desk.detail(t,a).watching,true);
 }finally{f.close();}
});

test('SLA selects the request form and hides private metrics from the client',()=>{
 const f=setup();try{const p=f.project('FORMS'),client=f.user('sla@example.test'),forms=f.catalog.list(p.id,f.admin,'manage'),incident=forms.find(r=>r.base_type==='incident'),request=forms.find(r=>r.base_type==='request'),goal=v=>({P1:v,P2:v,P3:v,P4:v}),rule=(id,form,minutes,visible)=>({id,name:id,kind:'status',goals:goal(minutes),request_type_ids:[form.id],start:[],pause:[],stop:['resolved'],visible_to_customer:visible});
 f.desk.saveSettings(p.id,{version:p.version,sla:{timezone:'UTC',rules:[rule('login',incident,30,false),rule('vpn',request,480,true)]}},f.admin);const t=f.ticket(p,client);assert.deepEqual(f.desk.detail(t,f.admin).sla.map(x=>x.id),['login']);assert.deepEqual(f.desk.detail(t,client).sla,[]);
 f.db.prepare('UPDATE tickets SET request_type_id=? WHERE id=?').run(request.id,t.id);const updated=f.desk.ticket(t.id);assert.deepEqual(f.desk.detail(updated,client).sla.map(x=>x.id),['vpn']);f.state(t.id,'closed');const frozen=f.desk.detail(f.desk.ticket(t.id),client).sla;f.advance(864000000);assert.deepEqual(f.desk.detail(f.desk.ticket(t.id),client).sla,frozen);
 }finally{f.close();}
});

test('Managers and team can receive a new-ticket email independently of watchers',()=>{
 const f=setup();try{let p=f.project('TEAM');const manager=f.user('manager@example.test','agent'),agent=f.user('team@example.test','agent'),client=f.user('requester@example.test');member(f,p,manager,'manager');member(f,p,agent);f.desk.saveSettings(p.id,{version:p.version,notify_new_managers:true},f.admin);f.ticket(p,client);f.ext.events();assert.ok(recipients(f).includes(manager.email));assert.ok(!recipients(f).includes(agent.email));clearMail(f);
 p=f.projects.project(p.id);f.desk.saveSettings(p.id,{version:p.version,notify_new_team:true},f.admin);f.ticket(p,client);f.ext.events();assert.ok(recipients(f).includes(manager.email));assert.ok(recipients(f).includes(agent.email));assert.ok(recipients(f).includes(client.email));
 }finally{f.close();}
});

test('SMTP-only team channel captures pending mail and never uses global SMTP',async()=>{
 const f=setup(),sent=[];let mail;try{const p=f.project('SMTP'),client=f.user('smtp@example.test'),t=f.ticket(p,client);f.ext.events();assert.equal(f.db.prepare('SELECT channel_id FROM mail_outbox').get().channel_id,null);
 mail=createMail(f.db,f.projects,f.catalog,f.workflows,f.desk,f.accounts,{origin:'https://help.example.test',dataDir:f.dataDir,clock:f.clock,transportFactory:config=>({sendMail:async m=>sent.push({config,m}),close(){}})});
 const rt=f.db.prepare('SELECT id FROM request_types WHERE project_id=? LIMIT 1').get(p.id),ch=mail.save(null,{project_id:p.id,name:'Help team',email:'support@example.test',enabled:true,config:{imap_enabled:false,request_type_id:rt.id,smtp_host:'smtp.example.test',smtp_port:587}},f.admin);
 assert.equal(f.db.prepare('SELECT channel_id FROM mail_outbox').get().channel_id,ch.id);await f.accounts.flush();assert.equal(f.sent.length,0);await mail.flush();assert.equal(sent.length,1);assert.equal(sent[0].config.host,'smtp.example.test');assert.equal(sent[0].m.from.address,'support@example.test');assert.equal(sent[0].m.replyTo.address,'support@example.test');assert.equal(sent[0].config.auth,undefined);
 mail.save(ch.id,{...ch,enabled:false},f.admin);f.comment(t,f.admin,'Następny e-mail');f.ext.events();await f.accounts.flush();await mail.flush();assert.equal(f.sent.length,0);assert.equal(sent.length,1);assert.equal(f.db.prepare("SELECT channel_id FROM mail_outbox WHERE status='queued'").get().channel_id,ch.id);
 }finally{mail?.stop();f.close();}
});

test('Project email template overrides standard participants template without duplicate messages',()=>{
 const f=setup();try{const p=f.project('TPL'),client=f.user('template@example.test'),t=f.ticket(p,client),templates=createMailTemplates(f.db,f.projects);f.ext.events();clearMail(f);
 const template=templates.save(null,{name:'Własna odpowiedź',project_id:p.id,event:'comment_added',audience:'participants',enabled:true,subject:'{{key}} — odpowiedź',body:'Dzień dobry {{reporter}},\n{{update}}\n{{url}}'},f.admin);
 f.comment(t,f.admin,'Własna treść <script>');f.ext.events();const rows=f.db.prepare('SELECT * FROM mail_outbox WHERE recipient=?').all(client.email);assert.equal(rows.length,1);assert.equal(rows[0].subject,t.key+' — odpowiedź');const body=secretStore(f.dataDir).open(rows[0].body);assert.match(body,/Odpowiedz powyżej/);assert.match(body,/Własna treść/);
 assert.throws(()=>templates.save(template.id,{...template,body:'{{unknown}}'},f.admin),e=>e.status===400);assert.throws(()=>templates.save(template.id,{...template},client),e=>e.status===403);
 }finally{f.close();}
});

test('Automation sends chosen email template once and may comment as an ordinary client with access',()=>{
 const f=setup();try{const p=f.project('AUTO'),client=f.user('author@example.test'),t=f.ticket(p,client),templates=createMailTemplates(f.db,f.projects),template=templates.save(null,{name:'Powiadomienie automatyczne',project_id:p.id,event:'manual',audience:'reporter',enabled:true,subject:'Automatyzacja {{key}}',body:'Przekazujemy informację. {{url}}'},f.admin),w=f.workflows.get(p.id);
 f.workflows.save(p.id,{...w,rules:[{id:'mail',name:'E-mail i komentarz',event:'agent_reply',from:'*',enabled:true,conditions:[],actions:[{type:'email',value:template.id},{type:'comment',bot_id:client.id,body:'Komentarz wybranego konta',internal:false}]}]},f.admin);
 f.ext.events();clearMail(f);f.workflows.run(t,'agent_reply',f.admin);f.ext.events();assert.equal(f.db.prepare("SELECT COUNT(*) n FROM mail_outbox WHERE subject LIKE 'Automatyzacja %'").get().n,1);assert.equal(f.db.prepare("SELECT author_id FROM comments WHERE origin='automation'").get().author_id,client.id);f.ext.events();assert.equal(f.db.prepare("SELECT COUNT(*) n FROM mail_outbox WHERE subject LIKE 'Automatyzacja %'").get().n,1);assert.throws(()=>templates.remove(template.id,{version:template.version},f.admin),e=>e.status===409);
 }finally{f.close();}
});

test('Reordering a central template propagates while project rules and current state survive',()=>{
 const f=setup();try{const p=f.project('ORDER'),t=f.ticket(p),w=f.workflows.get(p.id);f.workflows.save(p.id,{...w,rules:[{name:'Odpowiedź',event:'customer_reply',from:'waiting',to:'open',enabled:true}]},f.admin);const template=f.ext.templates.list(f.admin).find(x=>x.id===p.workflow_template_id);const keys=[...template.config.statuses].reverse();f.ext.templates.save(template.id,{...template,config:{...template.config,statuses:keys}},f.admin);const after=f.workflows.get(p.id);assert.deepEqual(after.statuses.map(x=>x.key),keys.map(x=>x.key));assert.equal(after.rules.length,1);assert.equal(f.desk.ticket(t.id).workflow_status,t.workflow_status);assert.throws(()=>f.ext.templates.detach(p.id,{version:p.version},f.admin),e=>e.status===409);
 }finally{f.close();}
});

test('Asset project creates a catalogue and does not expose a customer portal',()=>{
 const f=setup();try{const p=f.projects.create({key:'DEVICES',name:'Katalog urządzeń',project_type:'assets',portal_access:'members',next_number:1,number_padding:5,description:'',archived:false},f.admin);assert.equal(p.project_type,'assets');assert.ok(p.workflow_template_id);assert.equal(p.can_request,false);const a=f.ext.resources.saveAsset(null,{project_id:p.id,name:'Laptop biurowy',kind:'Laptop'},f.admin);assert.equal(a.asset_key,'DEVICES-00001');const u=f.user('assets@example.test');assert.ok(!f.projects.list(u).some(x=>x.id===p.id));
 }finally{f.close();}
});

test('Update repository is fixed and checks are forced on; knowledge integration only stores configuration',()=>{
 const f=setup();try{const updates=createUpdates(f.db,f.projects,{dataDir:f.dataDir});try{const s=updates.status(f.admin);assert.equal(s.repository,RELEASE_REPOSITORY);assert.equal(s.automatic_checks,true);assert.throws(()=>updates.save({version:s.version,repository:'other/desk'},f.admin),e=>e.status===400);assert.equal(updates.save({version:s.version,automatic_checks:false},f.admin).automatic_checks,true);}finally{updates.stop();}
 const kb=createKnowledge(f.db,f.projects);assert.throws(()=>kb.save({version:1,enabled:true,base_url:'https://user:pass@example.test'},f.admin),e=>e.status===400);const c=kb.save({version:1,enabled:true,base_url:'https://kb.example.test'},f.admin);assert.equal(c.base_url,'https://kb.example.test');assert.equal(c.contract_version,1);assert.throws(()=>kb.status(f.user('kb@example.test')),e=>e.status===403);
 }finally{f.close();}
});

test('Agent linking a ticket auto-watches it, while manual unwatch stays effective',async()=>{const f=setup();try{const p=f.project('LINK'),a=f.user('linker@example.test','agent'),t=f.ticket(p),other=f.ticket(p);member(f,p,a);f.ext.events();await f.ext.handle('POST','/api/desk/tickets/'+t.id+'/link',a,new URLSearchParams(),async()=>({key:other.key}));assert.equal(f.desk.detail(t,a).watching,true);await f.ext.handle('POST','/api/desk/tickets/'+t.id+'/watch',a,new URLSearchParams(),async()=>({watching:false}));assert.equal(f.desk.detail(t,a).watching,false);}finally{f.close();}});
