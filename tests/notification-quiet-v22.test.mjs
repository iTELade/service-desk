import test from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './v6-fixture.mjs';
import { migrateV8 } from '../lib/migration-v8.mjs';
import { migrateV9 } from '../lib/migration-v9.mjs';
import { migrateV10 } from '../lib/migration-v10.mjs';
import { migrateV11 } from '../lib/migration-v11.mjs';
import { migrateV12 } from '../lib/migration-v12.mjs';
import { createV21 } from '../lib/v21.mjs';
import { createV22 } from '../lib/v22.mjs';

test('quiet hours never hide accessible in-app notifications',()=>{
 const f=setup();
 try {
  migrateV8(f.db);migrateV9(f.db);migrateV10(f.db);migrateV11(f.db);migrateV12(f.db);
  const v21=createV21(f.db,{...f,ticketView:t=>t,queryTickets:()=>({tickets:[]})});
  const v=createV22(f.db,{...f,extensions:f.ext,v21});
  const p=f.project('NOT'),t=f.ticket(p),agent=f.user('agent-notify@x.test','agent');
  f.projects.setMember(p.id,agent.id,'agent',f.admin);
  f.db.prepare('INSERT INTO notifications(user_id,ticket_id,body,created_at) VALUES(?,?,?,?)').run(agent.id,t.id,'Public notification',new Date().toISOString());
  v.preferences({version:0,config:{events:[],quiet_start:'00:00',quiet_end:'23:59',timezone:'UTC',digest:true}},agent);
  const list=f.ext.notifications.list(agent);
  assert.equal(list.items.length,1);
  assert.equal(list.unread,1);
  assert.equal(list.digest.threads[0].ticket_key,t.key);
 } finally {f.close();}
});
