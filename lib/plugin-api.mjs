import { createHash } from 'node:crypto';
import { fail, choice, text, integer, txFor, now } from './core.mjs';
import { pluginResultData } from './plugin-ui-contract.mjs';

export function createPluginAPI(db, { runtime, projects, catalog, processes, workspace, workflows }) {
  db.exec('CREATE TABLE IF NOT EXISTS plugin_trigger_receipts(plugin_id TEXT NOT NULL,request_key TEXT NOT NULL,ticket_id INTEGER NOT NULL,event TEXT NOT NULL,request_hash TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(plugin_id,request_key));');
  const tx=txFor(db);
  const actorFor = (job, t) => {
    const actor = job && db.prepare('SELECT * FROM users WHERE id=?').get(job.user_id);
    if (!actor?.active || !actor.directory_active || actor.registration_state !== 'active' || !projects.canWork(actor,projects.project(t.project_id))) fail(403,'Konto zlecenia utraciło dostęp.');
    return actor;
  };
  async function handle({ method, path, token, idempotencyKey, read }) {
    const match = path.match(/^\/api\/plugins\/([a-z0-9._-]+)\/(tickets|jobs)\/([1-9][0-9]*)(?:\/(comments|result|context|fields|person|schedule|trigger))?$/);
    if (!match) fail(404,'Nieznana operacja pluginu.');
    const [, pluginId, resource, rawId, action] = match, id = Number(rawId), ok = value => ({ status:200,value });
    if (resource === 'tickets') {
      const permission = ({comments:'ticket.comment',context:'ticket.context',fields:'ticket.fields',person:'person.read',schedule:'scheduled.job',trigger:'automation.trigger'})[action] || 'ticket.read';
      let t = runtime.authorize(pluginId,token,permission,id);
      if (method === 'GET' && !action) return ok({api_version:1,ticket:{id:t.id,key:t.key,title:t.title,description:t.description,status:t.workflow_status,version:t.version}});
      if (method === 'GET' && action === 'fields') return ok(catalog.ticket(t,true,runtime.executionUser(pluginId,t)));
      if (method === 'GET' && action === 'context') {
        const x = processes.extras(t.id,runtime.executionUser(pluginId,t));
        return ok({context:{subject_id:x.context.subject_id||null,team_id:x.context.team_id||null,parent_id:x.context.parent_id||null},next:x.next,approvals:x.approvals.map(r=>({id:r.id,state:r.state,stale:r.stale,stage_index:r.stage_index})),version:t.version});
      }
      if (method === 'GET' && action === 'person') {
        const subject = db.prepare('SELECT u.id,u.name,u.email,u.active,u.directory_active FROM ticket_context c JOIN users u ON u.id=c.subject_id WHERE c.ticket_id=?').get(t.id);
        return ok({person:subject||null});
      }
      if (method === 'POST' && action === 'comments') {
        const b = await read();t=runtime.authorize(pluginId,token,permission,id);const job = db.prepare('SELECT * FROM platform_jobs WHERE id=? AND plugin_id=? AND ticket_id=?').get(integer(b.job_id,'Zlecenie'),pluginId,t.id);
        if (!job) fail(403,'Zlecenie niedostępne.');
        return ok(workspace.comment(t.key,{body:b.body,version:b.version,internal:false,request_key:'plugin:'+pluginId+':'+text(idempotencyKey,'Idempotency-Key',8,100)},actorFor(job,t)));
      }
      if (method === 'POST' && action === 'trigger') {
        const b=await read();t=runtime.authorize(pluginId,token,permission,id);
        const manifest=JSON.parse(db.prepare('SELECT manifest FROM plugin_registry WHERE id=?').get(pluginId).manifest);if(!manifest.capabilities.includes('automation.trigger'))fail(403,'Plugin nie udostępnia wyzwalaczy.');
        const event=text(b.event,'Zdarzenie pluginu',1,100),key=text(idempotencyKey,'Idempotency-Key',8,200);if(!/^[a-zA-Z][a-zA-Z0-9._:-]*$/.test(event))fail(400,'Nieprawidłowe zdarzenie pluginu.');
        const hash=createHash('sha256').update(JSON.stringify([t.id,event,b.version])).digest('hex');
        return tx(()=>{
          const previous=db.prepare('SELECT * FROM plugin_trigger_receipts WHERE plugin_id=? AND request_key=?').get(pluginId,key);
          if(previous){if(previous.request_hash!==hash)fail(409,'Identyfikator należy do innego zdarzenia.');return ok({ok:true,duplicate:true});}
          if(t.version!==b.version)fail(409,'Sprawa zmieniła się.');
          workflows.automation.emit(t.id,'plugin_event',runtime.executionUser(pluginId,t),undefined,{plugin_id:pluginId,plugin_event:event,origin:'plugin'});
          db.prepare('INSERT INTO plugin_trigger_receipts VALUES(?,?,?,?,?,?)').run(pluginId,key,t.id,event,hash,now());projects.audit(t.project_id,runtime.executionUser(pluginId,t),'plugin.trigger',{plugin_id:pluginId,ticket_id:t.id,event});return ok({ok:true,event_accepted:true});
        });
      }
      if (method === 'POST' && action === 'schedule') {
        const b = await read();t=runtime.authorize(pluginId,token,permission,id);const parent = db.prepare("SELECT * FROM platform_jobs WHERE id=? AND plugin_id=? AND ticket_id=? AND state='sent' AND json_extract(result,'$.business_result')='completed'").get(integer(b.parent_job_id,'Zlecenie źródłowe'),pluginId,t.id);
        if (!parent || t.version !== b.version) fail(409,'Sprawa lub zlecenie źródłowe zmieniło się.');
        return ok(runtime.enqueue(pluginId,{ticket_id:t.id,parent_job_id:parent.id,action:b.action,hook_id:b.hook_id,input:b.input,run_at:b.run_at,version_policy:b.version_policy,request_key:text(idempotencyKey,'Idempotency-Key',8,200)},actorFor(parent,t)));
      }
    } else if (method === 'POST' && action === 'result') {
      const b=await read();const job = db.prepare('SELECT * FROM platform_jobs WHERE id=? AND plugin_id=?').get(id,pluginId); if (!job) fail(404,'Zadanie niedostępne.');
      const t = runtime.authorize(pluginId,token,'scheduled.job',job.ticket_id), actor = actorFor(job,t);
      if (job.state !== 'sent') fail(409,'Wynik można zgłosić po potwierdzeniu odbioru zadania.');
      const plugin = db.prepare('SELECT * FROM plugin_registry WHERE id=?').get(pluginId), manifest = JSON.parse(plugin.manifest), data = b.data === undefined ? undefined : pluginResultData(manifest,b.data);
      if (data !== undefined) runtime.authorize(pluginId,token,'ui.extension',t.id);
      if (b.condition !== undefined) { if (typeof b.condition !== 'boolean') fail(400,'Warunek musi być wartością logiczną.'); runtime.authorize(pluginId,token,'workflow.condition',t.id); }
      const previous = JSON.parse(job.result), message = text(b.message||'','Wynik pluginu',0,2000), status = choice(b.status,['completed','failed'],'Wynik');
      if (previous.business_result) {
        if (previous.business_result === status && previous.message === message && previous.condition === b.condition && JSON.stringify(previous.data) === JSON.stringify(data)) return ok({ok:true,duplicate:true});
        fail(409,'Wynik został już zapisany.');
      }
      const source = JSON.parse(job.payload), connector = db.prepare('SELECT version FROM plugin_connectors WHERE plugin_id=?').get(pluginId);
      if (!runtime.snapshotValid(source,t,{p:plugin,r:connector})) fail(409,'Sprawa lub konfiguracja pluginu zmieniła się.');
      const result = {...previous,business_result:status,message,...(b.condition!==undefined?{condition:b.condition}:{}),...(data!==undefined?{data}:{} )};
      db.prepare('UPDATE platform_jobs SET result=?,version=version+1 WHERE id=?').run(JSON.stringify(result),id);
      projects.audit(t.project_id,actor,'plugin.result',{job_id:id,plugin_id:pluginId,status}); return ok({ok:true});
    }
    fail(405,'Nieobsługiwana operacja pluginu.');
  }
  return { handle };
}
