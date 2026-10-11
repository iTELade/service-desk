import { fail, text, boolean, integer, now, txFor } from './core.mjs';
import { secretStore } from './secrets.mjs';
import { knowledgeRequest } from './knowledge-http.mjs';

const stableId = (value) => {
  const id = text(value, 'ID artykułu lub przestrzeni', 1, 120);
  if (!/^[A-Za-z0-9_-]+$/.test(id)) fail(400, 'Nieprawidłowy identyfikator bazy wiedzy.');
  return id;
};
const stop = new Set(
  'a i o w z ze do na od po nie jest sie się to ten ta the and for with issue problem please prosze proszę zgłoszenie zgloszenie this that have has jak aby ale przy przez can cannot using user użytkownik'.split(
    ' ',
  ),
);
export function knowledgeKeywords(title, body) {
  const terms = new Map();
  for (const [value, weight] of [
    [title, 5],
    [body, 1],
  ]) {
    const clean = String(value || '').replace(/https?:\/\/\S+|\S+@\S+/g, ' ');
    for (const word of clean.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}_-]{1,31}/gu) || []) {
      const key = word.normalize('NFKD').replace(/\p{M}/gu, '').replaceAll('ł', 'l');
      if (stop.has(key) || /^\d+$/.test(key) || word.length < 3) continue;
      const old = terms.get(key) || { word, weight: 0 };
      old.weight += weight;
      terms.set(key, old);
    }
  }
  return [...terms.values()]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 16)
    .map((t) => t.word)
    .join(' ')
    .slice(0, 240);
}

