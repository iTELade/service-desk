import test from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './v6-fixture.mjs';
import { createMail } from '../lib/mail.mjs';

test('two independent mail sender instances never send a claimed outbox row simultaneously', async()=>{
 const f=setup();
 let unblock,sendCount=0;
 const deliver=()=>({sendMail:async()=>{sendCount++;await new Promise(r=>{unblock=r;});},close(){}});
 const options={origin:'https://help.example.test',dataDir:f.dataDir,clock:()=>Date.parse('2026-10-13T20:00:00Z'),transportFactory:deliver};
 const one=createMail(f.db,f.projects,f.catalog,f.workflows,f.desk,f.accounts,options),two=createMail(f.db,f.projects,f.catalog,f.workflows,f.desk,f.accounts,options);
 try {
  const p=f.project('SND');
  const form=f.db.prepare('SELECT id FROM request_types WHERE project_id=? LIMIT 1').get(p.id);
  const channel=one.save(null,{project_id:p.id,name:'QA SMTP',email:'qa-send@example.test',enabled:true,config:{imap_enabled:false,smtp_host:'mail.example.test',smtp_port:587,smtp_secure:false,smtp_user:'',request_type_id:form.id}},f.admin);
  one.enqueue(channel,'test@example.test','SMTP concurrency','Safe test body');
  const first=one.flush();
  assert.equal(sendCount,1);
  const second=two.flush();
  assert.equal(sendCount,1);
  unblock();
  await Promise.all([first,second]);
  assert.equal(sendCount,1);
  assert.equal(f.db.prepare('SELECT status FROM mail_outbox WHERE channel_id=?').get(channel.id).status,'sent');
 } finally {one.stop();two.stop();f.close();}
});
