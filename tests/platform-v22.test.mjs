import { createPluginAPI } from '../lib/plugin-api.mjs';
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
import { createPluginRuntime } from '../lib/plugin-runtime.mjs';
import { compileExpression, parseExpression, formatExpression } from '../lib/query-v22.mjs';
import { createPasskeys } from '../lib/passkeys.mjs';
import { generateKeyPairSync, createHash, randomBytes, sign } from 'node:crypto';
import { isoCBOR } from '@simplewebauthn/server/helpers';

function fixture() {
  const f = setup(); migrateV8(f.db); migrateV9(f.db); migrateV10(f.db); migrateV11(f.db); migrateV12(f.db);
  const v21 = createV21(f.db, { ...f, ticketView: t => t, queryTickets: () => ({ tickets: [] }) });
  const v = createV22(f.db, { ...f, extensions: f.ext, v21 }); return { ...f, v, v21 };
}
const status = n => e => e.status === n;
test('schema 12 migration is idempotent and preserves tickets, identities and foreign keys', () => {
  const f = setup(); try { const p = f.project('MIG'), t = f.ticket(p); migrateV8(f.db); migrateV9(f.db); migrateV10(f.db); migrateV11(f.db); migrateV12(f.db); migrateV12(f.db); assert.equal(f.db.prepare('PRAGMA user_version').get().user_version, 12); assert.equal(f.desk.ticket(t.id).key, t.key); assert.equal(f.db.prepare('SELECT COUNT(*) n FROM process_instances').get().n, 1); assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(), []); assert.equal(f.db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok'); } finally { f.close(); }
});
test('blueprint draft preview has no effects and activation creates HR + IT atomically', () => {
  const f = fixture(); try {
    const draft = f.v.blueprints.draft(null, { name: 'HR + IT', blueprint: 'hr_it' }, f.admin), mapping = { hr: { key: 'HR', name: 'HR' }, it: { key: 'ITA', name: 'IT' } };
    assert.equal(f.db.prepare('SELECT count(*) n FROM projects').get().n, 0);
    assert.equal(f.v.blueprints.validate(draft.id, { version: 1, mapping }, f.admin).valid, true);
    assert.equal(f.db.prepare('SELECT count(*) n FROM projects').get().n, 0);
    const result = f.v.blueprints.activate(draft.id, { version: 1, mapping }, f.admin); assert.equal(Object.keys(result.projects).length, 2);
    assert.equal(f.db.prepare('SELECT count(*) n FROM sync_configs').get().n, 1);
    assert.equal(f.db.prepare('SELECT count(*) n FROM tickets').get().n, 0);
    assert.throws(() => f.v.blueprints.activate(draft.id, { version: 1, mapping }, f.admin), status(409));
    const clean = f.v.blueprints.portable({ projects: [{ alias: 'test', project_type: 'internal', forms: [{ name: 'Form', fields: [] }], token: 'SECRET' }], secret: 'SECRET' }); assert.ok(!JSON.stringify(clean).includes('SECRET'));
  } finally { f.close(); }
});
test('sequential approvals require all parallel approvers, reject changes and block closure', () => {
  const f = fixture(); try {
    const p = f.project('APR'), t = f.ticket(p), a = f.user('a@x.test', 'agent'), b = f.user('b@x.test', 'agent'); f.projects.setMember(p.id, a.id, 'agent', f.admin); f.projects.setMember(p.id, b.id, 'agent', f.admin);
    const run = f.v.processes.approval(t.id, { stages: [{ name: 'Kierownicy', users: [a.id, b.id], mode: 'all' }, { name: 'Odbiór', users: [f.admin.id], mode: 'all' }] }, f.admin);
    assert.throws(() => f.workflows.transition(t, { workflow_status: 'resolved', workflow_version: f.workflows.get(p.id).version }, true, f.admin), status(409));
    f.v.processes.decide(run.id, { version: 1, decision: 'approved' }, a); assert.equal(f.db.prepare('SELECT stage_index FROM approval_runs WHERE id=?').get(run.id).stage_index, 0);
    f.v.processes.decide(run.id, { version: 2, decision: 'approved' }, b); assert.equal(f.db.prepare('SELECT stage_index FROM approval_runs WHERE id=?').get(run.id).stage_index, 1);
    f.db.prepare('UPDATE tickets SET description=? WHERE id=?').run('Changed material data', t.id);
    assert.throws(() => f.v.processes.decide(run.id, { version: 3, decision: 'approved' }, f.admin), status(409));
    assert.equal(f.v.processes.extras(t.id, f.admin).approvals[0].stale, true);
  } finally { f.close(); }
});
test('dependencies reject cycles and block direct API/sync database transitions', () => {
  const f = fixture(); try { const p = f.project('DEP'), a = f.ticket(p), b = f.ticket(p); f.v.processes.dependency(a.id, { blocked_by: b.id }, f.admin); assert.throws(() => f.v.processes.dependency(b.id, { blocked_by: a.id }, f.admin), status(400)); assert.throws(() => f.db.prepare("UPDATE tickets SET status='closed' WHERE id=?").run(a.id), /DESK_PROCESS_DEPENDENCY/); assert.equal(f.v.processes.extras(a.id, f.admin).blockers.length, 1); } finally { f.close(); }
});
test('participant access grants only public conversation and revocation removes queue scope', () => {
  const f = fixture(); try { const p = f.project('PAR'), owner = f.user('owner@x.test'), other = f.user('other@x.test'), t = f.ticket(p, owner); assert.equal(f.projects.canRead(other, f.projects.project(p.id), t), false); f.v.governance.participant(t.id, { user_id: other.id }, f.admin); assert.equal(f.projects.canRead(other, f.projects.project(p.id), t), true); const scope = f.projects.ticketScope(other); assert.equal(f.db.prepare('SELECT COUNT(*) n FROM tickets t WHERE ' + scope.sql).get(...scope.values).n, 1); f.v.governance.participant(t.id, { user_id: other.id, remove: true }, f.admin); assert.equal(f.projects.canRead(other, f.projects.project(p.id), t), false); } finally { f.close(); }
});
test('recycle preserves ticket body and reserved key; restoration never resumes jobs', () => {
  const f = fixture(); try { const p = f.project('BIN'), t = f.ticket(p); f.v.runtime.reminders({ ticket_id: t.id, body: 'Remember', run_at: new Date(Date.now() + 60000).toISOString(), request_key: 'reminder-recycle' }, f.admin); const r = f.v.governance.recycleTicket(t.id, { version: t.version, confirm_key: t.key }, f.admin); assert.equal(f.desk.ticket(t.id).title, t.title); assert.equal(f.db.prepare('SELECT state FROM platform_jobs').get().state, 'paused'); assert.equal(f.projects.canRead(f.admin, f.projects.project(p.id), f.desk.ticket(t.id)), false); f.v.governance.restoreTrash(r.id, { confirm_key: t.key }, f.admin); assert.equal(f.desk.ticket(t.id).deleted_at, null); assert.equal(f.db.prepare('SELECT state FROM platform_jobs').get().state, 'paused'); assert.equal(f.desk.ticket(t.id).key, t.key); } finally { f.close(); }
});
test('query grammar is parameterized, supports OR/IN/currentUser and rejects inaccessible custom fields', () => {
  const f = fixture(); try { const p = f.project('QUE'), t = f.ticket(p); const r = compileExpression('project=QUE AND (priority IN (P1,P3) OR assignee=currentUser())', { user: f.admin, projects: f.projects }); assert.equal(f.db.prepare('SELECT count(*) n FROM tickets t WHERE ' + r.sql).get(...r.values).n, 1); assert.throws(() => compileExpression('custom.secret = foo', { user: f.admin, projects: f.projects }), status(403)); assert.throws(() => compileExpression('project=QUE; DROP TABLE tickets', { user: f.admin, projects: f.projects }), status(400)); assert.equal(f.desk.ticket(t.id).key, t.key); } finally { f.close(); }
});
test('bulk preview rolls back effects and receipts, then actual mutation rechecks versions', () => {
  const f = fixture(); try { const p = f.project('BLK'), t = f.ticket(p), b = { action: 'priority', value: 'P1', items: [{ key: t.key, version: t.version }] }; const preview = f.v.preview(b, f.admin); assert.equal(preview.results[0].ok, true); assert.equal(f.desk.ticket(t.id).priority, 'P3'); assert.equal(f.db.prepare('SELECT count(*) n FROM workspace_receipts').get().n, 0); } finally { f.close(); }
});
test('plugin service is scoped, paused on revocation, and deduplicates requests', async () => {
  const f = fixture(); try {
    const p = f.project('PLG'), t = f.ticket(p); f.ext.plugins.install({ id: 'test.connector', name: 'Test', version: '1.0.0', capabilities: ['scheduled.job', 'integration.connector'], permissions: ['scheduled.job', 'ticket.read'] }, f.admin); f.ext.plugins.setEnabled('test.connector', true, f.admin);
    const delivered = [], r = createPluginRuntime(f.db, { projects: f.projects, desk: f.desk, registry: f.ext.plugins, dataDir: f.dataDir, send: async (...args) => delivered.push(args) });
    r.configure('test.connector', { version: 0, url: 'https://plugin.example.test/action', project_ids: [p.id], permissions: ['scheduled.job', 'ticket.read'] }, f.admin);
    const b = { ticket_id: t.id, action: 'noop', request_key: 'plugin-job-0001' }; const first = r.enqueue('test.connector', b, f.admin); assert.equal(r.enqueue('test.connector', b, f.admin).id, first.id); await r.flush(); assert.equal(delivered.length, 1); assert.equal(f.db.prepare('SELECT state FROM platform_jobs WHERE id=?').get(first.id).state, 'sent'); await r.flush(); assert.equal(delivered.length, 1);
    const pending = r.enqueue('test.connector', { ...b, request_key: 'plugin-job-0002' }, f.admin); f.ext.plugins.setEnabled('test.connector', false, f.admin); await r.flush(); assert.equal(f.db.prepare('SELECT state FROM platform_jobs WHERE id=?').get(pending.id).state, 'paused'); assert.equal(delivered.length, 1);
  } finally { f.close(); }
});
test('passkeys require fresh reauthentication, resident credential and user verification', async () => {
  const f = fixture(); try { const u = { ...f.admin, token: 'session-hash' }, p = createPasskeys(f.db, { origin: 'https://desk.example.test' }); await assert.rejects(() => p.registrationOptions(u), status(403)); p.grant(u, u.token); const opts = await p.registrationOptions(u); assert.equal(opts.publicKey.authenticatorSelection.residentKey, 'required'); assert.equal(opts.publicKey.authenticatorSelection.userVerification, 'required'); const login = await p.options(); assert.equal(login.publicKey.userVerification, 'required'); assert.equal(login.publicKey.allowCredentials?.length || 0, 0); await assert.rejects(() => p.verify({ token: login.token, credential: { id: 'unknown' } }), status(401)); await assert.rejects(() => p.verify({ token: login.token, credential: { id: 'unknown' } }), status(401)); const directoryUser = { ...u, auth_source: 'ldap' }; await assert.rejects(() => p.registrationOptions(directoryUser), status(403)); } finally { f.close(); }
});
test('real WebAuthn cryptographic verification accepts synchronized passkey and rejects replay, wrong origin and missing UV', async () => {
  const f = fixture();
  try {
    const origin = 'https://desk.example.test', u = { ...f.admin, token: 'session-hash' }, p = createPasskeys(f.db, { origin });
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }), jwk = publicKey.export({ format: 'jwk' });
    const id = randomBytes(32), idString = id.toString('base64url'), hash = v => createHash('sha256').update(v).digest();
    const cose = isoCBOR.encode(new Map([[1, 2], [3, -7], [-1, 1], [-2, new Uint8Array(Buffer.from(jwk.x, 'base64url'))], [-3, new Uint8Array(Buffer.from(jwk.y, 'base64url'))]]));
    p.grant(u, u.token); const registration = await p.registrationOptions(u);
    const data = Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge: registration.publicKey.challenge, origin }));
    const length = Buffer.alloc(2); length.writeUInt16BE(id.length);
    const authData = Buffer.concat([hash('desk.example.test'), Buffer.from([0x5d]), Buffer.alloc(4), Buffer.alloc(16), length, id, Buffer.from(cose)]);
    const attestation = isoCBOR.encode(new Map([['fmt', 'none'], ['attStmt', new Map()], ['authData', new Uint8Array(authData)]]));
    await p.register(u, { token: registration.token, name: 'Synthetic synced passkey', credential: { id: idString, rawId: idString, type: 'public-key', clientExtensionResults: { credProps: { rk: true } }, response: { clientDataJSON: data.toString('base64url'), attestationObject: Buffer.from(attestation).toString('base64url'), transports: ['internal', 'hybrid'] } } });
    assert.equal(p.list(u)[0].backed_up, 1);
    const assertion = async (wrongOrigin = false, flags = 0x1d) => {
      const options = await p.options(), cd = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge: options.publicKey.challenge, origin: wrongOrigin ? 'https://evil.example' : origin }));
      const ad = Buffer.concat([hash('desk.example.test'), Buffer.from([flags]), Buffer.alloc(4)]), signature = sign('sha256', Buffer.concat([ad, hash(cd)]), privateKey);
      return { token: options.token, credential: { id: idString, rawId: idString, type: 'public-key', clientExtensionResults: {}, response: { clientDataJSON: cd.toString('base64url'), authenticatorData: ad.toString('base64url'), signature: signature.toString('base64url'), userHandle: registration.publicKey.user.id } } };
    };
    const valid = await assertion(); assert.equal((await p.verify(valid)).id, u.id); await assert.rejects(() => p.verify(valid), status(401));
    const invalidOrigin = await assertion(true); await assert.rejects(() => p.verify(invalidOrigin), status(401));
    const noUV = await assertion(false, 0x19); await assert.rejects(() => p.verify(noUV), status(401));
    const second = await assertion(); assert.equal((await p.verify(second)).id, u.id); // multi-device credentials may retain counter zero
    p.grant(u, u.token); p.remove(u, p.list(u)[0].id); const revoked = await assertion(); await assert.rejects(() => p.verify(revoked), status(401));
  } finally { f.close(); }
});

