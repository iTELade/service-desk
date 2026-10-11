import { randomBytes } from 'node:crypto';
import { fail, text, integer, choice, boolean, now, txFor } from './core.mjs';
import { hash, fingerprint } from './workspace-v21.mjs';
export function createOperations(db, { projects, workspace }) {
  const tx = txFor(db),
    visible = (u) =>
      projects
        .list(u)
        .filter((p) => p.can_work)
        .map((p) => p.id);
  const pscope = (u) => visible(u).join(',') || 'NULL';
  const service = (id, u, manage = false) => {
    const s = db.prepare('SELECT * FROM managed_services WHERE id=?').get(integer(Number(id), 'Usługa'));
    if (!s) fail(404, 'Usługa niedostępna.');
    const p = projects.requireProject(s.project_id, u, manage);
    return { ...s, can_manage: projects.canManage(u, p) };
  };
  const item = (id, u, manage = false) => {
    const c = db
      .prepare('SELECT * FROM operational_cases WHERE id=?')
      .get(integer(Number(id), 'Sprawa operacyjna'));
    if (!c) fail(404, 'Sprawa niedostępna.');
    projects.requireProject(c.project_id, u, manage);
    return c;
  };
  const writable = (p) => {
    if (p.archived) fail(409, 'Projekt w archiwum.');
  };
  const event = (id, u, body, publicVisible = false) =>
    db
      .prepare('INSERT INTO case_events(case_id,actor_id,body,public,created_at) VALUES(?,?,?,?,?)')
      .run(id, u?.id ?? null, body, Number(publicVisible), now());
  function services(u, project) {
    if (project) projects.requireProject(Number(project), u);
    return db
      .prepare(
        `SELECT s.*,u.name owner_name FROM managed_services s LEFT JOIN users u ON u.id=s.owner_id WHERE s.project_id IN (${pscope(u)})${project ? ' AND s.project_id=?' : ''} ORDER BY s.name LIMIT 500`,
      )
      .all(...(project ? [Number(project)] : []));
  }
  function saveService(id, b, u) {
    const old = id ? service(id, u, true) : null,
      p = projects.requireProject(old?.project_id ?? integer(b.project_id, 'Projekt'), u, true);
    writable(p);
    if (old && old.version !== b.version) fail(409, 'Usługa zmieniła się.');
    const owner = workspace.activeOwner(b.owner_id ?? null, p),
      values = [
        text(b.name, 'Nazwa', 2, 120),
        text(b.description || '', 'Opis', 0, 4000),
        owner,
        choice(b.state || 'operational', ['operational', 'degraded', 'outage', 'maintenance'], 'stan'),
        now(),
      ];
    if (old)
      db.prepare(
        'UPDATE managed_services SET name=?,description=?,owner_id=?,state=?,updated_at=?,version=version+1 WHERE id=?',
      ).run(...values, id);
    else
      id = Number(
        db
          .prepare(
            'INSERT INTO managed_services(name,description,owner_id,state,updated_at,project_id,created_at) VALUES(?,?,?,?,?,?,?)',
          )
          .run(...values, p.id, now()).lastInsertRowid,
      );
    projects.audit(p.id, u, 'service.saved', { service_id: id });
    return service(id, u);
  }
  function graph(id, u) {
    service(id, u);
    const ids = new Set(services(u).map((s) => s.id)),
      edges = db
        .prepare('SELECT * FROM service_dependencies')
        .all()
        .filter((x) => ids.has(x.service_id) && ids.has(x.depends_on));
    const impacted = new Set([Number(id)]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const e of edges)
        if (impacted.has(e.depends_on) && !impacted.has(e.service_id)) {
          impacted.add(e.service_id);
          changed = true;
        }
    }
    const deps = new Set([Number(id)]);
    changed = true;
    while (changed) {
      changed = false;
      for (const e of edges)
        if (deps.has(e.service_id) && !deps.has(e.depends_on)) {
          deps.add(e.depends_on);
          changed = true;
        }
    }
    return {
      services: services(u).filter((s) => impacted.has(s.id) || deps.has(s.id)),
      edges: edges.filter(
        (e) =>
          (impacted.has(e.service_id) || deps.has(e.service_id)) &&
          (impacted.has(e.depends_on) || deps.has(e.depends_on)),
      ),
      impacted: [...impacted].filter((x) => x !== Number(id)),
      assets: db
        .prepare(
          'SELECT a.id,a.asset_key,a.name,a.project_id FROM assets a JOIN service_assets sa ON sa.asset_id=a.id WHERE sa.service_id=?',
        )
        .all(id)
        .filter((a) => projects.canWork(u, projects.project(a.project_id))),
    };
  }
  function dependency(id, b, u) {
    const s = service(id, u, true);
    writable(projects.project(s.project_id));
    const target = service(b.depends_on, u);
    if (s.id === target.id) fail(400, 'Usługa nie może zależeć od siebie.');
    if (b.remove)
      db.prepare('DELETE FROM service_dependencies WHERE service_id=? AND depends_on=?').run(s.id, target.id);
    else {
      const visited = new Set([target.id]);
      let expanded = true;
      const all = db.prepare('SELECT * FROM service_dependencies').all();
      while (expanded) {
        expanded = false;
        for (const edge of all)
          if (visited.has(edge.service_id) && !visited.has(edge.depends_on)) {
            visited.add(edge.depends_on);
            expanded = true;
          }
      }
      if (visited.has(s.id)) fail(409, 'Zależność tworzy cykl.');
      db.prepare('INSERT OR IGNORE INTO service_dependencies VALUES(?,?)').run(s.id, target.id);
    }
    projects.audit(s.project_id, u, 'service.dependency', {
      service_id: s.id,
      depends_on: target.id,
      remove: Boolean(b.remove),
    });
    return graph(s.id, u);
  }
  function asset(id, b, u) {
    const s = service(id, u, true);
    writable(projects.project(s.project_id));
    const a = db.prepare('SELECT * FROM assets WHERE id=?').get(integer(b.asset_id, 'Urządzenie'));
    if (!a || !projects.canWork(u, projects.project(a.project_id))) fail(404, 'Urządzenie niedostępne.');
    if (b.remove) db.prepare('DELETE FROM service_assets WHERE service_id=? AND asset_id=?').run(s.id, a.id);
    else db.prepare('INSERT OR IGNORE INTO service_assets VALUES(?,?)').run(s.id, a.id);
    return graph(s.id, u);
  }
  function cases(u, q) {
    const project = q.get('project'),
      kind = q.get('kind');
    if (project) projects.requireProject(Number(project), u);
    if (kind) choice(kind, ['incident', 'problem', 'change'], 'typ');
    return db
      .prepare(
        `SELECT c.*,s.name service_name,u.name owner_name FROM operational_cases c LEFT JOIN managed_services s ON s.id=c.service_id LEFT JOIN users u ON u.id=c.owner_id WHERE c.project_id IN (${pscope(u)})${project ? ' AND c.project_id=?' : ''}${kind ? ' AND c.kind=?' : ''} ORDER BY c.updated_at DESC LIMIT 200`,
      )
      .all(...(project ? [Number(project)] : []), ...(kind ? [kind] : []));
  }
  function detail(id, u) {
    const c = item(id, u);
    return {
      ...c,
      events: db
        .prepare(
          'SELECT e.*,u.name actor_name FROM case_events e LEFT JOIN users u ON u.id=e.actor_id WHERE case_id=? ORDER BY e.id DESC LIMIT 200',
        )
        .all(c.id),
      tickets: db
        .prepare(
          'SELECT t.key,t.title,t.status,t.version,t.project_id FROM tickets t JOIN case_tickets ct ON ct.ticket_id=t.id WHERE ct.case_id=? AND t.deleted_at IS NULL',
        )
        .all(c.id)
        .filter((t) => projects.canWork(u, projects.project(t.project_id))),
      tasks: db
        .prepare(
          'SELECT t.*,u.name owner_name FROM case_tasks t LEFT JOIN users u ON u.id=t.owner_id WHERE case_id=? ORDER BY t.id',
        )
        .all(c.id),
      can_manage: projects.canManage(u, projects.project(c.project_id)),
    };
  }
  function calendar(u, project) {
    const q = new URLSearchParams({ kind: 'change', ...(project ? { project } : {}) }),
      changes = cases(u, q);
    const windows = db
      .prepare(
        `SELECT * FROM change_windows WHERE project_id IN (${pscope(u)})${project ? ' AND project_id=?' : ''} ORDER BY starts_at LIMIT 200`,
      )
      .all(...(project ? [Number(project)] : []));
    return {
      changes,
      windows,
      collisions: changes
        .filter((c) => c.starts_at && c.ends_at && !['closed', 'rejected'].includes(c.state))
        .flatMap((a, i, rows) =>
          rows
            .slice(i + 1)
            .filter(
              (b) =>
                a.service_id &&
                a.service_id === b.service_id &&
                a.starts_at < b.ends_at &&
                a.ends_at > b.starts_at,
            )
            .map((b) => ({ first: a.id, second: b.id, service_id: a.service_id })),
        ),
    };
  }
  const datetime = (v, label) => {
    if (!v) return null;
    const d = new Date(v);
    if (!Number.isFinite(+d)) fail(400, 'Nieprawidłowy termin: ' + label);
    return d.toISOString();
  };
  function saveCase(id, b, u) {
    return tx(() => {
      const old = id ? item(id, u) : null,
        p = projects.requireProject(old?.project_id ?? integer(b.project_id, 'Projekt'), u);
      writable(p);
      if (old && old.version !== b.version) fail(409, 'Sprawa operacyjna zmieniła się.');
      const kind = old?.kind || choice(b.kind, ['incident', 'problem', 'change'], 'typ'),
        status = b.state || old?.state || (kind === 'change' ? 'planned' : 'open'),
        states =
          kind === 'change'
            ? ['planned', 'approved', 'rejected', 'implementing', 'resolved', 'closed']
            : ['open', 'investigating', 'monitoring', 'resolved', 'closed'];
      choice(status, states, 'stan');
      if (kind === 'change' && ['approved', 'rejected'].includes(status) && !projects.canManage(u, p))
        fail(403, 'Decyzję o zmianie podejmuje kierownik.');
      if (old?.state === 'closed' && status !== 'closed') fail(409, 'Zamknięta sprawa pozostaje w historii.');
      if (
        kind === 'change' &&
        status === 'implementing' &&
        old?.state !== 'approved' &&
        old?.state !== 'implementing'
      )
        fail(409, 'Najpierw zatwierdź zmianę.');
      if (kind === 'change' && old && status !== old.state) {
        const allowed = {
          planned: ['approved', 'rejected'],
          approved: ['planned', 'rejected', 'implementing'],
          rejected: ['planned', 'closed'],
          implementing: ['resolved'],
          resolved: ['closed'],
          closed: [],
        };
        if (!allowed[old.state]?.includes(status)) fail(409, 'Niedozwolone przejście zmiany.');
      }
      if (
        kind === 'change' &&
        old?.state === 'approved' &&
        status === 'approved' &&
        Object.keys(b).some((k) => !['version', 'state'].includes(k))
      )
        fail(409, 'Przed edycją zatwierdzonej zmiany wróć do planowania.');
      const data = { ...old, ...b };
      if (data.service_id) {
        const s = service(data.service_id, u);
        if (s.project_id !== p.id) fail(400, 'Wybierz usługę tego projektu.');
      }
      const starts = datetime(data.starts_at, 'początek'),
        ends = datetime(data.ends_at, 'koniec');
      if (Boolean(starts) !== Boolean(ends) || (starts && ends <= starts))
        fail(400, 'Koniec musi być po początku.');
      const rollback = text(data.rollback_plan || '', 'Rollback', 0, 10000);
      if (kind === 'change' && status === 'implementing' && (!rollback || !starts))
        fail(400, 'Wdrożenie wymaga terminów i planu rollbacku.');
      if (
        kind === 'change' &&
        status === 'implementing' &&
        db
          .prepare(
            "SELECT 1 FROM change_windows WHERE project_id=? AND kind='freeze' AND starts_at<? AND ends_at>? LIMIT 1",
          )
          .get(p.id, ends, starts)
      )
        fail(409, 'Termin objęty blokadą zmian.');
      const values = [
        text(data.title, 'Temat', 3, 200),
        text(data.summary || '', 'Opis', 0, 20000),
        status,
        choice(data.severity || 'P2', ['P1', 'P2', 'P3', 'P4'], 'priorytet'),
        workspace.activeOwner(data.owner_id ?? null, p),
        data.service_id ? Number(data.service_id) : null,
        choice(data.risk || 'medium', ['low', 'medium', 'high'], 'ryzyko'),
        starts,
        ends,
        rollback,
        text(data.root_cause || '', 'Przyczyna', 0, 10000),
        text(data.workaround || '', 'Obejście', 0, 10000),
        text(data.postmortem || '', 'Post-mortem', 0, 20000),
        Number(data.known_error === true || data.known_error === 1),
        now(),
      ];
      if (old)
        db.prepare(
          'UPDATE operational_cases SET title=?,summary=?,state=?,severity=?,owner_id=?,service_id=?,risk=?,starts_at=?,ends_at=?,rollback_plan=?,root_cause=?,workaround=?,postmortem=?,known_error=?,updated_at=?,version=version+1 WHERE id=?',
        ).run(...values, id);
      else
        id = Number(
          db
            .prepare(
              'INSERT INTO operational_cases(title,summary,state,severity,owner_id,service_id,risk,starts_at,ends_at,rollback_plan,root_cause,workaround,postmortem,known_error,updated_at,project_id,kind,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
            )
            .run(...values, p.id, kind, now()).lastInsertRowid,
        );
      event(id, u, old ? `Stan: ${old.state} → ${status}. Zapisano szczegóły.` : 'Utworzono ' + kind + '.');
      projects.audit(p.id, u, 'operations.case_saved', { case_id: id, kind, state: status });
      return detail(id, u);
    });
  }
  function link(id, b, u) {
    const c = item(id, u),
      t = workspace.ticket(b.key, u);
    projects.requireProject(t.project_id, u);
    if (t.archived_at || projects.project(t.project_id).archived) fail(409, 'Zgłoszenie w archiwum.');
    writable(projects.project(c.project_id));
    if (b.remove) db.prepare('DELETE FROM case_tickets WHERE case_id=? AND ticket_id=?').run(c.id, t.id);
    else db.prepare('INSERT OR IGNORE INTO case_tickets VALUES(?,?)').run(c.id, t.id);
    event(c.id, u, (b.remove ? 'Odłączono ' : 'Powiązano ') + t.key);
    return detail(c.id, u);
  }
  function communicate(id, b, u) {
    const c = item(id, u),
      p = projects.requireProject(c.project_id, u);
    writable(p);
    return workspace.once(u, b.request_key, { action: 'case-message', id, ...b }, () => {
      const body = text(b.body, 'Komunikat', 1, 20000),
        pub = boolean(b.public ?? false, 'Publiczny');
      const results = [];
      if (pub)
        for (const row of detail(c.id, u).tickets) {
          try {
            const t = workspace.ticket(row.key, u, true);
            workspace.comment(
              t.key,
              { body, internal: false, version: t.version, request_key: b.request_key + ':' + t.id },
              u,
            );
            results.push({ key: t.key, ok: true });
          } catch (e) {
            results.push({ key: row.key, ok: false, error: e.status ? e.message : 'Nie wysłano.' });
          }
        }
      event(c.id, u, body, pub);
      return { ok: true, results };
    });
  }
  function task(id, b, u) {
    const c = item(id, u),
      p = projects.requireProject(c.project_id, u);
    writable(p);
    if (b.id) {
      const old = db
        .prepare('SELECT * FROM case_tasks WHERE id=? AND case_id=?')
        .get(integer(b.id, 'Zadanie'), c.id);
      if (!old) fail(404, 'Zadanie niedostępne.');
      if (old.version !== b.version) fail(409, 'Zadanie zmieniło się.');
      db.prepare('UPDATE case_tasks SET done=?,owner_id=?,version=version+1 WHERE id=?').run(
        Number(boolean(b.done, 'Wykonano')),
        workspace.activeOwner(b.owner_id ?? old.owner_id, p),
        old.id,
      );
    } else
      db.prepare('INSERT INTO case_tasks(case_id,label,owner_id) VALUES(?,?,?)').run(
        c.id,
        text(b.label, 'Zadanie', 2, 300),
        workspace.activeOwner(b.owner_id ?? null, p),
      );
    return detail(c.id, u);
  }
  function window(b, u) {
    const p = projects.requireProject(integer(b.project_id, 'Projekt'), u, true);
    writable(p);
    const start = datetime(b.starts_at, 'początek'),
      end = datetime(b.ends_at, 'koniec');
    if (!start || !end || end <= start) fail(400, 'Podaj zakres czasu.');
    const id = Number(
      db
        .prepare('INSERT INTO change_windows(project_id,name,kind,starts_at,ends_at) VALUES(?,?,?,?,?)')
        .run(
          p.id,
          text(b.name, 'Nazwa', 2, 100),
          choice(b.kind, ['maintenance', 'freeze'], 'okno'),
          start,
          end,
        ).lastInsertRowid,
    );
    projects.audit(p.id, u, 'change.window_created', { id });
    return { id };
  }
  function connectors(u, b) {
    if (!b)
      return db
        .prepare(
          `SELECT id,project_id,service_id,name,enabled,created_at FROM monitoring_connectors WHERE project_id IN (${pscope(u)})`,
        )
        .all()
        .filter((c) => projects.canManage(u, projects.project(c.project_id)));
    const p = projects.requireProject(integer(b.project_id, 'Projekt'), u, true);
    writable(p);
    const s = service(b.service_id, u, true);
    if (s.project_id !== p.id) fail(400, 'Usługa innego projektu.');
    if (b.id) {
      if (
        !db
          .prepare('SELECT 1 FROM monitoring_connectors WHERE id=? AND project_id=? AND service_id=?')
          .get(Number(b.id), p.id, s.id)
      )
        fail(404, 'Konektor niedostępny.');
      db.prepare('UPDATE monitoring_connectors SET enabled=? WHERE id=? AND project_id=?').run(
        Number(boolean(b.enabled, 'Aktywny')),
        integer(b.id, 'Konektor'),
        p.id,
      );
      return { ok: true };
    }
    const secret = randomBytes(32).toString('hex'),
      id = Number(
        db
          .prepare(
            'INSERT INTO monitoring_connectors(project_id,service_id,name,token_hash,created_by,created_at) VALUES(?,?,?,?,?,?)',
          )
          .run(p.id, s.id, text(b.name, 'Nazwa', 2, 100), hash(secret), u.id, now()).lastInsertRowid,
      );
    return { id, secret, url: '/api/monitoring/' + id };
  }
  function incoming(id, authorization, b) {
    return tx(() => {
      const conn = db
        .prepare('SELECT * FROM monitoring_connectors WHERE id=? AND enabled=1')
        .get(integer(Number(id), 'Konektor'));
      const raw = String(authorization || '').match(/^Bearer ([a-f0-9]{64})$/)?.[1];
      if (!conn || !raw || hash(raw) !== conn.token_hash) fail(401, 'Nieprawidłowy konektor lub token.');
      const u = db.prepare('SELECT * FROM users WHERE id=?').get(conn.created_by),
        p = projects.project(conn.project_id);
      if (
        !u?.active ||
        !u.directory_active ||
        u.registration_state !== 'active' ||
        !projects.canManage(u, p) ||
        p.archived
      )
        fail(403, 'Konektor utracił dostęp.');
      const eventId = text(b.event_id, 'Identyfikator zdarzenia', 1, 200),
        state = choice(b.state, ['down', 'up'], 'stan'),
        requestHash = fingerprint(b);
      const prior = db
        .prepare('SELECT * FROM monitoring_events WHERE connector_id=? AND event_id=?')
        .get(conn.id, eventId);
      if (prior) {
        if (prior.request_hash !== requestHash) fail(409, 'Identyfikator należy do innego zdarzenia.');
        return { case_id: prior.case_id, replayed: true };
      }
      let current = db
        .prepare(
          "SELECT * FROM operational_cases WHERE service_id=? AND kind='incident' AND state NOT IN ('closed','resolved') ORDER BY id DESC LIMIT 1",
        )
        .get(conn.service_id);
      if (!current && state === 'up') fail(409, 'Brak otwartego incydentu dla zdarzenia przywrócenia.');
      if (!current)
        current = saveCase(
          null,
          {
            project_id: p.id,
            kind: 'incident',
            title: 'Awaria: ' + service(conn.service_id, u).name,
            summary: text(b.summary || 'Alert monitoringu', 'Opis', 1, 20000),
            service_id: conn.service_id,
            severity: 'P1',
            state: 'investigating',
          },
          u,
        );
      event(
        current.id,
        u,
        state === 'up'
          ? 'Monitoring zgłosił przywrócenie usługi. Wymagana weryfikacja zespołu.'
          : text(b.summary || 'Monitoring zgłosił awarię.', 'Opis', 1, 20000),
      );
      db.prepare('UPDATE operational_cases SET state=?,updated_at=?,version=version+1 WHERE id=?').run(
        state === 'up' ? 'monitoring' : 'investigating',
        now(),
        current.id,
      );
      db.prepare('UPDATE managed_services SET state=?,version=version+1,updated_at=? WHERE id=?').run(
        state === 'up' ? 'operational' : 'outage',
        now(),
        conn.service_id,
      );
      db.prepare('INSERT INTO monitoring_events VALUES(?,?,?,?,?,?)').run(
        conn.id,
        eventId,
        requestHash,
        current.id,
        state,
        now(),
      );
      return { case_id: current.id, replayed: false };
    });
  }
  return {
    services,
    saveService,
    graph,
    dependency,
    asset,
    cases,
    detail,
    calendar,
    saveCase,
    link,
    communicate,
    task,
    window,
    connectors,
    incoming,
    service,
  };
}
