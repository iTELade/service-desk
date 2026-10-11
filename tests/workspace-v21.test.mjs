import test from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './v6-fixture.mjs';
import { migrateV8 } from '../lib/migration-v8.mjs';
import { migrateV9 } from '../lib/migration-v9.mjs';
import { migrateV10 } from '../lib/migration-v10.mjs';
import { createV21 } from '../lib/v21.mjs';
const error = (status) => (e) => e.status === status;
function fixture() {
  const f = setup();
  migrateV8(f.db);
  migrateV9(f.db);
  migrateV10(f.db);
  const v = createV21(f.db, { ...f, ticketView: (t) => t, queryTickets: () => ({ tickets: [] }) });
  return { ...f, v, w: v.workspace, o: v.operations };
}
test('2.1 migration preserves historical data and excludes native knowledge portal', () => {
  const f = setup();
  try {
    const p = f.project('MI'),
      t = f.ticket(p);
    migrateV8(f.db);
    migrateV9(f.db);
    migrateV10(f.db);
    assert.equal(f.db.prepare('PRAGMA user_version').get().user_version, 10);
    assert.equal(f.db.prepare('SELECT title FROM tickets WHERE id=?').get(t.id).title, t.title);
    assert.equal(
      f.db
        .prepare(
          "SELECT count(*) n FROM sqlite_master WHERE name IN ('knowledge_articles','knowledge_versions','knowledge_feedback')",
        )
        .get().n,
      0,
    );
    migrateV10(f.db);
    assert.equal(f.db.prepare('PRAGMA foreign_key_check').all().length, 0);
  } finally {
    f.close();
  }
});
test('2.1 comment + transition is atomic, versioned and idempotent', () => {
  const f = fixture();
  try {
    const p = f.project('CO'),
      t = f.ticket(p),
      b = {
        body: 'Public answer',
        internal: false,
        version: t.version,
        request_key: 'comment-retry-001',
        workflow_status: 'in_progress',
      };
    const first = f.w.comment(t.key, b, f.admin);
    assert.deepEqual(f.w.comment(t.key, b, f.admin), first);
    assert.deepEqual(f.w.comment(t.key, Object.fromEntries(Object.entries(b).reverse()), f.admin), first);
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM comments WHERE ticket_id=?').get(t.id).n, 1);
    assert.equal(f.desk.ticket(t.id).status, 'in_progress');
    assert.throws(() => f.w.comment(t.key, { ...b, body: 'Changed' }, f.admin), error(409));
    const fresh = f.desk.ticket(t.id);
    assert.throws(
      () =>
        f.w.comment(
          t.key,
          { ...b, version: fresh.version, request_key: 'rollback-comment', workflow_status: 'missing' },
          f.admin,
        ),
      error(403),
    );
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM comments WHERE ticket_id=?').get(t.id).n, 1);
    assert.throws(() => f.w.comment(t.key, { ...b, request_key: 'stale-comment' }, f.admin), error(409));
  } finally {
    f.close();
  }
});
test('2.1 customer cannot edit staff fields, read extras or publish internal note', () => {
  const f = fixture();
  try {
    const p = f.project('ACL'),
      u = f.user('customer@x.test'),
      t = f.ticket(p, u);
    assert.throws(() => f.w.patch(t.key, { version: t.version, priority: 'P1' }, u), error(404));
    assert.throws(
      () =>
        f.w.comment(
          t.key,
          { body: 'secret', internal: true, version: t.version, request_key: 'internal-customer' },
          u,
        ),
      error(403),
    );
    const extra = f.w.extras(t.key, u);
    for (const field of ['worklogs', 'checklist', 'services', 'cases', 'presence', 'estimate'])
      assert.equal(extra[field], undefined);
    assert.throws(() => f.v.reports(u, new URLSearchParams()), error(403));
  } finally {
    f.close();
  }
});
test('2.1 bulk rolls back individual failures and preserves successful items on retry', () => {
  const f = fixture();
  try {
    const p = f.project('BU'),
      a = f.ticket(p),
      b = f.ticket(p);
    const req = {
      items: [
        { key: a.key, version: a.version },
        { key: b.key, version: b.version + 1 },
        { key: 'NONE-1', version: 1 },
      ],
      action: 'priority',
      value: 'P1',
      request_key: 'bulk-retry-0001',
    };
    const result = f.w.bulk(req, f.admin);
    assert.deepEqual(
      result.results.map((x) => x.ok),
      [true, false, false],
    );
    assert.equal(f.desk.ticket(a.id).priority, 'P1');
    assert.equal(f.desk.ticket(b.id).priority, 'P3');
    assert.deepEqual(f.w.bulk(req, f.admin), result);
    assert.equal(f.desk.ticket(a.id).version, a.version + 1);
    assert.throws(() => f.w.bulk({ ...req, items: Array(51).fill(req.items[0]) }, f.admin), error(400));
  } finally {
    f.close();
  }
});
test('2.1 worklogs, estimates and checklist enforce data and access constraints', () => {
  const f = fixture();
  try {
    const p = f.project('WL'),
      t = f.ticket(p),
      u = f.user('agent@x.test', 'agent');
    f.w.estimate(t.key, { version: 0, estimated_minutes: 60, remaining_minutes: 60 }, f.admin);
    const req = { minutes: 20, body: 'Diagnosed network', request_key: 'worklog-retry-001' };
    f.w.worklog(t.key, req, f.admin);
    f.w.worklog(t.key, req, f.admin);
    assert.equal(f.w.extras(t.key, f.admin).worklogs.length, 1);
    assert.equal(f.w.extras(t.key, f.admin).estimate.remaining_minutes, 40);
    assert.throws(
      () => f.w.estimate(t.key, { version: 1, estimated_minutes: 50, remaining_minutes: 50 }, f.admin),
      error(409),
    );
    assert.throws(
      () => f.w.worklog(t.key, { ...req, request_key: 'negative-worklog', minutes: -1 }, f.admin),
      error(400),
    );
    assert.throws(() => f.w.checklist(t.key, { label: 'Secret owner', owner_id: u.id }, f.admin), error(400));
    f.w.checklist(t.key, { label: 'Validate fix' }, f.admin);
    const c = f.w.extras(t.key, f.admin).checklist[0];
    f.w.checklist(t.key, { id: c.id, version: c.version, done: true }, f.admin);
    assert.throws(
      () => f.w.checklist(t.key, { id: c.id, version: c.version, done: false }, f.admin),
      error(409),
    );
  } finally {
    f.close();
  }
});
test('2.1 CSAT is reporter-only, after resolution, once per ticket', () => {
  const f = fixture();
  try {
    const p = f.project('CS'),
      u = f.user('rating@x.test'),
      t = f.ticket(p, u);
    assert.throws(() => f.w.rate(t.key, { rating: 5 }, u), error(403));
    f.state(t.id, 'resolved');
    assert.throws(() => f.w.rate(t.key, { rating: 5 }, f.admin), error(403));
    assert.throws(() => f.w.rate(t.key, { rating: 6 }, u), error(400));
    f.w.rate(t.key, { rating: 5, body: 'Thanks' }, u);
    assert.throws(() => f.w.rate(t.key, { rating: 4 }, u), error(409));
    assert.equal(f.w.extras(t.key, u).can_rate, false);
  } finally {
    f.close();
  }
});
test('2.1 service dependency graph detects transitive impact and prevents cycles', () => {
  const f = fixture();
  try {
    const p = f.project('SV'),
      a = f.o.saveService(null, { project_id: p.id, name: 'Database' }, f.admin),
      b = f.o.saveService(null, { project_id: p.id, name: 'Application' }, f.admin),
      c = f.o.saveService(null, { project_id: p.id, name: 'Portal' }, f.admin);
    f.o.dependency(b.id, { depends_on: a.id }, f.admin);
    f.o.dependency(c.id, { depends_on: b.id }, f.admin);
    assert.deepEqual(new Set(f.o.graph(a.id, f.admin).impacted), new Set([b.id, c.id]));
    assert.throws(() => f.o.dependency(a.id, { depends_on: c.id }, f.admin), error(409));
    assert.throws(() => f.o.dependency(a.id, { depends_on: a.id }, f.admin), error(400));
    assert.throws(() => f.o.service(a.id, f.user('outsider@x.test', 'agent')), error(404));
  } finally {
    f.close();
  }
});
test('2.1 changes require manager approval, rollback and avoid freeze windows', () => {
  const f = fixture();
  try {
    const p = f.project('CH'),
      agent = f.user('change@x.test', 'agent');
    f.projects.setMember(p.id, agent.id, 'agent', f.admin);
    const c = f.o.saveCase(null, { project_id: p.id, kind: 'change', title: 'Deploy application' }, agent);
    assert.throws(() => f.o.saveCase(c.id, { version: c.version, state: 'approved' }, agent), error(403));
    assert.throws(() => f.o.saveCase(c.id, { version: c.version, state: 'implementing' }, agent), error(409));
    const a = f.o.saveCase(c.id, { version: c.version, state: 'approved' }, f.admin);
    assert.throws(
      () => f.o.saveCase(c.id, { version: a.version, state: 'implementing' }, f.admin),
      error(400),
    );
    f.o.window(
      {
        project_id: p.id,
        name: 'Freeze',
        kind: 'freeze',
        starts_at: '2026-11-01T00:00Z',
        ends_at: '2026-11-02T00:00Z',
      },
      f.admin,
    );
    assert.throws(
      () =>
        f.o.saveCase(
          c.id,
          {
            version: a.version,
            state: 'implementing',
            starts_at: '2026-11-01T01:00Z',
            ends_at: '2026-11-01T02:00Z',
            rollback_plan: 'Revert image',
          },
          f.admin,
        ),
      error(409),
    );
    const i = f.o.saveCase(
      c.id,
      {
        version: a.version,
        state: 'implementing',
        starts_at: '2026-11-03T01:00Z',
        ends_at: '2026-11-03T02:00Z',
        rollback_plan: 'Revert image',
      },
      f.admin,
    );
    assert.equal(i.state, 'implementing');
  } finally {
    f.close();
  }
});
test('2.1 monitoring deduplicates alerts; recovery never closes customer tickets', () => {
  const f = fixture();
  try {
    const p = f.project('MO'),
      s = f.o.saveService(null, { project_id: p.id, name: 'VPN service' }, f.admin),
      conn = f.o.connectors(f.admin, { project_id: p.id, service_id: s.id, name: 'Synthetic monitor' }),
      b = { event_id: 'alert-1', state: 'down', summary: 'VPN unavailable' };
    assert.throws(() => f.o.incoming(conn.id, 'Bearer ' + '0'.repeat(64), b), error(401));
    const r = f.o.incoming(conn.id, 'Bearer ' + conn.secret, b);
    assert.equal(f.o.incoming(conn.id, 'Bearer ' + conn.secret, b).replayed, true);
    assert.throws(
      () => f.o.incoming(conn.id, 'Bearer ' + conn.secret, { ...b, summary: 'different' }),
      error(409),
    );
    const t = f.ticket(p);
    f.o.link(r.case_id, { key: t.key }, f.admin);
    f.o.incoming(conn.id, 'Bearer ' + conn.secret, { event_id: 'alert-2', state: 'up' });
    assert.equal(f.o.detail(r.case_id, f.admin).state, 'monitoring');
    assert.equal(f.desk.ticket(t.id).status, 'open');
    assert.equal(f.o.connectors(f.admin)[0].token_hash, undefined);
  } finally {
    f.close();
  }
});
test('2.1 operational communication is idempotent and reports closed-ticket failures', () => {
  const f = fixture();
  try {
    const p = f.project('BR'),
      a = f.ticket(p),
      b = f.ticket(p),
      c = f.o.saveCase(null, { project_id: p.id, kind: 'incident', title: 'Global outage' }, f.admin);
    f.o.link(c.id, { key: a.key }, f.admin);
    f.o.link(c.id, { key: b.key }, f.admin);
    f.state(b.id, 'closed');
    const req = { body: 'Investigating outage', public: true, request_key: 'broadcast-0001' },
      first = f.o.communicate(c.id, req, f.admin);
    assert.deepEqual(
      first.results.map((x) => x.ok),
      [true, false],
    );
    assert.deepEqual(f.o.communicate(c.id, req, f.admin), first);
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM comments WHERE ticket_id=?').get(a.id).n, 1);
  } finally {
    f.close();
  }
});
test('2.1 workflow draft validates without effects and publishes with optimistic locking', () => {
  const f = fixture();
  try {
    const p = f.project('WF'),
      t = f.ticket(p),
      original = f.workflows.get(p.id),
      config = {
        ...original,
        statuses: [...original.statuses, { key: 'triage', name: 'Triage', category: 'in_progress' }],
        transitions: [...original.transitions, { from: 'open', to: 'triage', actor: 'team', name: 'Triage' }],
      };
    const d = f.v.draft(
      p.id,
      { version: 0, base_version: original.version, config, positions: { triage: { x: 100, y: 100 } } },
      f.admin,
    );
    assert.equal(f.workflows.get(p.id).statuses.length, original.statuses.length);
    assert.throws(() => f.v.publish(p.id, { version: d.version - 1 }, f.admin), error(409));
    f.v.publish(p.id, { version: d.version }, f.admin);
    assert.equal(f.workflows.get(p.id).statuses.length, original.statuses.length + 1);
    assert.equal(f.desk.ticket(t.id).workflow_status, 'open');
    assert.throws(
      () => f.v.draft(p.id, { version: d.version, base_version: original.version, config }, f.admin),
      error(409),
    );
    const before = f.db.prepare('SELECT COUNT(*) n FROM automation_runs').get().n;
    f.workflows.automation.preview(t, 'customer_reply', { comment_body: 'test' });
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM automation_runs').get().n, before);
  } finally {
    f.close();
  }
});
test('2.1 reports aggregate visible projects and use calendar-aware SLA radar', () => {
  const f = fixture();
  try {
    const p = f.project('RP'),
      t = f.ticket(p),
      r = f.v.reports(f.admin, new URLSearchParams({ project: String(p.id) }));
    assert.equal(r.totals.total, 1);
    assert.equal(r.totals.open, 1);
    assert.equal(r.radar_examined, 1);
    assert.match(r.definitions.response_minutes, /kalendarzowy/);
    assert.equal(r.csat.responses, 0);
  } finally {
    f.close();
  }
});

