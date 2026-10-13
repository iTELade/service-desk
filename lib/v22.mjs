import { parseExpression, formatExpression, compileExpression } from './query-v22.mjs';
import { initializeProcessSnapshots, migrateProcessSettings, processSettings } from './process-snapshots.mjs';
import { createPluginFormExtension } from './plugin-form-extension.mjs';
import { periodReport } from './reports-v22.mjs';
import { fail, text, integer, now, txFor } from './core.mjs';
import { fingerprint } from './workspace-v21.mjs';
import { createBlueprints } from './project-blueprints.mjs';
import { createProcesses } from './process-v22.mjs';
import { createGovernance } from './governance-v22.mjs';
import { createConfigurationTrash } from './config-trash-v22.mjs';
import { createPluginRuntime } from './plugin-runtime.mjs';

export function createV22(db, ctx) {
  const { projects, desk, workflows, catalog, extensions, v21 } = ctx, tx = txFor(db);
  initializeProcessSnapshots(db);
  const governance = createGovernance(db,ctx),configTrash=createConfigurationTrash(db,{projects}),processes=createProcesses(db,ctx),blueprints=createBlueprints(db,{projects,catalog,workflows,sync:extensions.sync,governance,processes}),runtime = createPluginRuntime(db, { ...ctx, registry: extensions.plugins });
  blueprints.setPluginTemplates(runtime.templateContract);
  workflows.setGuard((t,s,u)=>{processes.guard(t,s,u);runtime.checkConditions(t,s,u);});extensions.setEventHook(runtime.receiveEvent);workflows.automation.setPluginHooks(runtime.automationHooks);extensions.lifecycle.setRecycle(governance.recycleTicket);
  const importPluginFields=createPluginFormExtension(db,{runtime,projects,catalog});
  const rawTicket = id => desk.ticket(integer(Number(id), 'Zgłoszenie'));
  function revisionsActor(p, u) { db.prepare('UPDATE configuration_revisions SET actor_id=? WHERE id=(SELECT max(id) FROM configuration_revisions WHERE project_id=?)').run(u.id, p); }
  function preview(b, u) {
    if (!Array.isArray(b.items) || !b.items.length || b.items.length > 50) fail(400, 'Wybierz od 1 do 50 spraw.');
    const results = b.items.map(item => {
      try { const t = v21.workspace.ticket(item.key, u, true); const save = 'bulk_preview22'; db.exec('SAVEPOINT ' + save); try { const r = v21.workspace.bulk({ ...b, items: [item], request_key: 'preview-' + crypto.randomUUID() }, u); return r.results[0]; } finally { db.exec('ROLLBACK TO ' + save + '; RELEASE ' + save); } } catch (err) { return { key: item.key, ok: false, error: err.status ? err.message : 'Zmiana niedostępna.' }; }
    });
    return { preview: true, results, fingerprint: fingerprint({ action: b.action, value: b.value, items: b.items, resolution_text: b.resolution_text }) };
  }
  function merge(id, b, u) {
    const a = desk.requireTicket(id, u), target = desk.requireTicket(integer(b.target_id, 'Sprawa główna'), u);
    if (a.id === target.id || a.project_id !== target.project_id || a.archived_at || target.archived_at || a.status === 'closed' || target.status === 'closed') fail(400, 'Scalaj aktywne sprawy w jednym projekcie.');
    if (b.version !== a.version || b.target_version !== target.version) fail(409, 'Sprawa zmieniła się.');
    const summary = { source: a.key, target: target.key, comments: db.prepare('SELECT count(*) n FROM comments WHERE ticket_id=?').get(a.id).n, attachments: db.prepare('SELECT count(*) n FROM r112_attachments WHERE ticket_id=?').get(a.id).n, reporter_added: a.reporter_id !== target.reporter_id };
    if (!b.confirm) return { preview: true, ...summary };
    return tx(() => {
      for (const c of db.prepare('SELECT * FROM comments WHERE ticket_id=? ORDER BY id').all(a.id)) db.prepare('INSERT INTO comments(ticket_id,author_id,actual_actor_id,body,internal,source_comment_id,origin,created_at) VALUES(?,?,?,?,?,?,?,?)').run(target.id, c.author_id, c.actual_actor_id || c.author_id, '[' + a.key + ']\n' + c.body, c.internal, c.id, 'sync', c.created_at);
      // Retain original attachment ownership and visibility; only the ticket pointer changes.
      db.prepare('UPDATE r112_attachments SET ticket_id=?,comment_id=NULL WHERE ticket_id=?').run(target.id, a.id);
      const reporter = db.prepare('SELECT * FROM users WHERE id=?').get(a.reporter_id); if (reporter?.active && projects.canPortal(reporter, projects.project(target.project_id))) db.prepare('INSERT OR IGNORE INTO ticket_participants VALUES(?,?,?,?)').run(target.id, reporter.id, u.id, now());
      db.prepare('INSERT OR REPLACE INTO ticket_aliases(key,ticket_id) VALUES(?,?)').run(a.key, target.id);
      db.prepare('UPDATE tickets SET deleted_at=?,version=version+1,last_actor_id=? WHERE id=?').run(now(), u.id, a.id); db.prepare('UPDATE tickets SET version=version+1,updated_at=?,last_actor_id=? WHERE id=?').run(now(), u.id, target.id);
      db.prepare('UPDATE sync_pairs SET enabled=0 WHERE source_id=? OR target_id=?').run(a.id, a.id); db.prepare("UPDATE platform_jobs SET state='paused',version=version+1 WHERE ticket_id=? AND state='queued'").run(a.id); db.prepare("UPDATE automation_jobs SET status='cancelled' WHERE ticket_id=? AND status='queued'").run(a.id); db.prepare("UPDATE approval_runs SET state='cancelled',version=version+1 WHERE ticket_id=? AND state='pending'").run(a.id);
      projects.audit(a.project_id, u, 'ticket.merged', { ...summary, source_id: a.id, target_id: target.id, jobs_resumed: false }); return { ...summary, key: target.key };
    });
  }
  function preferences(b, u) {
    const old = db.prepare('SELECT * FROM notification_preferences WHERE user_id=?').get(u.id);
    if (!b) return { config: JSON.parse(old?.config || '{"events":[],"quiet_start":null,"quiet_end":null,"timezone":"UTC","digest":false}'), version: old?.version || 0 };
    if ((old?.version || 0) !== b.version) fail(409, 'Preferencje zmieniły się.');
    if (!Array.isArray(b.config?.events) || b.config.events.some(e => !['ticket_created', 'ticket_updated', 'status_changed', 'comment_added'].includes(e))) fail(400, 'Nieprawidłowe zdarzenia.');
    for (const k of ['quiet_start', 'quiet_end']) if (b.config[k] && !/^([01]\d|2[0-3]):[0-5]\d$/.test(b.config[k])) fail(400, 'Nieprawidłowe godziny ciszy.');
    try { new Intl.DateTimeFormat('en', { timeZone: b.config.timezone }).format(); } catch { fail(400, 'Nieprawidłowa strefa czasowa.'); }
    const config = { events: [...new Set(b.config.events)], quiet_start: b.config.quiet_start || null, quiet_end: b.config.quiet_end || null, timezone: b.config.timezone, digest: b.config.digest === true };
    db.prepare('INSERT INTO notification_preferences VALUES(?,?,1) ON CONFLICT(user_id) DO UPDATE SET config=excluded.config,version=notification_preferences.version+1').run(u.id, JSON.stringify(config)); return preferences(null, u);
  }
  function diagnostics(t, u) {
    if (!projects.canWork(u, projects.project(t.project_id))) fail(403, 'Diagnostyka dostępna zespołowi.');
    const cfg = workflows.forTicket(t), states = desk.detail(t, u).sla;
    return { workflow_version: cfg.version, status: t.workflow_status, transitions: workflows.transitions(t, true).map(tr => { const target = cfg.statuses.find(s => s.key === tr.to); try { processes.guard(t, target, u); return { ...tr, allowed: true }; } catch (err) { return { ...tr, allowed: false, reason: err.message }; } }), sla: states.map(s => ({ name: s.name, state: s.state, due_at: s.due_at, remaining_ms: s.remaining_ms, reason: s.state === 'paused' ? 'Aktualny status zatrzymuje pomiar według konfiguracji SLA.' : s.state === 'not_started' ? 'Nie osiągnięto warunku rozpoczęcia.' : s.state === 'completed' ? 'Osiągnięto warunek zakończenia.' : 'Stan wynika z kalendarza i warunków SLA projektu.' })), automation: workflows.automation.preview(t, 'ticket_updated', {}), blockers: processes.extras(t.id, u).blockers };
  }
  function migrateProcess(t,b,u){
    const p=projects.requireProject(t.project_id,u,true),w=workflows.get(p.id),live=JSON.parse(p.settings||'{}'),old=processSettings(db,t,projects);
    if(b.version!==t.version||t.deleted_at||t.archived_at||p.archived)fail(409,'Sprawa lub projekt zmieniły się.');
    const status=w.statuses.find(s=>s.key===t.workflow_status);if(!status||status.category!==t.status)fail(409,'Status lub jego kategoria nie pasują do nowego procesu.');
    const fields=new Set(catalog.list(p.id,u,'manage').flatMap(f=>f.fields.map(x=>x.key)));
    for(const [key,rule] of Object.entries(live.transition_conditions||{}))if(!w.statuses.some(s=>s.key===key)||(rule.fields||[]).some(k=>!fields.has(k)))fail(409,'Nowy proces zawiera nieaktualny status lub pole warunku.');
    const pendingJobs=db.prepare("SELECT COUNT(*) n FROM platform_jobs WHERE ticket_id=? AND state='queued'").get(t.id).n,approvals=db.prepare("SELECT COUNT(*) n FROM approval_runs WHERE ticket_id=? AND state IN ('pending','approved')").get(t.id).n;
    const preview={preview:true,old_version:workflows.forTicket(t).version,new_version:w.version,old_conditions:old.transition_conditions||{},new_conditions:live.transition_conditions||{},old_plugin_conditions:old.plugin_conditions||{},new_plugin_conditions:live.plugin_conditions||{},jobs_to_pause:pendingJobs,approvals_to_cancel:approvals};
    const token=fingerprint({ticket_version:t.version,project_version:p.version,workflow:w,preview});
    if(!b.confirm)return {...preview,preview_fingerprint:token};
    if(b.preview_fingerprint!==token)fail(409,'Wykonaj podgląd aktualnej migracji.');
    return tx(()=>{
      db.prepare('UPDATE process_instances SET definition=?,workflow_version=?,revision=revision+1 WHERE ticket_id=?').run(JSON.stringify(w),w.version,t.id);migrateProcessSettings(db,t,projects);
      db.prepare('UPDATE tickets SET version=version+1,last_actor_id=? WHERE id=?').run(u.id,t.id);
      db.prepare("UPDATE approval_runs SET state='cancelled',version=version+1 WHERE ticket_id=? AND state IN ('pending','approved')").run(t.id);
      db.prepare("UPDATE platform_jobs SET state='paused',version=version+1 WHERE ticket_id=? AND state='queued'").run(t.id);
      projects.audit(p.id,u,'process.migrated',{ticket_id:t.id,version:w.version,jobs_paused:pendingJobs,approvals_cancelled:approvals});return {ok:true};
    });
  }
  const reports = (u, q) => periodReport(db, projects, u, q);
  async function handle(method, path, u, q, read) {
    if (!path.startsWith('/api/desk/v22/')) return null;
    const [resource, rawId, action] = path.slice('/api/desk/v22/'.length).split('/'), id = rawId ? Number(rawId) : null, b = method === 'GET' ? null : await read();if(method==='GET'&&['form-extension','votes','reminders','bulk-preview','bulk','settings'].includes(resource))fail(405,'Niedozwolona metoda.'); let value;
    if(resource==='query'){
      if(method!=='POST'||!['parse','format'].includes(action||rawId))fail(405,'Niedozwolona metoda zapytania.');
      const allowed=new Set(),denied=new Set();for(const p of projects.list(u).filter(p=>p.can_work))for(const f of catalog.list(p.id,u,'team').flatMap(f=>f.fields)){if(catalog.visibleField(f,u,{project_id:p.id}))allowed.add(f.key);else denied.add(f.key);}
      const ast=(action||rawId)==='parse'?parseExpression(b.expression):b.ast,expression=formatExpression(ast),compiled=compileExpression(expression,{user:u,projects,allowedFields:[...allowed].filter(k=>!denied.has(k))});value={ast:compiled.ast,expression};
    }
    else if(resource==='reports')value=reports(u,q);
    else if (resource === 'blueprints') {if(action==='delete'&&method==='POST')value=configTrash.trash('blueprint',id,b,u);else if(action==='revisions'&&method==='GET')value=blueprints.history('blueprint',id,u);else if(action==='restore'&&method==='POST')value=blueprints.restore('blueprint',id,b,u);else if(!action&&method==='GET')value=blueprints.list(u);else if(method==='POST'&&!action)value=blueprints.save(id,b,u);else if(method==='POST'&&action==='from-project')value=blueprints.fromProject(id,b,u);else fail(405,'Niedozwolona metoda.');}
    else if (resource === 'drafts') {if(action==='delete'&&method==='POST')value=configTrash.trash('draft',id,b,u);else if(action==='revisions'&&method==='GET')value=blueprints.history('draft',id,u);else if(action==='restore'&&method==='POST')value=blueprints.restore('draft',id,b,u);else if(method==='POST')value=action==='activate'?blueprints.activate(id,b,u):action==='preview'?blueprints.validate(id,b,u):!action?blueprints.draft(id,b,u):fail(404,'Nieznana operacja draftu.');else fail(405,'Niedozwolona metoda.');}
    else if(resource==='responsibility')value=method==='GET'?processes.rules(Number(q.get('project')),u):processes.saveRule(id,b,u);
    else if(resource==='people-attributes'){if(u.role!=='admin')fail(403,'Dostęp administratora.');const row=db.prepare('SELECT * FROM people_attributes WHERE user_id=?').get(id);value=method==='GET'?{config:JSON.parse(row?.config||'{}'),version:row?.version||0}:processes.personAttributes(id,b,u);}
    else if (resource === 'teams') value = method === 'GET' ? processes.teams(u, Number(q.get('project'))) : processes.saveTeam(id, b, u);
    else if (resource === 'delegations') value = method === 'GET' ? db.prepare('SELECT * FROM user_delegations WHERE user_id=? ORDER BY starts_at DESC').all(u.id) : processes.delegation(id, b, u);
    else if (resource === 'votes') value = processes.decide(id, b, u);
    else if (resource === 'tickets') {
      const t = rawTicket(id); if (!t || !projects.canRead(u, projects.project(t.project_id), t)) fail(404, 'Sprawa niedostępna.');
      if (method === 'GET') value = action === 'diagnostics' ? diagnostics(t, u) : { ...processes.extras(id, u), participants: governance.participants(t, u), plugin_ui: runtime.uiContract(t.project_id,u,t.id) };
      else if (action === 'context') value = processes.metadata(id, b, u);
      else if (action === 'acknowledge') value = processes.acknowledge(id, b, u);
      else if (action === 'dependencies') value = processes.dependency(id, b, u);
      else if (action === 'approval') value = processes.approval(id, b, u);
      else if(action==='approval-withdraw')value=processes.withdraw(id,b,u);
      else if (action === 'participants') value = governance.participant(id, b, u);
      else if (action === 'merge') value = merge(id, b, u);
      else if (action === 'delete') value = governance.recycleTicket(id, b, u);
      else if(action==='migrate-process')value=migrateProcess(t,b,u);
      else fail(404, 'Nieznana operacja.');
    }
    else if(resource==='form-extension')value=importPluginFields(id,b,u);
    else if(resource==='plugin-settings')value=method==='GET'?runtime.settings.list(rawId,Number(action||0),u):runtime.settings.save(rawId,Number(action||0),b,u);
    else if(resource==='extension-ui'){if(method!=='GET')fail(405,'Niedozwolona metoda.');value=runtime.uiContract(Number(q.get('project')),u);}
    else if (resource === 'jobs') value = method === 'GET' ? runtime.jobs(u) : runtime.state(id, b, u);
    else if (resource === 'reminders') value = runtime.reminders(b, u);
    else if(resource==='plugin-migrations')value=runtime.migrations.cancel(id,b,u);
    else if(resource==='plugins'&&action==='migrations')value=method==='GET'?runtime.migrations.list(rawId,u):runtime.migrations.enqueue(rawId,b,u);
    else if (resource === 'plugins') value = method === 'GET' ? runtime.list(u) : action === 'jobs' ? runtime.enqueue(rawId, b, u) : runtime.configure(rawId, b, u);
    else if (resource === 'bulk-preview') value = preview(b, u);
    else if (resource === 'bulk') { if (b.preview_fingerprint !== fingerprint({ action: b.action, value: b.value, items: b.items, resolution_text: b.resolution_text })) fail(409, 'Wykonaj podgląd aktualnego zlecenia.'); const { preview_fingerprint, ...data } = b; value = v21.workspace.bulk(data, u); }
    else if (resource === 'recycle') value = method === 'GET' ? governance.recycle(u) : action === 'purge' ? configTrash.purge(id,b,u) : action === 'restore' || !action ? (db.prepare('SELECT kind FROM recycle_entries WHERE id=?').get(id)?.kind === 'ticket' ? governance.restoreTrash(id,b,u) : configTrash.restore(id,b,u)) : fail(404,'Nieznana operacja kosza.');
    else if (resource === 'recycle-policy') value = method === 'GET' ? configTrash.policy(null,u) : configTrash.policy(b,u);
    else if (resource === 'revisions') value = method === 'GET' ? governance.revisions(Number(q.get('project')), u) : governance.restoreRevision(id, b, u);
    else if (resource === 'consistency') value = governance.consistency(Number(q.get('project')), u);
    else if (resource === 'settings') value = governance.settings(id, b, u);
    else if (resource === 'notification-preferences') value = preferences(b, u);
    else fail(404, 'Nieznany moduł 2.2.');
    if (method !== 'GET' && id && resource === 'settings') revisionsActor(id, u);
    return { status: 200, value };
  }
  return { blueprints, processes, governance, configTrash, runtime, handle, diagnostics, preview, merge, preferences, start() { runtime.start(); }, stop() { runtime.stop(); } };
}
