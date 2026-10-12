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
import { compileExpression } from '../lib/query-v22.mjs';
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