test('period reports isolate project access and count team responsibility, reopen events and median', async () => {
  const f = fixture(); try {
    const p = f.project('REP'), other = f.project('HIDDEN'), a = f.ticket(p), b = f.ticket(p); f.ticket(other);
    const team = f.v.processes.saveTeam(null, { project_id: p.id, name: 'Support', members: [f.admin.id], version: 0 }, f.admin)[0];
    f.v.processes.metadata(a.id, { version: 0, team_id: team.id }, f.admin);
    f.db.prepare('UPDATE tickets SET first_response_at=? WHERE id=?').run('2026-09-14T09:10:00.000Z', a.id);
    f.db.prepare('UPDATE tickets SET first_response_at=? WHERE id=?').run('2026-09-14T09:20:00.000Z', b.id);
    f.advance(3600000); f.state(a.id, 'resolved', f.admin, { resolution: 'Fixed' }); f.advance(60000); f.state(a.id, 'open');
    const report = (await f.v.handle('GET', '/api/desk/v22/reports', f.admin, new URLSearchParams({ project: String(p.id), from: '2026-09-14', to: '2026-09-14' }))).value;
    assert.equal(report.total, 2); assert.equal(report.response.median_minutes, 15); assert.equal(report.response.p90_minutes, 20); assert.equal(report.reopened.tickets, 1); assert.equal(report.reopened.events, 1); assert.equal(report.reopened.rate, .5);
    assert.equal(report.by_team.find(t => t.id === team.id).reopened_tickets, 1);
    await assert.rejects(() => f.v.handle('GET', '/api/desk/v22/reports', f.admin, new URLSearchParams({ from: '2026-02-30' })), status(400));
    const customer = f.user('report-customer@x.test'); await assert.rejects(() => f.v.handle('GET', '/api/desk/v22/reports', customer, new URLSearchParams()), status(403));
  } finally { f.close(); }
});

test('plugin subscriptions preserve business actor and durable deduplication; workflow proofs expire on change', async () => {
 const f=fixture();try{
  const p=f.project('HOOK'),t=f.ticket(p),id='neutral.hooks';
  f.ext.plugins.install({id,name:'Neutral hooks',version:'1.0.0',capabilities:['scheduled.job','event.listener','workflow.condition'],permissions:['scheduled.job','event.listener','ticket.read','workflow.condition'],subscriptions:['ticket_created','comment_added']},f.admin);
  f.ext.plugins.setEnabled(id,true,f.admin);
  const deliveries=[],r=createPluginRuntime(f.db,{projects:f.projects,desk:f.desk,registry:f.ext.plugins,dataDir:f.dataDir,send:async(...args)=>deliveries.push(args)});
  r.configure(id,{version:0,url:'https://neutral.example.test/execute',project_ids:[p.id],permissions:['scheduled.job','event.listener','ticket.read','workflow.condition']},f.admin);
  const event=f.db.prepare("SELECT * FROM desk_events WHERE ticket_id=? AND event='ticket_created'").get(t.id);
  r.receiveEvent(event);r.receiveEvent(event);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM platform_jobs').get().n,1);
  const privateComment=f.comment(t,f.admin,'Private note',1);r.receiveEvent({id:1000,ticket_id:t.id,event:'comment_added',payload:JSON.stringify({comment_id:privateComment})});assert.equal(f.db.prepare('SELECT COUNT(*) n FROM platform_jobs').get().n,1);
  const current=f.projects.project(p.id);f.v.governance.settings(p.id,{version:current.version,transition_conditions:{},plugin_conditions:{in_progress:[{plugin_id:id,action:'check'}]}},f.admin);
  const target=f.workflows.get(p.id).statuses.find(s=>s.key==='in_progress');
  assert.throws(()=>f.workflows.checkGuard(t,target,f.admin),status(409));
  const job=r.enqueue(id,{ticket_id:t.id,action:'check',request_key:'condition-proof-0001'},f.admin);await r.flush();assert.equal(deliveries.length,2);
  const eventDelivery=deliveries.map(d=>JSON.parse(d[1])).find(d=>d.event_id===event.id);assert.equal(eventDelivery.business_actor_id,f.admin.id);assert.equal(eventDelivery.actor_id,f.admin.id);
  f.db.prepare('UPDATE platform_jobs SET result=? WHERE id=?').run(JSON.stringify({business_result:'completed',condition:true}),job.id);
  assert.doesNotThrow(()=>f.workflows.checkGuard(t,target,f.admin));
  f.db.prepare('UPDATE tickets SET title=?,version=version+1 WHERE id=?').run('Changed request',t.id);assert.throws(()=>f.workflows.checkGuard(f.desk.ticket(t.id),target,f.admin),status(409));
  f.ext.plugins.install({id,name:'Neutral hooks',version:'1.1.0',capabilities:['scheduled.job'],permissions:['ticket.read','scheduled.job']},f.admin);assert.equal(f.ext.plugins.list(f.admin)[0].enabled,false);
 }finally{f.close();}
});

test('changing affected person invalidates approvals and pauses already authorized external jobs',()=>{
 const f=fixture();try{
  const p=f.project('SUBJECT'),t=f.ticket(p),subject=f.user('affected@x.test');
  const id='neutral.approval';f.ext.plugins.install({id,name:'Neutral approval',version:'1.0.0',capabilities:['scheduled.job'],permissions:['ticket.read','scheduled.job']},f.admin);f.ext.plugins.setEnabled(id,true,f.admin);
  f.v.runtime.configure(id,{version:0,url:'https://neutral.example.test/execute',project_ids:[p.id],permissions:['ticket.read','scheduled.job']},f.admin);
  const run=f.v.processes.approval(t.id,{stages:[{name:'Approval',mode:'all',users:[f.admin.id]}]},f.admin);
  assert.throws(()=>f.v.runtime.enqueue(id,{ticket_id:t.id,action:'noop',request_key:'subject-pending-001'},f.admin),status(409));
  f.v.processes.decide(run.id,{version:1,decision:'approved',reason:'Reviewed'},f.admin);
  const job=f.v.runtime.enqueue(id,{ticket_id:t.id,action:'noop',request_key:'subject-approved-001'},f.admin);
  f.v.processes.metadata(t.id,{version:0,subject_id:subject.id},f.admin);
  assert.equal(f.db.prepare('SELECT state FROM approval_runs WHERE id=?').get(run.id).state,'cancelled');
  assert.equal(f.db.prepare('SELECT state FROM platform_jobs WHERE id=?').get(job.id).state,'paused');
  assert.equal(f.desk.ticket(t.id).version,t.version+1);
  assert.throws(()=>f.v.runtime.enqueue(id,{ticket_id:t.id,action:'noop',request_key:'subject-changed-001'},f.admin),status(409));
 }finally{f.close();}
});

test('declarative plugin actions enforce schema and scope; revoked UI disappears',()=>{
 const f=fixture();try{
  const p=f.project('PUI'),t=f.ticket(p),id='neutral.ui',manifest={id,name:'Neutral UI',version:'1.0.0',capabilities:['scheduled.job','ticket.action','ticket.panel'],permissions:['scheduled.job','ticket.read','ui.extension'],hooks:[{id:'check',kind:'ticket.action',label:'Check',action:'check',fields:[{key:'amount',label:'Amount',type:'number',required:true}]},{id:'result',kind:'ticket.panel',label:'Result',fields:[{key:'state',type:'text'}]}]};
  f.ext.plugins.install(manifest,f.admin);f.ext.plugins.setEnabled(id,true,f.admin);f.v.runtime.configure(id,{version:0,url:'https://neutral.example.test/execute',project_ids:[p.id],permissions:manifest.permissions},f.admin);
  assert.equal(f.v.runtime.uiContract(p.id,f.admin,t.id)[0].hooks.length,2);
  assert.throws(()=>f.v.runtime.enqueue(id,{ticket_id:t.id,action:'ignored',hook_id:'check',input:{amount:'3'},request_key:'ui-action-invalid-001'},f.admin),status(400));
  const job=f.v.runtime.enqueue(id,{ticket_id:t.id,action:'ignored',hook_id:'check',input:{amount:3},request_key:'ui-action-valid-001'},f.admin);
  const payload=JSON.parse(f.db.prepare('SELECT payload FROM platform_jobs WHERE id=?').get(job.id).payload);assert.equal(payload.action,'check');assert.equal(payload.input.amount,3);
  f.ext.plugins.setEnabled(id,false,f.admin);assert.deepEqual(f.v.runtime.uiContract(p.id,f.admin,t.id),[]);
  assert.throws(()=>f.ext.plugins.install({...manifest,id:'bad.ui',hooks:[{id:'eval',kind:'ticket.action',label:'Bad',action:'x',fields:[{key:'constructor',type:'text'}]}]},f.admin),status(400));
 }finally{f.close();}
});

test('plugin settings encrypt secrets, mask reads, preserve omitted secrets and bind queued jobs to revision',async()=>{
 const f=fixture();try{
  const p=f.project('SECRET'),t=f.ticket(p),id='neutral.settings',manifest={id,name:'Neutral settings',version:'1.0.0',capabilities:['scheduled.job','admin.settings','project.settings'],permissions:['ticket.read','scheduled.job','ui.extension','settings.read'],hooks:[{id:'connection',kind:'admin.settings',label:'Connection',fields:[{key:'host',label:'Host',type:'text',required:true},{key:'password',label:'Password',type:'password',required:true}]},{id:'project',kind:'project.settings',label:'Project',fields:[{key:'mode',type:'select',options:['safe','review'],required:true}]}]};
  f.ext.plugins.install(manifest,f.admin);f.ext.plugins.setEnabled(id,true,f.admin);
  const sent=[],r=createPluginRuntime(f.db,{projects:f.projects,desk:f.desk,registry:f.ext.plugins,dataDir:f.dataDir,send:async(...args)=>sent.push(args)});
  r.configure(id,{version:0,url:'https://neutral.example.test/execute',project_ids:[p.id],permissions:manifest.permissions},f.admin);
  const saved=r.settings.save(id,0,{hook_id:'connection',version:0,input:{host:'neutral.example.test',password:'test-only-secret'}},f.admin)[0];
  assert.equal(saved.has_secret.password,true);assert.equal(saved.values.password,undefined);assert.ok(!f.db.prepare('SELECT config FROM plugin_settings').get().config.includes('test-only-secret'));
  const stale=r.enqueue(id,{ticket_id:t.id,action:'noop',request_key:'settings-stale-001'},f.admin);
  r.settings.save(id,0,{hook_id:'connection',version:1,input:{host:'new.example.test',password:''}},f.admin);
  assert.throws(()=>r.settings.save(id,0,{hook_id:'connection',version:1,input:{host:'old'}},f.admin),status(409));
  await r.flush();assert.equal(sent.length,0);assert.equal(f.db.prepare('SELECT state FROM platform_jobs WHERE id=?').get(stale.id).state,'paused');
  r.enqueue(id,{ticket_id:t.id,action:'noop',request_key:'settings-current-001'},f.admin);await r.flush();assert.equal(JSON.parse(sent[0][1]).settings.global.connection.password,'test-only-secret');
  const customer=f.user('secret-customer@x.test');assert.throws(()=>r.settings.list(id,0,customer),status(403));
  r.configure(id,{version:1,url:'https://neutral.example.test/execute',project_ids:[p.id],permissions:['ticket.read','scheduled.job','ui.extension']},f.admin);
  r.enqueue(id,{ticket_id:t.id,action:'noop',request_key:'settings-without-read-001'},f.admin);await r.flush();assert.equal(JSON.parse(sent[1][1]).settings,undefined);
 }finally{f.close();}
});

