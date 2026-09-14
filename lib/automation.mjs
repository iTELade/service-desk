import {maintenance} from './maintenance.mjs';
import {randomUUID} from 'node:crypto';
import {fail,text,choice,integer,boolean} from './core.mjs';

export const automationEvents={
  comment_added:'Dodanie komentarza',webhook_received:'Odebranie webhooka',reporter_changed:'Zmiana zgłaszającego',customer_reply:'Publiczna odpowiedź klienta',agent_reply:'Publiczna odpowiedź zespołu',
  internal_note:'Notatka wewnętrzna zespołu',ticket_created:'Utworzenie zgłoszenia',
  status_changed:'Zmiana statusu',ticket_resolved:'Rozwiązanie zgłoszenia',ticket_closed:'Zamknięcie zgłoszenia',
  ticket_reopened:'Ponowne otwarcie zgłoszenia',priority_changed:'Zmiana priorytetu',assignee_changed:'Zmiana opiekuna',
  fields_changed:'Zmiana danych formularza',status_elapsed:'Upływ czasu w statusie',
  silence_elapsed:'Brak odpowiedzi klienta przez określony czas'
};
const timers=new Set(['status_elapsed','silence_elapsed']);
const units={minutes:60000,hours:3600000,days:86400000};
const categories=['open','in_progress','waiting','resolved','closed'];
const fields=['status_category','previous_status','priority','type','assignee_id','request_type_id','customer_reply_locked','author_kind','comment_visibility','comment_body','origin','reporter_id','title','organization_id'];
const actions=['status','comment','priority','assign','lock','unlock','webhook','resolution','email'];
const tokens=['ticket.key','ticket.title','ticket.status','project.name','reporter.name','assignee.name','ticket.resolution'];
const plain=x=>{const {id,revision,activated_at,actor_id,...rest}=x;return rest;};
const active=u=>u&&u.active&&u.directory_active&&u.registration_state==='active';

export function normalizeRule(r,index=0){
  if(Array.isArray(r.actions))return r;
  return {id:r.id||`legacy_${index}`,name:r.name,enabled:r.enabled??true,event:r.event,from:r.from,
    match:'all',conditions:[],actions:[{type:'status',value:r.to}],legacy:true};
}

