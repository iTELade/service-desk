import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { setup } from './v6-fixture.mjs';
import { migrateV8 } from '../lib/migration-v8.mjs';
import { migrateV9 } from '../lib/migration-v9.mjs';
import { migrateV10 } from '../lib/migration-v10.mjs';
import { migrateV11 } from '../lib/migration-v11.mjs';
import { createKnowledge, knowledgeKeywords } from '../lib/knowledge.mjs';
import { knowledgeRequest } from '../lib/knowledge-http.mjs';
const token = 'kb_' + 'a'.repeat(43),
  error = (status) => (e) => e.status === status;
function fixture(request) {
  const f = setup();
  migrateV8(f.db);
  migrateV9(f.db);
  migrateV10(f.db);
  migrateV11(f.db);
  const calls = [],
    page = {
      id: 'pg_vpn',
      title: 'VPN recovery',
      summary: 'Recover remote access',
      spaceId: 'spc_it',
      space: { id: 'spc_it' },
      status: 'published',
      visibility: 'public',
      content: '# VPN\nUse approved recovery. <script>unsafe()</script>',
    };
  let missing = false;
  const send = async (url, options) => {
    calls.push({ url, options });
    if (request) return request(url, options);
    if (url.includes('/health'))
      return { ok: true, service: 'iTELade Knowledge Base', schemaVersion: 1, version: '0.5.1' };
    if (url.includes('/search'))
      return {
        results: [
          { ...page, score: 9 },
          { ...page, id: 'pg_other', spaceId: 'spc_other' },
        ],
      };
    if (url.includes('__desk_read_scope_probe__') || missing || !url.includes('pg_vpn'))
      throw Object.assign(new Error('Unavailable'), { status: 502, upstreamStatus: 404 });
    return url.includes('/api/v1/') ? page : { page };
  };
  const k = createKnowledge(f.db, f.projects, { dataDir: f.dataDir, knowledgeRequest: send });
  const configure = (extra = {}) =>
    k.save(
      {
        version: k.status(f.admin).version,
        enabled: true,
        base_url: 'https://kb.example.test',
        token,
        ...extra,
      },
      f.admin,
    );
  return { ...f, k, calls, page, configure, hide: () => (missing = true) };
}
test('KB schema 10→11 preserves tickets, stores references only and rolls back failed migration', () => {
  const f = setup();
  try {
    migrateV8(f.db);
    migrateV9(f.db);
    migrateV10(f.db);
    const p = f.project('KB'),
      t = f.ticket(p);
    migrateV11(f.db);
    migrateV11(f.db);
    assert.equal(f.db.prepare('PRAGMA user_version').get().user_version, 11);
    assert.equal(f.desk.ticket(t.id).title, t.title);
    assert.equal(
      f.db
        .prepare(
          "SELECT count(*) n FROM sqlite_master WHERE name IN ('knowledge_articles','knowledge_versions')",
        )
        .get().n,
      0,
    );
    assert.equal(f.db.prepare('PRAGMA foreign_key_check').all().length, 0);
  } finally {
    f.close();
  }
  const broken = setup();
  try {
    migrateV8(broken.db);
    migrateV9(broken.db);
    migrateV10(broken.db);
    broken.db.exec('CREATE TABLE ticket_knowledge_links(id INTEGER)');
    assert.throws(() => migrateV11(broken.db));
    assert.equal(broken.db.prepare('PRAGMA user_version').get().user_version, 10);
  } finally {
    broken.close();
  }
});
test('KB configuration encrypts credentials, redacts responses/audits, preserves blank token and clears it on provider change', () => {
  const f = fixture();
  try {
    const c = f.configure();
    assert.equal(c.has_token, true);
    assert.ok(!JSON.stringify(c).includes(token));
    assert.ok(!f.db.prepare('SELECT config FROM knowledge_settings').get().config.includes(token));
    assert.ok(!JSON.stringify(f.db.prepare('SELECT * FROM audit_events').all()).includes(token));
    assert.equal(f.k.save({ ...c, token: '' }, f.admin).has_token, true);
    assert.throws(() => f.k.save({ ...c, token: '' }, f.admin), error(409));
    const next = f.k.status(f.admin);
    assert.equal(
      f.k.save({ ...next, base_url: 'https://another.example.test', token: '' }, f.admin).has_token,
      false,
    );
    assert.throws(() => f.k.status(f.user('client@x.test')), error(403));
  } finally {
    f.close();
  }
});
test('automatic KB suggestions use title and description, enforce project/space scopes and reject customers', async () => {
  const f = fixture();
  try {
    const p = f.project('KS'),
      q = f.project('NO'),
      u = f.user('customer@x.test'),
      t = f.ticket(p, u);
    f.db
      .prepare('UPDATE tickets SET title=?,description=? WHERE id=?')
      .run('Remote access', 'VPN connection failure', t.id);
    f.configure({ project_ids: [p.id], space_ids: ['spc_it'] });
    const r = await f.k.search({ ticket_key: t.key, suggest: true }, f.admin);
    assert.equal(r.results.length, 1);
    assert.ok(decodeURIComponent(f.calls[0].url).includes('vpn'));
    assert.ok(decodeURIComponent(f.calls[0].url).includes('remote'));
    assert.equal(r.results[0].content, undefined);
    assert.deepEqual(await f.k.search({ project_id: q.id, q: 'VPN' }, f.admin), {
      enabled: false,
      results: [],
    });
    await assert.rejects(f.k.search({ ticket_key: t.key, suggest: true }, u), error(404));
    const outside = f.user('outside@x.test', 'agent');
    await assert.rejects(f.k.search({ ticket_key: t.key, suggest: true }, outside), error(404));
    f.configure({ auto_suggest: false });
    assert.equal((await f.k.search({ ticket_key: t.key, suggest: true }, f.admin)).automatic, false);
    assert.ok(
      knowledgeKeywords('VPN issue', 'Please contact person@example.test https://host/path').startsWith(
        'vpn',
      ),
    );
    assert.ok(!knowledgeKeywords('VPN', 'person@example.test https://host/path').includes('example'));
  } finally {
    f.close();
  }
});
test('KB public insertion checks anonymous page access; HTML is not forwarded', async () => {
  const f = fixture();
  try {
    const p = f.project('PU');
    f.configure();
    const r = await f.k.detail({ project_id: p.id, public_only: true }, f.admin, 'pg_vpn');
    assert.equal(r.public, true);
    assert.equal(f.calls.at(-1).options.token, '');
    assert.equal(r.html, undefined);
    f.page.visibility = 'internal';
    await assert.rejects(f.k.detail({ project_id: p.id, public_only: true }, f.admin, 'pg_vpn'), error(404));
    assert.equal((await f.k.detail({ project_id: p.id }, f.admin, 'pg_vpn')).visibility, 'internal');
    assert.equal(f.calls.at(-1).options.token, token);
  } finally {
    f.close();
  }
});
test('KB reference linking is scoped, deduplicated, version-checked and revalidates remote visibility', async () => {
  const f = fixture();
  try {
    const p = f.project('LI'),
      t = f.ticket(p),
      client = f.user('client-links@x.test');
    f.configure();
    await f.k.link(t.key, { version: t.version, page_id: 'pg_vpn' }, f.admin);
    await f.k.link(t.key, { version: t.version, page_id: 'pg_vpn' }, f.admin);
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM ticket_knowledge_links').get().n, 1);
    const l = await f.k.links(t.key, f.admin);
    assert.equal(l.links[0].article.content, undefined);
    assert.equal(l.links[0].article.title, 'VPN recovery');
    await assert.rejects(f.k.links(t.key, client), error(404));
    await assert.rejects(f.k.link(t.key, { version: t.version - 1, page_id: 'pg_vpn' }, f.admin), error(409));
    f.hide();
    const missing = await f.k.links(t.key, f.admin);
    assert.deepEqual(missing.links, [{ id: l.links[0].id, unavailable: true }]);
    f.k.unlink(t.key, { version: t.version, link_id: l.links[0].id }, f.admin);
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM ticket_knowledge_links').get().n, 0);
    f.db.prepare('UPDATE projects SET archived=1 WHERE id=?').run(p.id);
    await assert.rejects(f.k.link(t.key, { version: t.version, page_id: 'pg_vpn' }, f.admin), error(409));
    f.db
      .prepare(
        'INSERT INTO ticket_knowledge_links(ticket_id,source_url,page_id,created_by,created_at) VALUES(?,?,?,?,?)',
      )
      .run(t.id, 'https://kb.example.test', 'pg_vpn', f.admin.id, new Date().toISOString());
    f.ext.lifecycle.remove(t.id, { version: t.version, confirm_key: t.key }, f.admin);
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM ticket_knowledge_links').get().n, 0);
  } finally {
    f.close();
  }
});
test('KB health checks all three scopes and detects provider/authentication failures', async () => {
  const f = fixture();
  try {
    f.configure();
    assert.equal((await f.k.testConnection(f.admin)).ok, true);
    assert.equal(f.calls.length, 3);
    assert.equal(f.k.status(f.admin).last_health.ok, true);
  } finally {
    f.close();
  }
  const bad = fixture(async () => {
    throw Object.assign(new Error('Token rejected'), { status: 502, upstreamStatus: 401 });
  });
  try {
    bad.configure();
    assert.equal((await bad.k.testConnection(bad.admin)).ok, false);
  } finally {
    bad.close();
  }
});
test('KB async reads recheck membership and configuration before exposing content', async () => {
  let f, agent, project;
  f = fixture(async () => {
    f.db.prepare('DELETE FROM project_members WHERE project_id=? AND user_id=?').run(project.id, agent.id);
    return { results: [f.page] };
  });
  try {
    project = f.project('RA');
    agent = f.user('reader@x.test', 'agent');
    f.db
      .prepare("INSERT INTO project_members(project_id,user_id,role) VALUES(?,?,'agent')")
      .run(project.id, agent.id);
    f.configure();
    await assert.rejects(f.k.search({ project_id: project.id, q: 'VPN' }, agent), error(404));
  } finally {
    f.close();
  }
});
test('KB HTTP transport pins vetted DNS, rejects private/loopback/mixed DNS and redirects', async () => {
  for (const addresses of [
    ['127.0.0.1'],
    ['169.254.169.254'],
    ['10.0.0.2'],
    ['::ffff:7f00:1'],
    ['8.8.8.8', '127.0.0.1'],
  ])
    await assert.rejects(
      knowledgeRequest(
        'https://kb.example.test/api/v1/health',
        {},
        { lookup: async () => addresses.map((address) => ({ address, family: 4 })) },
      ),
      error(400),
    );
  let pinned, headers;
  const request = (url, opts, done) => {
    headers = opts.headers;
    opts.lookup('ignored', { all: false }, (_, address) => (pinned = address));
    const req = new EventEmitter();
    req.end = () => {
      const res = new EventEmitter();
      res.statusCode = 200;
      res.headers = { 'content-type': 'application/json' };
      done(res);
      res.emit('data', Buffer.from('{"ok":true}'));
      res.emit('end');
      req.emit('close');
    };
    req.destroy = (e) => {
      req.emit('error', e);
      req.emit('close');
    };
    return req;
  };
  assert.deepEqual(
    await knowledgeRequest(
      'https://kb.example.test/api/v1/health',
      { token },
      { lookup: async () => [{ address: '8.8.8.8', family: 4 }], request },
    ),
    { ok: true },
  );
  assert.equal(pinned, '8.8.8.8');
  assert.equal(headers.Authorization, 'Bearer ' + token);
  const redirect = (url, opts, done) => {
    const req = new EventEmitter();
    req.end = () => {
      done({ statusCode: 302, resume() {} });
      req.emit('close');
    };
    return req;
  };
  await assert.rejects(
    knowledgeRequest(
      'https://kb.example.test/api/v1/health',
      {},
      { lookup: async () => [{ address: '8.8.8.8', family: 4 }], request: redirect },
    ),
    (e) => e.upstreamStatus === 302,
  );
  await assert.rejects(
    knowledgeRequest(
      'http://kb.example.test/api/v1/health',
      { allowPrivate: true },
      { lookup: async () => [{ address: '8.8.8.8', family: 4 }] },
    ),
    error(400),
  );
});