test('signed plugin API filters protected fields, verifies results and scopes follow-up jobs to their source actor',async()=>{
 const f=fixture();try{
  const p=f.project('RPC'),created=f.ticket(p),agent=f.user('plugin-executor@x.test','agent'),subject=f.user('plugin-subject@x.test');f.projects.setMember(p.id,agent.id,'agent',f.admin);
  const team=f.v.processes.saveTeam(null,{project_id:p.id,name:'Private',members:[f.admin.id]},f.admin)[0];
  f.db.prepare('UPDATE tickets SET form_snapshot=?,custom_values=? WHERE id=?').run(JSON.stringify({fields:[{key:'secret',label:'Secret',type:'text',visibility:'internal',allowed_team_ids:[team.id]}]}),JSON.stringify({secret:'protected-value'}),created.id);
  f.v.processes.metadata(created.id,{version:0,subject_id:subject.id},f.admin);const t=f.desk.ticket(created.id),id='neutral.rpc',permissions=['scheduled.job','ticket.read','ticket.comment','ticket.context','ticket.fields','person.read','ui.extension'];
  f.ext.plugins.install({id,name:'Neutral RPC',version:'1.0.0',capabilities:['scheduled.job','ticket.panel'],permissions,hooks:[{id:'result',kind:'ticket.panel',label:'Result',fields:[{key:'state',type:'text'}]}]},f.admin);f.ext.plugins.setEnabled(id,true,f.admin);
  const runtime=createPluginRuntime(f.db,{projects:f.projects,desk:f.desk,registry:f.ext.plugins,dataDir:f.dataDir,send:async()=>{}}),configured=runtime.configure(id,{version:0,url:'https://neutral.example.test/execute',project_ids:[p.id],execution_user_id:agent.id,permissions},f.admin),api=createPluginAPI(f.db,{runtime,projects:f.projects,catalog:f.catalog,processes:f.v.processes,workspace:f.v21.workspace});
  const call=(method,path,body={},key='rpc-test-0001')=>api.handle({method,path:'/api/plugins/'+id+path,token:'Bearer '+configured.generated_secret,idempotencyKey:key,read:async()=>body});
  assert.deepEqual((await call('GET','/tickets/'+t.id+'/fields')).value.custom_values,{});
  assert.equal((await call('GET','/tickets/'+t.id+'/person')).value.person.id,subject.id);
  assert.equal((await call('GET','/tickets/'+t.id+'/context')).value.context.subject_id,subject.id);
  const job=runtime.enqueue(id,{ticket_id:t.id,action:'noop',request_key:'rpc-source-0001'},f.admin);await runtime.flush();
  const follow={parent_job_id:job.id,version:t.version,action:'followup',run_at:new Date(Date.now()+60000).toISOString()};await assert.rejects(()=>call('POST','/tickets/'+t.id+'/schedule',follow),status(409));
  await assert.rejects(()=>call('POST','/jobs/'+job.id+'/result',{status:'completed',data:{secret:'no'}}),status(400));
  const result={status:'completed',message:'Verified',data:{state:'Verified'}};assert.equal((await call('POST','/jobs/'+job.id+'/result',result)).value.ok,true);assert.equal((await call('POST','/jobs/'+job.id+'/result',result)).value.duplicate,true);
  const scheduled=(await call('POST','/tickets/'+t.id+'/schedule',follow,'rpc-followup-0001')).value;assert.equal((await call('POST','/tickets/'+t.id+'/schedule',follow,'rpc-followup-0001')).value.id,scheduled.id);
  const payload=JSON.parse(f.db.prepare('SELECT payload FROM platform_jobs WHERE id=?').get(scheduled.id).payload);assert.equal(payload.parent_job_id,job.id);assert.equal(f.db.prepare('SELECT user_id FROM platform_jobs WHERE id=?').get(scheduled.id).user_id,f.admin.id);
  f.db.prepare('UPDATE users SET active=0 WHERE id=?').run(agent.id);await assert.rejects(()=>call('GET','/tickets/'+t.id),status(403));
 }finally{f.close();}
});

test('customer ticket extension contract keeps portal readable and excludes staff panels and result data',async()=>{
 const f=fixture();try{
  const p=f.project('PORTAL'),customer=f.user('portal-owner@x.test'),other=f.user('portal-other@x.test'),t=f.ticket(p,customer),id='neutral.portal';
  f.ext.plugins.install({id,name:'Neutral portal',version:'1.0.0',capabilities:['portal.panel','ticket.panel'],permissions:['ui.extension'],hooks:[{id:'public',kind:'portal.panel',label:'Public panel',fields:[{key:'state',type:'text'}]},{id:'staff',kind:'ticket.panel',label:'Staff panel',fields:[{key:'private',type:'text'}]}]},f.admin);f.ext.plugins.setEnabled(id,true,f.admin);f.v.runtime.configure(id,{version:0,url:'https://neutral.example.test/execute',project_ids:[p.id],permissions:['ui.extension']},f.admin);
  const value=(await f.v.handle('GET','/api/desk/v22/tickets/'+t.id,customer,new URLSearchParams())).value;
  assert.equal(value.next.action,'Realizacja zgłoszenia');assert.equal(value.context,undefined);assert.equal(value.plugin_ui[0].hooks.length,1);assert.equal(value.plugin_ui[0].hooks[0].kind,'portal.panel');assert.equal(value.plugin_ui[0].hooks[0].values.state,null);
  await assert.rejects(()=>f.v.handle('GET','/api/desk/v22/tickets/'+t.id,other,new URLSearchParams()),status(404));
 }finally{f.close();}
});

test('plugin field import previews effects, preserves old snapshots and publishes typed internal fields',async()=>{
 const f=fixture();try{
  const p=f.project('PFIELD'),oldTicket=f.ticket(p),id='neutral.fields',manifest={id,name:'Neutral fields',version:'1.0.0',capabilities:['form.field','dashboard.widget'],permissions:['ui.extension'],hooks:[{id:'fields',kind:'form.field',label:'Fields',fields:[{key:'quantity',label:'Quantity',type:'number',required:false}]},{id:'widget',kind:'dashboard.widget',label:'Widget',fields:[{key:'state',type:'text'}]}]};
  f.ext.plugins.install(manifest,f.admin);f.ext.plugins.setEnabled(id,true,f.admin);f.v.runtime.configure(id,{version:0,url:'https://neutral.example.test/execute',project_ids:[p.id],permissions:manifest.permissions},f.admin);
  const form=f.catalog.list(p.id,f.admin,'manage').find(f=>f.base_type==='incident'),body={form_id:form.id,version:form.version,plugin_id:id,hook_id:'fields'},path='/api/desk/v22/form-extension/'+p.id;
  const preview=(await f.v.handle('POST',path,f.admin,new URLSearchParams(),async()=>body)).value;
  assert.equal(preview.preview,true);assert.equal(f.catalog.list(p.id,f.admin,'manage').find(f=>f.id===form.id).version,form.version);assert.equal(preview.added[0].visibility,'internal');
  await assert.rejects(()=>f.v.handle('POST',path,f.admin,new URLSearchParams(),async()=>({...body,confirm:true,preview_fingerprint:'stale'})),status(409));
  await f.v.handle('POST',path,f.admin,new URLSearchParams(),async()=>({...body,confirm:true,preview_fingerprint:preview.fingerprint}));
  assert.ok(!JSON.parse(f.desk.ticket(oldTicket.id).form_snapshot).fields.some(f=>f.key===preview.added[0].key));
  const newTicket=f.ticket(p);assert.ok(JSON.parse(newTicket.form_snapshot).fields.some(f=>f.key===preview.added[0].key&&f.type==='number'));
  const agent=f.user('widget-agent@x.test','agent');f.projects.setMember(p.id,agent.id,'agent',f.admin);
  f.db.prepare("INSERT INTO platform_jobs(kind,ticket_id,user_id,plugin_id,request_key,payload,run_at,state,result,created_at) VALUES('plugin',?,?,?,'widget-result','{}',?,'sent',?,?)").run(oldTicket.id,f.admin.id,id,new Date().toISOString(),JSON.stringify({data:{state:'Private result'}}),new Date().toISOString());
  assert.equal(f.v.runtime.uiContract(p.id,f.admin)[0].hooks.find(h=>h.kind==='dashboard.widget').values.state,'Private result');
  assert.equal(f.v.runtime.uiContract(p.id,agent)[0].hooks.find(h=>h.kind==='dashboard.widget').values.state,null);
 }finally{f.close();}
});

test('automation queues plugin work after cascade completion and revocation rolls back local actions',async()=>{
 const f=fixture();try{
  const p=f.project('AUTO'),t=f.ticket(p),id='neutral.automation',permissions=['scheduled.job','ticket.read','automation.action'];
  f.ext.plugins.install({id,name:'Neutral automation',version:'1.0.0',capabilities:['scheduled.job','automation.action'],permissions},f.admin);f.ext.plugins.setEnabled(id,true,f.admin);f.v.runtime.configure(id,{version:0,url:'https://neutral.example.test/execute',project_ids:[p.id],permissions},f.admin);
  const w=f.workflows.get(p.id);f.workflows.save(p.id,{...w,rules:[{name:'Prioritize and schedule',event:'ticket_created',from:'*',conditions:[],actions:[{type:'priority',value:'P1'},{type:'plugin',value:{plugin_id:id,action:'noop'}}]},{name:'Move after priority',event:'priority_changed',from:'*',conditions:[],actions:[{type:'status',value:'in_progress'}]}],version:w.version},f.admin);
  f.workflows.automation.emit(t.id,'ticket_created',f.admin);
  const job=f.db.prepare('SELECT * FROM platform_jobs WHERE plugin_id=?').get(id),payload=JSON.parse(job.payload),after=f.desk.ticket(t.id);assert.equal(after.priority,'P1');assert.equal(after.status,'in_progress');assert.equal(payload.ticket_version,after.version);assert.ok(payload.automation_run_id);assert.equal(payload.business_actor_id,f.admin.id);
  const deliveries=[],r=createPluginRuntime(f.db,{projects:f.projects,desk:f.desk,registry:f.ext.plugins,dataDir:f.dataDir,send:async(...args)=>deliveries.push(args)});await r.flush();assert.equal(JSON.parse(deliveries[0][1]).automation_run_id,payload.automation_run_id);assert.ok(JSON.parse(deliveries[0][1]).instance_id);
  f.ext.plugins.setEnabled(id,false,f.admin);const second=f.ticket(p);f.workflows.automation.emit(second.id,'ticket_created',f.admin);assert.equal(f.desk.ticket(second.id).priority,'P3');assert.equal(f.desk.ticket(second.id).status,'open');assert.equal(f.db.prepare('SELECT COUNT(*) n FROM platform_jobs').get().n,1);assert.equal(f.db.prepare('SELECT status FROM automation_runs WHERE ticket_id=? ORDER BY id DESC LIMIT 1').get(second.id).status,'failed');
 }finally{f.close();}
});

test('signed plugin trigger is scoped and durable retries cannot repeat local automation',async()=>{
 const f=fixture();try{
  const p=f.project('TRIGGER'),t=f.ticket(p),id='neutral.trigger',permissions=['automation.trigger'];f.ext.plugins.install({id,name:'Neutral trigger',version:'1.0.0',capabilities:['automation.trigger'],permissions},f.admin);f.ext.plugins.setEnabled(id,true,f.admin);
  const configured=f.v.runtime.configure(id,{version:0,url:'https://neutral.example.test/execute',project_ids:[p.id],permissions},f.admin),w=f.workflows.get(p.id);
  f.workflows.save(p.id,{...w,version:w.version,rules:[{name:'Respond to plugin',event:'plugin_event',from:'*',conditions:[{field:'plugin_id',op:'eq',value:id},{field:'plugin_event',op:'eq',value:'ready'}],actions:[{type:'priority',value:'P1'}]}]},f.admin);
  const api=createPluginAPI(f.db,{runtime:f.v.runtime,projects:f.projects,catalog:f.catalog,processes:f.v.processes,workspace:f.v21.workspace,workflows:f.workflows}),body={event:'ready',version:t.version},call=b=>api.handle({method:'POST',path:'/api/plugins/'+id+'/tickets/'+t.id+'/trigger',token:'Bearer '+configured.generated_secret,idempotencyKey:'trigger-receipt-0001',read:async()=>b});
  assert.equal((await call(body)).value.event_accepted,true);assert.equal(f.desk.ticket(t.id).priority,'P1');const version=f.desk.ticket(t.id).version;
  assert.equal((await call(body)).value.duplicate,true);assert.equal(f.desk.ticket(t.id).version,version);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM automation_runs WHERE ticket_id=?').get(t.id).n,1);
  await assert.rejects(()=>call({...body,event:'different'}),status(409));f.ext.plugins.setEnabled(id,false,f.admin);await assert.rejects(()=>call(body),status(401));
 }finally{f.close();}
});

test('request-bound delayed jobs survive status changes but material edits and archiving require review',async()=>{
 const f=fixture();try{
  const p=f.project('DELAY'),t=f.ticket(p),id='neutral.delay',permissions=['ticket.read','scheduled.job'];f.ext.plugins.install({id,name:'Neutral delay',version:'1.0.0',capabilities:['scheduled.job'],permissions},f.admin);f.ext.plugins.setEnabled(id,true,f.admin);
  const sent=[],r=createPluginRuntime(f.db,{projects:f.projects,desk:f.desk,registry:f.ext.plugins,dataDir:f.dataDir,send:async(...args)=>sent.push(args)});r.configure(id,{version:0,url:'https://neutral.example.test/execute',project_ids:[p.id],permissions},f.admin);
  const material=r.enqueue(id,{ticket_id:t.id,action:'noop',version_policy:'request',request_key:'delay-request-001'},f.admin),strict=r.enqueue(id,{ticket_id:t.id,action:'noop',request_key:'delay-ticket-001'},f.admin);
  f.state(t.id,'resolved',f.admin,{resolution:'Fixed'});f.state(t.id,'closed');await r.flush();assert.equal(sent.length,1);assert.equal(f.db.prepare('SELECT state FROM platform_jobs WHERE id=?').get(material.id).state,'sent');assert.equal(f.db.prepare('SELECT state FROM platform_jobs WHERE id=?').get(strict.id).state,'paused');
  const changed=r.enqueue(id,{ticket_id:t.id,action:'noop',version_policy:'request',request_key:'delay-edited-001'},f.admin);f.db.prepare('UPDATE tickets SET title=?,version=version+1 WHERE id=?').run('Changed request',t.id);await r.flush();assert.equal(sent.length,1);assert.equal(f.db.prepare('SELECT state FROM platform_jobs WHERE id=?').get(changed.id).state,'paused');
  const archive=r.enqueue(id,{ticket_id:t.id,action:'noop',version_policy:'request',request_key:'delay-archive-001',run_at:new Date(Date.now()+86400000).toISOString()},f.admin);f.ext.lifecycle.archive(t.id,{version:f.desk.ticket(t.id).version,archived:true},f.admin);assert.equal(f.db.prepare('SELECT state FROM platform_jobs WHERE id=?').get(archive.id).state,'paused');
  f.ext.lifecycle.archive(t.id,{version:f.desk.ticket(t.id).version,archived:false},f.admin);assert.equal(f.db.prepare('SELECT state FROM platform_jobs WHERE id=?').get(archive.id).state,'paused');
 }finally{f.close();}
});

