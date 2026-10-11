// Synthetic, isolated dataset; no production data or external integrations.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
const dataDir = mkdtempSync(join(tmpdir(), 'desk21-load-')),
  probe = createServer();
await new Promise((r) => probe.listen(0, '127.0.0.1', r));
const port = probe.address().port;
await new Promise((r) => probe.close(r));
const base = 'http://127.0.0.1:' + port;
const server = spawn(process.execPath, ['server.mjs'], {
  env: {
    ...process.env,
    NODE_ENV: 'test',
    APP_URL: base,
    HOST: '127.0.0.1',
    PORT: String(port),
    DATA_DIR: dataDir,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '',
  cookie = '',
  csrf = '',
  db;
const timings = {};
server.stderr.on('data', (c) => (logs += c));
async function api(path, data) {
  const r = await fetch(base + path, {
    method: data ? 'POST' : 'GET',
    headers: { Origin: base, 'Content-Type': 'application/json', Cookie: cookie, 'X-CSRF-Token': csrf },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  if (r.headers.has('set-cookie')) cookie = r.headers.get('set-cookie').split(';')[0];
  const value = await r.json();
  assert.ok(r.ok, path + ': ' + JSON.stringify(value));
  return value;
}
const timed = async (name, fn) => {
  const start = performance.now(),
    value = await fn();
  timings[name] = Math.round(performance.now() - start);
  return value;
};
try {
  await new Promise((r, j) => {
    server.stdout.on('data', (c) => String(c).includes('porcie') && r());
    server.once('exit', () => j(Error(logs)));
    setTimeout(() => j(Error('Startup ' + logs)), 15000).unref();
  });
  await api('/api/setup', {
    token: readFileSync(join(dataDir, 'setup-token'), 'utf8').trim(),
    company_name: 'Load QA',
    brand_name: 'Load QA',
    first_name: 'QA',
    last_name: 'Admin',
    email: 'load@x.test',
    password: 'Synthetic-load-password-2026',
  });
  const login = await api('/api/login', { email: 'load@x.test', password: 'Synthetic-load-password-2026' });
  csrf = login.csrf;
  const p = await api('/api/projects', {
      key: 'LD',
      name: 'Synthetic load project',
      project_type: 'external',
      portal_access: 'authenticated',
    }),
    seed = await api('/api/tickets', {
      project_id: p.id,
      title: 'Synthetic load seed',
      description: 'Isolated performance fixture',
      priority: 'P3',
      type: 'incident',
    });
  db = new DatabaseSync(join(dataDir, 'desk.sqlite'));
  db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=10000;');
  const original = db.prepare('SELECT * FROM tickets WHERE key=?').get(seed.key),
    insert = db.prepare(
      'INSERT INTO tickets(project_id,key,number,title,description,type,priority,status,workflow_status,reporter_id,created_by,created_at,updated_at,request_type_id,form_snapshot,custom_values) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    );
  db.exec('BEGIN IMMEDIATE');
  for (let n = 2; n <= 10000; n++) {
    const stamp = new Date(Date.now() - (n % 30) * 86400000).toISOString();
    insert.run(
      p.id,
      'LD-' + n,
      n,
      'Synthetic ticket ' + n,
      'Dataset for pagination and SLA radar',
      'incident',
      'P3',
      'open',
      'open',
      login.user.id,
      login.user.id,
      stamp,
      stamp,
      original.request_type_id,
      original.form_snapshot,
      original.custom_values,
    );
  }
  db.prepare('UPDATE projects SET next_number=10001 WHERE id=?').run(p.id);
  db.exec('COMMIT');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM tickets WHERE project_id=?').get(p.id).n, 10000);
  const first = await timed('queue_page_1_ms', () =>
      api('/api/desk/v21/queue?project=' + p.id + '&limit=25&sort=created_asc'),
    ),
    last = await timed('queue_page_400_ms', () =>
      api('/api/desk/v21/queue?project=' + p.id + '&limit=25&page=400&sort=created_asc'),
    );
  assert.equal(first.total, 10000);
  assert.equal(first.tickets.length, 25);
  assert.equal(last.tickets.length, 25);
  assert.equal(new Set([...first.tickets, ...last.tickets].map((t) => t.key)).size, 50);
  assert.equal((await api('/api/desk/v21/queue?project=' + p.id + '&limit=25&page=401')).tickets.length, 0);
  const report = await timed('reports_with_500_sla_candidates_ms', () =>
    api('/api/desk/v21/reports?project=' + p.id),
  );
  assert.equal(report.totals.total, 10000);
  assert.equal(report.radar_examined, 500);
  assert.equal(report.daily.length, 30);
  const items = (await api('/api/desk/v21/queue?project=' + p.id + '&limit=50')).tickets.map((t) => ({
      key: t.key,
      version: t.version,
    })),
    payload = { items, action: 'priority', value: 'P2', request_key: randomUUID() },
    bulk = await timed('bulk_50_ms', () => api('/api/desk/v21/bulk', payload));
  assert.equal(bulk.results.length, 50);
  assert.ok(bulk.results.every((x) => x.ok));
  assert.deepEqual(await api('/api/desk/v21/bulk', payload), bulk);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM tickets WHERE priority='P2'").get().n, 50);
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  console.log('Synthetic 10,000-ticket load passed: ' + JSON.stringify(timings));
} finally {
  db?.close();
  server.kill('SIGTERM');
  rmSync(dataDir, { recursive: true, force: true });
}