test('2.1 conditional forms preserve server validation and remove hidden dependent values', async () => {
  const { validateFields, validateValues } = await import('../lib/catalog.mjs');
  const fields = validateFields([
    { key: 'need_vpn', label: 'VPN', type: 'checkbox' },
    {
      key: 'manager',
      label: 'Manager',
      type: 'text',
      required: true,
      show_when: { field: 'need_vpn', value: true },
    },
    { key: 'mail', label: 'Email', type: 'email', prefill: 'reporter_email' },
  ]);
  assert.throws(() => validateValues(fields, { need_vpn: true }), error(400));
  assert.deepEqual(validateValues(fields, { need_vpn: false, manager: 'Hidden' }), { need_vpn: false });
  assert.equal(validateValues(fields, { need_vpn: true, manager: 'Alice' }).manager, 'Alice');
  assert.throws(
    () =>
      validateFields([
        { key: 'one', label: 'One', type: 'text', show_when: { field: 'two', value: 'x' } },
        { key: 'two', label: 'Two', type: 'text' },
      ]),
    error(400),
  );
  assert.throws(
    () =>
      validateFields([
        { key: 'private', label: 'Private', type: 'text', visibility: 'internal' },
        { key: 'public', label: 'Public', type: 'text', show_when: { field: 'private', value: 'x' } },
      ]),
    error(400),
  );
});

test('2.1 failed migration rolls back all new tables and schema version', () => {
  const f = setup();
  try {
    migrateV8(f.db);
    migrateV9(f.db);
    f.db.exec('CREATE TABLE managed_services(id INTEGER PRIMARY KEY)');
    assert.throws(() => migrateV10(f.db));
    assert.equal(f.db.prepare('PRAGMA user_version').get().user_version, 9);
    assert.equal(
      f.db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name='ticket_worklogs'").get().n,
      0,
    );
  } finally {
    f.close();
  }
});