test('external plugin migrations require disabled plugin, scoped grant, acknowledged version and current actor',async()=>{
 const f=fixture();try{
  const p=f.project('PMI'),id='neutral.migration',manifest={id,name:'Neutral migration',version:'1.0.0',dataVersion:1,capabilities:['migration'],permissions:['migration']},sent=[];
  f.ext.plugins.install(manifest,f.admin);const runtime=createPluginRuntime(f.db,{...f,registry:f.ext.plugins,send:async(...args)=>{sent.push(args);}});
  const secret=runtime.configure(id,{version:0,url:'https://neutral.example.test/migrate',project_ids:[p.id],permissions:['migration']},f.admin).generated_secret;
  assert.throws(()=>f.ext.plugins.setEnabled(id,true,f.admin),status(409));
  const job=runtime.migrations.enqueue(id,{revision:1,confirm_version:1,request_key:'migration-001'},f.admin);
  assert.equal(runtime.migrations.enqueue(id,{revision:1,confirm_version:1,request_key:'migration-001'},f.admin).duplicate,true);
  assert.throws(()=>runtime.migrations.enqueue(id,{revision:1,confirm_version:1,request_key:'migration-other'},f.admin),status(409));
  assert.throws(()=>runtime.migrations.result(id,job.id,secret,{status:'completed',data_version:1}),status(409));
  await runtime.flush();assert.equal(sent.length,1);const body=JSON.parse(sent[0][1]);assert.equal(body.action,'platform.migrate');assert.equal(body.from_data_version,0);assert.equal(body.to_data_version,1);assert.equal(body.ticket,undefined);
  assert.throws(()=>runtime.migrations.result(id,job.id,'wrong',{status:'completed',data_version:1}),status(401));
  assert.throws(()=>runtime.migrations.result(id,job.id,secret,{status:'completed',data_version:2}),status(409));
  runtime.migrations.result(id,job.id,secret,{status:'completed',data_version:1});assert.equal(runtime.migrations.result(id,job.id,secret,{status:'completed',data_version:1}).duplicate,true);
  f.ext.plugins.setEnabled(id,true,f.admin);assert.equal(f.ext.plugins.list(f.admin)[0].data_version,1);
  assert.throws(()=>f.ext.plugins.install({...manifest,version:'0.9.0'},f.admin),status(409));
  f.ext.plugins.install({...manifest,version:'2.0.0',dataVersion:2},f.admin);assert.throws(()=>f.ext.plugins.setEnabled(id,true,f.admin),status(409));
  const next=runtime.migrations.enqueue(id,{revision:3,confirm_version:2,request_key:'migration-002'},f.admin);await runtime.flush();
  runtime.configure(id,{version:1,url:'https://neutral.example.test/migrate',project_ids:[p.id],permissions:[]},f.admin);
  assert.throws(()=>runtime.migrations.result(id,next.id,secret,{status:'completed',data_version:2}),status(409));assert.equal(f.ext.plugins.list(f.admin)[0].data_version,1);
  runtime.migrations.cancel(next.id,{version:2},f.admin);assert.equal(runtime.migrations.list(id,f.admin)[0].state,'cancelled');
 }finally{f.close();}
});


test('cancelling an in-flight external migration cannot be undone by a late HTTP acknowledgement',async()=>{
 const f=fixture();try{
  const p=f.project('PMC'),id='neutral.cancel',manifest={id,name:'Neutral cancellation',version:'1.0.0',dataVersion:1,capabilities:['migration'],permissions:['migration']};
  f.ext.plugins.install(manifest,f.admin);let release,started;const reached=new Promise(r=>started=r),pending=new Promise(r=>release=r),runtime=createPluginRuntime(f.db,{...f,registry:f.ext.plugins,send:async()=>{started();await pending;}});
  const secret=runtime.configure(id,{version:0,url:'https://neutral.example.test/migrate',project_ids:[p.id],permissions:['migration']},f.admin).generated_secret;
  const job=runtime.migrations.enqueue(id,{revision:1,confirm_version:1,request_key:'migration-cancel-inflight'},f.admin),flush=runtime.flush();await reached;runtime.migrations.cancel(job.id,{version:1},f.admin);release();await flush;
  assert.equal(runtime.migrations.list(id,f.admin)[0].state,'cancelled');assert.throws(()=>runtime.migrations.result(id,job.id,secret,{status:'completed',data_version:1}),status(409));assert.equal(f.ext.plugins.list(f.admin)[0].data_version,0);
 }finally{f.close();}
});

test('versioned processes freeze core/plugin conditions; reviewed migration rechecks preview and invalidates jobs',async()=>{
 const f=fixture();try{
  const p=f.project('PSN'),agent=f.user('snapshot-agent@x.test','agent');f.projects.setMember(p.id,agent.id,'agent',f.admin);
  const pluginId='neutral.snapshot';f.ext.plugins.install({id:pluginId,name:'Snapshot condition',version:'1.0.0',capabilities:['workflow.condition','scheduled.job'],permissions:['workflow.condition','scheduled.job','ticket.read']},f.admin);f.ext.plugins.setEnabled(pluginId,true,f.admin);f.v.runtime.configure(pluginId,{version:0,url:'https://neutral.example.test/execute',project_ids:[p.id],permissions:['workflow.condition','scheduled.job','ticket.read']},f.admin);
  const save=(conditions,plugin_conditions={})=>f.v.governance.settings(p.id,{version:f.projects.project(p.id).version,versioned_process:true,transition_conditions:conditions,plugin_conditions},f.admin);
  save({resolved:{fields:[],manager:true}},{waiting:[{plugin_id:pluginId,action:'check'}]});const t=f.ticket(p);
  save({});assert.throws(()=>f.workflows.transition(t,{workflow_status:'waiting',workflow_version:f.workflows.forTicket(t).version},true,f.admin),status(409));assert.throws(()=>f.workflows.transition(t,{workflow_status:'resolved',workflow_version:f.workflows.forTicket(t).version},true,agent),status(403));
  const fresh=f.ticket(p);assert.equal(f.workflows.transition(fresh,{workflow_status:'resolved',workflow_version:f.workflows.forTicket(fresh).version},true,agent).key,'resolved');
  // Turning off versioning applies to new work, not already snapshotted work.
  f.v.governance.settings(p.id,{version:f.projects.project(p.id).version,versioned_process:false,transition_conditions:{},plugin_conditions:{}},f.admin);
  assert.throws(()=>f.workflows.transition(t,{workflow_status:'resolved',workflow_version:f.workflows.forTicket(t).version},true,agent),status(403));
  f.v.runtime.reminders({ticket_id:t.id,body:'Review',run_at:new Date(Date.now()+60000).toISOString(),request_key:'snapshot-reminder'},f.admin);
  const path='/api/desk/v22/tickets/'+t.id+'/migrate-process',request=b=>f.v.handle('POST',path,f.admin,new URLSearchParams(),async()=>b);
  const preview=(await request({version:t.version})).value;assert.equal(preview.jobs_to_pause,1);assert.equal(preview.old_conditions.resolved.manager,true);assert.deepEqual(preview.new_conditions,{});
  save({in_progress:{fields:[],manager:true}});await assert.rejects(()=>request({version:t.version,confirm:true,preview_fingerprint:preview.preview_fingerprint}),status(409));
  const current=(await request({version:t.version})).value;await request({version:t.version,confirm:true,preview_fingerprint:current.preview_fingerprint});
  assert.equal(f.desk.ticket(t.id).version,t.version+1);assert.equal(f.db.prepare('SELECT state FROM platform_jobs WHERE ticket_id=?').get(t.id).state,'paused');
  assert.equal(f.workflows.transition(f.desk.ticket(t.id),{workflow_status:'resolved',workflow_version:f.workflows.forTicket(f.desk.ticket(t.id)).version},true,agent).key,'resolved');
 }finally{f.close();}
});

test('project templates preserve form-specific SLA and protected team fields through explicit mapping',()=>{
 const f=fixture();try{
  const p=f.project('BPM'),agent=f.user('blueprint-private@x.test','agent');f.projects.setMember(p.id,agent.id,'agent',f.admin);
  const teamId=f.v.processes.saveTeam(null,{project_id:p.id,name:'Review team',members:[agent.id]},f.admin)[0].id;
  const form=f.catalog.save(p.id,null,{name:'Protected request',enabled:true,fields:[{key:'private',label:'Protected',type:'text',visibility:'internal',allowed_team_ids:[teamId]}],default_priority:'P1',base_fields:{title:{hidden:true,value:'Template request'},description:{hidden:false,value:''}}},f.admin);
  const settings=JSON.parse(f.projects.project(p.id).settings);settings.sla={timezone:'UTC',rules:[{id:'form_sla',name:'Form deadline',kind:'status',goals:{P1:10,P2:20,P3:30,P4:40},start:['open'],pause:['waiting'],stop:['resolved','closed'],request_type_ids:[form.id]}]};f.db.prepare('UPDATE projects SET settings=? WHERE id=?').run(JSON.stringify(settings),p.id);
  const exported=f.v.blueprints.fromProject(p.id,{name:'Mapped template'},f.admin).config,project=exported.projects[0],definition=project.forms.find(x=>x.name==='Protected request');
  assert.deepEqual(project.sla.rules[0].request_type_aliases,[definition.alias]);assert.equal(project.sla.rules[0].request_type_ids,undefined);assert.deepEqual(definition.fields[0].allowed_team_aliases,[project.teams[0].alias]);assert.equal(definition.fields[0].allowed_team_ids,undefined);assert.ok(!JSON.stringify(exported).includes(agent.email));
  const draft=f.v.blueprints.draft(null,{name:'Mapped draft',config:exported},f.admin),mapping={project:{key:'BPN',name:'Mapped new project',teams:{[project.teams[0].alias]:[agent.id]}}};
  assert.equal(f.v.blueprints.validate(draft.id,{version:1,mapping:{project:{key:'BPN',name:'Missing team'}}},f.admin).valid,false);
  const created=f.v.blueprints.activate(draft.id,{version:1,mapping},f.admin).projects.project,newForm=f.catalog.list(created,f.admin,'manage').find(x=>x.name===definition.name),newTeam=f.v.processes.teams(f.admin,created)[0];
  assert.notEqual(newTeam.id,teamId);assert.deepEqual(newForm.fields[0].allowed_team_ids,[newTeam.id]);assert.equal(newForm.default_priority,'P1');assert.equal(newForm.base_fields.title.value,'Template request');assert.deepEqual(JSON.parse(f.projects.project(created).settings).sla.rules[0].request_type_ids,[newForm.id]);assert.equal(f.projects.canWork(agent,f.projects.project(created)),true);const published=f.catalog.list(created,f.admin,'manage').find(f=>f.enabled&&f.portal_visible);assert.ok(f.db.prepare('SELECT 1 FROM service_catalog_category_types WHERE request_type_id=?').get(published.id));assert.equal(f.db.prepare('SELECT 1 FROM service_catalog_category_types WHERE request_type_id=?').get(newForm.id),undefined);assert.equal(JSON.parse(f.db.prepare('SELECT config FROM project_service_settings WHERE project_id=?').get(created).config).versioned_process,true);
 }finally{f.close();}
});

test('required plugin dependencies block project activation before any project is created',()=>{
 const f=fixture();try{
  const config={projects:[{alias:'test',project_type:'internal',forms:[{name:'Request'}],plugins:[{id:'neutral.required',minimum:'1.0.0',required:true}]}]},draft=f.v.blueprints.draft(null,{name:'Dependency draft',config},f.admin),b={version:1,mapping:{test:{key:'BPD',name:'Dependencies'}}};
  assert.equal(f.v.blueprints.validate(draft.id,b,f.admin).valid,false);assert.throws(()=>f.v.blueprints.activate(draft.id,b,f.admin),status(400));assert.equal(f.db.prepare('SELECT COUNT(*) n FROM projects').get().n,0);
  f.ext.plugins.install({id:'neutral.required',name:'Required fixture',version:'1.0.0-beta.1'},f.admin);f.ext.plugins.setEnabled('neutral.required',true,f.admin);assert.equal(f.v.blueprints.validate(draft.id,b,f.admin).valid,false);
  f.ext.plugins.install({id:'neutral.required',name:'Required fixture',version:'1.0.0'},f.admin);f.ext.plugins.setEnabled('neutral.required',true,f.admin);assert.equal(f.v.blueprints.validate(draft.id,b,f.admin).valid,true);
 }finally{f.close();}
});

