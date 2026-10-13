import { createHash } from 'node:crypto';
import { fail, text, integer, choice, boolean, now, txFor } from './core.mjs';
export const hash = (value) => createHash('sha256').update(value).digest('hex');
const canonical = (value) =>
  Array.isArray(value)
    ? '[' + value.map(canonical).join(',') + ']'
    : value && typeof value === 'object'
      ? '{' +
        Object.keys(value)
          .filter((k) => value[k] !== undefined)
          .sort()
          .map((k) => JSON.stringify(k) + ':' + canonical(value[k]))
          .join(',') +
        '}'
      : JSON.stringify(value);
export const fingerprint = (value) => hash(canonical(value));
export function createWorkspaceV21(db, { projects, desk, workflows, ticketView }) {
  const tx = txFor(db);
  const ticket = (key, u, write = false) => {
    const t = db
      .prepare(
        'SELECT * FROM tickets WHERE (key=? COLLATE NOCASE OR id=(SELECT ticket_id FROM ticket_aliases WHERE key=? COLLATE NOCASE)) AND deleted_at IS NULL',
      )
      .get(text(key, 'Zgłoszenie', 3, 30), key);
    const p = t && projects.project(t.project_id);
    if (!t || !projects.canRead(u, p, t) || (write && !projects.canWork(u, p)))
      fail(404, 'Zgłoszenie niedostępne.');
    if (write && (p.archived || t.archived_at || t.status === 'closed'))
      fail(409, 'Zgłoszenie nie przyjmuje zmian.');
    return t;
  };
  const activeOwner = (id, p) => {
    if (id === null || id === '') return null;
    const u = db.prepare('SELECT * FROM users WHERE id=?').get(integer(Number(id), 'Opiekun'));
    if (!u?.active || !u.directory_active || u.registration_state !== 'active' || !projects.canWork(u, p))
      fail(400, 'Opiekun musi mieć dostęp do projektu.');
    return u.id;
  };
  function once(u, key, payload, fn) {
    key = text(key, 'Identyfikator żądania', 8, 200);
    const requestHash = fingerprint(payload);
    return tx(() => {
      const old = db
        .prepare('SELECT * FROM workspace_receipts WHERE user_id=? AND request_key=?')
        .get(u.id, key);
      if (old) {
        if (old.request_hash !== requestHash) fail(409, 'Identyfikator należy do innego żądania.');
        return JSON.parse(old.response);
      }
      const value = fn();
      db.prepare('INSERT INTO workspace_receipts VALUES(?,?,?,?,?)').run(
        u.id,
        key,
        requestHash,
        JSON.stringify(value),
        now(),
      );
      return value;
    });
  }
  function patch(key, b, u) {
    return tx(() => {
      const t = ticket(key, u, true),
        p = projects.project(t.project_id);
      if (b.version !== t.version) fail(409, 'Sprawa zmieniła się. Wczytaj aktualne dane.');
      const fields = Object.keys(b);
      if (
        fields.some(
          (k) =>
            ![
              'version',
              'priority',
              'assignee_id',
              'title',
              'description',
              'workflow_status',
              'workflow_version',
              'resolution_text',
            ].includes(k),
        )
      )
        fail(400, 'Nieznane pole edycji.');
      const target = workflows.transition(t, b, true, u),
        n = { ...t, status: target.category, workflow_status: target.key };
      if (b.priority !== undefined) n.priority = choice(b.priority, ['P1', 'P2', 'P3', 'P4'], 'priorytet');
      if (b.assignee_id !== undefined) n.assignee_id = activeOwner(b.assignee_id, p);
      if (b.title !== undefined) n.title = text(b.title, 'Temat', 3, 200);
      if (b.description !== undefined) n.description = text(b.description, 'Opis', 3, 20000);
      n.resolution_text = text(b.resolution_text ?? t.resolution_text ?? '', 'Rozwiązanie', 0, 20000);
      const cfg = desk.settings(p);
      if (
        cfg.resolution_required &&
        (n.status === 'closed' || (cfg.resolution_statuses || []).includes(n.workflow_status)) &&
        !n.resolution_text
      )
        fail(400, 'Podaj rozwiązanie.');
      const stamp = now();
      db.prepare(
        "UPDATE tickets SET title=?,description=?,priority=?,assignee_id=?,status=?,workflow_status=?,resolution_text=?,resolved_at=?,updated_at=?,version=version+1,last_actor_id=?,change_source='web' WHERE id=?",
      ).run(
        n.title,
        n.description,
        n.priority,
        n.assignee_id,
        n.status,
        n.workflow_status,
        n.resolution_text,
        ['resolved', 'closed'].includes(n.status) ? t.resolved_at || stamp : null,
        stamp,
        u.id,
        t.id,
      );
      const diff = Object.fromEntries(
        ['title', 'description', 'priority', 'assignee_id', 'status', 'workflow_status', 'resolution_text']
          .filter((k) => n[k] !== t[k])
          .map((k) => [k, { before: t[k], after: n[k] }]),
      );
      db.prepare('INSERT INTO activity(ticket_id,actor_id,body,created_at) VALUES(?,?,?,?)').run(
        t.id,
        u.id,
        Object.entries(diff)
          .map(([k, v]) => `${k}: ${v.before ?? '—'} → ${v.after ?? '—'}`)
          .join('\n') || 'Zapisano zgłoszenie.',
        stamp,
      );
      projects.audit(p.id, u, 'workspace.ticket_updated', { ticket_id: t.id, changes: diff });
      workflows.automation.onChange(t, u);
      return { ok: true, ticket: ticketView(db.prepare('SELECT * FROM tickets WHERE id=?').get(t.id), u) };
    });
  }
  function comment(key, b, u, provenance = null) {
    const origin=provenance?choice(provenance.origin,['api'],'Źródło komentarza'):'web',actualActor=provenance?integer(provenance.actual_actor_id,'Inicjator komentarza'):u.id;
    return once(u, b.request_key, { action: 'comment', key, ...b, ...(provenance?{origin,actual_actor_id:actualActor}:{}) }, () => {
      const t = ticket(key, u),
        p = projects.project(t.project_id),
        staff = projects.canWork(u, p);
      if (p.archived || t.archived_at || t.status === 'closed' || (!staff && t.customer_reply_locked))
        fail(409, 'Sprawa nie przyjmuje odpowiedzi.');
      const internal = boolean(b.internal ?? false, 'Notatka');
      if (internal && !staff) fail(403, 'Notatki dostępne zespołowi.');
      if (b.version !== t.version)
        fail(409, 'Pojawiła się nowa aktywność. Wczytaj ją przed wysłaniem; szkic zostanie zachowany.');
      const content = text(b.body, 'Wiadomość', 1, 20000);
      const stamp = now();
      const id = Number(
        db
          .prepare(
            'INSERT INTO comments(ticket_id,author_id,actual_actor_id,body,internal,created_at,origin) VALUES(?,?,?,?,?,?,?)',
          )
          .run(t.id, u.id, actualActor, content, Number(internal), stamp, origin).lastInsertRowid,
      );
      db.prepare(
        "UPDATE tickets SET updated_at=?,version=version+1,first_response_at=CASE WHEN ? THEN COALESCE(first_response_at,?) ELSE first_response_at END,last_actor_id=?,change_source=? WHERE id=?",
      ).run(stamp, Number(staff && !internal && u.id !== t.reporter_id), stamp, u.id, origin, t.id);
      workflows.run(
        t,
        internal ? 'internal_note' : staff && u.id !== t.reporter_id ? 'agent_reply' : 'customer_reply',
        u,
      );
      if (b.workflow_status) {
        if (!staff) fail(403, 'Status zmienia zespół.');
        const fresh = db.prepare('SELECT * FROM tickets WHERE id=?').get(t.id);
        patch(
          key,
          {
            version: fresh.version,
            workflow_status: b.workflow_status,
            workflow_version: workflows.forTicket(t).version,
            resolution_text: b.resolution_text,
          },
          u,
        );
      }
      return { ok: true, id };
    });
  }
  function bulk(b, u) {
    if (!Array.isArray(b.items) || !b.items.length || b.items.length > 50)
      fail(400, 'Wybierz od 1 do 50 spraw.');
    if (new Set(b.items.map((x) => x.key)).size !== b.items.length) fail(400, 'Powtórzone zgłoszenie.');
    const action = choice(b.action, ['assign', 'priority', 'transition', 'note'], 'operacja');
    return once(u, b.request_key, { action: 'bulk', ...b }, () => ({
      results: b.items.map((item, index) => {
        try {
          return tx(() => {
            const t = ticket(item.key, u, true);
            if (item.version !== t.version) fail(409, 'Konflikt wersji.');
            let data = { version: t.version };
            if (action === 'assign') data.assignee_id = b.value;
            if (action === 'priority') data.priority = b.value;
            if (action === 'transition') {
              data.workflow_status = b.value;
              data.workflow_version = workflows.forTicket(t).version;
              data.resolution_text = b.resolution_text;
            }
            if (action === 'note')
              comment(
                item.key,
                {
                  version: t.version,
                  body: b.value,
                  internal: true,
                  request_key: b.request_key + ':' + index,
                },
                u,
              );
            else patch(item.key, data, u);
            return { key: item.key, ok: true };
          });
        } catch (e) {
          return {
            key: item.key,
            ok: false,
            status: e.status || 500,
            error: e.status ? e.message : 'Operacja nie powiodła się.',
          };
        }
      }),
    }));
  }
  function extras(key, u) {
    const t = ticket(key, u),
      staff = projects.canWork(u, projects.project(t.project_id));
    const csat =
      db.prepare('SELECT rating,body,created_at FROM ticket_csat WHERE ticket_id=?').get(t.id) || null;
    return {
      csat,
      can_rate: u.id === t.reporter_id && ['resolved', 'closed'].includes(t.status) && !csat,
      ...(staff
        ? {
            worklogs: db
              .prepare(
                'SELECT w.*,u.name user_name FROM ticket_worklogs w JOIN users u ON u.id=w.user_id WHERE ticket_id=? ORDER BY w.id DESC',
              )
              .all(t.id),
            estimate: db.prepare('SELECT * FROM ticket_estimates WHERE ticket_id=?').get(t.id) || {
              estimated_minutes: 0,
              remaining_minutes: 0,
              version: 0,
            },
            presence: db
              .prepare(
                'SELECT u.id,u.name,p.mode FROM ticket_presence p JOIN users u ON u.id=p.user_id WHERE p.ticket_id=? AND p.expires_at>? AND p.user_id<>?',
              )
              .all(t.id, Date.now(), u.id)
              .filter((x) => {
                const person = db.prepare('SELECT * FROM users WHERE id=?').get(x.id);
                return (
                  person.active &&
                  person.directory_active &&
                  projects.canWork(person, projects.project(t.project_id))
                );
              }),
            checklist: db
              .prepare(
                'SELECT c.*,u.name owner_name FROM ticket_checklist c LEFT JOIN users u ON u.id=c.owner_id WHERE ticket_id=? ORDER BY c.id',
              )
              .all(t.id),
            services: db
              .prepare(
                'SELECT s.* FROM managed_services s JOIN ticket_services ts ON ts.service_id=s.id WHERE ts.ticket_id=?',
              )
              .all(t.id)
              .filter((s) => projects.canWork(u, projects.project(s.project_id))),
            cases: db
              .prepare(
                'SELECT c.id,c.kind,c.title,c.state FROM operational_cases c JOIN case_tickets ct ON ct.case_id=c.id WHERE ct.ticket_id=?',
              )
              .all(t.id)
              .filter((c) => {
                const row = db.prepare('SELECT project_id FROM operational_cases WHERE id=?').get(c.id);
                return projects.canWork(u, projects.project(row.project_id));
              }),
          }
        : {}),
    };
  }
  function worklog(key, b, u) {
    return once(u, b.request_key, { action: 'worklog', key, ...b }, () => {
      const t = ticket(key, u, true),
        minutes = integer(b.minutes, 'Minuty', 1, 10080),
        stamp = now(),
        started = new Date(b.started_at || stamp);
      if (!Number.isFinite(+started) || +started > Date.now() + 60000)
        fail(400, 'Nieprawidłowy początek pracy.');
      const id = Number(
        db
          .prepare(
            'INSERT INTO ticket_worklogs(ticket_id,user_id,minutes,body,started_at,created_at) VALUES(?,?,?,?,?,?)',
          )
          .run(t.id, u.id, minutes, text(b.body, 'Opis pracy', 1, 2000), started.toISOString(), stamp)
          .lastInsertRowid,
      );
      projects.audit(t.project_id, u, 'worklog.created', { ticket_id: t.id, minutes, id });
      db.prepare(
        'UPDATE ticket_estimates SET remaining_minutes=MAX(0,remaining_minutes-?),version=version+1 WHERE ticket_id=?',
      ).run(minutes, t.id);
      return { id };
    });
  }
  function estimate(key, b, u) {
    return tx(() => {
      const t = ticket(key, u, true),
        old = db.prepare('SELECT * FROM ticket_estimates WHERE ticket_id=?').get(t.id);
      if ((old?.version || 0) !== b.version) fail(409, 'Estymacja zmieniła się.');
      db.prepare(
        'INSERT INTO ticket_estimates VALUES(?,?,?,1) ON CONFLICT(ticket_id) DO UPDATE SET estimated_minutes=excluded.estimated_minutes,remaining_minutes=excluded.remaining_minutes,version=ticket_estimates.version+1',
      ).run(
        t.id,
        integer(b.estimated_minutes, 'Estymacja', 0, 525600),
        integer(b.remaining_minutes, 'Pozostało', 0, 525600),
      );
      return { ok: true };
    });
  }
  function checklist(key, b, u) {
    const t = ticket(key, u, true),
      p = projects.project(t.project_id);
    if (b.id) {
      const old = db
        .prepare('SELECT * FROM ticket_checklist WHERE id=? AND ticket_id=?')
        .get(integer(b.id, 'Zadanie'), t.id);
      if (!old) fail(404, 'Zadanie niedostępne.');
      if (old.version !== b.version) fail(409, 'Zadanie zmieniło się.');
      db.prepare('UPDATE ticket_checklist SET done=?,owner_id=?,version=version+1 WHERE id=?').run(
        Number(boolean(b.done, 'Wykonano')),
        activeOwner(b.owner_id ?? old.owner_id, p),
        old.id,
      );
    } else
      db.prepare('INSERT INTO ticket_checklist(ticket_id,label,owner_id,created_at) VALUES(?,?,?,?)').run(
        t.id,
        text(b.label, 'Zadanie', 2, 300),
        activeOwner(b.owner_id ?? null, p),
        now(),
      );
    return { ok: true };
  }
  function serviceLink(key, b, u) {
    const t = ticket(key, u, true),
      serviceId = integer(b.service_id, 'Usługa'),
      s = db.prepare('SELECT * FROM managed_services WHERE id=?').get(serviceId);
    if (!s || !projects.canWork(u, projects.project(s.project_id))) fail(404, 'Usługa niedostępna.');
    if (b.remove)
      db.prepare('DELETE FROM ticket_services WHERE ticket_id=? AND service_id=?').run(t.id, s.id);
    else db.prepare('INSERT OR IGNORE INTO ticket_services VALUES(?,?)').run(t.id, s.id);
    projects.audit(t.project_id, u, 'ticket.service_linked', {
      ticket_id: t.id,
      service_id: s.id,
      remove: Boolean(b.remove),
    });
    return { ok: true };
  }
  function presence(key, b, u) {
    const t = ticket(key, u, true);
    db.prepare('DELETE FROM ticket_presence WHERE expires_at<?').run(Date.now());
    db.prepare(
      'INSERT INTO ticket_presence VALUES(?,?,?,?) ON CONFLICT(ticket_id,user_id) DO UPDATE SET mode=excluded.mode,expires_at=excluded.expires_at',
    ).run(t.id, u.id, choice(b.mode, ['viewing', 'writing'], 'obecność'), Date.now() + 45000);
    return extras(key, u).presence;
  }
  function rate(key, b, u) {
    const t = ticket(key, u);
    if (t.reporter_id !== u.id || !['resolved', 'closed'].includes(t.status))
      fail(403, 'Ocenę wystawia zgłaszający po rozwiązaniu.');
    if (db.prepare('SELECT 1 FROM ticket_csat WHERE ticket_id=?').get(t.id))
      fail(409, 'Sprawa została już oceniona.');
    db.prepare('INSERT INTO ticket_csat VALUES(?,?,?,?,?)').run(
      t.id,
      u.id,
      integer(b.rating, 'Ocena', 1, 5),
      text(b.body || '', 'Komentarz', 0, 2000),
      now(),
    );
    return { ok: true };
  }
  function templates(b, u, id) {
    const p = projects.requireProject(Number(b.project_id), u, Boolean(id || b.name));
    if (!b.name)
      return db.prepare('SELECT * FROM reply_templates WHERE project_id=? ORDER BY name').all(p.id);
    if (p.archived) fail(409, 'Projekt zarchiwizowany.');
    if (id) {
      const old = db.prepare('SELECT * FROM reply_templates WHERE id=? AND project_id=?').get(id, p.id);
      if (!old) fail(404, 'Szablon nie istnieje.');
      if (old.version !== b.version) fail(409, 'Szablon zmienił się.');
      db.prepare('UPDATE reply_templates SET name=?,body=?,internal=?,version=version+1 WHERE id=?').run(
        text(b.name, 'Nazwa', 2, 100),
        text(b.body, 'Treść', 1, 20000),
        Number(boolean(b.internal ?? false, 'Notatka')),
        id,
      );
    } else
      id = Number(
        db
          .prepare('INSERT INTO reply_templates(project_id,name,body,internal) VALUES(?,?,?,?)')
          .run(
            p.id,
            text(b.name, 'Nazwa', 2, 100),
            text(b.body, 'Treść', 1, 20000),
            Number(boolean(b.internal ?? false, 'Notatka')),
          ).lastInsertRowid,
      );
    return { id };
  }
  function preferences(b, u) {
    const old = db.prepare('SELECT * FROM workspace_preferences WHERE user_id=?').get(u.id);
    if (!b) return { config: JSON.parse(old?.config || '{}'), version: old?.version || 0 };
    if ((old?.version || 0) !== b.version) fail(409, 'Preferencje zmieniły się.');
    const cfg = b.config;
    if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg) || JSON.stringify(cfg).length > 16000)
      fail(400, 'Nieprawidłowe preferencje.');
    db.prepare(
      'INSERT INTO workspace_preferences VALUES(?,?,1) ON CONFLICT(user_id) DO UPDATE SET config=excluded.config,version=workspace_preferences.version+1',
    ).run(u.id, JSON.stringify(cfg));
    return preferences(null, u);
  }
  return {
    ticket,
    activeOwner,
    once,
    patch,
    comment,
    bulk,
    extras,
    worklog,
    estimate,
    checklist,
    serviceLink,
    presence,
    rate,
    templates,
    preferences,
  };
}