export function validateAutomation(input,{statuses,transitions,initial,oldRules=[],user,db,projects,project,stamp}){
  if(!Array.isArray(input)||input.length>100)fail(400,'Maksymalnie 100 reguł w projekcie.');
  const keys=statuses.map(s=>s.key),ids=new Set(),old=oldRules.map(normalizeRule);
  return input.map((raw,index)=>{
    if(!raw||typeof raw!=='object'||Array.isArray(raw))fail(400,'Nieprawidłowa reguła.');
    const r=normalizeRule(raw,index),id=r.id||randomUUID();
    if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{1,64}$/.test(id)||ids.has(id))fail(400,'Identyfikatory reguł muszą być unikalne.');ids.add(id);
    const out={id,name:text(r.name,'Nazwa reguły',2,120),enabled:boolean(r.enabled??true,'Reguła aktywna'),
      event:choice(r.event,Object.keys(automationEvents),'wyzwalacz'),from:choice(r.from??'*',['*',...keys],'status reguły'),
      match:choice(r.match??'all',['all','any'],'łączenie warunków'),conditions:[],actions:[]};
    if(timers.has(out.event)){
      out.after={value:integer(r.after?.value,'Czas oczekiwania',1,525600),unit:choice(r.after?.unit,Object.keys(units),'jednostka czasu')};
      if(out.after.value*units[out.after.unit]>366*86400000)fail(400,'Maksymalny czas oczekiwania wynosi 366 dni.');
      if(out.from==='*')fail(400,'Reguła czasowa wymaga wskazania konkretnego statusu.');
    }
    if(!Array.isArray(r.conditions)||r.conditions.length>20)fail(400,'Reguła może zawierać do 20 warunków.');
    out.conditions=r.conditions.map(c=>{
      if(!c||typeof c!=='object'||Array.isArray(c))fail(400,'Nieprawidłowy warunek.');
      const field=choice(c.field,fields,'pole warunku'),op=choice(c.op,['eq','neq','contains','not_contains'],'operator');let value=c.value;
      if(['contains','not_contains'].includes(op)&&!['comment_body','title'].includes(field))fail(400,'Zawiera: tylko treść komentarza lub tytuł.');
      if(['comment_body','title','origin'].includes(field))value=text(value,'Wartość warunku',0,1000);
      if(field==='author_kind')value=choice(value,['customer','agent','service'],'Autor komentarza');
      if(field==='comment_visibility')value=choice(value,['public','internal'],'Widoczność komentarza');
      if(['reporter_id','organization_id'].includes(field))value=value===null?null:integer(value,'Konto lub organizacja');
      if(field==='status_category')value=choice(value,categories,'kategoria');
      if(field==='previous_status'){
        if(!['status_changed','ticket_resolved','ticket_closed','ticket_reopened'].includes(out.event))fail(400,'Warunek poprzedniego statusu wymaga wyzwalacza zmiany statusu, rozwiązania, zamknięcia lub ponownego otwarcia.');
        value=choice(value,keys,'poprzedni status');
      }
      if(field==='priority')value=choice(value,['P1','P2','P3','P4'],'priorytet');
      if(field==='type')value=choice(value,['incident','request','task','bug','story'],'typ');
      if(field==='customer_reply_locked')value=boolean(value,'Blokada odpowiedzi');
      if(field==='assignee_id')value=value===null?null:integer(value,'Identyfikator opiekuna');
      if(field==='request_type_id'){
        value=integer(value,'Formularz');if(!db.prepare('SELECT id FROM request_types WHERE id=? AND project_id=?').get(value,project.id))fail(400,'Formularz musi należeć do tego projektu.');
      }
      return {field,op,value};
    });
    if(!Array.isArray(r.actions)||!r.actions.length||r.actions.length>10)fail(400,'Reguła wymaga od 1 do 10 akcji.');
    const unique=new Set();
    out.actions=r.actions.map(a=>{
      if(!a||typeof a!=='object'||Array.isArray(a))fail(400,'Nieprawidłowa akcja.');
      const type=choice(a.type,actions,'akcja');
      if(type!=='comment'&&unique.has(['lock','unlock'].includes(type)?'lock':type))fail(400,'Ta akcja może wystąpić tylko raz w regule.');
      unique.add(['lock','unlock'].includes(type)?'lock':type);
      if(type==='status'){
        const value=choice(a.value,keys,'status docelowy');
        if(out.from!=='*'&&out.from!==value&&!transitions.some(t=>t.from===out.from&&t.to===value))fail(400,'Akcja zmiany statusu wymaga połączenia na mapie przejść.');
        if(out.from==='*'&&!transitions.some(t=>t.to===value))fail(400,'Status docelowy musi mieć przejście na mapie.');
        return {type,value,resolution:text(a.resolution??'','Rozwiązanie',0,20000)};
      }
      if(type==='comment'){
        const body=text(a.body,'Treść komentarza bota',1,10000);
        for(const m of body.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g))if(!tokens.includes(m[1]))fail(400,`Nieznany znacznik szablonu: ${m[1]}. Dostępne: ${tokens.join(', ')}.`);
        const bot_id=a.bot_id??null;if(bot_id!==null){const bot=db.prepare('SELECT * FROM users WHERE id=?').get(integer(bot_id,'Bot'));if(!active(bot)||!(projects.canWork(bot,project)||projects.canPortal(bot,project)))fail(400,'Wybierz aktywne konto projektu.');}
        return {type,body,bot_id,internal:boolean(a.internal??false,'Notatka wewnętrzna')};
      }
      if(type==='priority')return {type,value:choice(a.value,['P1','P2','P3','P4'],'priorytet')};
      if(type==='assign'){
        if(['actor','reporter','bot'].includes(a.value))return {type,value:a.value,bot_id:a.bot_id===undefined?null:integer(a.bot_id,'Konto bota')};
        const value=a.value===null?null:integer(a.value,'Opiekun');
        if(value!==null){const agent=db.prepare('SELECT * FROM users WHERE id=?').get(value);if(!active(agent)||!projects.canWork(agent,project))fail(400,'Opiekun musi mieć aktywny dostęp zespołowy do projektu.');}
        return {type,value};
      }
      if(type==='resolution')return {type,body:text(a.body,'Rozwiązanie',1,20000)};
      if(type==='email'){const id=integer(a.value,'Szablon e-mail'),template=db.prepare('SELECT * FROM mail_templates WHERE id=? AND enabled=1').get(id);if(!template||(template.project_id&&template.project_id!==project.id))fail(400,'Wybierz szablon e-mail tego projektu.');return {type,value:id};}
      if(type==='webhook'){const id=integer(a.value,'Webhook');if(!db.prepare("SELECT id FROM webhook_endpoints WHERE id=? AND project_id=? AND direction='outbound' AND enabled=1").get(id,project.id))fail(400,'Wybierz aktywny webhook wychodzący projektu.');return {type,value:id};}
      return {type};
    });
    if(r.legacy){
      if(out.event==='ticket_created'&&out.from!==initial)fail(400,'Reguła utworzenia musi zaczynać się od statusu początkowego.');
      out.legacy=true;
    }
    const previous=old.find(x=>x.id===id),same=previous&&JSON.stringify(plain(out))===JSON.stringify(plain(previous));
    return {...out,revision:same?(previous.revision||1):(previous?.revision||0)+1,
      activated_at:same?(previous.activated_at||stamp):stamp,actor_id:same?(previous.actor_id||user.id):user.id};
  });
}

