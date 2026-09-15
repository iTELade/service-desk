import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {migrateV8} from '../lib/migration-v8.mjs';
import {createCatalog} from '../lib/catalog.mjs';
import {createWorkflows} from '../lib/workflows.mjs';
import {createDesk} from '../lib/desk.mjs';
import {createRelease112,storeInboundAttachments} from '../lib/release-112.mjs';

function setup(){
  const f=fixture();migrateV8(f.db);
  const catalog=createCatalog(f.db,f.projects),workflows=createWorkflows(f.db,f.projects),desk=createDesk(f.db,f.projects,catalog,workflows);
  const p=f.projects.create({key:'R12',name:'Release 1.1.2',project_type:'external',portal_access:'authenticated'},f.admin);
  const stamp=new Date().toISOString();
  const customerId=Number(f.db.prepare("INSERT INTO users(email,name,password,role,must_change,created_at,username,first_name,last_name) VALUES('customer112@example.test','Customer 112','TEST','customer',0,?,'customer112','Customer','112')").run(stamp).lastInsertRowid);
  f.db.prepare("INSERT INTO project_members(project_id,user_id,role) VALUES(?,?,'requester')").run(p.id,customerId);
  const customer=f.db.prepare('SELECT * FROM users WHERE id=?').get(customerId);
  const ticketId=Number(f.db.prepare("INSERT INTO tickets(project_id,key,number,title,description,type,priority,status,workflow_status,reporter_id,created_by,created_at,updated_at) VALUES(?,?,1,?,?,?,'P3','open','open',?,?,?,?)")
    .run(p.id,'R12-1','VPN access request','Need VPN access for test','request',customerId,customerId,stamp,stamp).lastInsertRowid);
  const ticket=desk.ticket(ticketId),r=createRelease112(f.db,f.projects,desk);
  return {...f,p,customer,ticket,r,workflows,closeAll(){workflows.automation.stop();f.close();}};
}

test('1.1.2 queue preferences persist hidden columns and drag order',()=>{
  const f=setup();try{
    const q=new URLSearchParams({project:String(f.p.id)});
    const saved=f.r.preferences('POST',f.admin,q,{project_id:f.p.id,columns:['issue','updated','status'],sort_primary:'created_asc',sort_secondary:'status',quick_filter:'mine'});
    assert.deepEqual(saved.columns,['issue','updated','status']);
    assert.equal(saved.sort_primary,'created_asc');assert.equal(saved.sort_secondary,'status');assert.equal(saved.quick_filter,'mine');
    const loaded=f.r.preferences('GET',f.admin,q,{});assert.deepEqual(loaded.columns,['issue','updated','status']);
    assert.throws(()=>f.r.preferences('GET',f.customer,q,{}),e=>e.status===403);
  }finally{f.closeAll();}
});

test('1.1.2 attachments enforce ticket and internal visibility',()=>{
  const f=setup();try{
    const publicFile=f.r.attachmentCreate(f.customer,{ticket_id:f.ticket.id,filename:'screen.png',mime:'image/png',data_base64:Buffer.from('png-test').toString('base64'),internal:false});
    assert.equal(publicFile.filename,'screen.png');assert.equal(publicFile.internal,false);
    assert.equal(f.r.attachmentContent(f.customer,publicFile.id).data_base64,Buffer.from('png-test').toString('base64'));
    assert.throws(()=>f.r.attachmentCreate(f.customer,{ticket_id:f.ticket.id,filename:'secret.txt',mime:'text/plain',data_base64:Buffer.from('secret').toString('base64'),internal:true}),e=>e.status===403);
    const internal=f.r.attachmentCreate(f.admin,{ticket_id:f.ticket.id,filename:'agent.txt',mime:'text/plain',data_base64:Buffer.from('agent-only').toString('base64'),internal:true});
    const customerList=f.r.attachmentList(f.customer,new URLSearchParams({ticket:String(f.ticket.id)}));assert.equal(customerList.some(x=>x.id===internal.id),false);
    assert.throws(()=>f.r.attachmentContent(f.customer,internal.id),e=>e.status===404);
    assert.equal(f.r.attachmentContent(f.admin,internal.id).filename,'agent.txt');
    assert.throws(()=>f.r.attachmentCreate(f.admin,{ticket_id:f.ticket.id,filename:'run.js',mime:'application/javascript',data_base64:Buffer.from('x').toString('base64'),internal:false}),e=>e.status===400);
  }finally{f.closeAll();}
});

test('1.1.2 inbound mail attachment storage keeps valid files and rejects unsafe files',()=>{
  const f=setup();try{
    const out=storeInboundAttachments(f.db,f.ticket.id,null,[
      {filename:'invoice.pdf',contentType:'application/pdf',content:Buffer.from('pdf-data')},
      {filename:'evil.html',contentType:'text/html',content:Buffer.from('<script>x</script>')},
      {filename:'pixel.png',contentType:'image/png',contentDisposition:'inline',content:Buffer.from('x')}
    ],f.customer.id);
    assert.deepEqual(out,{stored:1,rejected:1});
    const rows=f.db.prepare('SELECT filename,source FROM r112_attachments WHERE ticket_id=? ORDER BY filename').all(f.ticket.id);
    assert.deepEqual(rows,[{filename:'invoice.pdf',source:'email'}]);
  }finally{f.closeAll();}
});

test('1.1.2 global search is permission aware and prioritizes exact ticket keys',()=>{
  const f=setup();try{
    const hidden=f.projects.create({key:'HID',name:'Hidden internal',project_type:'internal',portal_access:'internal'},f.admin),stamp=new Date().toISOString();
    f.db.prepare("INSERT INTO tickets(project_id,key,number,title,description,type,priority,status,workflow_status,reporter_id,created_by,created_at,updated_at) VALUES(?,?,1,?,?,?,'P3','open','open',?,?,?,?)")
      .run(hidden.id,'HID-1','Secret VPN','Hidden secret VPN','request',f.admin.id,f.admin.id,stamp,stamp);
    const customerResult=f.r.search(f.customer,new URLSearchParams({q:'VPN'}));
    assert.deepEqual(customerResult.tickets.map(x=>x.key),['R12-1']);
    assert.deepEqual(customerResult.users,[]);assert.deepEqual(customerResult.organizations,[]);assert.deepEqual(customerResult.assets,[]);
    const exact=f.r.search(f.admin,new URLSearchParams({q:'R12-1'}));assert.equal(exact.tickets[0].key,'R12-1');
    assert.ok(Array.isArray(exact.knowledge));
  }finally{f.closeAll();}
});
