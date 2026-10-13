import { validateSlaConfig, deadline, workingMs } from './sla.mjs';
import { fail, text, integer, now, txFor } from './core.mjs';
import { createWorkspaceV21 } from './workspace-v21.mjs';
import { createOperations } from './operations.mjs';
import { createTicketAssistance } from './ticket-assistance.mjs';
export function createV21(db, ctx) {
  const { projects, desk, workflows, ticketView, queryTickets } = ctx,
    tx = txFor(db);
  const workspace = createWorkspaceV21(db, ctx),
    operations = createOperations(db, { projects, workspace });
  const assistance = createTicketAssistance(db, ctx);
  function reports(u, q) {
    if (u.role === 'customer') fail(403, 'Raporty dostępne zespołowi.');
    const project = q.get('project');
    if (project) projects.requireProject(Number(project), u);
    const ids =
        projects
          .list(u)
          .filter((p) => p.can_work && (!project || p.id === Number(project)))
          .map((p) => p.id)
          .join(',') || 'NULL',
      scope = `project_id IN (${ids}) AND deleted_at IS NULL`;
    const totals = db
      .prepare(
        `SELECT COUNT(*) total,SUM(status NOT IN ('resolved','closed')) open,SUM(assignee_id IS NULL AND status NOT IN ('resolved','closed')) unassigned,SUM(status='waiting') waiting,SUM(status IN ('resolved','closed')) resolved,AVG(CASE WHEN first_response_at IS NOT NULL THEN (julianday(first_response_at)-julianday(created_at))*1440 END) response_minutes,AVG(CASE WHEN resolved_at IS NOT NULL THEN (julianday(resolved_at)-julianday(created_at))*1440 END) resolution_minutes FROM tickets WHERE ${scope}`,
      )
      .get();
    const daily = db
      .prepare(
        `SELECT substr(created_at,1,10) day,COUNT(*) created FROM tickets WHERE ${scope} AND created_at>=? GROUP BY day ORDER BY day`,
      )
      .all(new Date(Date.now() - 30 * 86400000).toISOString());
    const resolvedDaily = db
      .prepare(
        `SELECT substr(resolved_at,1,10) day,COUNT(*) resolved FROM tickets WHERE ${scope} AND resolved_at>=? GROUP BY day ORDER BY day`,
      )
      .all(new Date(Date.now() - 30 * 86400000).toISOString());
    const load = db
      .prepare(
        `SELECT u.name,COUNT(*) count FROM tickets t LEFT JOIN users u ON u.id=t.assignee_id WHERE t.${scope.replaceAll('project_id', 'project_id').replace(' AND deleted_at', ' AND t.deleted_at')} AND t.status NOT IN ('resolved','closed') GROUP BY t.assignee_id ORDER BY count DESC`,
      )
      .all();
    const csat = db
      .prepare(
        `SELECT COUNT(*) responses,AVG(c.rating) average FROM ticket_csat c JOIN tickets t ON t.id=c.ticket_id WHERE t.${scope.replace(' AND deleted_at', ' AND t.deleted_at')}`,
      )
      .get();
    const logged = db
      .prepare(
        `SELECT u.name,SUM(w.minutes) minutes FROM ticket_worklogs w JOIN tickets t ON t.id=w.ticket_id JOIN users u ON u.id=w.user_id WHERE t.${scope.replace(' AND deleted_at', ' AND t.deleted_at')} GROUP BY u.id ORDER BY minutes DESC`,
      )
      .all();
    const candidates = db
      .prepare(
        `SELECT * FROM tickets WHERE ${scope} AND status NOT IN ('resolved','closed') AND archived_at IS NULL ORDER BY priority,updated_at LIMIT 500`,
      )
      .all();
    const radar = candidates
      .map((t) => ({
        key: t.key,
        title: t.title,
        priority: t.priority,
        assignee_id: t.assignee_id,
        updated_at: t.updated_at,
        sla: desk.detail(t, u).sla,
      }))
      .filter((t) => t.sla.some((s) => s.state === 'running' && (s.breached || s.remaining_ms <= 30 * 60000)))
      .sort(
        (a, b) =>
          Math.min(...a.sla.filter((s) => s.state === 'running').map((s) => s.remaining_ms)) -
          Math.min(...b.sla.filter((s) => s.state === 'running').map((s) => s.remaining_ms)),
      );
    return {
      totals,
      daily: Array.from({ length: 30 }, (_, i) => {
        const day = new Date(Date.now() - (29 - i) * 86400000).toISOString().slice(0, 10);
        return {
          day,
          created: daily.find((x) => x.day === day)?.created || 0,
          resolved: resolvedDaily.find((x) => x.day === day)?.resolved || 0,
        };
      }),
      load,
      csat,
      worklogs: logged,
      radar: radar.slice(0, 30),
      radar_examined: candidates.length,
      radar_limit: 500,
      generated_at: now(),
      definitions: {
        response_minutes: 'Czas kalendarzowy od utworzenia do pierwszej publicznej odpowiedzi zespołu.',
        resolution_minutes: 'Czas kalendarzowy od utworzenia do rozwiązania; odrębny od godzin pracy SLA.',
        radar:
          'Do 500 aktywnych spraw, najpierw priorytet i najstarsza aktualizacja; bieżące SLA według kalendarza projektu.',
      },
    };
  }
  function draft(id, b, u) {
    const p = projects.requireProject(id, u, true);
    if (p.archived) fail(409, 'Projekt w archiwum.');
    const current = workflows.get(p.id),
      old = db.prepare('SELECT * FROM workflow_drafts WHERE project_id=?').get(p.id);
    if (!b)
      return {
        config: old ? JSON.parse(old.config) : current,
        positions: JSON.parse(old?.positions || '{}'),
        base_version: old?.base_version ?? current.version,
        version: old?.version || 0,
        shared_template_id: p.workflow_template_id,
        usage: db
          .prepare(
            'SELECT workflow_status,COUNT(*) count FROM tickets WHERE project_id=? GROUP BY workflow_status',
          )
          .all(p.id),
      };
    if (b.version !== (old?.version || 0)) fail(409, 'Szkic zmienił się.');
    if (b.base_version !== current.version)
      fail(409, 'Opublikowany workflow zmienił się. Wczytaj aktualny szkic.');
    const config = workflows.validate(b.config, p, u, current),
      positions = b.positions || {};
    if (
      !positions ||
      Array.isArray(positions) ||
      typeof positions !== 'object' ||
      JSON.stringify(positions).length > 10000
    )
      fail(400, 'Nieprawidłowe pozycje.');
    for (const [key, v] of Object.entries(positions))
      if (
        !config.statuses.some((s) => s.key === key) ||
        !Number.isFinite(v?.x) ||
        !Number.isFinite(v?.y) ||
        Math.abs(v.x) > 10000 ||
        Math.abs(v.y) > 10000
      )
        fail(400, 'Nieprawidłowa pozycja statusu.');
    db.prepare(
      'INSERT INTO workflow_drafts VALUES(?,?,?,?,1,?) ON CONFLICT(project_id) DO UPDATE SET config=excluded.config,positions=excluded.positions,base_version=excluded.base_version,version=workflow_drafts.version+1,updated_at=excluded.updated_at',
    ).run(p.id, JSON.stringify(config), JSON.stringify(positions), current.version, now());
    return draft(id, null, u);
  }
  function publish(id, b, u) {
    return tx(() => {
      const d = draft(id, null, u);
      if (b.version !== d.version || d.version === 0) fail(409, 'Zapisz aktualny szkic przed publikacją.');
      if (d.base_version !== workflows.get(id).version) fail(409, 'Workflow zmienił się.');
      const w = workflows.save(id, { ...d.config, version: d.base_version }, u);
      db.prepare('UPDATE workflow_drafts SET base_version=?,version=version+1 WHERE project_id=?').run(
        w.version,
        id,
      );
      projects.audit(id, u, 'workflow.draft_published', { version: w.version });
      return draft(id, null, u);
    });
  }
  function query(q, u) {
    const expression = q.get('expression');
    const next = new URLSearchParams(q);
    next.delete('expression');
    if (expression) next.set('expression',expression);
    return queryTickets(next, u);
  }
  async function handle(method, path, u, q, readBody) {
    if (!path.startsWith('/api/desk/v21/')) return null;
    const parts = path.slice('/api/desk/v21/'.length).split('/'),
      [resource, key, action] = parts;
    const b = method === 'GET' ? null : await readBody();
    let value;
    if (resource === 'assistance' && key && !action && ['GET', 'POST'].includes(method)) value = assistance.settings(key, b, u);
    else if (resource === 'similar' && !key && method === 'POST') value = assistance.similar(b, u);
    else if (resource === 'tickets' && key) {
      if (method === 'GET' && action === 'insights') value = assistance.insights(key, u);
      else if (method === 'GET' && !action) value = workspace.extras(key, u);
      else if (method === 'PATCH' && !action) value = workspace.patch(key, b, u);
      else if (method === 'POST') {
        const actions = {
          comments: workspace.comment,
          worklogs: workspace.worklog,
          estimate: workspace.estimate,
          checklist: workspace.checklist,
          presence: workspace.presence,
          services: workspace.serviceLink,
          csat: workspace.rate,
        };
        if (!actions[action]) fail(404, 'Nieznana operacja.');
        value = actions[action](key, b, u);
      } else fail(405, 'Niedozwolona metoda.');
    } else if (resource === 'queue' && method === 'GET') value = query(q, u);
    else if (resource === 'bulk' && method === 'POST') value = workspace.bulk(b, u);
    else if (resource === 'preferences' && ['GET', 'POST'].includes(method))
      value = workspace.preferences(b, u);
    else if (resource === 'reply-templates') {
      if (method === 'GET') value = workspace.templates({ project_id: Number(q.get('project')) }, u);
      else if (['POST', 'PATCH'].includes(method))
        value = workspace.templates(b, u, key ? Number(key) : null);
      else fail(405, 'Niedozwolona metoda.');
    } else if (resource === 'reports' && method === 'GET') value = reports(u, q);
    else if (resource === 'sla-preview' && method === 'POST') {
      const p = projects.requireProject(integer(b.project_id, 'Projekt'), u, true),
        w = workflows.get(p.id),
        cfg = validateSlaConfig(
          b.config,
          w.statuses.map((s) => s.key),
        ),
        start = Date.parse(b.starts_at),
        minutes = integer(b.minutes, 'Cel SLA', 1, 525600);
      if (!Number.isFinite(start)) fail(400, 'Nieprawidłowy początek pomiaru.');
      const due = deadline(start, minutes * 60000, cfg);
      value = {
        dry_run: true,
        timezone: cfg.timezone,
        starts_at: new Date(start).toISOString(),
        due_at: due,
        working_minutes: due ? workingMs(start, Date.parse(due), cfg) / 60000 : null,
      };
    } else if (resource === 'services') {
      if (method === 'GET')
        value = key
          ? action === 'graph'
            ? operations.graph(key, u)
            : operations.service(key, u)
          : operations.services(u, q.get('project'));
      else if (method === 'POST' || method === 'PATCH') {
        if (action === 'dependencies') value = operations.dependency(key, b, u);
        else if (action === 'assets') value = operations.asset(key, b, u);
        else value = operations.saveService(key ? Number(key) : null, b, u);
      } else fail(405, 'Niedozwolona metoda.');
    } else if (resource === 'cases') {
      if (method === 'GET') value = key ? operations.detail(key, u) : operations.cases(u, q);
      else if (method === 'POST' || method === 'PATCH') {
        if (action === 'tickets') value = operations.link(key, b, u);
        else if (action === 'messages') value = operations.communicate(key, b, u);
        else if (action === 'tasks') value = operations.task(key, b, u);
        else value = operations.saveCase(key ? Number(key) : null, b, u);
      } else fail(405, 'Niedozwolona metoda.');
    } else if (resource === 'calendar' && method === 'GET') value = operations.calendar(u, q.get('project'));
    else if (resource === 'windows' && method === 'POST') value = operations.window(b, u);
    else if (resource === 'monitoring' && ['GET', 'POST'].includes(method))
      value = operations.connectors(u, b);
    else if (resource === 'workflow') {
      const id = integer(Number(key), 'Projekt');
      if (method === 'GET') value = draft(id, null, u);
      else if (method === 'POST' && action === 'publish') value = publish(id, b, u);
      else if (method === 'POST' && action === 'preview') {
        projects.requireProject(id, u, true);
        const t = workspace.ticket(b.ticket_key, u, true);
        if (t.project_id !== id) fail(400, 'Sprawa z innego projektu.');
        value = {
          dry_run: true,
          rules: workflows.automation.preview(t, text(b.event, 'Zdarzenie', 1, 80), b.context || {}),
        };
      } else if (method === 'POST') value = draft(id, b, u);
      else fail(405, 'Niedozwolona metoda.');
    } else fail(404, 'Nieznany zasób 2.1.');
    return { status: 200, value };
  }
  return { workspace, operations, assistance, handle, reports, draft, publish };
}