export function createAutomation(db,projects,getWorkflow,{clock=Date.now}={}){
  let sequence=0,timer,hooks={};
  const botFor=(p,id)=>{const u=id?db.prepare('SELECT * FROM users WHERE id=?').get(id):db.prepare("SELECT * FROM users WHERE username IN ('desk.bot','itelade.bot')").get();if(!active(u)||!(projects.canWork(u,p)||projects.canPortal(u,p)))fail(409,'Konto nie ma dostępu do projektu.');return u;};
  const iso=()=>new Date(clock()).toISOString();
  const atomic=fn=>{const s=`automation_${++sequence}`;db.exec(`SAVEPOINT ${s}`);try{const result=fn();db.exec(`RELEASE ${s}`);return result;}catch(e){db.exec(`ROLLBACK TO ${s}; RELEASE ${s}`);throw e;}};
  const ticket=id=>db.prepare('SELECT * FROM tickets WHERE id=?').get(id);
  const rules=p=>getWorkflow(p).rules.map(normalizeRule);
  const log=(t,r,event,status,detail)=>db.prepare('INSERT INTO automation_runs(project_id,ticket_id,rule_id,rule_name,event,status,detail,created_at) VALUES(?,?,?,?,?,?,?,?)').run(t.project_id,t.id,r.id,r.name,event,status,detail,iso());
  const eligible=(r,t)=>r.enabled&&(r.from==='*'||r.from===t.workflow_status);
  function matches(r,t,previous,context={}){
    const checks=r.conditions.map(c=>{const value=c.field==='status_category'?t.status:c.field==='previous_status'?previous?.workflow_status:c.field==='customer_reply_locked'?Boolean(t.customer_reply_locked):Object.hasOwn(context,c.field)?context[c.field]:t[c.field];return c.op==='contains'?String(value??'').toLowerCase().includes(String(c.value).toLowerCase()):c.op==='not_contains'?!String(value??'').toLowerCase().includes(String(c.value).toLowerCase()):c.op==='eq'?value===c.value:value!==c.value;});
    return !checks.length||(r.match==='any'?checks.some(Boolean):checks.every(Boolean));
  }
  function schedule(t){
    if(!t||t.deleted_at||t.archived_at||projects.project(t.project_id)?.archived)return;
    for(const r of rules(t.project_id)){
      if(!timers.has(r.event)||!eligible(r,t))continue;
      const anchor=new Date(Math.max(Date.parse(t.automation_state_since||t.created_at),Date.parse(r.activated_at||t.created_at),r.event==='silence_elapsed'?Date.parse(t.automation_customer_at||t.created_at):0)).toISOString();
      const due=Date.parse(anchor)+r.after.value*units[r.after.unit];
      db.prepare(`INSERT INTO automation_jobs(ticket_id,project_id,rule_id,revision,cycle,anchor,due_at,created_at) VALUES(?,?,?,?,?,?,?,?)
        ON CONFLICT(ticket_id,rule_id,revision,cycle,anchor) DO UPDATE SET status='queued',finished_at=NULL WHERE automation_jobs.status='cancelled'`).run(t.id,t.project_id,r.id,r.revision||1,t.automation_cycle,anchor,due,iso());
    }
  }
  function cancel(id){db.prepare("UPDATE automation_jobs SET status='cancelled',finished_at=? WHERE ticket_id=? AND status='queued'").run(iso(),id);}
  function changed(before,after){
    const events=[];
    if(before.workflow_status!==after.workflow_status){
      db.prepare('UPDATE tickets SET automation_state_since=?,automation_cycle=automation_cycle+1,customer_reply_locked=CASE WHEN ?=\'closed\' THEN customer_reply_locked ELSE 0 END WHERE id=?').run(iso(),after.status,after.id);
      cancel(after.id);events.push('status_changed');
      if(after.status==='resolved'&&before.status!=='resolved')events.push('ticket_resolved');
      if(after.status==='closed'&&before.status!=='closed')events.push('ticket_closed');
      if(['resolved','closed'].includes(before.status)&&!['resolved','closed'].includes(after.status))events.push('ticket_reopened');
    }
    if(before.reporter_id!==after.reporter_id)events.push('reporter_changed');
    if(before.priority!==after.priority)events.push('priority_changed');
    if(before.assignee_id!==after.assignee_id)events.push('assignee_changed');
    if(before.custom_values!==after.custom_values)events.push('fields_changed');
    return events;
  }
  function render(body,t){
    const w=getWorkflow(t.project_id),p=projects.project(t.project_id),reporter=db.prepare('SELECT name FROM users WHERE id=?').get(t.reporter_id),assignee=t.assignee_id?db.prepare('SELECT name FROM users WHERE id=?').get(t.assignee_id):null;
    const values={'ticket.key':t.key,'ticket.title':t.title,'ticket.status':w.statuses.find(s=>s.key===t.workflow_status)?.name||t.status,'project.name':p.name,'reporter.name':reporter.name,'assignee.name':assignee?.name||'Nieprzypisane','ticket.resolution':t.resolution_text||''};
    return body.replace(/\{\{\s*([^{}]+?)\s*\}\}/g,(_,key)=>values[key]??'');
  }
  function execute(t,r,event,actor){
    const before={...t},w=getWorkflow(t.project_id),p=projects.project(t.project_id),actorId=actor?.id||r.actor_id||t.reporter_id;
    for(const a of r.actions){
      t=ticket(t.id);
      db.prepare("UPDATE tickets SET last_actor_id=?,change_source=CASE WHEN change_source='sync' THEN 'sync' ELSE 'automation' END WHERE id=?").run(actorId,t.id);
      if(a.type==='status'&&a.value!==t.workflow_status){
        if(t.status==='closed')fail(409,'Zamknięta sprawa jest ostateczna.');
        if(!w.transitions.some(x=>x.from===t.workflow_status&&x.to===a.value))fail(409,'Brak dozwolonego przejścia na mapie statusów.');
        const s=w.statuses.find(x=>x.key===a.value),stamp=iso();
        db.prepare("UPDATE tickets SET workflow_status=?,status=?,resolved_at=?,updated_at=?,resolution_text=?,change_source=CASE WHEN change_source='sync' THEN 'sync' ELSE 'automation' END WHERE id=?").run(s.key,s.category,['resolved','closed'].includes(s.category)?(t.resolved_at||stamp):null,stamp,a.resolution?render(a.resolution,t):t.resolution_text,t.id);
      }else if(a.type==='comment'){
        const bot=botFor(p,a.bot_id);if(!projects.canRead(bot,p,t)||(a.internal&&!projects.canWork(bot,p)))fail(403,'Autor nie ma dostępu do tej wiadomości.');db.prepare("INSERT INTO comments(ticket_id,author_id,body,internal,created_at,automation_rule,actual_actor_id,origin) VALUES(?,?,?,?,?,?,?,'automation')").run(t.id,bot.id,render(a.body,t),a.internal?1:0,iso(),r.id,actorId);
      }else if(a.type==='priority')db.prepare('UPDATE tickets SET priority=? WHERE id=?').run(a.value,t.id);
      else if(a.type==='assign'){
        const value=a.value==='actor'?(actor?.id??botFor(p,a.bot_id).id):a.value==='bot'?botFor(p,a.bot_id).id:a.value==='reporter'?t.reporter_id:a.value;
        if(value!==null){const u=db.prepare('SELECT * FROM users WHERE id=?').get(value);if(!active(u)||!projects.canWork(u,p))fail(409,'Wybrany opiekun utracił dostęp do projektu.');}
        db.prepare('UPDATE tickets SET assignee_id=? WHERE id=?').run(value,t.id);
      }else if(a.type==='lock')db.prepare('UPDATE tickets SET customer_reply_locked=1 WHERE id=?').run(t.id);
      else if(a.type==='resolution')db.prepare('UPDATE tickets SET resolution_text=? WHERE id=?').run(render(a.body,t),t.id);
      else if(a.type==='email'){if(!hooks.email)fail(503,'Poczta nie jest gotowa.');hooks.email(a.value,t,event,actorId);}
      else if(a.type==='webhook'){if(!hooks.webhook)fail(503,'Moduł webhooków nie jest gotowy.');hooks.webhook(a.value,t,event,actorId);}
      else if(a.type==='unlock'&&t.status!=='closed')db.prepare('UPDATE tickets SET customer_reply_locked=0 WHERE id=?').run(t.id);
    }
    db.prepare('UPDATE tickets SET updated_at=?,version=version+1 WHERE id=?').run(iso(),t.id);
    const after=ticket(t.id),events=changed(before,after);
    // Jawna akcja blokady ma pierwszeństwo przed domyślnym odblokowaniem przy ponownym otwarciu.
    if(r.actions.some(a=>a.type==='lock'))db.prepare('UPDATE tickets SET customer_reply_locked=1 WHERE id=?').run(t.id);
    const from=w.statuses.find(s=>s.key===before.workflow_status)?.name,to=w.statuses.find(s=>s.key===after.workflow_status)?.name;
    db.prepare('INSERT INTO activity(ticket_id,actor_id,body,created_at,automation_rule) VALUES(?,?,?,?,?)').run(t.id,actorId,`Automatyzacja „${r.name}”${from!==to?`: ${from} → ${to}`:''}.`,iso(),r.id);
    log(t,r,event,'done',`Wykonano ${r.actions.length} akcji.`);
    return events.map(event=>({event,previous:before}));
  }
  function cascade(id,queue,actor,seen=new Set()){
    while(queue.length){
      const context=queue.shift();
      let legacyMatched=false;
      for(const r of rules(ticket(id).project_id)){
        const t=ticket(id);
        if((r.legacy&&legacyMatched)||seen.has(r.id)||r.event!==context.event||!eligible(r,t)||!matches(r,t,context.previous,context))continue;
        if(r.legacy)legacyMatched=true;
        seen.add(r.id);
        try{queue.push(...atomic(()=>execute(t,r,context.event,actor)));}
        catch(e){log(t,r,context.event,'failed',e.status?e.message:'Nie udało się wykonać akcji. Sprawdź log serwera.');if(!e.status)console.error('Automatyzacja:',e.message);}
      }
    }
    schedule(ticket(id));
  }
  function emit(id,event,user,previous,context={}){return atomic(()=>{
    const t=ticket(id);if(!t||t.deleted_at||t.archived_at||projects.project(t.project_id)?.archived)return;
    if(!t.automation_state_since)db.prepare('UPDATE tickets SET automation_state_since=? WHERE id=?').run(t.created_at,id);
    if(event==='customer_reply'){
      db.prepare('UPDATE tickets SET automation_customer_at=? WHERE id=?').run(iso(),id);
      const ids=rules(t.project_id).filter(r=>r.event==='silence_elapsed').map(r=>r.id);
      for(const ruleId of ids)db.prepare("UPDATE automation_jobs SET status='cancelled',finished_at=? WHERE ticket_id=? AND rule_id=? AND status='queued'").run(iso(),id,ruleId);
    }
    cascade(id,[{event,previous,...context}],user);
  });}
  function onChange(before,user){return atomic(()=>{
    const t=ticket(before.id);cascade(t.id,changed(before,t).map(event=>({event,previous:before})),user);
  });}
  function processDue(ticketId=null){
    const jobs=db.prepare(`SELECT id FROM automation_jobs WHERE status='queued' AND due_at<=?${ticketId===null?'':' AND ticket_id=?'} ORDER BY due_at,id LIMIT 100`).all(clock(),...(ticketId===null?[]:[ticketId]));
    for(const item of jobs)atomic(()=>{
      const j=db.prepare('SELECT * FROM automation_jobs WHERE id=?').get(item.id);if(j.status!=='queued'||j.due_at>clock())return;
      const t=ticket(j.ticket_id),r=rules(j.project_id).find(r=>r.id===j.rule_id);
      if(!t||t.deleted_at||t.archived_at||projects.project(j.project_id)?.archived||!r||!eligible(r,t)||(r.revision||1)!==j.revision||t.automation_cycle!==j.cycle){db.prepare("UPDATE automation_jobs SET status='cancelled',finished_at=? WHERE id=?").run(iso(),j.id);return;}
      if(!matches(r,t)){
        log(t,r,r.event,'skipped','Warunki nie zostały spełnione w terminie wykonania.');db.prepare("UPDATE automation_jobs SET status='done',finished_at=? WHERE id=?").run(iso(),j.id);return;
      }
      try{
        const queue=atomic(()=>execute(t,r,r.event));
        db.prepare("UPDATE automation_jobs SET status='done',finished_at=?,last_error=NULL WHERE id=?").run(iso(),j.id);
        cascade(t.id,queue,null,new Set([r.id]));
      }catch(e){
        const detail=e.status?e.message:'Błąd wykonania. Sprawdź log serwera.';
        db.prepare("UPDATE automation_jobs SET status='failed',last_error=?,finished_at=? WHERE id=?").run(detail,iso(),j.id);log(t,r,r.event,'failed',detail);if(!e.status)console.error('Automatyzacja czasowa:',e.message);
      }
    });
    return jobs.length;
  }
  function reconcile(projectId){atomic(()=>{
    db.prepare("UPDATE automation_jobs SET status='cancelled',finished_at=? WHERE project_id=? AND status='queued'").run(iso(),projectId);
    for(const t of db.prepare('SELECT * FROM tickets WHERE project_id=?').all(projectId))schedule(t);
  });}
  function history(id){return {
    runs:db.prepare('SELECT a.*,t.key ticket_key FROM automation_runs a JOIN tickets t ON t.id=a.ticket_id WHERE a.project_id=? ORDER BY a.id DESC LIMIT 50').all(id),
    jobs:db.prepare("SELECT a.*,t.key ticket_key FROM automation_jobs a JOIN tickets t ON t.id=a.ticket_id WHERE a.project_id=? AND a.status IN ('queued','failed') ORDER BY a.due_at,a.id LIMIT 50").all(id).map(j=>({...j,rule_name:rules(id).find(r=>r.id===j.rule_id)?.name||'Usunięta reguła'}))
  };}
  function retry(id,jobId){atomic(()=>{
    const j=db.prepare("SELECT * FROM automation_jobs WHERE id=? AND project_id=? AND status='failed'").get(jobId,id);if(!j)fail(404,'Nie znaleziono błędnego zadania.');
    db.prepare("UPDATE automation_jobs SET status='queued',last_error=NULL,finished_at=NULL WHERE id=?").run(j.id);
  });processDue();}
  function ticketInfo(t,canWork){
    const jobs=db.prepare("SELECT due_at,rule_id FROM automation_jobs WHERE ticket_id=? AND status='queued' ORDER BY due_at").all(t.id),rs=rules(t.project_id);
    const closure=jobs.find(j=>{const r=rs.find(r=>r.id===j.rule_id);return r?.actions.some(a=>a.type==='status'&&getWorkflow(t.project_id).statuses.find(s=>s.key===a.value)?.category==='closed')&&r.actions.some(a=>a.type==='lock');});
    return {customer_reply_locked:Boolean(t.customer_reply_locked),auto_close_at:closure?new Date(closure.due_at).toISOString():null,...(canWork?{automation_pending:jobs.length}:{})};
  }
  function start(){if(timer)return;const tick=()=>{if(maintenance())return;try{processDue();}catch(e){console.error('Harmonogram automatyzacji:',e.message);}};tick();timer=setInterval(tick,15000);timer.unref();}
  return {setHooks(value){hooks=value;},emit,onChange,processDue,reconcile,history,retry,ticketInfo,start,stop(){clearInterval(timer);timer=null;}};
}
