import {now,fail,txFor,text,choice,boolean} from './core.mjs';
import {automationEvents,createAutomation,normalizeRule,validateAutomation} from './automation.mjs';
export const categories={open:'Nowe',in_progress:'W trakcie',waiting:'Oczekuje na klienta',resolved:'Rozwiązane',closed:'Zamknięte'};
export const workflowEvents=automationEvents;
export function defaultWorkflow(){
  const statuses=Object.entries(categories).map(([key,name])=>({key,name,category:key}));
  const customer=new Set(['resolved:open','closed:open','resolved:closed']);
  return {initial:'open',statuses,transitions:statuses.filter(a=>a.category!=='closed').flatMap(a=>statuses.filter(b=>a.key!==b.key).map(b=>({from:a.key,to:b.key,actor:customer.has(a.key+':'+b.key)?'both':'team',name:b.name}))),rules:[{name:'Odpowiedź klienta ponownie otwiera sprawę',event:'customer_reply',from:'waiting',to:'open',enabled:true}]};
}
export function seedWorkflow(db,id){db.prepare('INSERT INTO project_workflows(project_id,config) VALUES(?,?)').run(id,JSON.stringify(defaultWorkflow()));}
export function createWorkflows(db,projects,options={}){
  const tx=txFor(db);
  function get(id){const r=db.prepare('SELECT * FROM project_workflows WHERE project_id=?').get(id);if(!r)fail(404,'Nie znaleziono obiegu projektu.');const w=JSON.parse(r.config);return {...w,rules:w.rules.map(normalizeRule),version:r.version};}
  const automation=createAutomation(db,projects,get,options);
  function validate(input,p,user,old){
    if(!input||!Array.isArray(input.statuses)||input.statuses.length<2||input.statuses.length>30)fail(400,'Obieg wymaga od 2 do 30 statusów.');
    const used=new Set(),names=new Set();
    const statuses=input.statuses.map(s=>{
      const key=text(s.key,'Identyfikator statusu',1,50),name=text(s.name,'Nazwa statusu',1,80);
      if(!/^[a-z][a-z0-9_]*$/.test(key)||['constructor','prototype','__proto__'].includes(key)||used.has(key)||names.has(name.toLowerCase()))fail(400,'Statusy muszą mieć unikalne identyfikatory i nazwy.');used.add(key);names.add(name.toLowerCase());
      return {key,name,category:choice(s.category,Object.keys(categories),'kategoria statusu')};
    });
    const initial=choice(input.initial,[...used],'status początkowy');
    if(['resolved','closed'].includes(statuses.find(s=>s.key===initial).category))fail(400,'Status początkowy musi należeć do aktywnej kategorii.');
    if(!Array.isArray(input.transitions)||input.transitions.length>900)fail(400,'Nieprawidłowa mapa przejść.');
    const edges=new Set(),transitions=input.transitions.map(t=>{
      const from=choice(t.from,[...used],'status źródłowy'),to=choice(t.to,[...used],'status docelowy');
      if(from===to||edges.has(from+':'+to))fail(400,'Przejścia nie mogą się powtarzać ani prowadzić do tego samego statusu.');edges.add(from+':'+to);
      return {from,to,actor:choice(t.actor??'team',['team','customer','both'],'wykonawca przejścia'),name:text(t.name||statuses.find(s=>s.key===to).name,'Nazwa przejścia',1,100)};
    });
    const reachable=new Set([initial]);let more=true;while(more){more=false;for(const t of transitions)if(reachable.has(t.from)&&!reachable.has(t.to)){reachable.add(t.to);more=true;}}
    if(reachable.size!==statuses.length)fail(400,'Każdy status musi być osiągalny ze statusu początkowego przez mapę przejść.');
    const rules=validateAutomation(input.rules,{statuses,transitions,initial,oldRules:old.rules,user,db,projects,project:p,stamp:new Date(options.clock?.()??Date.now()).toISOString()});
    for(const row of db.prepare('SELECT workflow_status,status,COUNT(*) n FROM tickets WHERE project_id=? GROUP BY workflow_status,status').all(p.id)){
      const target=statuses.find(s=>s.key===row.workflow_status);
      if(!target)fail(409,'Nie można usunąć statusu używanego przez zgłoszenia. Najpierw przenieś je innym przejściem.');
      if(target.category!==row.status)fail(409,'Nie można zmienić kategorii statusu używanego przez zgłoszenia. Dodaj nowy status i przejście.');
    }
    return {initial,statuses,transitions,rules};
  }
  function save(id,b,user){
    const p=projects.requireProject(id,user,true);if(p.archived)fail(409,'Projekt jest zarchiwizowany.');
    const old=get(p.id);if(b.version!==old.version)fail(409,'Mapa statusów zmieniła się. Odśwież przed zapisem.');const config=validate(b,p,user,old);
    const shape=c=>JSON.stringify({initial:c.initial,statuses:c.statuses,transitions:c.transitions});
    const detach=p.workflow_template_id&&shape(config)!==shape(old);
    return tx(()=>{
      if(detach)db.prepare('UPDATE projects SET workflow_template_id=NULL WHERE id=?').run(p.id);
      db.prepare('UPDATE project_workflows SET config=?,version=version+1 WHERE project_id=?').run(JSON.stringify(config),p.id);
      db.prepare('UPDATE projects SET version=version+1 WHERE id=?').run(p.id);
      automation.reconcile(p.id);
      projects.audit(p.id,user,'workflow.updated',{statuses:config.statuses.length,transitions:config.transitions.length,rules:config.rules.length});return get(p.id);
    });
  }
  function transitions(t,canWork){if(t.deleted_at||t.archived_at||t.status==='closed'||(!canWork&&t.customer_reply_locked))return [];const w=get(t.project_id);return w.transitions.filter(x=>x.from===t.workflow_status&&(canWork?x.actor!=='customer':x.actor!=='team')).map(x=>({...x,status_name:w.statuses.find(s=>s.key===x.to).name}));}
  function transition(t,b,canWork){
    const w=get(t.project_id);
    if(b.workflow_status!==undefined&&b.workflow_version!==w.version)fail(409,'Mapa statusów zmieniła się. Odśwież zgłoszenie.');
    let key=b.workflow_status;
    if(key===undefined&&b.status!==undefined){
      choice(b.status,Object.keys(categories),'kategoria statusu');
      if(b.status===t.status)return {key:t.workflow_status,category:t.status};
      const possible=transitions(t,canWork).map(x=>w.statuses.find(s=>s.key===x.to)).filter(s=>s.category===b.status);
      if(possible.length!==1)fail(403,'Wybierz dozwolone przejście na mapie statusów.');key=possible[0].key;
    }
    if(key===undefined||key===t.workflow_status)return {key:t.workflow_status,category:t.status};
    if(!transitions(t,canWork).some(x=>x.to===key))fail(403,'To przejście nie jest dozwolone dla Twojej roli i obecnego statusu.');
    const s=w.statuses.find(s=>s.key===key);return {key:s.key,category:s.category};
  }
  function start(p){const w=get(p.id),s=w.statuses.find(s=>s.key===w.initial);return {key:s.key,category:s.category};}
  function run(t,event,user){
    automation.emit(t.id,event,user);
  }
  function ticket(t,canWork){const w=get(t.project_id);const settings=JSON.parse(projects.project(t.project_id).settings||'{}');return {resolution_required:Boolean(settings.resolution_required),resolution_statuses:settings.resolution_statuses||[],status_name:w.statuses.find(s=>s.key===t.workflow_status)?.name||categories[t.status],status_category:t.status,workflow_version:w.version,transitions:transitions(t,canWork),...automation.ticketInfo(t,canWork)};}
  return {get,save,validate,transitions,transition,start,run,ticket,automation};
}
