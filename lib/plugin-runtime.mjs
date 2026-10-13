import { comparePluginVersions } from './plugin-versions.mjs';
import { processSettings } from './process-snapshots.mjs';
import { createPluginMigrations } from './plugin-migrations.mjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createPluginSettings } from './plugin-settings.mjs';
import { hookInput } from './plugin-ui-contract.mjs';
import { randomBytes, createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { deliverWebhook } from './webhooks.mjs';
import { secretStore } from './secrets.mjs';
import { fail, text, integer, now, txFor } from './core.mjs';
import { maintenance } from './maintenance.mjs';

// Extensions execute in a separately deployed service. No uploaded JavaScript runs in Desk.
export function createPluginRuntime(db, { projects, desk, registry, dataDir, clock = Date.now, send = deliverWebhook }) {
  const secrets = secretStore(dataDir), tx = txFor(db), settings = createPluginSettings(db,{projects,secrets}); let timer, busy = false;
  db.exec('CREATE TABLE IF NOT EXISTS plugin_runtime_identity(id INTEGER PRIMARY KEY CHECK(id=1),instance_id TEXT NOT NULL UNIQUE);');
  db.prepare('INSERT OR IGNORE INTO plugin_runtime_identity VALUES(1,?)').run(randomBytes(16).toString('hex'));
  const migrations=createPluginMigrations(db,{projects,dataDir,send,clock});
  const instanceId=db.prepare('SELECT instance_id FROM plugin_runtime_identity WHERE id=1').get().instance_id;
  db.exec(`CREATE INDEX IF NOT EXISTS platform_job_plugin_state22 ON platform_jobs(plugin_id,state,id);
    CREATE INDEX IF NOT EXISTS approval_ticket22 ON approval_runs(ticket_id,id);
    CREATE TRIGGER IF NOT EXISTS platform_ticket_lifecycle22 AFTER UPDATE OF archived_at,deleted_at ON tickets WHEN new.archived_at IS NOT NULL OR new.deleted_at IS NOT NULL BEGIN UPDATE platform_jobs SET state='paused',version=version+1 WHERE ticket_id=new.id AND state='queued'; END;
    CREATE TRIGGER IF NOT EXISTS platform_project_lifecycle22 AFTER UPDATE OF archived ON projects WHEN new.archived=1 BEGIN UPDATE platform_jobs SET state='paused',version=version+1 WHERE ticket_id IN (SELECT id FROM tickets WHERE project_id=new.id) AND state='queued'; END;`);
  const plugin = id => db.prepare('SELECT * FROM plugin_registry WHERE id=?').get(id);
  const connector = id => db.prepare('SELECT * FROM plugin_connectors WHERE plugin_id=?').get(id);
  const active = u => u?.active && u.directory_active && u.registration_state === 'active';
  function operationalHealth(id){
    const p=plugin(id),r=connector(id),m=JSON.parse(p.manifest);let health='ready',last_error=null;
    if(m.capabilities.includes('migration')&&(db.prepare('SELECT data_version FROM plugin_data_versions WHERE plugin_id=?').get(id)?.data_version||0)!==m.dataVersion)health='migration_pending';
    else if(!p.enabled)health='disabled';else if(!r)health='not_configured';else{
      const c=JSON.parse(r.config),actor=db.prepare('SELECT * FROM users WHERE id=?').get(c.execution_user_id);
      if(!active(actor)||c.project_ids.some(id=>!projects.project(id)||projects.project(id).archived||!projects.canWork(actor,projects.project(id)))){health='blocked';last_error='Konto wykonawcze lub projekt są niedostępne.';}
      else{try{requireDependencies(p);}catch(err){if(err.status!==409)throw err;health='blocked';last_error='Zależności pluginu są niedostępne.';}
        if(health==='ready'){const latest=db.prepare("SELECT state,result FROM platform_jobs WHERE plugin_id=? AND state IN ('sent','failed') AND json_extract(payload,'$.connector_version')=? AND json_extract(payload,'$.manifest_revision')=? ORDER BY id DESC LIMIT 1").get(id,r.version,p.version),result=JSON.parse(latest?.result||'{}');if(latest?.state==='failed'||result.business_result==='failed'){health='error';last_error='Ostatnie zlecenie zakończyło się błędem.';}else if(db.prepare("SELECT 1 FROM platform_jobs WHERE plugin_id=? AND state='queued' AND attempts>0 AND json_extract(payload,'$.connector_version')=? AND json_extract(payload,'$.manifest_revision')=?").get(id,r.version,p.version)){health='degraded';last_error='Dostarczenie zlecenia oczekuje na ponowienie.';}else if(latest)health=result.business_result==='completed'?'completed':'awaiting_result';}
      }
    }return {health,last_error};
  }
  function list(u) { return registry.list(u).map(p => { const r = connector(p.id); return { ...p, connector: r ? { ...JSON.parse(r.config), has_secret: Boolean(r.secret), version: r.version } : null }; }); }
  function configure(id, b, u) {
    if (u.role !== 'admin') fail(403, 'Plugin konfiguruje administrator.');
    const p = plugin(id); if (!p) fail(404, 'Plugin nie jest zainstalowany.');
    const old = connector(id); if ((old?.version || 0) !== b.version) fail(409, 'Konfiguracja zmieniła się.');
    let url; try { url = new URL(b.url); } catch { fail(400, 'Nieprawidłowy adres connectora.'); }
    if (url.username || url.password || url.search || url.hash || (!['https:', 'http:'].includes(url.protocol)) || (url.protocol === 'http:' && b.allow_private !== true)) fail(400, 'Podaj HTTPS lub jawnie włączony prywatny HTTP, bez danych logowania i query.');
    if (!Array.isArray(b.project_ids) || !b.project_ids.length || b.project_ids.length > 100) fail(400, 'Wybierz projekty pluginu.');
    const ids = [...new Set(b.project_ids.map(id => projects.requireProject(integer(id, 'Projekt'), u, true).id))];
    const manifest = JSON.parse(p.manifest), allowed = ['ticket.read', 'ticket.comment', 'scheduled.job', 'event.listener', 'workflow.condition', 'ui.extension', 'settings.read', 'ticket.context', 'ticket.fields', 'person.read', 'automation.action', 'automation.trigger','migration','template.publish'];
    if (!Array.isArray(b.permissions) || b.permissions.some(x => !allowed.includes(x) || !manifest.permissions.includes(x))) fail(400, 'Uprawnienia muszą być zadeklarowane w manifeście i obsługiwane przez SDK.');
    const executionUser=db.prepare('SELECT * FROM users WHERE id=?').get(b.execution_user_id||u.id);if(!active(executionUser)||ids.some(pid=>!projects.canWork(executionUser,projects.project(pid))))fail(400,'Konto wykonawcze musi mieć dostęp do każdego projektu.');
    const config = { execution_user_id:executionUser.id, url: url.href, project_ids: ids, permissions: [...new Set(b.permissions)], allow_private: b.allow_private === true };
    const generated = old && !b.rotate_secret ? null : randomBytes(32).toString('hex');
    db.prepare('INSERT INTO plugin_connectors VALUES(?,?,?,1) ON CONFLICT(plugin_id) DO UPDATE SET config=excluded.config,secret=excluded.secret,version=plugin_connectors.version+1').run(id, JSON.stringify(config), generated ? secrets.seal(generated) : old.secret);
    projects.audit(null, u, 'plugin.connector_configured', { plugin_id: id, projects: ids, permissions: config.permissions });
    return { ok: true, ...(generated ? { generated_secret: generated } : {}) };
  }
  function requireDependencies(p, seen=new Set(),verified=new Set()) {
    if(seen.has(p.id))fail(409,'Cykl zależności pluginów.');if(verified.has(p.id))return;if(seen.size>=50)fail(409,'Zbyt głęboka hierarchia zależności.');seen.add(p.id);
    for(const dep of JSON.parse(p.manifest).dependencies||[]){
      const dependency=plugin(dep.id);
      if(!dependency?.enabled||comparePluginVersions(dependency.plugin_version,dep.minimum)<0)fail(409,'Zależność pluginu jest niedostępna: '+dep.id);
      requireDependencies(dependency,new Set(seen),verified);
    }verified.add(p.id);
  }
  function access(id, u, ticketId, permission) {
    const p = plugin(id), r = connector(id), t = desk.ticket(integer(Number(ticketId), 'Zgłoszenie'));
    if (!p?.enabled || !r || !active(u) || !t || t.deleted_at || t.archived_at || !projects.canWork(u, projects.project(t.project_id)) || projects.project(t.project_id).archived) fail(403, 'Plugin, konto lub zgłoszenie nie są dostępne.');
    requireDependencies(p);
    const c = JSON.parse(r.config), manifest = JSON.parse(p.manifest);
    if (!c.project_ids.includes(t.project_id) || !c.permissions.includes(permission) || !manifest.permissions.includes(permission)) fail(403, 'Plugin nie ma wymaganego uprawnienia.');
    executionUser(id,t);return { p, r, t, c };
  }
  function templateContract(u){
    if(u.role!=='admin')fail(403,'Szablony pluginów są dostępne administratorowi.');const result=[];
    for(const p of db.prepare('SELECT * FROM plugin_registry WHERE enabled=1').all()){
      const r=connector(p.id),m=JSON.parse(p.manifest);if(!r||!m.capabilities.includes('project.template')||!m.permissions.includes('template.publish'))continue;const c=JSON.parse(r.config),actor=db.prepare('SELECT * FROM users WHERE id=?').get(c.execution_user_id);if(!c.permissions.includes('template.publish')||!active(actor)||c.project_ids.some(id=>!projects.project(id)||projects.project(id).archived||!projects.canWork(actor,projects.project(id))))continue;
      try{requireDependencies(p);}catch(err){if(err.status===409)continue;throw err;}
      for(const template of m.templates||[]){const config=structuredClone(template.config);for(const project of config.projects){const existing=project.plugins.find(d=>d.id===p.id);if(existing){existing.required=true;if(comparePluginVersions(existing.minimum,p.plugin_version)<0)existing.minimum=p.plugin_version;}else project.plugins.push({id:p.id,minimum:p.plugin_version,required:true});}result.push({id:p.id+':'+template.id,name:template.name,plugin_id:p.id,plugin_revision:p.version,config});}
    }return result;
  }
  const allowedHook=(hook,u,p)=>hook.roles.includes(u.role==='admin'?'admin':projects.canManage(u,p)?'manager':'agent');
  function uiContract(projectId,u,ticketId=null){
    const p=projects.project(integer(Number(projectId),'Projekt')),t=ticketId?desk.ticket(ticketId):null;if(!p||(!t&&!projects.canWork(u,p)))fail(404,'Projekt niedostępny.');
    if(t&&(!projects.canRead(u,p,t)||t.project_id!==p.id))fail(404,'Sprawa niedostępna.');
    const staff=projects.canWork(u,p), result=[];
    for(const plugin of db.prepare('SELECT * FROM plugin_registry WHERE enabled=1').all()){
      const r=connector(plugin.id);if(!r)continue;const config=JSON.parse(r.config),manifest=JSON.parse(plugin.manifest);
      if(!config.project_ids.includes(p.id)||!config.permissions.includes('ui.extension')||!manifest.permissions.includes('ui.extension'))continue;
      try{requireDependencies(plugin);executionUser(plugin.id,{project_id:p.id});}catch{continue;}
      const hooks=(manifest.hooks||[]).filter(h=>staff?allowedHook(h,u,p):h.kind==='portal.panel');
      if(!hooks.length)continue;
      // Dynamic result panels are limited to jobs the reader may inspect.
      const jobs=staff?(t?db.prepare("SELECT * FROM platform_jobs WHERE plugin_id=? AND ticket_id=? AND state='sent' ORDER BY id DESC LIMIT 30").all(plugin.id,t.id):db.prepare("SELECT j.* FROM platform_jobs j JOIN tickets t ON t.id=j.ticket_id WHERE j.plugin_id=? AND t.project_id=? AND t.deleted_at IS NULL AND j.state='sent' ORDER BY j.id DESC LIMIT 100").all(plugin.id,p.id)).filter(j=>(u.role==='admin'||j.user_id===u.id)&&projects.canRead(u,p,desk.ticket(j.ticket_id))):[];
      result.push({id:plugin.id,name:plugin.name,hooks:hooks.map(h=>({...h,values:Object.fromEntries(h.fields.filter(f=>f.type!=='password').map(f=>{const job=jobs.find(j=>Object.hasOwn(JSON.parse(j.result).data||{},f.key));return [f.key,job?JSON.parse(job.result).data[f.key]:null];}))}))});
    }
    return result;
  }
  const requestDigestKey=readFileSync(join(dataDir,'master.key'));
  const approvalId=t=>db.prepare('SELECT id FROM approval_runs WHERE ticket_id=? ORDER BY id DESC LIMIT 1').get(t.id)?.id||null;
  const approvalRevision=t=>db.prepare('SELECT version FROM approval_runs WHERE ticket_id=? ORDER BY id DESC LIMIT 1').get(t.id)?.version||0;
  function requestFingerprint(t){const subject=db.prepare('SELECT subject_id FROM ticket_context WHERE ticket_id=?').get(t.id)?.subject_id||null;return createHmac('sha256',requestDigestKey).update(JSON.stringify([t.title,t.description,t.type,t.priority,t.request_type_id,t.custom_values,t.reporter_id,subject])).digest('hex');}
  function snapshotValid(detail,t,a){return detail.connector_version===a.r.version&&detail.manifest_revision===a.p.version&&detail.settings_revision===settings.digest(a.p.id,t.project_id)&&detail.approval_id===approvalId(t)&&detail.approval_revision===approvalRevision(t)&&detail.process_revision===(db.prepare('SELECT revision FROM process_instances WHERE ticket_id=?').get(t.id)?.revision||0)&&(detail.version_policy==='request'?detail.request_fingerprint===requestFingerprint(t):detail.ticket_version===t.version);}
  function requireApproval(t){const r=db.prepare('SELECT state FROM approval_runs WHERE ticket_id=? ORDER BY id DESC LIMIT 1').get(t.id);if(r&&r.state!=='approved')fail(409,'Zadanie wymaga zakończonej akceptacji aktualnych danych.');}
  function enqueue(id, b, u, source = null, automation = null) {
    const a = access(id, u, b.ticket_id, 'scheduled.job');access(id,u,b.ticket_id,'ticket.read'); if (!JSON.parse(a.p.manifest).capabilities.includes('scheduled.job')) fail(403, 'Plugin nie deklaruje zadań.');
    const hook=b.hook_id?JSON.parse(a.p.manifest).hooks?.find(h=>h.id===b.hook_id&&h.kind==='ticket.action'):null;
    if(b.hook_id&&(!hook||!allowedHook(hook,u,projects.project(a.t.project_id))||!a.c.permissions.includes('ui.extension')||!JSON.parse(a.p.manifest).permissions.includes('ui.extension')))fail(403,'Akcja pluginu jest niedostępna.');
    const versionPolicy=b.version_policy||'ticket';if(!['ticket','request'].includes(versionPolicy))fail(400,'Nieprawidłowa polityka zmian zadania.');
    if(!source)requireApproval(a.t);
    const runAt = new Date(b.run_at || clock()); if (!Number.isFinite(+runAt)) fail(400, 'Nieprawidłowy termin.');
    const requestKey = text(b.request_key, 'Identyfikator', 8, 200), payload = { action: text(hook?.action||b.action, 'Akcja pluginu', 1, 100), ticket_version: a.t.version, connector_version: a.r.version, manifest_revision: a.p.version, settings_revision:settings.digest(id,a.t.project_id),approval_id:approvalId(a.t),approval_revision:approvalRevision(a.t),process_revision:db.prepare('SELECT revision FROM process_instances WHERE ticket_id=?').get(a.t.id)?.revision||0,version_policy:versionPolicy,...(versionPolicy==='request'?{request_fingerprint:requestFingerprint(a.t)}:{}), ...(source ? {source_event:source.id,business_actor_id:source.actor_id} : {}),...(automation?{automation_run_id:automation.run_id,automation_rule_id:automation.rule.id,business_actor_id:automation.business_actor_id}: {}) };
    if(hook){payload.action=hook.action;payload.hook_id=hook.id;payload.input=hookInput(hook,b.input||{});}
    else if(b.input!==undefined)fail(400,'Dane wejściowe wymagają zadeklarowanej akcji pluginu.');
    if(b.parent_job_id){const parent=db.prepare("SELECT * FROM platform_jobs WHERE id=? AND plugin_id=? AND ticket_id=? AND user_id=? AND state='sent' AND json_extract(result,'$.business_result')='completed'").get(integer(b.parent_job_id,'Zlecenie źródłowe'),id,a.t.id,u.id);if(!parent)fail(403,'Zlecenie źródłowe niedostępne.');if(!snapshotValid(JSON.parse(parent.payload),a.t,a))fail(409,'Zlecenie źródłowe jest nieaktualne.');payload.parent_job_id=parent.id;payload.business_actor_id=JSON.parse(parent.payload).business_actor_id??parent.user_id;}
    const old = db.prepare('SELECT * FROM platform_jobs WHERE user_id=? AND request_key=?').get(u.id, requestKey);
    if (old) { if (old.plugin_id !== id || old.ticket_id !== a.t.id || old.payload !== JSON.stringify(payload) || (b.run_at&&old.run_at!==runAt.toISOString())) fail(409, 'Identyfikator należy do innego zlecenia.'); return old; }
    const jobId = Number(db.prepare('INSERT INTO platform_jobs(kind,ticket_id,user_id,plugin_id,request_key,payload,run_at,created_at) VALUES(?,?,?,?,?,?,?,?)').run('plugin', a.t.id, u.id, id, requestKey, JSON.stringify(payload), runAt.toISOString(), now()).lastInsertRowid);
    projects.audit(a.t.project_id, u, 'plugin.job_queued', { plugin_id: id, job_id: jobId, ticket_id: a.t.id }); return { id: jobId };
  }
  function jobs(u) {
    return db.prepare('SELECT j.*,t.key ticket_key,t.project_id FROM platform_jobs j LEFT JOIN tickets t ON t.id=j.ticket_id ORDER BY j.id DESC LIMIT 500').all().filter(j => (u.role === 'admin' || j.user_id === u.id) && (!j.ticket_id || (desk.ticket(j.ticket_id) && projects.canRead(u, projects.project(j.project_id), desk.ticket(j.ticket_id))))).map(({ payload, result, ...j }) => ({ ...j, payload: JSON.parse(payload), result: JSON.parse(result) }));
  }
  function state(id, b, u) {
    const j = db.prepare('SELECT * FROM platform_jobs WHERE id=?').get(integer(id, 'Zadanie')); if (!j || (u.role !== 'admin' && j.user_id !== u.id)) fail(404, 'Zadanie niedostępne.'); if (j.ticket_id && !projects.canRead(u, projects.project(desk.ticket(j.ticket_id).project_id), desk.ticket(j.ticket_id))) fail(404, 'Zadanie niedostępne.');
    if (j.version !== b.version || j.state === 'sent' || j.state === 'cancelled') fail(409, 'Zadanie zmieniło się lub jest zakończone.');
    const next = ['paused', 'cancelled', 'queued'].includes(b.state) ? b.state : null; if (!next) fail(400, 'Nieprawidłowy stan.');
    if(next==='queued'&&j.plugin_id){const a=access(j.plugin_id,db.prepare('SELECT * FROM users WHERE id=?').get(j.user_id),j.ticket_id,'scheduled.job');requireApproval(a.t);if(!snapshotValid(JSON.parse(j.payload),a.t,a))fail(409,'Zlecenie jest nieaktualne; utwórz nowe po przeglądzie.');}
    db.prepare('UPDATE platform_jobs SET state=?,version=version+1 WHERE id=?').run(next, id); projects.audit(j.ticket_id ? desk.ticket(j.ticket_id).project_id : null, u, 'job.state', { job_id: id, state: next }); return { ok: true };
  }
  function reminders(b, u) {
    const t = desk.ticket(integer(b.ticket_id, 'Zgłoszenie')); if (!t || !projects.canRead(u, projects.project(t.project_id), t) || t.archived_at) fail(404, 'Sprawa niedostępna.');
    const runAt = new Date(b.run_at); if (!Number.isFinite(+runAt) || +runAt <= clock()) fail(400, 'Wybierz przyszły termin.');
    const key = text(b.request_key, 'Identyfikator', 8, 200), payload = JSON.stringify({ body: text(b.body || 'Przypomnienie o sprawie', 'Treść', 1, 1000) });
    const old = db.prepare('SELECT * FROM platform_jobs WHERE user_id=? AND request_key=?').get(u.id, key); if (old) { if (old.kind !== 'reminder' || old.payload !== payload || old.ticket_id !== t.id || old.run_at !== runAt.toISOString()) fail(409, 'Identyfikator zajęty.'); return { id: old.id }; }
    const id = Number(db.prepare('INSERT INTO platform_jobs(kind,ticket_id,user_id,request_key,payload,run_at,created_at) VALUES(?,?,?,?,?,?,?)').run('reminder', t.id, u.id, key, payload, runAt.toISOString(), now()).lastInsertRowid); return { id };
  }
  async function flush() {
    if (busy || maintenance()) return; busy = true;
    try {
      await migrations.flush();
      for (const j of db.prepare("SELECT * FROM platform_jobs WHERE state='queued' AND run_at<=? ORDER BY id LIMIT 20").all(new Date(clock()).toISOString())) {
        const fresh=db.prepare('SELECT state,version FROM platform_jobs WHERE id=?').get(j.id);if(fresh?.state!=='queued'||fresh.version!==j.version)continue;let acknowledged=false;
        try {
          const u = db.prepare('SELECT * FROM users WHERE id=?').get(j.user_id), t = desk.ticket(j.ticket_id);
          if (!active(u) || !t || t.deleted_at || t.archived_at || !projects.canRead(u, projects.project(t.project_id), t)) { db.prepare("UPDATE platform_jobs SET state='paused',result=?,version=version+1 WHERE id=?").run(JSON.stringify({ reason: 'Konto lub sprawa niedostępne.' }), j.id); continue; }
          if (j.kind === 'reminder') {
            tx(() => { db.prepare('INSERT INTO notifications(user_id,ticket_id,body,created_at) VALUES(?,?,?,?)').run(u.id, t.id, JSON.parse(j.payload).body + ' · ' + t.key, now()); db.prepare("UPDATE platform_jobs SET state='sent',version=version+1 WHERE id=?").run(j.id); }); continue;
          }
          access(j.plugin_id,u,j.ticket_id,'ticket.read');const a = access(j.plugin_id, u, j.ticket_id, 'scheduled.job'), detail = JSON.parse(j.payload);
          if(!detail.source_event)requireApproval(t);
          // Recheck the ticket version before external action; stale jobs need explicit rescheduling.
          if (!snapshotValid(detail,t,a)) fail(409, 'Wniosek, akceptacja lub konfiguracja zmieniły się; wymagane nowe zlecenie.');
          const body = JSON.stringify({ instance_id:instanceId,api_version: 1, job_id: j.id, idempotency_key: j.request_key, action: detail.action, ticket: { id: t.id, key: t.key, title: t.title, description: t.description, status: t.workflow_status,version:t.version },version_policy:detail.version_policy, actor_id: u.id,business_actor_id:detail.business_actor_id??u.id,...(detail.automation_run_id?{automation_run_id:detail.automation_run_id,automation_rule_id:detail.automation_rule_id}:{}), ...(a.c.permissions.includes('settings.read')&&JSON.parse(a.p.manifest).permissions.includes('settings.read')?{settings:settings.delivery(j.plugin_id,t.project_id,JSON.parse(a.p.manifest))}:{}), ...(detail.hook_id?{hook_id:detail.hook_id,input:detail.input}:{}), ...(detail.source_event ? { event_id:detail.source_event,business_actor_id:detail.business_actor_id } : {}) });
          const signature = createHmac('sha256', secrets.open(a.r.secret)).update(body).digest('hex');
          await send(a.c.url, body, { 'X-Desk-Plugin-Signature': signature, 'Idempotency-Key': j.request_key, 'X-Desk-API-Version': '1','X-Desk-Instance-ID':instanceId }, a.c.allow_private);
          acknowledged=true;
          const current=db.prepare('SELECT state,version FROM platform_jobs WHERE id=?').get(j.id);
          if(current.state!=='queued'||current.version!==j.version){db.prepare('UPDATE platform_jobs SET state=?,result=?,attempts=attempts+1,version=version+1 WHERE id=?').run(current.state==='queued'?'paused':current.state,JSON.stringify({delivered:true,late_acknowledgement:true,note:'Odbiór HTTP potwierdzony po zmianie stanu; wynik biznesowy niepotwierdzony.'}),j.id);continue;}
          const currentUser=db.prepare('SELECT * FROM users WHERE id=?').get(j.user_id),currentAccess=access(j.plugin_id,currentUser,j.ticket_id,'scheduled.job');access(j.plugin_id,currentUser,j.ticket_id,'ticket.read');if(!detail.source_event)requireApproval(currentAccess.t);if(!snapshotValid(detail,currentAccess.t,currentAccess))fail(409,'Wniosek lub konfiguracja zmieniły się podczas dostarczania.');
          db.prepare("UPDATE platform_jobs SET state='sent',attempts=attempts+1,result=?,version=version+1 WHERE id=?").run(JSON.stringify({ delivered: true, note: 'Connector potwierdził odbiór HTTP; nie jest to potwierdzenie wykonania operacji biznesowej.' }), j.id);
        } catch (err) {
          const attempts = j.attempts + 1, blocked = err.status === 403 || err.status === 409;
          db.prepare('UPDATE platform_jobs SET attempts=?,state=?,run_at=?,result=?,version=version+1 WHERE id=? AND state=\'queued\' AND version=?').run(attempts, blocked ? 'paused' : attempts >= 5 ? 'failed' : 'queued', new Date(clock() + 2 ** attempts * 60000).toISOString(), JSON.stringify({ error: err.status ? err.message : 'Connector nie potwierdził odbioru.',...(acknowledged?{delivered:true,note:'Odbiór HTTP potwierdzony; wynik biznesowy niepotwierdzony.'}:{}) }), j.id,j.version);
        }
      }
    } finally { busy = false; }
  }
  function receiveEvent(event) {
    const t=desk.ticket(event.ticket_id);if(!t||t.deleted_at||t.archived_at)return;
    const data=JSON.parse(event.payload), comment=event.event==='comment_added'?db.prepare('SELECT * FROM comments WHERE id=?').get(data.comment_id):null;
    if(event.event==='comment_added'&&(!comment||comment.internal))return;
    const actorId=comment?comment.actual_actor_id||comment.author_id:event.event==='ticket_created'?t.created_by:data.actor_id||t.last_actor_id;
    for(const p of db.prepare('SELECT * FROM plugin_registry WHERE enabled=1').all()){
      const manifest=JSON.parse(p.manifest), r=connector(p.id);if(!r||!manifest.subscriptions?.includes(event.event))continue;
      const config=JSON.parse(r.config);if(!config.project_ids.includes(t.project_id)||!config.permissions.includes('event.listener')||!manifest.permissions.includes('event.listener'))continue;
      const executionUser=db.prepare('SELECT * FROM users WHERE id=?').get(config.execution_user_id);
      try { enqueue(p.id,{ticket_id:t.id,action:'event.'+event.event,request_key:'event:'+event.id+':'+p.id},executionUser,{id:event.id,actor_id:actorId||null}); }
      catch(err){if([403,409].includes(err.status)){projects.audit(t.project_id,null,'plugin.event_blocked',{plugin_id:p.id,event_id:event.id,reason:err.message});continue;}throw err;}
    }
  }
  function checkConditions(t,target,u){
    const rules=processSettings(db,t,projects).plugin_conditions?.[target.key]||[];
    for(const rule of rules){
      const a=access(rule.plugin_id,u,t.id,'workflow.condition');
      if(!JSON.parse(a.p.manifest).capabilities.includes('workflow.condition'))fail(409,'Plugin nie udostępnia warunków workflow.');
      const jobs=db.prepare("SELECT * FROM platform_jobs WHERE ticket_id=? AND plugin_id=? AND state='sent' ORDER BY id DESC LIMIT 100").all(t.id,rule.plugin_id);
      const proof=jobs.find(j=>{const p=JSON.parse(j.payload);return p.action===rule.action&&snapshotValid(p,t,a);});
      if(proof)access(rule.plugin_id,db.prepare('SELECT * FROM users WHERE id=?').get(proof.user_id),t.id,'workflow.condition');
      const result=proof&&JSON.parse(proof.result);
      if(result?.business_result!=='completed'||result.condition!==true)fail(409,'Warunek pluginu oczekuje lub nie jest spełniony: '+rule.plugin_id+' / '+rule.action);
    }
  }
  function validateAutomationAction(action,t,rule){
    const owner=db.prepare('SELECT * FROM users WHERE id=?').get(rule.actor_id),a=access(action.value.plugin_id,owner,t.id,'automation.action');
    access(action.value.plugin_id,owner,t.id,'scheduled.job');access(action.value.plugin_id,owner,t.id,'ticket.read');
    if(!JSON.parse(a.p.manifest).capabilities.some(c=>['automation.action','workflow.action'].includes(c)))fail(403,'Plugin nie udostępnia akcji automatyzacji.');
    requireApproval(t);return owner;
  }
  function automationAction(action,t,source){const owner=validateAutomationAction(action,t,source.rule);return enqueue(action.value.plugin_id,{ticket_id:t.id,action:action.value.action,request_key:'automation:'+source.run_id+':'+source.index},owner,null,source);}
  function executionUser(id,t){
    const c=JSON.parse(connector(id)?.config||'{}'),u=db.prepare('SELECT * FROM users WHERE id=?').get(c.execution_user_id||0);
    if(!active(u)||!projects.canWork(u,projects.project(t.project_id)))fail(403,'Konto wykonawcze pluginu utraciło dostęp.');
    return u;
  }
  function authorize(id, token, permission, ticketId) {
    const p = plugin(id), r = connector(id); if (!p?.enabled || !r) fail(401, 'Plugin niedostępny.');
    requireDependencies(p);
    const expected = createHash('sha256').update(secrets.open(r.secret)).digest(), actual = createHash('sha256').update(String(token || '').replace(/^Bearer /, '')).digest(); if (!timingSafeEqual(expected, actual)) fail(401, 'Nieprawidłowy token pluginu.');
    const c = JSON.parse(r.config), t = desk.ticket(ticketId); if (!t || t.deleted_at || t.archived_at || !c.project_ids.includes(t.project_id) || !c.permissions.includes(permission)||!JSON.parse(p.manifest).permissions.includes(permission)||projects.project(t.project_id).archived) fail(404, 'Zasób niedostępny dla pluginu.');
    executionUser(id,t);return t;
  }
  registry.setHealthProvider(operationalHealth);
  return { operationalHealth,templateContract,migrations, snapshotValid, automationHooks:{validate:validateAutomationAction,enqueue:automationAction}, executionUser, settings, uiContract, receiveEvent, checkConditions, list, configure, enqueue, jobs, state, reminders, flush, authorize, start() { timer = setInterval(() => void flush(), 15000).unref(); }, stop() { clearInterval(timer); } };
}