test('template export preserves automation via logical roles, forms and integration mappings without effects during preview',()=>{
 const f=fixture();try{
  const p=f.project('AMO'),source=f.user('source-owner@x.test','agent'),target=f.user('target-owner@x.test','agent');f.projects.setMember(p.id,source.id,'manager',f.admin);
  const form=f.catalog.save(p.id,null,{name:'Mapped automation request',fields:[],enabled:true},f.admin);
  const mailId=Number(f.db.prepare("INSERT INTO mail_templates(name,project_id,event,subject,body,audience,enabled) VALUES('Selected mail',?,'manual','[{{key}}] Update','{{update}}','team',1)").run(p.id).lastInsertRowid);
  const hook=f.ext.webhooks.save(null,{project_id:p.id,name:'Selected outbound',direction:'outbound',enabled:true,config:{url:'https://neutral.example.test/hook',events:[]}},f.admin);
  const workflow=f.workflows.get(p.id);f.workflows.save(p.id,{...workflow,rules:[{name:'Mapped automation',event:'fields_changed',from:'*',enabled:true,conditions:[{field:'request_type_id',op:'eq',value:form.id}],actions:[{type:'assign',value:source.id},{type:'comment',body:'Mapped note',bot_id:source.id,internal:true},{type:'email',value:mailId},{type:'webhook',value:hook.id}]}],version:workflow.version},source);
  const exported=f.v.blueprints.fromProject(p.id,{name:'Automation template'},f.admin).config,cfg=exported.projects[0];assert.equal(cfg.workflow.rules.length,1);assert.ok(cfg.roles.length>0);assert.ok(!JSON.stringify(exported).includes(source.email));assert.equal(cfg.workflow.rules[0].actor_id,undefined);assert.equal(cfg.workflow.rules[0].actions[0].value.role,cfg.roles[0].alias);assert.equal(cfg.workflow.rules[0].conditions[0].value.form,cfg.forms.find(x=>x.name===form.name).alias);
  const draft=f.v.blueprints.draft(null,{name:'Automation activation',config:exported},f.admin),mapping={project:{key:'AMN',name:'Mapped destination',roles:Object.fromEntries(cfg.roles.map(r=>[r.alias,target.id])),integrations:Object.fromEntries(cfg.integrations.map(d=>[d.alias,d.kind==='email'?mailId:hook.id]))}},b={version:1,mapping};
  const before={projects:f.db.prepare('SELECT COUNT(*) n FROM projects').get().n,keys:f.db.prepare('SELECT COUNT(*) n FROM project_keys').get().n,mail:f.db.prepare('SELECT COUNT(*) n FROM mail_templates').get().n,hooks:f.db.prepare('SELECT COUNT(*) n FROM webhook_endpoints').get().n};
  const preview=f.v.blueprints.validate(draft.id,b,f.admin);assert.equal(preview.valid,true,preview.errors.join(';'));assert.deepEqual({projects:f.db.prepare('SELECT COUNT(*) n FROM projects').get().n,keys:f.db.prepare('SELECT COUNT(*) n FROM project_keys').get().n,mail:f.db.prepare('SELECT COUNT(*) n FROM mail_templates').get().n,hooks:f.db.prepare('SELECT COUNT(*) n FROM webhook_endpoints').get().n},before);
  assert.throws(()=>f.v.blueprints.activate(draft.id,b,f.admin),status(409));f.db.prepare('UPDATE mail_templates SET version=version+1 WHERE id=?').run(mailId);assert.throws(()=>f.v.blueprints.activate(draft.id,{...b,preview_fingerprint:preview.preview_fingerprint},f.admin),status(409));
  const current=f.v.blueprints.validate(draft.id,b,f.admin),id=f.v.blueprints.activate(draft.id,{...b,preview_fingerprint:current.preview_fingerprint},f.admin).projects.project,rule=f.workflows.get(id).rules[0],newForm=f.catalog.list(id,f.admin,'manage').find(x=>x.name===form.name);
  assert.equal(rule.actor_id,target.id);assert.equal(rule.actions[0].value,target.id);assert.equal(rule.actions[1].bot_id,target.id);assert.equal(rule.conditions[0].value,newForm.id);assert.notEqual(rule.actions[2].value,mailId);assert.notEqual(rule.actions[3].value,hook.id);assert.equal(f.db.prepare('SELECT project_id FROM mail_templates WHERE id=?').get(rule.actions[2].value).project_id,id);assert.equal(f.db.prepare('SELECT secret FROM webhook_endpoints WHERE id=?').get(rule.actions[3].value).secret,f.db.prepare('SELECT secret FROM webhook_endpoints WHERE id=?').get(hook.id).secret);
  const prepared=f.catalog.prepare(f.projects.project(id),{request_type_id:newForm.id,request_type_version:newForm.version,title:'Mapped execution',description:'Synthetic automation'},false),stamp=new Date(f.clock()).toISOString();
  const tid=Number(f.db.prepare("INSERT INTO tickets(project_id,key,number,title,description,type,priority,status,workflow_status,reporter_id,created_by,created_at,updated_at,request_type_id,form_snapshot,custom_values) VALUES(?, 'AMN-1',1,'Mapped execution','Synthetic automation','request','P3','open','open',?,?,?,?,?,?,?)").run(id,f.admin.id,f.admin.id,stamp,stamp,newForm.id,prepared.snapshot,prepared.values).lastInsertRowid);
  f.workflows.automation.emit(tid,'fields_changed',f.admin);assert.equal(f.desk.ticket(tid).assignee_id,target.id);assert.equal(f.db.prepare('SELECT author_id FROM comments WHERE ticket_id=?').get(tid).author_id,target.id);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM mail_outbox WHERE ticket_id=?').get(tid).n,1);assert.equal(f.db.prepare('SELECT endpoint_id FROM webhook_jobs WHERE json_extract(payload,\'$.ticket.key\')=?').get('AMN-1')?.endpoint_id,rule.actions[3].value);
  f.db.prepare('UPDATE users SET active=0 WHERE id=?').run(target.id);const another=f.v.blueprints.draft(null,{name:'Revoked actor',config:exported},f.admin);assert.equal(f.v.blueprints.validate(another.id,{version:1,mapping:{project:{...mapping.project,key:'AMX'}}},f.admin).valid,false);
 }finally{f.close();}
});

test('template plugin scope changes require explicit consent, preserve old scope and pause jobs only on activation',()=>{
 const f=fixture();try{
  const p=f.project('BPS'),t=f.ticket(p),id='neutral.blueprint',permissions=['ticket.read','scheduled.job','automation.action'];f.ext.plugins.install({id,name:'Blueprint fixture',version:'1.0.0',capabilities:['scheduled.job','automation.action'],permissions},f.admin);f.ext.plugins.setEnabled(id,true,f.admin);f.v.runtime.configure(id,{version:0,url:'https://neutral.example.test/execute',project_ids:[p.id],permissions},f.admin);const job=f.v.runtime.enqueue(id,{ticket_id:t.id,action:'review',request_key:'blueprint-existing-job'},f.admin);
  const w=f.workflows.get(p.id),config={projects:[{alias:'next',project_type:'internal',forms:[{name:'Request'}],workflow:{...w,rules:[{name:'Plugin action',event:'ticket_created',from:'*',conditions:[],actions:[{type:'plugin',value:{plugin_id:id,action:'review'}}]}]}}]},draft=f.v.blueprints.draft(null,{name:'Plugin scope',config},f.admin),mapping={next:{key:'BPT',name:'New scope'}},b={version:1,mapping};
  assert.equal(f.v.blueprints.validate(draft.id,b,f.admin).valid,false);mapping.next.plugin_scopes={[id]:true};const preview=f.v.blueprints.validate(draft.id,b,f.admin);assert.equal(preview.valid,true,preview.errors.join(';'));assert.equal(f.db.prepare('SELECT version FROM plugin_connectors WHERE plugin_id=?').get(id).version,1);assert.equal(f.db.prepare('SELECT state FROM platform_jobs WHERE id=?').get(job.id).state,'queued');
  const created=f.v.blueprints.activate(draft.id,{...b,preview_fingerprint:preview.preview_fingerprint},f.admin).projects.next;assert.deepEqual(JSON.parse(f.db.prepare('SELECT config FROM plugin_connectors WHERE plugin_id=?').get(id).config).project_ids,[p.id,created]);assert.equal(f.db.prepare('SELECT state FROM platform_jobs WHERE id=?').get(job.id).state,'paused');
 }finally{f.close();}
});

test('project templates retain validated transition conditions, portal order and attachment limits without opaque settings',()=>{
 const f=fixture();try{
  const p=f.project('BPC'),form=f.catalog.save(p.id,null,{name:'Justified request',fields:[{key:'justification',label:'Justification',type:'text'}],enabled:true},f.admin);
  f.v.governance.settings(p.id,{version:f.projects.project(p.id).version,versioned_process:true,transition_conditions:{resolved:{manager:true,fields:['justification'],checklist:true}},customer_layout:['next','description','attachments','conversation'],attachments:{max_bytes:2048,extensions:['pdf'],max_storage_bytes:65536}},f.admin);
  const settings=JSON.parse(f.projects.project(p.id).settings);settings.opaque_secret='Do not export';f.db.prepare('UPDATE projects SET settings=? WHERE id=?').run(JSON.stringify(settings),p.id);
  const cfg=f.v.blueprints.fromProject(p.id,{name:'Configured process'},f.admin).config;assert.ok(!JSON.stringify(cfg).includes('Do not export'));const source=cfg.projects[0];assert.deepEqual(source.process_settings.transition_conditions.resolved,{manager:true,fields:['justification'],checklist:true});
  const draft=f.v.blueprints.draft(null,{name:'Configured draft',config:cfg},f.admin),b={version:1,mapping:{project:{key:'BPD',name:'Configured destination'}}},preview=f.v.blueprints.validate(draft.id,b,f.admin);assert.equal(preview.valid,true,preview.errors.join(';'));const id=f.v.blueprints.activate(draft.id,{...b,preview_fingerprint:preview.preview_fingerprint},f.admin).projects.project,newSettings=JSON.parse(f.projects.project(id).settings);
  assert.deepEqual(newSettings.transition_conditions,settings.transition_conditions);assert.deepEqual(newSettings.customer_layout,settings.customer_layout);assert.deepEqual(newSettings.attachments,settings.attachments);
  const invalid=f.v.blueprints.draft(null,{name:'Unknown field',config:{projects:[{...source,process_settings:{...source.process_settings,transition_conditions:{resolved:{fields:['missing']}}}}]}},f.admin);assert.equal(f.v.blueprints.validate(invalid.id,{version:1,mapping:{project:{key:'BPE',name:'Invalid condition'}}},f.admin).valid,false);assert.equal(f.db.prepare('SELECT 1 FROM project_keys WHERE key=?').get('BPE'),undefined);
 }finally{f.close();}
});

test('template responsibility maps approvers and organization explicitly; person preview is read only and stale previews fail',()=>{
 const f=fixture();try{
  const p=f.project('RPM'),source=f.user('source-approver@x.test','agent'),target=f.user('mapped-approver@x.test','agent'),subject=f.user('subject-preview@x.test');f.projects.setMember(p.id,source.id,'manager',f.admin);
  const team=f.v.processes.saveTeam(null,{project_id:p.id,name:'HR review',members:[source.id]},f.admin)[0],org=Number(f.db.prepare("INSERT INTO organizations(name) VALUES('Preview organization')").run().lastInsertRowid);f.db.prepare('INSERT INTO organization_members VALUES(?,?)').run(org,subject.id);
  f.v.processes.personAttributes(subject.id,{version:0,department:'Engineering',location:'Berlin'},f.admin);f.v.processes.saveRule(null,{project_id:p.id,name:'Engineering review',department:'Engineering',location:'Berlin',organization_id:org,team_id:team.id,approvers:[source.id]},f.admin);
  const cfg=f.v.blueprints.fromProject(p.id,{name:'Responsibility package'},f.admin).config,project=cfg.projects[0];assert.equal(project.responsibility_rules.length,1);assert.ok(!JSON.stringify(cfg).includes(source.email));assert.equal(project.responsibility_rules[0].approvers,undefined);
  const draft=f.v.blueprints.draft(null,{name:'Responsibility draft',config:cfg},f.admin),mapping={project:{key:'RPN',name:'Destination responsibility',teams:Object.fromEntries(project.teams.map(t=>[t.alias,[target.id]])),roles:Object.fromEntries(project.roles.map(r=>[r.alias,target.id])),integrations:Object.fromEntries(project.integrations.map(d=>[d.alias,org]))}},b={version:1,mapping,sample_person_id:subject.id},before=f.db.prepare('SELECT COUNT(*) n FROM projects').get().n;
  const preview=f.v.blueprints.validate(draft.id,b,f.admin);assert.equal(preview.valid,true,preview.errors.join(';'));assert.equal(preview.responsibility_preview[0].matched,true);assert.deepEqual(preview.responsibility_preview[0].approver_ids,[target.id]);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM projects').get().n,before);
  f.v.processes.personAttributes(subject.id,{version:1,department:'Engineering',location:'Hamburg'},f.admin);assert.throws(()=>f.v.blueprints.activate(draft.id,{...b,preview_fingerprint:preview.preview_fingerprint},f.admin),status(409));const current=f.v.blueprints.validate(draft.id,b,f.admin);assert.equal(current.responsibility_preview[0].matched,false);
  const id=f.v.blueprints.activate(draft.id,{...b,preview_fingerprint:current.preview_fingerprint},f.admin).projects.project,newRule=f.v.processes.rules(id,f.admin)[0],newTeam=f.v.processes.teams(f.admin,id)[0];assert.deepEqual(newRule.approvers,[target.id]);assert.equal(newRule.team_id,newTeam.id);assert.equal(newRule.organization_id,org);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM tickets WHERE project_id=?').get(id).n,0);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM platform_jobs WHERE ticket_id IN (SELECT id FROM tickets WHERE project_id=?)').get(id).n,0);
 }finally{f.close();}
});

