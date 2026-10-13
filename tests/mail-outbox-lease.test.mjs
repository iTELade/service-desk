import test from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './v6-fixture.mjs';
import { claimPendingMail } from '../lib/mail-outbox-lease.mjs';

test('SMTP leases prevent two workers from claiming the same outbox message',()=>{
 const f=setup();
 try {
  const p=f.project('OUT'),at=Date.parse('2026-10-13T20:00:00Z');
  const channel=Number(f.db.prepare('INSERT INTO email_channels(project_id,name,email,config,secret) VALUES(?,?,?,?,?)').run(p.id,'SMTP test','notifications@x.test','{}','TEST').lastInsertRowid);
  const add=(recipient,due)=>Number(f.db.prepare('INSERT INTO mail_outbox(recipient,subject,body,next_attempt,created_at,channel_id) VALUES(?,?,?,?,?,?)').run(recipient,'Subject','encrypted',due,new Date(at).toISOString(),channel).lastInsertRowid);
  const first=add('first@x.test',at),later=add('later@x.test',at+60000);
  const a=claimPendingMail(f.db,at);
  assert.deepEqual(a.map(x=>x.id),[first]);
  assert.equal(a[0].status,'sending');
  assert.equal(a[0].next_attempt,at+300000);
  assert.deepEqual(claimPendingMail(f.db,at),[]);
  assert.deepEqual(claimPendingMail(f.db,at+60000).map(x=>x.id),[later]);
  assert.deepEqual(claimPendingMail(f.db,at+299999),[]);
  assert.deepEqual(claimPendingMail(f.db,at+300000).map(x=>x.id),[first]);
  f.db.prepare("UPDATE mail_outbox SET status='sent',body='' WHERE id=?").run(first);
  assert.deepEqual(claimPendingMail(f.db,at+700000).map(x=>x.id),[later]);
  assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{f.close();}
});

test('SMTP leases reject invalid limits and never claim a row without a channel',()=>{
 const f=setup();
 try {
  f.db.prepare("INSERT INTO mail_outbox(recipient,subject,body,next_attempt,created_at) VALUES('x@x.test','Subj','encrypted',0,'2026-10-13')").run();
  assert.deepEqual(claimPendingMail(f.db,0),[]);
  assert.throws(()=>claimPendingMail(f.db,0,1000),RangeError);
  assert.throws(()=>claimPendingMail(f.db,0,20,1000),RangeError);
 }finally{f.close();}
});
