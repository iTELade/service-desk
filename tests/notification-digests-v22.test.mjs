import test from 'node:test';
import assert from 'node:assert/strict';
import {setup} from './v6-fixture.mjs';
import {migrateV8} from '../lib/migration-v8.mjs';
import {migrateV9} from '../lib/migration-v9.mjs';
import {migrateV10} from '../lib/migration-v10.mjs';
import {migrateV11} from '../lib/migration-v11.mjs';
import {migrateV12} from '../lib/migration-v12.mjs';
import {createV21} from '../lib/v21.mjs';
import {createV22} from '../lib/v22.mjs';
import {createNotificationDigests} from '../lib/notification-digests-v22.mjs';
import {mailAllowed} from '../lib/mail-access.mjs';
import {secretStore} from '../lib/secrets.mjs';

test('opt-in scheduled email digest is idempotent, rechecks access and obeys quiet hours',()=>{
 const f=setup();
 try {
  migrateV8(f.db);migrateV9(f.db);migrateV10(f.db);migrateV11(f.db);migrateV12(f.db);
  const v21=createV21(f.db,{...f,ticketView:t=>t,queryTickets:()=>({tickets:[]})});
  const v=createV22(f.db,{...f,extensions:f.ext,v21});
  const p=f.project('DGS'),t=f.ticket(p),other=f.ticket(p),staff=f.user('digest-receiver@x.test','agent');
  f.projects.setMember(p.id,staff.id,'agent',f.admin);
  const form=f.db.prepare('SELECT id FROM request_types WHERE project_id=? LIMIT 1').get(p.id);
  const ch=f.ext.mail.save(null,{project_id:p.id,name:'Digest sender',email:'digest-sender@x.test',enabled:true,config:{imap_enabled:false,smtp_host:'smtp.example.test',smtp_port:587,smtp_secure:false,smtp_user:'',request_type_id:form.id}},f.admin);
  const pref=v.preferences({version:0,config:{events:[],quiet_start:'22:00',quiet_end:'07:00',timezone:'UTC',digest:true,channels:['app','email'],digest_frequency:'daily',digest_hour:8}},staff);
  assert.equal(pref.config.digest_frequency,'daily');
  let clock=Date.parse('2026-10-13T06:00:00Z');
  const digests=createNotificationDigests(f.db,{projects:f.projects,mail:f.ext.mail,clock:()=>clock});
  const note=(ticket)=>f.db.prepare('INSERT INTO notifications(user_id,ticket_id,body,created_at) VALUES(?,?,?,?)').run(staff.id,ticket.id,'Synthetic internal summary',new Date(clock).toISOString());
  note(t);note(other);
  assert.equal(digests.dispatch().queued,0);
  clock=Date.parse('2026-10-13T09:00:00Z');
  assert.equal(digests.dispatch().queued,1);
  assert.equal(digests.dispatch().queued,0);
  const row=f.db.prepare('SELECT * FROM mail_outbox WHERE recipient=?').get(staff.email);
  assert.equal(row.channel_id,ch.id);
  const secrets=secretStore(f.dataDir),meta=JSON.parse(secrets.open(row.metadata));
  assert.equal(meta.desk_internal,true);
  assert.deepEqual(meta.desk_digest_ticket_ids,[t.id,other.id]);
  assert.ok(!secrets.open(row.body).includes('Synthetic internal summary'));
  assert.ok(mailAllowed(f.db,row,meta));
  f.db.prepare('DELETE FROM project_members WHERE project_id=? AND user_id=?').run(p.id,staff.id);
  assert.equal(mailAllowed(f.db,row,meta),false);
  assert.equal(f.ext.notifications.list(staff).unread,0);
  clock=Date.parse('2026-10-14T09:00:00Z');
  assert.equal(digests.dispatch().queued,0);
  assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{f.close();}
});

test('digest configuration rejects unsupported delivery channels and scheduling settings',()=>{
 const f=setup();
 try{
  migrateV8(f.db);migrateV9(f.db);migrateV10(f.db);migrateV11(f.db);migrateV12(f.db);
  const v21=createV21(f.db,{...f,ticketView:t=>t,queryTickets:()=>({tickets:[]})});
  const v=createV22(f.db,{...f,extensions:f.ext,v21});
  const base={events:[],quiet_start:'23:00',quiet_end:'07:00',timezone:'UTC',digest:true,channels:['app','email'],digest_frequency:'daily',digest_hour:8};
  assert.throws(()=>v.preferences({version:0,config:{...base,channels:['email','webhook']}},f.admin),e=>e.status===400);
  assert.throws(()=>v.preferences({version:0,config:{...base,digest_hour:26}},f.admin),e=>e.status===400);
  assert.throws(()=>v.preferences({version:0,config:{...base,digest_frequency:'weekly'}},f.admin),e=>e.status===400);
  const data=v.preferences({version:0,config:base},f.admin);
  assert.deepEqual(data.config.channels,['app','email']);
  assert.throws(()=>v.preferences({version:0,config:base},f.admin),e=>e.status===409);
 }finally{f.close();}
});