test('plugin workflow conditions in project packages require consent and retain current connector grants',()=>{
 const f=fixture();try{
  const p=f.project('PCT'),id='neutral.package.condition',permissions=['workflow.condition','ticket.read','scheduled.job'];f.ext.plugins.install({id,name:'Condition package',version:'1.0.0',capabilities:['workflow.condition','scheduled.job'],permissions},f.admin);f.ext.plugins.setEnabled(id,true,f.admin);f.v.runtime.configure(id,{version:0,url:'https://neutral.example.test/execute',project_ids:[p.id],permissions},f.admin);
  f.v.governance.settings(p.id,{version:f.projects.project(p.id).version,transition_conditions:{},plugin_conditions:{waiting:[{plugin_id:id,action:'check'}]}},f.admin);const cfg=f.v.blueprints.fromProject(p.id,{name:'Condition template'},f.admin).config,draft=f.v.blueprints.draft(null,{name:'Condition draft',config:cfg},f.admin),mapping={project:{key:'PCN',name:'Condition destination'}},b={version:1,mapping};assert.equal(f.v.blueprints.validate(draft.id,b,f.admin).valid,false);mapping.project.plugin_scopes={[id]:true};const preview=f.v.blueprints.validate(draft.id,b,f.admin);assert.equal(preview.valid,true,preview.errors.join(';'));
  const created=f.v.blueprints.activate(draft.id,{...b,preview_fingerprint:preview.preview_fingerprint},f.admin).projects.project;assert.deepEqual(JSON.parse(f.projects.project(created).settings).plugin_conditions.waiting,[{plugin_id:id,action:'check'}]);const connector=JSON.parse(f.db.prepare('SELECT config FROM plugin_connectors WHERE plugin_id=?').get(id).config);assert.deepEqual(connector.permissions,permissions);assert.ok(connector.project_ids.includes(created));
 }finally{f.close();}
});

test('plugin project templates require an explicit grant and remain dependent on their publisher',()=>{
 const f=fixture();try{
  const p=f.project('PUB'),id='neutral.templates',manifest={id,name:'Template publisher',version:'1.0.0',capabilities:['project.template'],permissions:['template.publish'],templates:[{id:'neutral',name:'Neutral package',config:{projects:[{alias:'neutral',project_type:'internal',forms:[{name:'Neutral request'}]}]}}]};
  f.ext.plugins.install(manifest,f.admin);f.v.runtime.configure(id,{version:0,url:'https://neutral.example.test/execute',project_ids:[p.id],permissions:[]},f.admin);f.ext.plugins.setEnabled(id,true,f.admin);assert.deepEqual(f.v.blueprints.list(f.admin).plugin_templates,[]);
  f.v.runtime.configure(id,{version:1,url:'https://neutral.example.test/execute',project_ids:[p.id],permissions:['template.publish']},f.admin);const published=f.v.blueprints.list(f.admin).plugin_templates;assert.equal(published.length,1);assert.equal(published[0].id,id+':neutral');assert.deepEqual(published[0].config.projects[0].plugins,[{id,minimum:'1.0.0',required:true}]);
  const draft=f.v.blueprints.draft(null,{name:'Published draft',config:published[0].config},f.admin),b={version:1,mapping:{neutral:{key:'PUBN',name:'Published destination'}}};assert.equal(f.v.blueprints.validate(draft.id,b,f.admin).valid,true);f.ext.plugins.setEnabled(id,false,f.admin);assert.deepEqual(f.v.blueprints.list(f.admin).plugin_templates,[]);assert.equal(f.v.blueprints.validate(draft.id,b,f.admin).valid,false);assert.throws(()=>f.v.blueprints.activate(draft.id,b,f.admin),status(400));
  assert.throws(()=>f.ext.plugins.install({...manifest,id:'bad.templates',capabilities:[]},f.admin),status(400));
 }finally{f.close();}
});

test('plugin health distinguishes readiness, delivery and business completion and blocks revoked execution access',()=>{
 const f=fixture();try{
  const p=f.project('HLT'),t=f.ticket(p),id='neutral.health',permissions=['scheduled.job','ticket.read'];f.ext.plugins.install({id,name:'Health fixture',version:'1.0.0',capabilities:['scheduled.job'],permissions},f.admin);f.ext.plugins.setEnabled(id,true,f.admin);assert.equal(f.ext.plugins.health().plugins[0].health,'not_configured');f.v.runtime.configure(id,{version:0,url:'https://neutral.example.test/execute',project_ids:[p.id],permissions},f.admin);assert.equal(f.v.runtime.list(f.admin)[0].health,'ready');const job=f.v.runtime.enqueue(id,{ticket_id:t.id,action:'check',request_key:'health-check-fixture'},f.admin);
  f.db.prepare("UPDATE platform_jobs SET state='failed' WHERE id=?").run(job.id);assert.equal(f.ext.plugins.health().failed,1);f.db.prepare("UPDATE platform_jobs SET state='sent',result=? WHERE id=?").run(JSON.stringify({delivered:true}),job.id);assert.equal(f.v.runtime.list(f.admin)[0].health,'awaiting_result');f.db.prepare('UPDATE platform_jobs SET result=? WHERE id=?').run(JSON.stringify({delivered:true,business_result:'completed'}),job.id);assert.equal(f.v.runtime.list(f.admin)[0].health,'completed');f.v.runtime.configure(id,{version:1,url:'https://neutral.example.test/new',project_ids:[p.id],permissions},f.admin);assert.equal(f.v.runtime.list(f.admin)[0].health,'ready');f.db.prepare('UPDATE users SET active=0 WHERE id=?').run(f.admin.id);assert.equal(f.v.runtime.operationalHealth(id).health,'blocked');
 }finally{f.close();}
});

test('late connector acknowledgements cannot resurrect a cancelled job or execute another cancelled batch item',async()=>{
 const f=fixture();try{
  const p=f.project('CJA'),t=f.ticket(p),id='neutral.late',permissions=['scheduled.job','ticket.read'];f.ext.plugins.install({id,name:'Late acknowledgement',version:'1.0.0',capabilities:['scheduled.job'],permissions},f.admin);f.ext.plugins.setEnabled(id,true,f.admin);let release,started;const reached=new Promise(r=>started=r),pending=new Promise(r=>release=r),deliveries=[],runtime=createPluginRuntime(f.db,{...f,registry:f.ext.plugins,send:async(...args)=>{deliveries.push(args);started();await pending;}});runtime.configure(id,{version:0,url:'https://neutral.example.test/execute',project_ids:[p.id],permissions},f.admin);
  const first=runtime.enqueue(id,{ticket_id:t.id,action:'first',request_key:'late-first-action'},f.admin),second=runtime.enqueue(id,{ticket_id:t.id,action:'second',request_key:'late-second-action'},f.admin),flush=runtime.flush();await reached;runtime.state(first.id,{version:1,state:'cancelled'},f.admin);runtime.state(second.id,{version:1,state:'cancelled'},f.admin);release();await flush;
  assert.equal(deliveries.length,1);assert.equal(f.db.prepare('SELECT state FROM platform_jobs WHERE id=?').get(first.id).state,'cancelled');assert.equal(f.db.prepare('SELECT state FROM platform_jobs WHERE id=?').get(second.id).state,'cancelled');assert.equal(JSON.parse(f.db.prepare('SELECT result FROM platform_jobs WHERE id=?').get(first.id).result).late_acknowledgement,true);
 }finally{f.close();}
});

test('configuration restore retains complete form settings and rejects stale project field references atomically',()=>{
 const f=fixture();try{
  const p=f.project('REV'),old=f.catalog.save(p.id,null,{name:'Original form',enabled:true,group_name:'Original group',icon:'users',default_priority:'P1',portal_priority:true,sort_order:77,base_fields:{title:{hidden:true,value:'Original title'},description:{hidden:false,value:'Original description'}},fields:[{key:'reason',label:'Reason',type:'text'}]},f.admin);
  const newer=f.catalog.save(p.id,old.id,{...old,name:'Changed form',default_priority:'P4',group_name:'Changed group',base_fields:{title:{hidden:true,value:'Changed title'},description:{hidden:false,value:''}}},f.admin),revision=f.v.governance.revisions(p.id,f.admin).find(r=>r.kind==='form'&&r.resource_id===old.id&&r.config.name==='Original form');assert.ok(revision);f.v.governance.restoreRevision(revision.id,{version:newer.version},f.admin);const restored=f.catalog.get(p.id,old.id,f.admin);assert.equal(restored.default_priority,'P1');assert.equal(restored.group_name,'Original group');assert.equal(restored.icon,'users');assert.equal(restored.sort_order,77);assert.equal(restored.portal_priority,true);assert.deepEqual(restored.base_fields,old.base_fields);
  f.v.governance.settings(p.id,{version:f.projects.project(p.id).version,transition_conditions:{resolved:{fields:['reason']}},attachments:{max_bytes:2048,extensions:['pdf']}},f.admin);f.v.governance.settings(p.id,{version:f.projects.project(p.id).version,transition_conditions:{}},f.admin);const settingsRevision=f.v.governance.revisions(p.id,f.admin).find(r=>r.kind==='settings'&&r.config.settings.transition_conditions?.resolved);
  f.catalog.save(p.id,old.id,{...restored,fields:[],version:restored.version},f.admin);const before=f.projects.project(p.id),count=f.v.governance.revisions(p.id,f.admin).length;assert.throws(()=>f.v.governance.restoreRevision(settingsRevision.id,{version:before.version},f.admin),status(400));assert.equal(f.projects.project(p.id).settings,before.settings);assert.equal(f.projects.project(p.id).version,before.version);assert.equal(f.v.governance.revisions(p.id,f.admin).length,count);
 }finally{f.close();}
});

test('plugin migrations can be scheduled for maintenance and identical delayed retries retain their original job',async()=>{
 const f=fixture();try{
  const p=f.project('MTS'),id='neutral.maintenance';let time=Date.now(),deliveries=0;f.ext.plugins.install({id,name:'Maintenance fixture',version:'1.0.0',dataVersion:1,capabilities:['migration'],permissions:['migration']},f.admin);const runtime=createPluginRuntime(f.db,{...f,registry:f.ext.plugins,clock:()=>time,send:async()=>{deliveries++;}});runtime.configure(id,{version:0,url:'https://neutral.example.test/migrate',project_ids:[p.id],permissions:['migration']},f.admin);const b={revision:1,confirm_version:1,request_key:'maintenance-time-fixture',run_at:new Date(time+3600000).toISOString()},job=runtime.migrations.enqueue(id,b,f.admin);await runtime.flush();assert.equal(deliveries,0);time+=3602000;assert.equal(runtime.migrations.enqueue(id,b,f.admin).id,job.id);await runtime.flush();assert.equal(deliveries,1);assert.equal(runtime.migrations.list(id,f.admin)[0].state,'sent');
 }finally{f.close();}
});

test('reinstalling the same plugin ID cannot revive work approved for an earlier installation',()=>{
 const f=fixture();try{
  const p=f.project('GEN'),t=f.ticket(p),id='neutral.generation',permissions=['scheduled.job','ticket.read'],manifest={id,name:'Generation fixture',version:'1.0.0',capabilities:['scheduled.job'],permissions};f.ext.plugins.install(manifest,f.admin);f.ext.plugins.setEnabled(id,true,f.admin);f.v.runtime.configure(id,{version:0,url:'https://neutral.example.test/old',project_ids:[p.id],permissions},f.admin);const job=f.v.runtime.enqueue(id,{ticket_id:t.id,action:'check',request_key:'old-generation-job'},f.admin),old=f.ext.plugins.list(f.admin)[0].revision;f.ext.plugins.setEnabled(id,false,f.admin);f.ext.plugins.remove(id,f.admin);f.ext.plugins.install(manifest,f.admin);f.ext.plugins.setEnabled(id,true,f.admin);f.v.runtime.configure(id,{version:0,url:'https://neutral.example.test/new',project_ids:[p.id],permissions},f.admin);assert.ok(f.ext.plugins.list(f.admin)[0].revision>old);const paused=f.db.prepare('SELECT * FROM platform_jobs WHERE id=?').get(job.id);assert.equal(paused.state,'paused');assert.throws(()=>f.v.runtime.state(job.id,{version:paused.version,state:'queued'},f.admin),status(409));
 }finally{f.close();}
});


