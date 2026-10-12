import test from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './v6-fixture.mjs';
import { migrateV8 } from '../lib/migration-v8.mjs';
import { migrateV9 } from '../lib/migration-v9.mjs';
import { migrateV10 } from '../lib/migration-v10.mjs';
import { createTicketAssistance, rankSimilar } from '../lib/ticket-assistance.mjs';
const error = (status) => (e) => e.status === status;
function fixture() {
  const f = setup();
  migrateV8(f.db);
  migrateV9(f.db);
  migrateV10(f.db);
  return { ...f, a: createTicketAssistance(f.db, f) };
}
function enable(f, p, config = {}) {
  return f.a.settings(
    p.id,
    {
      version: f.projects.project(p.id).version,
      config: { similar: true, attention: true, handover: true, threshold: 35, stale_days: 3, ...config },
    },
    f.admin,
  );
}
test('assistance starts disabled; manager settings preserve unrelated configuration and reject stale writes', () => {
  const f = fixture();
  try {
    const p = f.project('AS');
    assert.equal(f.a.settings(p.id, null, f.admin).config.similar, false);
    assert.deepEqual(f.a.similar({ project_id: p.id, title: 'Awaria VPN firmy' }, f.admin), {
      enabled: false,
      matches: [],
    });
    f.db
      .prepare('UPDATE projects SET settings=? WHERE id=?')
      .run(JSON.stringify({ custom_integration: { value: 42 } }), p.id);
    const r = enable(f, p);
    assert.equal(JSON.parse(f.projects.project(p.id).settings).custom_integration.value, 42);
    assert.throws(
      () => f.a.settings(p.id, { version: r.version - 1, config: r.config }, f.admin),
      error(409),
    );
    assert.throws(
      () => f.a.settings(p.id, { version: r.version, config: { ...r.config, similar: 'true' } }, f.admin),
      error(400),
    );
    const outsider = f.user('outsider@x.test', 'agent');
    assert.throws(() => f.a.settings(p.id, null, outsider), error(404));
    assert.throws(
      () => f.a.settings(p.id, { version: r.version, config: { ...r.config, threshold: 101 } }, f.admin),
      error(400),
    );
  } finally {
    f.close();
  }
});
test('similarity handles accents, ranks exact titles, rejects one-word noise and returns top five deterministically', () => {
  const rows = [
    { id: 1, title: 'Awaria połączenia VPN' },
    { id: 2, title: 'Awaria drukarki biurowej' },
    { id: 3, title: 'VPN połączenia awaria sieci' },
  ];
  const ranked = rankSimilar('AWARIA połączenia VPN!', rows);
  assert.equal(ranked[0].id, 1);
  assert.equal(ranked[0].score, 100);
  assert.ok(ranked.some((r) => r.id === 3));
  assert.ok(!ranked.some((r) => r.id === 2));
  assert.deepEqual(rankSimilar('proszę problem zgłoszenie', rows), []);
  assert.equal(
    rankSimilar(
      'Awaria połączenia VPN',
      Array.from({ length: 10 }, (_, i) => ({ id: i + 1, title: 'Awaria połączenia VPN' })),
    ).length,
    5,
  );
  assert.equal(rankSimilar('blad laczenia vpn', [{ id: 11, title: 'Błąd łączenia VPN' }])[0].score, 100);
});
test('similarity has a visible 2000-candidate bound and never mutates tickets', () => {
  const f = fixture();
  try {
    const p = f.project('BO'),
      t = f.ticket(p);
    enable(f, p);
    f.db.prepare('UPDATE tickets SET title=? WHERE id=?').run('Original VPN failure', t.id);
    const insert = f.db.prepare(
      "INSERT INTO tickets(project_id,key,number,title,description,type,priority,status,workflow_status,reporter_id,created_by,created_at,updated_at,request_type_id,form_snapshot,custom_values) SELECT project_id,?,?,'Different printer request',description,type,priority,status,workflow_status,reporter_id,created_by,created_at,updated_at,request_type_id,form_snapshot,custom_values FROM tickets WHERE id=?",
    );
    f.db.exec('BEGIN');
    for (let i = 2; i <= 2002; i++) insert.run('BO-' + i, i, t.id);
    f.db.exec('COMMIT');
    const before = f.db.prepare('SELECT SUM(version) n FROM tickets').get().n;
    const r = f.a.similar({ project_id: p.id, title: 'Original VPN failure' }, f.admin);
    assert.equal(r.examined, 2000);
    assert.equal(r.limit, 2000);
    assert.deepEqual(r.matches, []);
    assert.equal(f.db.prepare('SELECT SUM(version) n FROM tickets').get().n, before);
  } finally {
    f.close();
  }
});
test('similarity enforces project and customer visibility before scoring and excludes archived, deleted and source tickets', () => {
  const f = fixture();
  try {
    const p = f.project('VI'),
      q = f.project('OT'),
      u = f.user('client@x.test'),
      other = f.user('other@x.test');
    enable(f, p);
    const own = f.ticket(p, u),
      hidden = f.ticket(p, other),
      outside = f.ticket(q, u),
      archived = f.ticket(p, u),
      deleted = f.ticket(p, u);
    for (const t of [own, hidden, outside, archived, deleted])
      f.db.prepare('UPDATE tickets SET title=? WHERE id=?').run('Awaria logowania VPN', t.id);
    f.db.prepare('UPDATE tickets SET archived_at=? WHERE id=?').run('2026-10-01', archived.id);
    f.db.prepare('UPDATE tickets SET deleted_at=? WHERE id=?').run('2026-10-01', deleted.id);
    const customer = f.a.similar({ project_id: p.id, title: 'Awaria logowania VPN' }, u);
    assert.deepEqual(
      customer.matches.map((t) => t.key),
      [own.key],
    );
    assert.equal(customer.examined, 1);
    assert.equal(customer.matches[0].description, undefined);
    assert.deepEqual(
      f.a.similar({ project_id: p.id, title: 'Awaria logowania VPN', exclude_key: own.key }, u).matches,
      [],
    );
    assert.throws(
      () => f.a.similar({ project_id: p.id, title: 'Awaria logowania VPN', exclude_key: hidden.key }, u),
      error(404),
    );
    assert.equal(f.a.similar({ project_id: p.id, title: 'Awaria logowania VPN' }, f.admin).matches.length, 2);
    const noAccess = f.project('IN', 'internal');
    assert.throws(
      () => f.a.similar({ project_id: noAccess.id, title: 'Awaria logowania VPN' }, u),
      error(404),
    );
  } finally {
    f.close();
  }
});
test('attention and handover are read-only, staff-only and omit internal comments', () => {
  const f = fixture();
  try {
    const p = f.project('HA'),
      u = f.user('requester@x.test'),
      t = f.ticket(p, u);
    enable(f, p);
    f.comment(t, f.admin, 'PUBLIC-CONTEXT');
    f.comment(t, f.admin, 'PRIVATE-SECRET', 1);
    f.db
      .prepare('INSERT INTO ticket_checklist(ticket_id,label,created_at) VALUES(?,?,?)')
      .run(t.id, 'Sprawdź tunel', new Date(f.clock()).toISOString());
    f.db
      .prepare('INSERT INTO ticket_estimates(ticket_id,estimated_minutes,remaining_minutes) VALUES(?,10,0)')
      .run(t.id);
    f.db
      .prepare(
        'INSERT INTO ticket_worklogs(ticket_id,user_id,minutes,body,started_at,created_at) VALUES(?,?,20,?,?,?)',
      )
      .run(t.id, f.admin.id, 'Test', '2026-09-14', '2026-09-14');
    f.advance(4 * 86400000);
    const before = f.desk.ticket(t.id),
      r = f.a.insights(t.key, f.admin);
    assert.deepEqual(
      r.attention.map((x) => x.kind),
      ['unassigned', 'stale', 'checklist', 'estimate'],
    );
    assert.match(r.handover, /PUBLIC-CONTEXT/);
    assert.doesNotMatch(r.handover, /PRIVATE-SECRET/);
    assert.match(r.handover, /Sprawdź tunel/);
    assert.deepEqual(f.desk.ticket(t.id), before);
    assert.throws(() => f.a.insights(t.key, u), error(404));
    f.state(t.id, 'resolved');
    assert.deepEqual(f.a.insights(t.key, f.admin).attention, []);
    enable(f, p, { similar: false, attention: false, handover: false });
    assert.equal(f.a.insights(t.key, f.admin).handover, null);
  } finally {
    f.close();
  }
});
