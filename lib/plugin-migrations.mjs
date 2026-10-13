import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { secretStore } from './secrets.mjs';
import { fail, integer, text, now, txFor } from './core.mjs';
import { VERSION } from './version.mjs';

// Only transport/version coordination lives here; external services own their data and code.
export function createPluginMigrations(db, { projects, dataDir, send, clock = Date.now }) {
  const secrets = secretStore(dataDir), tx = txFor(db);
  const admin = u => { if (u?.role !== 'admin' || !u.active || !u.directory_active || u.registration_state !== 'active') fail(403, 'Aktywny administrator jest wymagany.'); };
  function current(id) {
    const p = db.prepare('SELECT * FROM plugin_registry WHERE id=?').get(id), r = db.prepare('SELECT * FROM plugin_connectors WHERE plugin_id=?').get(id);
    if (!p || !r) fail(404, 'Plugin lub połączenie niedostępne.');
    const m = JSON.parse(p.manifest), c = JSON.parse(r.config);
    if (p.enabled || !m.capabilities.includes('migration') || !m.permissions.includes('migration') || !c.permissions.includes('migration')) fail(409, 'Wyłącz plugin i przyznaj uprawnienie migracji.');
    return { p, r, m, c };
  }
  function bound(job) {
    const a = current(job.plugin_id), source = JSON.parse(job.payload), u = db.prepare('SELECT * FROM users WHERE id=?').get(job.user_id); admin(u);
    if (source.manifest_revision !== a.p.version || source.connector_version !== a.r.version || source.to !== a.m.dataVersion || source.from !== (db.prepare('SELECT data_version FROM plugin_data_versions WHERE plugin_id=?').get(job.plugin_id)?.data_version || 0)) fail(409, 'Konfiguracja migracji zmieniła się; wymagane nowe zlecenie.');
    return a;
  }
  function enqueue(id, b, u) {
    admin(u); const a = current(id), from = db.prepare('SELECT data_version FROM plugin_data_versions WHERE plugin_id=?').get(id)?.data_version || 0;
    if (b.revision !== a.p.version || b.confirm_version !== a.m.dataVersion) fail(409, 'Potwierdź aktualną wersję migracji.');
    if (from >= a.m.dataVersion) fail(409, 'Dane mają już wymaganą wersję.');
    const key = text(b.request_key, 'Identyfikator migracji', 8, 200), payload = JSON.stringify({ from, to: a.m.dataVersion, plugin_version: a.p.plugin_version, manifest_revision: a.p.version, connector_version: a.r.version });
    return tx(() => {
      const old = db.prepare('SELECT * FROM plugin_migrations WHERE plugin_id=? AND request_key=?').get(id, key);
      if (old) { if (old.payload !== payload || old.user_id !== u.id) fail(409, 'Identyfikator należy do innej migracji.'); return { id: old.id, duplicate: true }; }
      if (db.prepare("SELECT 1 FROM plugin_migrations WHERE plugin_id=? AND state IN ('queued','sent')").get(id)) fail(409, 'Migracja już oczekuje lub jest wykonywana.');
      const job = Number(db.prepare('INSERT INTO plugin_migrations(plugin_id,user_id,request_key,payload,run_at,created_at) VALUES(?,?,?,?,?,?)').run(id, u.id, key, payload, new Date(clock()).toISOString(), now()).lastInsertRowid);
      projects.audit(null, u, 'plugin.migration_queued', { plugin_id: id, migration_id: job, from, to: a.m.dataVersion }); return { id: job };
    });
  }
  function list(id, u) { admin(u); return db.prepare('SELECT * FROM plugin_migrations WHERE plugin_id=? ORDER BY id DESC LIMIT 100').all(id).map(j => ({ ...j, payload: JSON.parse(j.payload), result: JSON.parse(j.result) })); }
  async function flush() {
    for (const j of db.prepare("SELECT * FROM plugin_migrations WHERE state='queued' AND run_at<=? ORDER BY id LIMIT 10").all(new Date(clock()).toISOString())) {
      try {
        const a = bound(j), source = JSON.parse(j.payload), instance = db.prepare('SELECT instance_id FROM plugin_runtime_identity WHERE id=1').get().instance_id;
        const body = JSON.stringify({ instance_id: instance, api_version: 1, service_desk_version: VERSION, migration_id: j.id, idempotency_key: j.request_key, action: 'platform.migrate', from_data_version: source.from, to_data_version: source.to, plugin_version: source.plugin_version, actor_id: j.user_id });
        await send(a.c.url, body, { 'X-Desk-Plugin-Signature': createHmac('sha256', secrets.open(a.r.secret)).update(body).digest('hex'), 'Idempotency-Key': j.request_key, 'X-Desk-API-Version': '1', 'X-Desk-Instance-ID': instance }, a.c.allow_private);
        bound(j);
        db.prepare("UPDATE plugin_migrations SET state='sent',attempts=attempts+1,result=?,version=version+1 WHERE id=? AND state='queued'").run(JSON.stringify({ delivered: true }), j.id);
      } catch (err) {
        const attempts = j.attempts + 1;
        db.prepare('UPDATE plugin_migrations SET state=?,attempts=?,run_at=?,result=?,version=version+1 WHERE id=? AND state=\'queued\'').run([403,404,409].includes(err.status) ? 'paused' : attempts >= 5 ? 'failed' : 'queued', attempts, new Date(clock() + 2 ** attempts * 60000).toISOString(), JSON.stringify({ error: err.status ? err.message : 'Serwis nie potwierdził odbioru migracji.' }), j.id);
      }
    }
  }
  function result(id, jobId, token, b) {
    const a = current(id), actual = createHash('sha256').update(String(token || '').replace(/^Bearer /, '')).digest(), expected = createHash('sha256').update(secrets.open(a.r.secret)).digest();
    if (!timingSafeEqual(actual, expected)) fail(401, 'Nieprawidłowy token pluginu.');
    const j = db.prepare('SELECT * FROM plugin_migrations WHERE id=? AND plugin_id=?').get(integer(jobId, 'Migracja'), id); if (!j) fail(404, 'Migracja niedostępna.');
    if (!['completed','failed'].includes(b.status)) fail(400, 'Nieprawidłowy wynik migracji.');
    const payload = JSON.parse(j.payload), encoded = JSON.stringify({ status: b.status, data_version: b.data_version, message: text(b.message || '', 'Wynik migracji', 0, 2000) });
    if (j.state === 'completed' || j.state === 'failed') { if (j.result === encoded) return { ok: true, duplicate: true }; fail(409, 'Wynik został już zapisany.'); }
    if (j.state !== 'sent' || b.data_version !== payload.to) fail(409, 'Potwierdź odbiór i wymaganą wersję danych.');
    bound(j);
    return tx(() => {
      db.prepare('UPDATE plugin_migrations SET state=?,result=?,version=version+1 WHERE id=?').run(b.status, encoded, j.id);
      if (b.status === 'completed') db.prepare('INSERT INTO plugin_data_versions(plugin_id,data_version) VALUES(?,?) ON CONFLICT(plugin_id) DO UPDATE SET data_version=excluded.data_version').run(id, payload.to);
      projects.audit(null, db.prepare('SELECT * FROM users WHERE id=?').get(j.user_id), 'plugin.migration_result', { plugin_id: id, migration_id: j.id, status: b.status, data_version: payload.to }); return { ok: true };
    });
  }
  function cancel(id, b, u) { admin(u); const j = db.prepare('SELECT * FROM plugin_migrations WHERE id=?').get(integer(id, 'Migracja')); if (!j || j.version !== b.version || ['completed','cancelled'].includes(j.state)) fail(409, 'Migracja zmieniła się.'); db.prepare("UPDATE plugin_migrations SET state='cancelled',version=version+1 WHERE id=?").run(j.id); projects.audit(null, u, 'plugin.migration_cancelled', { migration_id: j.id, plugin_id: j.plugin_id }); return { ok: true }; }
  return { enqueue, list, flush, result, cancel };
}