test('plugin comments and follow-ups reject stale source jobs and progress comments preserve request-bound results',async()=>{
 const f=fixture();try{
  const p=f.project('PCG'),t=f.ticket(p),executor=f.user('rpc-comment-executor@x.test','agent'),id='neutral.comment.guard',permissions=['scheduled.job','ticket.read','ticket.comment'],manifest={id,name:'Comment guard',version:'1.0.0',capabilities:['scheduled.job'],permissions};
  f.projects.setMember(p.id,executor.id,'agent',f.admin);f.ext.plugins.install(manifest,f.admin);f.ext.plugins.setEnabled(id,true,f.admin);
  const runtime=createPluginRuntime(f.db,{projects:f.projects,desk:f.desk,registry:f.ext.plugins,dataDir:f.dataDir,send:async()=>{}}),configured=runtime.configure(id,{version:0,url:'https://neutral.example.test/execute',project_ids:[p.id],execution_user_id:executor.id,permissions},f.admin),api=createPluginAPI(f.db,{runtime,projects:f.projects,workspace:f.v21.workspace});
  const call=(path,body,key='comment-guard-request')=>api.handle({method:'POST',path:'/api/plugins/'+id+path,token:'Bearer '+configured.generated_secret,idempotencyKey:key,read:async()=>body});
  const strict=runtime.enqueue(id,{ticket_id:t.id,action:'check',request_key:'strict-comment-job'},f.admin),job=runtime.enqueue(id,{ticket_id:t.id,action:'check',version_policy:'request',request_key:'request-comment-job'},f.admin);
  await assert.rejects(()=>call('/tickets/'+t.id+'/comments',{job_id:job.id,body:'Queued',version:t.version}),status(409));
  await runtime.flush();await assert.rejects(()=>call('/tickets/'+t.id+'/comments',{job_id:strict.id,body:'Strict',version:t.version}),status(409));
  const comment=await call('/tickets/'+t.id+'/comments',{job_id:job.id,body:'Progress',version:t.version});assert.equal(comment.value.ok,true);
  assert.equal((await call('/tickets/'+t.id+'/comments',{job_id:job.id,body:'Progress',version:t.version})).value.id,comment.value.id);
  const savedComment=f.db.prepare('SELECT * FROM comments WHERE id=?').get(comment.value.id);assert.equal(savedComment.author_id,executor.id);assert.equal(savedComment.actual_actor_id,f.admin.id);assert.equal(savedComment.origin,'api');f.ext.events();assert.equal(f.db.prepare('SELECT 1 FROM ticket_watchers WHERE ticket_id=? AND user_id=?').get(t.id,executor.id),undefined);assert.ok(f.db.prepare('SELECT 1 FROM notifications WHERE ticket_id=? AND user_id=?').get(t.id,f.admin.id));
  assert.equal((await call('/jobs/'+job.id+'/result',{status:'completed',message:'Done'})).value.ok,true);
  const version=f.desk.ticket(t.id).version;
  f.db.prepare('UPDATE plugin_connectors SET version=version+1 WHERE plugin_id=?').run(id);
  await assert.rejects(()=>call('/tickets/'+t.id+'/comments',{job_id:job.id,body:'Stale',version},'stale-comment-guard'),status(409));
  await assert.rejects(()=>call('/jobs/'+job.id+'/result',{status:'completed',message:'Done'}),status(409));
  const follow={ticket_id:t.id,parent_job_id:job.id,action:'followup',version,request_key:'stale-followup-guard'};
  assert.throws(()=>runtime.enqueue(id,follow,f.admin),status(409));
  await assert.rejects(()=>call('/tickets/'+t.id+'/schedule',follow,'stale-followup-guard'),status(409));
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM comments WHERE ticket_id=?').get(t.id).n,1);
 }finally{f.close();}
});

test('per-form customer layouts validate privacy and portability and filter historical fields',()=>{
 const f=fixture();try{
  const p=f.project('CLO'),form=f.catalog.save(p.id,null,{name:'Public request',portal_visible:true,fields:[{key:'first',label:'First',type:'text'},{key:'second',label:'Second',type:'text'},{key:'secret',label:'Secret',type:'text',visibility:'internal'}]},f.admin),layout={mode:'tabs',sections:['next','fields','conversation'],field_order:['second','first']};
  const save=input=>f.v.governance.settings(p.id,{version:f.projects.project(p.id).version,customer_form_layouts:input},f.admin);
  for(const invalid of [{...layout,field_order:['secret']},{...layout,sections:['fields','fields']},{...layout,field_order:['missing']}])assert.throws(()=>save({[form.id]:invalid}),status(400));
  assert.throws(()=>save({99999:layout}),status(400));save({[form.id]:layout});
  const t=f.ticket(p);f.db.prepare('UPDATE tickets SET request_type_id=?,form_snapshot=? WHERE id=?').run(form.id,JSON.stringify({fields:[{key:'first',visibility:'portal'},{key:'second',visibility:'internal'}]}),t.id);
  assert.deepEqual(f.v.processes.extras(t.id,f.admin).customer_view.field_order,['first']);
  const cfg=f.v.blueprints.fromProject(p.id,{name:'Portal layout package'},f.admin).config,alias=cfg.projects[0].forms.find(f=>f.name===form.name).alias;assert.deepEqual(cfg.projects[0].process_settings.customer_form_layouts[alias],layout);assert.equal(cfg.projects[0].process_settings.customer_form_layouts[form.id],undefined);
  const draft=f.v.blueprints.draft(null,{name:'Portal layout draft',config:cfg},f.admin),b={version:1,mapping:{project:{key:'CLN',name:'Portal destination'}}},preview=f.v.blueprints.validate(draft.id,b,f.admin);assert.equal(preview.valid,true,preview.errors.join(';'));
  const id=f.v.blueprints.activate(draft.id,{...b,preview_fingerprint:preview.preview_fingerprint},f.admin).projects.project,newForm=f.catalog.list(id,f.admin,'manage').find(f=>f.name===form.name);assert.notEqual(newForm.id,form.id);assert.deepEqual(JSON.parse(f.projects.project(id).settings).customer_form_layouts[newForm.id],layout);
  save({});assert.equal(f.v.processes.extras(t.id,f.admin).customer_view,undefined);
 }finally{f.close();}
});


test('durable event backlog yields between bounded batches without duplicate or reentrant deliveries',()=>{
 const f=fixture();try{
  const p=f.project('BKL'),t=f.ticket(p);f.ext.events();const ids=[],delivered=[];
  const insert=f.db.prepare("INSERT INTO desk_events(ticket_id,event,payload,created_at) VALUES(?,'ticket_updated','{}',?)");
  for(let n=0;n<250;n++)ids.push(Number(insert.run(t.id,new Date().toISOString()).lastInsertRowid));
  f.ext.setEventHook(event=>{delivered.push(event.id);f.ext.events();});f.ext.events();assert.ok(delivered.length>0&&delivered.length<=100);assert.ok(f.db.prepare("SELECT COUNT(*) n FROM desk_events WHERE status='queued'").get().n>0);
  for(let n=0;n<250&&f.db.prepare("SELECT 1 FROM desk_events WHERE status='queued'").get();n++)f.ext.events();
  assert.deepEqual(delivered,ids);assert.equal(new Set(delivered).size,250);assert.equal(f.db.prepare("SELECT COUNT(*) n FROM desk_events WHERE status<>'done'").get().n,0);assert.equal(f.db.prepare("SELECT COUNT(*) n FROM desk_event_deliveries WHERE module='plugins' AND event_id>=?").get(ids[0]).n,250);
 }finally{f.close();}
});

test('template and project draft edits keep restorable revisions and invalidate prior activation previews',()=>{
 const f=fixture();try{
  const draft=f.v.blueprints.draft(null,{name:'Original draft',blueprint:'it'},f.admin),cfg=JSON.parse(draft.config),mapping={it:{key:'REV',name:'Revision destination'}},preview=f.v.blueprints.validate(draft.id,{version:1,mapping},f.admin);
  const edited=f.v.blueprints.draft(draft.id,{version:1,name:'Changed draft',config:{...cfg,projects:cfg.projects.map(p=>({...p,forms:p.forms.map((form,i)=>i===0?{...form,name:'Changed form'}:form)}))}},f.admin);assert.equal(edited.version,2);
  assert.throws(()=>f.v.blueprints.activate(draft.id,{version:1,mapping,preview_fingerprint:preview.preview_fingerprint},f.admin),status(409));assert.equal(f.db.prepare('SELECT COUNT(*) n FROM projects').get().n,0);
  const history=f.v.blueprints.history('draft',draft.id,f.admin);assert.equal(history.revisions[0].version,1);assert.equal(history.revisions[0].name,'Original draft');
  const restored=f.v.blueprints.restore('draft',draft.id,{version:2,revision_id:history.revisions[0].id},f.admin);assert.equal(restored.version,3);assert.deepEqual(JSON.parse(restored.config),cfg);assert.equal(f.v.blueprints.history('draft',draft.id,f.admin).revisions.length,2);
  const tpl=f.v.blueprints.save(null,{name:'Original template',config:cfg},f.admin),other=f.v.blueprints.save(null,{name:'Other template',config:cfg},f.admin);f.v.blueprints.save(tpl.id,{version:1,name:'Changed template',config:cfg},f.admin);const old=f.v.blueprints.history('blueprint',tpl.id,f.admin).revisions[0];
  assert.throws(()=>f.v.blueprints.restore('blueprint',other.id,{version:1,revision_id:old.id},f.admin),status(404));assert.throws(()=>f.v.blueprints.restore('blueprint',tpl.id,{version:1,revision_id:old.id},f.admin),status(409));f.v.blueprints.restore('blueprint',tpl.id,{version:2,revision_id:old.id},f.admin);assert.equal(f.v.blueprints.list(f.admin).custom.find(t=>t.id===tpl.id).version,3);
  const nonadmin=f.user('template-agent@x.test','agent');assert.throws(()=>f.v.blueprints.history('draft',draft.id,nonadmin),status(403));
  const current=f.v.blueprints.validate(draft.id,{version:3,mapping},f.admin);f.v.blueprints.activate(draft.id,{version:3,mapping,preview_fingerprint:current.preview_fingerprint},f.admin);assert.throws(()=>f.v.blueprints.restore('draft',draft.id,{version:4,revision_id:history.revisions[0].id},f.admin),status(409));
  const copy=f.v.blueprints.draft(null,{name:'Copied activated config',config:cfg},f.admin);assert.equal(copy.activated_at,null);assert.equal(copy.version,1);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM projects').get().n,1);
 }finally{f.close();}
});

test('approval withdrawal preserves votes, pauses queued work and rejects results authorized by the old approval revision',async()=>{
 const f=fixture();try{
  const p=f.project('WDN'),requester=f.user('withdraw-requester@x.test'),agent=f.user('withdraw-agent@x.test','agent');f.projects.setMember(p.id,agent.id,'agent',f.admin);const t=f.ticket(p,requester),run=f.v.processes.approval(t.id,{stages:[{name:'Manager review',users:[f.admin.id]}]},f.admin);
  f.v.processes.decide(run.id,{version:1,decision:'approved'},f.admin);const control=f.v.processes.extras(t.id,requester).approval_control;assert.equal(control.run_id,run.id);assert.equal(f.v.processes.extras(t.id,agent).approval_control,null);
  const id='neutral.withdraw',permissions=['scheduled.job','ticket.read'];f.ext.plugins.install({id,name:'Withdrawal fixture',version:'1.0.0',capabilities:['scheduled.job'],permissions},f.admin);f.ext.plugins.setEnabled(id,true,f.admin);const runtime=createPluginRuntime(f.db,{projects:f.projects,desk:f.desk,registry:f.ext.plugins,dataDir:f.dataDir,send:async()=>{}}),configured=runtime.configure(id,{version:0,url:'https://neutral.example.test/execute',project_ids:[p.id],permissions},f.admin);
  const queued=runtime.enqueue(id,{ticket_id:t.id,action:'later',version_policy:'request',run_at:new Date(Date.now()+60000).toISOString(),request_key:'withdraw-later-job'},f.admin),sent=runtime.enqueue(id,{ticket_id:t.id,action:'now',version_policy:'request',request_key:'withdraw-sent-job'},f.admin);await runtime.flush();assert.equal(f.db.prepare('SELECT state FROM platform_jobs WHERE id=?').get(sent.id).state,'sent');
  const input={run_id:run.id,version:control.version,reason:'Request withdrawn'};assert.throws(()=>f.v.processes.withdraw(t.id,input,agent),status(403));assert.throws(()=>f.v.processes.withdraw(t.id,{...input,reason:''},requester),status(400));f.v.processes.withdraw(t.id,input,requester);
  assert.equal(f.db.prepare('SELECT state FROM platform_jobs WHERE id=?').get(queued.id).state,'paused');assert.equal(f.db.prepare('SELECT state FROM approval_runs WHERE id=?').get(run.id).state,'cancelled');assert.equal(f.db.prepare('SELECT COUNT(*) n FROM approval_votes WHERE run_id=?').get(run.id).n,1);assert.throws(()=>f.v.processes.withdraw(t.id,input,requester),status(409));
  const api=createPluginAPI(f.db,{runtime,projects:f.projects});await assert.rejects(()=>api.handle({method:'POST',path:'/api/plugins/'+id+'/jobs/'+sent.id+'/result',token:'Bearer '+configured.generated_secret,read:async()=>({status:'completed'})}),status(409));
  const renewed=f.v.processes.approval(t.id,{stages:[{name:'Renewed review',users:[f.admin.id]}]},f.admin);assert.notEqual(renewed.id,run.id);assert.throws(()=>f.v.processes.decide(run.id,{version:3,decision:'approved'},f.admin),status(409));f.v.processes.decide(renewed.id,{version:1,decision:'approved'},f.admin);assert.equal(f.v.processes.extras(t.id,f.admin).approvals[0].state,'approved');
 }finally{f.close();}
});