export function createKnowledge(db, projects, options = {}) {
  const tx = txFor(db),
    request = options.knowledgeRequest || knowledgeRequest;
  const row = () => db.prepare('SELECT * FROM knowledge_settings WHERE id=1').get();
  const config = () => {
    const r = row();
    return {
      enabled: false,
      base_url: '',
      public_url: '',
      allow_private: false,
      auto_suggest: true,
      project_ids: [],
      space_ids: [],
      ...JSON.parse(r.config),
      version: r.version,
    };
  };
  const secrets = () => {
    if (!options.dataDir) fail(400, 'Brak magazynu sekretów integracji.');
    return secretStore(options.dataDir);
  };
  const fresh = (u) => {
    const v = db.prepare('SELECT * FROM users WHERE id=?').get(u.id);
    if (!v?.active || !v.directory_active || v.registration_state !== 'active') fail(401, 'Sesja wygasła.');
    return v;
  };
  function status(u) {
    if (fresh(u).role !== 'admin') fail(403, 'Integrację konfiguruje administrator.');
    const c = config();
    return {
      enabled: c.enabled,
      base_url: c.base_url,
      public_url: c.public_url,
      allow_private: c.allow_private,
      auto_suggest: c.auto_suggest,
      project_ids: c.project_ids,
      space_ids: c.space_ids,
      has_token: Boolean(c.token),
      last_health: c.last_health || null,
      version: c.version,
      contract_version: 1,
    };
  }
  function save(b, u) {
    const old = status(u),
      c = config();
    if (old.version !== b.version) fail(409, 'Konfiguracja zmieniła się.');
    const enabled = boolean(b.enabled ?? false, 'Aktywna'),
      allow_private = boolean(b.allow_private ?? old.allow_private, 'Sieć prywatna');
    let base_url = text(b.base_url ?? old.base_url, 'Adres bazy wiedzy', enabled ? 1 : 0, 500);
    if (base_url) {
      let url;
      try {
        url = new URL(base_url);
      } catch {
        fail(400, 'Nieprawidłowy URL.');
      }
      if (
        !(url.protocol === 'https:' || (url.protocol === 'http:' && allow_private)) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      )
        fail(400, 'Podaj HTTPS bez danych logowania, zapytania i fragmentu. HTTP wymaga sieci prywatnej.');
      base_url = url.href.replace(/\/+$/, '');
    }
    let public_url = text(b.public_url ?? old.public_url, 'Adres w odnośnikach', 0, 500);
    if (public_url) {
      let url;
      try {
        url = new URL(public_url);
      } catch {
        fail(400, 'Nieprawidłowy adres w odnośnikach.');
      }
      if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
        fail(400, 'Adres w odnośnikach wymaga HTTPS bez danych logowania, zapytania i fragmentu.');
      public_url = url.href.replace(/\/+$/, '');
    }
    const project_ids = b.project_ids ?? old.project_ids,
      space_ids = b.space_ids ?? old.space_ids;
    if (
      !Array.isArray(project_ids) ||
      project_ids.length > 200 ||
      !Array.isArray(space_ids) ||
      space_ids.length > 100
    )
      fail(400, 'Nieprawidłowy zakres integracji.');
    const ids = [...new Set(project_ids.map((id) => integer(id, 'Projekt')))];
    for (const id of ids) {
      const p = projects.project(id);
      if (!p || p.module_type === 'assets') fail(400, 'Wybierz projekt zgłoszeń.');
    }
    const spaces = [...new Set(space_ids.map(stableId))],
      raw = b.token === undefined ? '' : text(b.token, 'Token API', 0, 256);
    let token = boolean(b.clear_token ?? false, 'Usuń token') ? '' : c.token || '';
    if (base_url !== c.base_url && !raw) token = '';
    if (raw) {
      if (!/^kb_[A-Za-z0-9_-]{20,200}$/.test(raw)) fail(400, 'Podaj token API wygenerowany w bazie wiedzy.');
      token = secrets().seal(raw);
    }
    const next = {
      enabled,
      base_url,
      public_url,
      allow_private,
      auto_suggest: boolean(b.auto_suggest ?? old.auto_suggest, 'Podpowiedzi'),
      project_ids: ids,
      space_ids: spaces,
      token,
      last_health: null,
    };
    return tx(() => {
      const r = db
        .prepare('UPDATE knowledge_settings SET config=?,version=version+1 WHERE id=1 AND version=?')
        .run(JSON.stringify(next), b.version);
      if (r.changes !== 1) fail(409, 'Konfiguracja zmieniła się.');
      projects.audit(null, u, 'knowledge.configured', {
        enabled,
        base_url,
        project_ids: ids,
        space_ids: spaces,
        token_changed: Boolean(raw || b.clear_token || base_url !== c.base_url),
      });
      return status(u);
    });
  }
  function scope(id, u) {
    u = fresh(u);
    const p = projects.requireProject(integer(Number(id), 'Projekt'), u),
      c = config();
    if (!c.enabled || !c.base_url || (c.project_ids.length && !c.project_ids.includes(p.id)))
      return { p, c, u, enabled: false };
    return { p, c, u, enabled: true };
  }
  const endpoint = (c, path) => new URL(path, c.base_url + '/').href;
  async function remote(c, path, publicOnly = false) {
    if (!publicOnly && !c.token)
      fail(400, 'Zapisz token API bazy wiedzy z uprawnieniami search, read i health.');
    return request(endpoint(c, path), {
      token: publicOnly ? '' : secrets().open(c.token),
      allowPrivate: c.allow_private,
    });
  }
  function still(s) {
    const current = scope(s.p.id, s.u);
    if (!current.enabled || current.c.version !== s.c.version)
      fail(409, 'Konfiguracja integracji zmieniła się. Spróbuj ponownie.');
    return current;
  }
  function pageShape(p, c, id, spaceId) {
    if (!p || p.status !== 'published' || p.archived || !p.title || (!p.id && !id))
      fail(502, 'Nieprawidłowy artykuł bazy wiedzy.');
    const sid = stableId(spaceId || p.spaceId || p.space?.id),
      pid = stableId(p.id || id);
    if (c.space_ids.length && !c.space_ids.includes(sid)) fail(404, 'Artykuł jest poza zakresem integracji.');
    return {
      id: pid,
      title: String(p.title).slice(0, 180),
      summary: String(p.summary || '').slice(0, 500),
      space_id: sid,
      language: String(p.language || '').slice(0, 12),
      visibility: String(p.visibility || 'internal'),
      updated_at: String(p.updatedAt || ''),
      labels: Array.isArray(p.labels) ? p.labels.slice(0, 30).map((v) => String(v).slice(0, 80)) : [],
      url: (c.public_url || c.base_url) + '/#/page/' + encodeURIComponent(pid),
    };
  }
  async function page(s, id, publicOnly = false) {
    id = stableId(id);
    const data = await remote(
        s.c,
        (publicOnly ? 'api/pages/' : 'api/v1/pages/') + encodeURIComponent(id),
        publicOnly,
      ),
      p = publicOnly ? data.page : data;
    const shaped = pageShape(p, s.c, id);
    if (shaped.id !== id || (publicOnly && shaped.visibility !== 'public'))
      fail(404, 'Artykuł nie jest dostępny publicznie.');
    still(s);
    return { ...shaped, content: String(p.content || '').slice(0, 1000000), public: publicOnly };
  }
  async function testConnection(u) {
    status(u);
    const c = config();
    if (!c.enabled || !c.base_url) fail(400, 'Włącz i zapisz integrację przed testem.');
    let result;
    try {
      const health = await remote(c, 'api/v1/health');
      if (
        health.ok !== true ||
        health.service !== 'iTELade Knowledge Base' ||
        !Number.isInteger(health.schemaVersion)
      )
        fail(502, 'Adres nie wskazuje na service-desk-knowledge-base.');
      await remote(c, 'api/v1/search?q=connection-check');
      try {
        await remote(c, 'api/v1/pages/__desk_read_scope_probe__');
      } catch (err) {
        if (err.upstreamStatus !== 404) throw err;
      }
      result = {
        ok: true,
        message: 'Połączenie i uprawnienia health/search/read działają.',
        remote_version: String(health.version || '').slice(0, 30),
        checked_at: now(),
      };
    } catch (err) {
      result = {
        ok: false,
        message: err.status ? err.message : 'Nie udało się połączyć z bazą wiedzy.',
        checked_at: now(),
      };
    }
    const current = config();
    if (current.version !== c.version) fail(409, 'Konfiguracja zmieniła się w trakcie testu.');
    fresh(u);
    const { version, ...saved } = current;
    db.prepare('UPDATE knowledge_settings SET config=? WHERE id=1 AND version=?').run(
      JSON.stringify({ ...saved, last_health: result }),
      version,
    );
    return result;
  }
  function ticket(key, u, write = false) {
    u = fresh(u);
    const t = db
        .prepare(
          'SELECT * FROM tickets WHERE key=? COLLATE NOCASE OR id=(SELECT ticket_id FROM ticket_aliases WHERE key=? COLLATE NOCASE)',
        )
        .get(text(key, 'Zgłoszenie', 3, 30), key),
      p = t && projects.project(t.project_id);
    if (!t || !projects.canRead(u, p, t) || !projects.canWork(u, p)) fail(404, 'Zgłoszenie niedostępne.');
    if (write && (p.archived || t.archived_at || t.status === 'closed'))
      fail(409, 'Zgłoszenie nie przyjmuje zmian.');
    return t;
  }
  async function search(b, u) {
    let t;
    if (b.ticket_key) t = ticket(b.ticket_key, u);
    const s = scope(t?.project_id ?? b.project_id, u);
    if (!s.enabled) return { enabled: false, results: [] };
    if (b.suggest && !s.c.auto_suggest) return { enabled: true, results: [], automatic: false };
    const q =
      b.suggest && t ? knowledgeKeywords(t.title, t.description) : text(b.q ?? '', 'Szukaj artykułu', 2, 240);
    if (q.length < 2) return { enabled: true, results: [], automatic: Boolean(b.suggest) };
    const data = await remote(s.c, 'api/v1/search?q=' + encodeURIComponent(q));
    if (!Array.isArray(data.results)) fail(502, 'Nieprawidłowa odpowiedź wyszukiwania bazy wiedzy.');
    const results = [];
    for (const p of data.results.slice(0, 50)) {
      try {
        const shaped = pageShape(p, s.c);
        results.push({ ...shaped, score: Number.isFinite(p.score) ? p.score : 0 });
      } catch (err) {
        if (err.status !== 404) throw err;
      }
    }
    still(s);
    return {
      enabled: true,
      results: results.slice(0, 5),
      automatic: Boolean(b.suggest),
      source: 'service-desk-knowledge-base',
    };
  }
  async function detail(b, u, id) {
    const s = scope(b.project_id, u);
    if (!s.enabled) fail(404, 'Integracja jest wyłączona.');
    const publicOnly = boolean(b.public_only ?? false, 'Publiczny artykuł');
    if (publicOnly && !s.c.public_url && !s.c.base_url.startsWith('https:'))
      fail(400, 'Skonfiguruj publiczny adres HTTPS bazy wiedzy do odnośników dla klientów.');
    return page(s, id, publicOnly);
  }
  async function links(key, u) {
    const t = ticket(key, u),
      s = scope(t.project_id, u);
    if (!s.enabled) return { enabled: false, links: [] };
    const rows = db
      .prepare(
        'SELECT id,page_id,source_url FROM ticket_knowledge_links WHERE ticket_id=? ORDER BY id LIMIT 10',
      )
      .all(t.id);
    const resolved = await Promise.all(
      rows.map(async (r) => {
        if (r.source_url !== s.c.base_url) return { id: r.id, unavailable: true };
        try {
          return { id: r.id, article: await page(s, r.page_id) };
        } catch (err) {
          if (err.status === 409 || err.status === 401) throw err;
          return { id: r.id, unavailable: true };
        }
      }),
    );
    still(s);
    return {
      enabled: true,
      links: resolved.map((r) =>
        r.article ? { ...r, article: (({ content, ...meta }) => meta)(r.article) } : r,
      ),
    };
  }
  async function link(key, b, u) {
    const t = ticket(key, u, true),
      s = scope(t.project_id, u);
    if (!s.enabled) fail(404, 'Integracja jest wyłączona.');
    if (t.version !== b.version) fail(409, 'Zgłoszenie zmieniło się.');
    const article = await page(s, b.page_id);
    still(s);
    return tx(() => {
      const current = ticket(key, u, true);
      if (current.version !== b.version) fail(409, 'Zgłoszenie zmieniło się.');
      if (
        db.prepare('SELECT COUNT(*) n FROM ticket_knowledge_links WHERE ticket_id=?').get(t.id).n >= 10 &&
        !db
          .prepare('SELECT id FROM ticket_knowledge_links WHERE ticket_id=? AND source_url=? AND page_id=?')
          .get(t.id, s.c.base_url, article.id)
      )
        fail(400, 'Maksymalnie 10 artykułów w zgłoszeniu.');
      db.prepare(
        'INSERT OR IGNORE INTO ticket_knowledge_links(ticket_id,source_url,page_id,created_by,created_at) VALUES(?,?,?,?,?)',
      ).run(t.id, s.c.base_url, article.id, u.id, now());
      projects.audit(t.project_id, u, 'ticket.knowledge.linked', { ticket_id: t.id, page_id: article.id });
      return { ok: true };
    });
  }
  function unlink(key, b, u) {
    const t = ticket(key, u, true);
    if (t.version !== b.version) fail(409, 'Zgłoszenie zmieniło się.');
    const id = integer(b.link_id, 'Powiązanie');
    return tx(() => {
      db.prepare('DELETE FROM ticket_knowledge_links WHERE id=? AND ticket_id=?').run(id, t.id);
      projects.audit(t.project_id, u, 'ticket.knowledge.unlinked', { ticket_id: t.id, link_id: id });
      return { ok: true };
    });
  }
  async function handle(method, parts, u, q, b) {
    if (!parts.length)
      return method === 'GET'
        ? status(u)
        : method === 'POST'
          ? save(b, u)
          : fail(405, 'Niedozwolona metoda.');
    const [resource, id, action] = parts;
    if (resource === 'test' && method === 'POST' && !id) return testConnection(u);
    if (resource === 'search' && method === 'POST' && !id) return search(b, u);
    if (resource === 'pages' && method === 'POST' && id && !action) return detail(b, u, id);
    if (resource === 'tickets' && id && action === 'links')
      return method === 'GET'
        ? links(id, u)
        : method === 'POST'
          ? link(id, b, u)
          : method === 'DELETE'
            ? unlink(id, b, u)
            : fail(405, 'Niedozwolona metoda.');
    fail(404, 'Nieznana operacja bazy wiedzy.');
  }
  function available(id, u) {
    const p = projects.project(id),
      c = config();
    return Boolean(
      p &&
        projects.canWork(u, p) &&
        c.enabled &&
        c.base_url &&
        c.token &&
        (!c.project_ids.length || c.project_ids.includes(p.id)),
    );
  }
  return { status, save, testConnection, search, detail, links, link, unlink, handle, available };
}
