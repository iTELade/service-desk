import {validateSlaConfig} from './sla.mjs';
import { fail, text, integer, now, txFor } from './core.mjs';
export function createGovernance(db, { projects, desk, workflows, catalog }) {
  const tx = txFor(db);
  function setupRevisions() {
    db.exec(`CREATE TRIGGER IF NOT EXISTS workflow_revision22 AFTER UPDATE OF config ON project_workflows WHEN old.config<>new.config BEGIN INSERT INTO configuration_revisions(project_id,kind,resource_id,config,created_at) VALUES(old.project_id,'workflow',old.project_id,old.config,strftime('%Y-%m-%dT%H:%M:%fZ','now')); END;
      CREATE TRIGGER IF NOT EXISTS form_revision22 AFTER UPDATE ON request_types BEGIN INSERT INTO configuration_revisions(project_id,kind,resource_id,config,created_at) VALUES(old.project_id,'form',old.id,json_object('name',old.name,'description',old.description,'base_type',old.base_type,'fields',json(old.fields),'enabled',json(CASE old.enabled WHEN 1 THEN 'true' ELSE 'false' END),'portal_visible',json(CASE old.portal_visible WHEN 1 THEN 'true' ELSE 'false' END)),strftime('%Y-%m-%dT%H:%M:%fZ','now')); END;
      CREATE TRIGGER IF NOT EXISTS settings_revision22 AFTER UPDATE OF settings,sla_policy ON projects WHEN old.settings<>new.settings OR old.sla_policy<>new.sla_policy BEGIN INSERT INTO configuration_revisions(project_id,kind,resource_id,config,created_at) VALUES(old.id,'settings',old.id,json_object('settings',json(old.settings),'sla_policy',json(old.sla_policy)),strftime('%Y-%m-%dT%H:%M:%fZ','now')); END;`);
  }
  setupRevisions();
  function revisions(project, u) { projects.requireProject(project, u, true); return db.prepare('SELECT * FROM configuration_revisions WHERE project_id=? ORDER BY id DESC LIMIT 100').all(project).map(r => ({ ...r, config: JSON.parse(r.config) })); }
  function restoreRevision(id, b, u) {
    const r = db.prepare('SELECT * FROM configuration_revisions WHERE id=?').get(integer(id, 'Rewizja')); if (!r) fail(404, 'Rewizja niedostępna.'); const p = projects.requireProject(r.project_id, u, true), config = JSON.parse(r.config);
    return tx(() => { let result;
      if (r.kind === 'workflow') result = workflows.save(p.id, { ...config, version: b.version }, u);
      else if (r.kind === 'form') result = catalog.save(p.id, r.resource_id, { ...config, version: b.version }, u);
      else { if (p.version !== b.version || p.archived) fail(409, 'Projekt zmienił się.'); const current = workflows.get(p.id); if (config.settings.sla) { validateSlaConfig(config.settings.sla, current.statuses.map(s => s.key)); } db.prepare('UPDATE projects SET settings=?,sla_policy=?,version=version+1 WHERE id=?').run(JSON.stringify(config.settings), JSON.stringify(config.sla_policy), p.id); result = projects.view(projects.project(p.id), u); }
      db.prepare('UPDATE configuration_revisions SET actor_id=? WHERE id=(SELECT max(id) FROM configuration_revisions WHERE project_id=?)').run(u.id, p.id); projects.audit(p.id, u, 'configuration.restored', { revision_id: id }); return result;
    });
  }
  function consistency(project, u) {
    const p = projects.requireProject(project, u, true), issues = [];
    for (const t of db.prepare('SELECT t.id,t.key,t.assignee_id,c.team_id FROM tickets t LEFT JOIN ticket_context c ON c.ticket_id=t.id WHERE t.project_id=? AND t.deleted_at IS NULL').all(p.id)) {
      if (t.assignee_id) { const a = db.prepare('SELECT * FROM users WHERE id=?').get(t.assignee_id); if (!a?.active || !a.directory_active || !projects.canWork(a, p)) issues.push({ kind: 'assignee', key: t.key, message: 'Opiekun utracił dostęp.', settings: '#/project/' + p.id }); }
      if (t.team_id && !db.prepare('SELECT 1 FROM teams WHERE id=? AND deleted_at IS NULL').get(t.team_id)) issues.push({ kind: 'team', key: t.key, message: 'Zespół został usunięty.', settings: '#/operations22?project=' + p.id });
    }
    const w = workflows.get(p.id), reachable = new Set([w.initial]); for (let i = 0; i < w.statuses.length; i++) for (const tr of w.transitions) if (reachable.has(tr.from)) reachable.add(tr.to);
    for (const s of w.statuses) if (!reachable.has(s.key)) issues.push({ kind: 'workflow', message: 'Nieosiągalny status: ' + s.name, settings: '#/workflow/' + p.id });
    if (!catalog.list(p.id, u, 'manage').some(f => f.enabled && (p.project_type !== 'external' || f.portal_visible))) issues.push({ kind: 'form', message: 'Brak dostępnego formularza.', settings: '#/project/' + p.id + '?tab=forms' });
    for (const s of db.prepare('SELECT * FROM sync_configs WHERE enabled=1 AND (source_project=? OR target_project=?)').all(p.id, p.id)) { const c = JSON.parse(s.config), a = db.prepare('SELECT * FROM users WHERE id=?').get(c.author_id); if (!a?.active || !a.directory_active || !projects.canWork(a, projects.project(s.source_project)) || !projects.canWork(a, projects.project(s.target_project))) issues.push({ kind: 'sync', message: 'Autor synchronizacji utracił dostęp.', settings: '#/admin/sync' }); }
    for (const j of db.prepare("SELECT j.id,j.plugin_id FROM platform_jobs j JOIN tickets t ON t.id=j.ticket_id LEFT JOIN plugin_registry p ON p.id=j.plugin_id WHERE t.project_id=? AND j.plugin_id IS NOT NULL AND j.state IN ('queued','paused') AND COALESCE(p.enabled,0)=0").all(p.id)) issues.push({ kind: 'plugin', job_id: j.id, message: 'Zadanie zależy od wyłączonego pluginu.', settings: '#/plugins22' });
    return { valid: !issues.length, issues, checked_at: now() };
  }
  function participant(id, b, u) {
    const t = desk.requireTicket(id, u), p = projects.project(t.project_id), target = db.prepare('SELECT * FROM users WHERE id=?').get(integer(b.user_id, 'Osoba'));
    if (!target?.active || !target.directory_active || target.registration_state !== 'active' || !projects.canPortal(target, p)) fail(400, 'Uczestnik musi mieć dostęp do portalu.');
    if (b.remove) db.prepare('DELETE FROM ticket_participants WHERE ticket_id=? AND user_id=?').run(t.id, target.id); else db.prepare('INSERT OR IGNORE INTO ticket_participants VALUES(?,?,?,?)').run(t.id, target.id, u.id, now());
    projects.audit(p.id, u, 'ticket.participant', { ticket_id: id, user_id: target.id, remove: Boolean(b.remove) }); return { ok: true };
  }
  function participants(t, u) { if (!projects.canRead(u, projects.project(t.project_id), t)) fail(404, 'Sprawa niedostępna.'); return db.prepare('SELECT u.id,u.name FROM ticket_participants p JOIN users u ON u.id=p.user_id WHERE p.ticket_id=?').all(t.id).filter(x => projects.canRead(db.prepare('SELECT * FROM users WHERE id=?').get(x.id), projects.project(t.project_id), t)); }
  function recycleTicket(id, b, u) {
    if (u.role !== 'admin') fail(403, 'Sprawę usuwa administrator.'); const t = desk.requireTicket(id, u); if (t.version !== b.version || b.confirm_key !== t.key) fail(409, 'Sprawa zmieniła się lub klucz nie pasuje.');
    return tx(() => {
      const expires = new Date(Date.now() + 30 * 86400000).toISOString();
      const rid = Number(db.prepare('INSERT INTO recycle_entries(kind,resource_id,project_id,snapshot,deleted_by,created_at,expires_at) VALUES(?,?,?,?,?,?,?)').run('ticket', id, t.project_id, JSON.stringify({ ticket: t }), u.id, now(), expires).lastInsertRowid);
      db.prepare('UPDATE tickets SET deleted_at=?,version=version+1,last_actor_id=? WHERE id=?').run(now(), u.id, id);
      db.prepare("UPDATE platform_jobs SET state='paused',version=version+1 WHERE ticket_id=? AND state='queued'").run(id); db.prepare("UPDATE automation_jobs SET status='cancelled' WHERE ticket_id=? AND status='queued'").run(id); db.prepare("UPDATE approval_runs SET state='cancelled',version=version+1 WHERE ticket_id=? AND state='pending'").run(id); db.prepare('UPDATE sync_pairs SET enabled=0 WHERE source_id=? OR target_id=?').run(id, id);
      projects.audit(t.project_id, u, 'ticket.recycled', { ticket_id: id, recycle_id: rid, expires_at: expires }); return { id: rid, reserved_key: t.key };
    });
  }
  function recycle(u) { if (u.role !== 'admin') fail(403, 'Kosz dostępny administratorowi.'); return db.prepare('SELECT id,kind,resource_id,project_id,created_at,expires_at FROM recycle_entries WHERE restored_at IS NULL AND purged_at IS NULL ORDER BY id DESC').all(); }
  function restoreTrash(id, b, u) {
    if (u.role !== 'admin') fail(403, 'Odtwarzanie wymaga administratora.'); const r = db.prepare('SELECT * FROM recycle_entries WHERE id=? AND restored_at IS NULL AND purged_at IS NULL').get(integer(id, 'Kosz')); if (!r || r.expires_at < now()) fail(409, 'Wpis wygasł lub został odtworzony.');
    projects.requireProject(r.project_id, u, true);
    return tx(() => { const t = desk.ticket(r.resource_id); if (b.confirm_key !== t.key) fail(400, 'Potwierdź klucz sprawy.'); db.prepare('UPDATE tickets SET deleted_at=NULL,version=version+1,last_actor_id=? WHERE id=?').run(u.id, t.id); db.prepare('UPDATE recycle_entries SET restored_at=? WHERE id=?').run(now(), id); projects.audit(r.project_id, u, 'ticket.recovered', { ticket_id: t.id, jobs_resumed: false }); return { key: t.key, jobs_resumed: false }; });
  }
  function settings(project, b, u) {
    const p = projects.requireProject(project, u, true); if (p.version !== b.version || p.archived) fail(409, 'Projekt zmienił się.'); const old = JSON.parse(p.settings || '{}');
    const conditions = b.transition_conditions || {}; if (typeof conditions !== 'object' || Array.isArray(conditions)) fail(400, 'Nieprawidłowe warunki.');
    const keys = workflows.get(p.id).statuses.map(s => s.key), fields = new Set(catalog.list(p.id, u, 'manage').flatMap(f => f.fields.map(x => x.key)));
    for (const [key, rule] of Object.entries(conditions)) { if (!keys.includes(key) || !Array.isArray(rule.fields) || rule.fields.some(x => !fields.has(x))) fail(400, 'Nieznany status lub pole warunku.'); }
    const portal = b.customer_layout || old.customer_layout || ['description', 'conversation', 'attachments', 'next']; if (!Array.isArray(portal) || new Set(portal).size !== portal.length || portal.some(x => !['description', 'conversation', 'attachments', 'next'].includes(x))) fail(400, 'Nieprawidłowy widok klienta.');
    const attachment = b.attachments || old.attachments || { max_bytes: 2097152, extensions: [] }; integer(attachment.max_bytes, 'Rozmiar załącznika', 1024, 2097152); if(attachment.max_storage_bytes!==undefined)integer(attachment.max_storage_bytes,'Magazyn projektu',1024,1073741824); if (!Array.isArray(attachment.extensions) || attachment.extensions.some(x => !/^[a-z0-9]{1,10}$/.test(x))) fail(400, 'Nieprawidłowe rozszerzenia plików.');
    db.prepare('UPDATE projects SET settings=?,version=version+1 WHERE id=?').run(JSON.stringify({ ...old, transition_conditions: conditions, customer_layout: portal, attachments: attachment,versioned_process:b.versioned_process===undefined?Boolean(old.versioned_process):b.versioned_process===true }), p.id); projects.audit(p.id, u, 'project.process_settings', { fields: ['transition_conditions', 'customer_layout', 'attachments'] }); return projects.view(projects.project(p.id), u);
  }
  return { revisions, restoreRevision, consistency, participant, participants, recycleTicket, recycle, restoreTrash, settings };
}