test('approval deadlines reject expired decisions without recording votes',()=>{
 const f=fixture();try{
  const p=f.project('DDL'),t=f.ticket(p);assert.throws(()=>f.v.processes.approval(t.id,{stages:[{name:'Past deadline',users:[f.admin.id],due_at:new Date(Date.now()-1000).toISOString()}]},f.admin),status(400));
  const run=f.v.processes.approval(t.id,{stages:[{name:'Timed review',users:[f.admin.id],due_at:new Date(Date.now()+60000).toISOString()}]},f.admin),config=JSON.parse(f.db.prepare('SELECT config FROM approval_runs WHERE id=?').get(run.id).config);config[0].due_at=new Date(Date.now()-1000).toISOString();f.db.prepare('UPDATE approval_runs SET config=? WHERE id=?').run(JSON.stringify(config),run.id);
  assert.throws(()=>f.v.processes.decide(run.id,{version:1,decision:'approved'},f.admin),status(409));assert.equal(f.db.prepare('SELECT COUNT(*) n FROM approval_votes WHERE run_id=?').get(run.id).n,0);assert.equal(f.db.prepare('SELECT state FROM approval_runs WHERE id=?').get(run.id).state,'pending');
 }finally{f.close();}
});


test('text and visual query AST round-trip preserve nested logic, literals and parameterized scope',()=>{
 const f=fixture();try{
  const p=f.project('AST'),t=f.ticket(p),input='project=AST AND (priority IN (P1,P3) OR assignee=currentUser()) AND custom.note = '+JSON.stringify('A "quoted" value');
  f.db.prepare('UPDATE tickets SET custom_values=? WHERE id=?').run(JSON.stringify({note:'A "quoted" value',amount:12.5,code:'12.5'}),t.id);const numeric=compileExpression('custom.amount=12.5 AND custom.code="12.5"',{user:f.admin,projects:f.projects,allowedFields:['amount','code']});assert.equal(f.db.prepare('SELECT COUNT(*) n FROM tickets t WHERE '+numeric.sql).get(...numeric.values).n,1);assert.deepEqual(parseExpression(formatExpression({kind:'comparison',field:'custom.amount',operator:'=',value:12.5})).value,12.5);
  const ast=parseExpression(input),formatted=formatExpression(ast),query=compileExpression(formatted,{user:f.admin,projects:f.projects,allowedFields:['note']});assert.deepEqual(query.ast,ast);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM tickets t WHERE '+query.sql).get(...query.values).n,1);
  const untrusted={kind:'comparison',field:'title) OR 1=1 --',operator:'=',value:'x'};assert.throws(()=>formatExpression(untrusted),status(400));assert.throws(()=>formatExpression({kind:'comparison',field:'assignee',operator:'=',value:{function:'eval'}}),status(400));assert.throws(()=>formatExpression({kind:'and',children:[]}),status(400));assert.throws(()=>compileExpression('custom.note IS EMPTY',{user:f.admin,projects:f.projects}),status(403));
 }finally{f.close();}
});

test('project queues preserve portable query logic with explicit account form and team aliases',()=>{
 const f=fixture();try{
  const p=f.project('QPT'),source=f.user('source-queue-agent@x.test','agent'),target=f.user('target-queue-agent@x.test','agent');f.projects.setMember(p.id,source.id,'agent',f.admin);
  const form=f.catalog.save(p.id,null,{name:'Queue form',fields:[{key:'code',label:'Code',type:'text'}]},f.admin),team=f.v.processes.saveTeam(null,{project_id:p.id,name:'Queue team',members:[source.id]},f.admin)[0];
  const expression='project='+p.key+' AND (assignee='+source.id+' OR assignee=currentUser()) AND form='+form.id+' AND team='+team.id+' AND custom.code="Ready"';
  f.db.prepare('INSERT INTO v8_saved_views(owner_id,name,project_id,filters,shared,columns,sort_key,sort_dir,density,created_at,updated_at) VALUES(?,?,?,?,1,?,?,?,?,?,?)').run(source.id,'Portable team queue',p.id,JSON.stringify({expression,priority:'P2'}),JSON.stringify(['issue','status','assignee']),'priority','asc','compact',new Date().toISOString(),new Date().toISOString());
  const cfg=f.v.blueprints.fromProject(p.id,{name:'Queue package'},f.admin).config,project=cfg.projects[0],queue=project.queues[0];assert.ok(queue.query_ast);assert.ok(!JSON.stringify(cfg).includes(source.email));assert.equal(queue.filters.expression,undefined);assert.ok(JSON.stringify(queue.query_ast).includes('@self'));assert.ok(JSON.stringify(queue.query_ast).includes('@assignee/role_1'));
  const draft=f.v.blueprints.draft(null,{name:'Queue destination',config:cfg},f.admin),b={version:1,mapping:{project:{key:'QPN',name:'Queue destination',roles:{role_1:target.id},teams:{team_1:[target.id]}}}},preview=f.v.blueprints.validate(draft.id,b,f.admin);assert.equal(preview.valid,true,preview.errors.join(';'));const id=f.v.blueprints.activate(draft.id,{...b,preview_fingerprint:preview.preview_fingerprint},f.admin).projects.project;
  const saved=f.db.prepare('SELECT * FROM v8_saved_views WHERE project_id=?').get(id),filters=JSON.parse(saved.filters),newForm=f.catalog.list(id,f.admin,'manage').find(x=>x.name===form.name),newTeam=f.v.processes.teams(f.admin,id)[0],stamp=new Date().toISOString(),ticketId=Number(f.db.prepare("INSERT INTO tickets(project_id,key,number,title,description,type,priority,status,workflow_status,reporter_id,created_by,created_at,updated_at,request_type_id,form_snapshot,custom_values) VALUES(?,?,1,'Queue test','Queue fixture','request','P2','open','open',?,?,?,?,?,?,?)").run(id,'QPN-1',f.admin.id,f.admin.id,stamp,stamp,newForm.id,JSON.stringify(newForm),JSON.stringify({code:'Ready'})).lastInsertRowid),t=f.desk.ticket(ticketId);
  f.db.prepare('UPDATE tickets SET assignee_id=?,request_type_id=?,priority=?,custom_values=? WHERE id=?').run(target.id,newForm.id,'P2',JSON.stringify({code:'Ready'}),t.id);f.v.processes.metadata(t.id,{version:0,team_id:newTeam.id},f.admin);
  const query=compileExpression(filters.expression,{user:target,projects:f.projects,allowedFields:['code']});assert.equal(f.db.prepare('SELECT COUNT(*) n FROM tickets t WHERE '+query.sql).get(...query.values).n,1);assert.deepEqual(JSON.parse(saved.columns),['issue','status','assignee']);assert.equal(saved.density,'compact');assert.equal(saved.sort_key,'priority');assert.equal(saved.sort_dir,'asc');
  const outside={projects:[{...project,queues:[{name:'Outside project queue',query_ast:{kind:'comparison',field:'project',operator:'=',value:'OTHER'}}]}]};assert.throws(()=>f.v.blueprints.portable(outside),status(400));
 }finally{f.close();}
});


test('configuration recycle respects retention, ACL, restore and permanent purge', async () => {
  const f=fixture();
  try {
    const tpl=f.v.blueprints.save(null,{name:'Temporary IT template',config:{projects:[{alias:'it',project_type:'internal',forms:[{name:'Access request'}]}]}},f.admin);
    const draft=f.v.blueprints.draft(null,{name:'Temporary project draft',blueprint:'it'},f.admin);
    const agent=f.user('recycle-agent@x.test','agent');
    assert.equal(f.v.configTrash.policy(null,f.admin).retention_days,30);
    assert.throws(()=>f.v.configTrash.policy({version:1,retention_days:0},f.admin),status(400));
    assert.throws(()=>f.v.configTrash.policy(null,agent),status(403));
    assert.equal(f.v.configTrash.policy({version:1,retention_days:14},f.admin).retention_days,14);
    assert.throws(()=>f.v.configTrash.policy({version:1,retention_days:7},f.admin),status(409));
    assert.throws(()=>f.v.configTrash.trash('blueprint',tpl.id,{version:1,confirm_name:'wrong'},f.admin),status(400));
    const gone=f.v.configTrash.trash('blueprint',tpl.id,{version:1,confirm_name:'Temporary IT template'},f.admin);
    assert.equal(f.v.blueprints.list(f.admin).custom.some(x=>x.id===tpl.id),false);
    assert.throws(()=>f.v.configTrash.trash('blueprint',tpl.id,{version:1,confirm_name:'Temporary IT template'},f.admin),status(404));
    assert.ok(Math.abs(Date.parse(gone.expires_at)-Date.now()-14*86400000)<15000);
    assert.equal(f.v.governance.recycle(f.admin).find(r=>r.id===gone.id).kind,'blueprint');
    const replacement=f.v.blueprints.save(null,{name:'Reserved ID fixture',config:{projects:[{alias:'new',project_type:'internal',forms:[{name:'New request'}]}]}},f.admin);assert.notEqual(replacement.id,tpl.id,'Recycled blueprint identifiers must not be reused');
    
    const restored=await f.v.handle('POST','/api/desk/v22/recycle/'+gone.id+'/restore',f.admin,new URLSearchParams(),async()=>({confirm_name:'Temporary IT template'}));
    assert.equal(restored.value.activated,false);
    assert.equal(f.v.blueprints.list(f.admin).custom.some(x=>x.id===tpl.id),true);
    assert.throws(()=>f.v.configTrash.restore(gone.id,{confirm_name:'Temporary IT template'},f.admin),status(404));
    const deletion=f.v.configTrash.trash('draft',draft.id,{version:1,confirm_name:'Temporary project draft'},f.admin);
    assert.equal(f.v.blueprints.list(f.admin).drafts.some(x=>x.id===draft.id),false);
    assert.throws(()=>f.v.configTrash.purge(deletion.id,{confirm_name:'Temporary project draft',confirm_purge:'NO'},f.admin),status(400));
    assert.throws(()=>f.v.configTrash.purge(deletion.id,{confirm_name:'wrong',confirm_purge:'USUŃ NA STAŁE'},f.admin),status(400));
    const purged=await f.v.handle('POST','/api/desk/v22/recycle/'+deletion.id+'/purge',f.admin,new URLSearchParams(),async()=>({confirm_name:'Temporary project draft',confirm_purge:'USUŃ NA STAŁE'}));
    assert.equal(purged.value.purged,true);
    assert.equal(f.db.prepare('SELECT snapshot FROM recycle_entries WHERE id=?').get(deletion.id).snapshot,'{}');
    assert.equal(f.v.governance.recycle(f.admin).some(r=>r.id===deletion.id),false);
    assert.throws(()=>f.v.configTrash.restore(deletion.id,{confirm_name:'Temporary project draft'},f.admin),status(404));
    const p=f.project('REC'),ticket=f.ticket(p),bin=f.v.governance.recycleTicket(ticket.id,{version:ticket.version,confirm_key:ticket.key},f.admin);
    assert.ok(Math.abs(Date.parse(f.db.prepare('SELECT expires_at FROM recycle_entries WHERE id=?').get(bin.id).expires_at)-Date.now()-14*86400000)<15000);
    assert.throws(()=>f.v.configTrash.purge(bin.id,{confirm_purge:'USUŃ NA STAŁE'},f.admin),status(409));
    assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);
  } finally { f.close(); }
});


test('expired configuration content is purged on a bounded sweep and resource IDs remain reserved',()=>{
 const f=fixture();
 try {
  const config={projects:[{alias:'ab',project_type:'internal',forms:[{name:'Internal request'}]}]};
  const blueprint=f.v.blueprints.save(null,{name:'Expires safely',config},f.admin);
  const entry=f.v.configTrash.trash('blueprint',blueprint.id,{version:1,confirm_name:'Expires safely'},f.admin);
  const old='2020-01-01T00:00:00.000Z';
  f.db.prepare('UPDATE recycle_entries SET expires_at=? WHERE id=?').run(old,entry.id);
  assert.throws(()=>f.v.configTrash.restore(entry.id,{confirm_name:'Expires safely'},f.admin),e=>e.status===409);
  assert.equal(f.v.configTrash.cleanupExpired().purged,1);
  assert.equal(f.v.configTrash.cleanupExpired().purged,0);
  assert.equal(f.db.prepare('SELECT snapshot FROM recycle_entries WHERE id=?').get(entry.id).snapshot,'{}');
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE action='configuration.expired' AND actor_id IS NULL").get().n,1);
  const next=f.v.blueprints.save(null,{name:'New safe template',config},f.admin);
  assert.notEqual(next.id,blueprint.id);
  assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{f.close();}
});
