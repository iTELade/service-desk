import {DateTime} from 'luxon';
import {fail,text,choice,integer,boolean,defaultSla} from './core.mjs';
export function validateSlaConfig(b,statuses){
  if(!b||!Array.isArray(b.rules)||b.rules.length>20)fail(400,'SLA: maksymalnie 20 mierników.');
  const timezone=text(b.timezone||'Europe/Warsaw','Strefa czasowa',1,100);if(!DateTime.now().setZone(timezone).isValid)fail(400,'Nieprawidłowa strefa SLA.');
  const week=b.week??Object.fromEntries([1,2,3,4,5,6,7].map(d=>[d,[['00:00','24:00']]]));
  const clean={};for(let day=1;day<=7;day++){
    if(!Array.isArray(week[day])||week[day].length>8)fail(400,'Dla każdego dnia SLA podaj przedziały godzin.');let last=-1;
    clean[day]=week[day].map(pair=>{if(!Array.isArray(pair)||pair.length!==2)fail(400,'Nieprawidłowy przedział SLA.');const [a,z]=pair.map(v=>{if(typeof v!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$|^24:00$/.test(v))fail(400,'Godzina SLA wymaga HH:MM.');const [h,m]=v.split(':').map(Number);return h*60+m;});if(a>=z||a<last)fail(400,'Przedziały muszą być uporządkowane i nie mogą się nakładać.');last=z;return pair;});
  }
  if(!Object.values(clean).some(x=>x.length))fail(400,'Kalendarz musi zawierać godziny pracy.');
  if(!Array.isArray(b.holidays??[])||(b.holidays??[]).length>1000)fail(400,'Maksymalnie 1000 dni wolnych.');
  const holidays=(b.holidays||[]).map(d=>{if(typeof d!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(d)||!DateTime.fromISO(d).isValid)fail(400,'Dzień wolny wymaga poprawnej daty YYYY-MM-DD.');return d;});
  const ids=new Set();const list=(v,n)=>{if(!Array.isArray(v)||v.length>30)fail(400,n+': lista statusów.');return [...new Set(v.map(s=>choice(s,statuses,n)))];};
  const rules=b.rules.map(r=>{const id=text(r.id,'ID miernika',1,50);if(ids.has(id))fail(400,'Powtórzone ID SLA.');ids.add(id);const goals={};for(const p of Object.keys(defaultSla))goals[p]=integer(r.goals?.[p],'Cel SLA w minutach',1,525600);
    return {id,visible_to_customer:boolean(r.visible_to_customer??false,'Widoczność dla klienta'),name:text(r.name,'Nazwa SLA',2,100),kind:choice(r.kind,['first_response','status'],'Pomiar SLA'),goals,start:list(r.start||[],'Start'),pause:list(r.pause||[],'Pauza'),stop:list(r.stop||[],'Stop'),reset_on_start:boolean(r.reset_on_start??false,'Reset SLA'),request_type_ids:(r.request_type_ids||[]).map(v=>integer(v,'Formularz'))};});
  return {timezone,week:clean,holidays,rules};
}
function intervals(date,calendar){
  if(calendar.holidays?.includes(date.toISODate()))return [];
  const at=v=>{const [h,m]=v.split(':').map(Number);return h===24?date.plus({days:1}).startOf('day'):date.set({hour:h,minute:m,second:0,millisecond:0});};
  return (calendar.week[date.weekday]||[]).map(([a,b])=>[at(a).toMillis(),at(b).toMillis()]);
}
export function workingMs(start,end,c){
  if(end<=start)return 0;if(!c.holidays?.length&&Object.values(c.week).length===7&&Object.values(c.week).every(v=>v.length===1&&v[0][0]==='00:00'&&v[0][1]==='24:00'))return end-start;let d=DateTime.fromMillis(start,{zone:c.timezone}).startOf('day'),sum=0,steps=0;
  while(d.toMillis()<end){if(++steps>36600)fail(400,'Zakres SLA przekracza 100 lat.');for(const [a,b] of intervals(d,c))sum+=Math.max(0,Math.min(end,b)-Math.max(start,a));d=d.plus({days:1});}return sum;
}
export function deadline(start,remaining,c){
  if(remaining<=0)return new Date(start).toISOString();let d=DateTime.fromMillis(start,{zone:c.timezone}).startOf('day');
  for(let n=0;n<36600;n++,d=d.plus({days:1})){for(const [a,b] of intervals(d,c)){const lo=Math.max(a,start),size=Math.max(0,b-lo);if(size>=remaining)return new Date(lo+remaining).toISOString();remaining-=size;}}return null;
}
export function createSla(db,projects,{clock=Date.now}={}){
  function metrics(t){
    const p=projects.project(t.project_id),settings=JSON.parse(p.settings||'{}'),spans=db.prepare('SELECT * FROM status_spans WHERE ticket_id=? ORDER BY started_at,id').all(t.id);
    let cfg=settings.sla;
    if(!cfg){const w=JSON.parse(db.prepare('SELECT config FROM project_workflows WHERE project_id=?').get(p.id).config),policy=JSON.parse(p.sla_policy),stop=w.statuses.filter(s=>['resolved','closed'].includes(s.category)).map(s=>s.key);cfg={timezone:'UTC',week:Object.fromEntries([1,2,3,4,5,6,7].map(d=>[d,[['00:00','24:00']]])),holidays:[],rules:[{id:'response',name:'Pierwsza odpowiedź',kind:'first_response',goals:Object.fromEntries(Object.keys(defaultSla).map(k=>[k,(policy[k]||defaultSla[k])[0]])),start:[],pause:[],stop:[],reset_on_start:false},{id:'resolution',name:'Rozwiązanie',kind:'status',goals:Object.fromEntries(Object.keys(defaultSla).map(k=>[k,(policy[k]||defaultSla[k])[1]])),start:[],pause:[],stop,reset_on_start:false}]};}
    return cfg.rules.filter(r=>!r.request_type_ids?.length||r.request_type_ids.includes(t.request_type_id)).map(r=>{
      const terminal=t.closed_at||(t.status==='closed'?t.updated_at:null)||t.archived_at;const bound=terminal?Date.parse(terminal):clock();let start=Date.parse(t.created_at),finished=null;
      if(r.start.length){const hits=spans.filter(s=>r.start.includes(s.status_key));if(!hits.length)return {id:r.id,name:r.name,visible_to_customer:Boolean(r.visible_to_customer),state:'not_started'};start=Date.parse((r.reset_on_start?hits.at(-1):hits[0]).started_at);}
      if(r.kind==='first_response'&&t.first_response_at&&Date.parse(t.first_response_at)>=start)finished=Date.parse(t.first_response_at);
      if(r.kind==='status'){const end=spans.find(s=>Date.parse(s.started_at)>=start&&r.stop.includes(s.status_key));if(end)finished=Date.parse(end.started_at);}
      const end=Math.min(bound,finished??bound);let elapsed=workingMs(start,end,cfg),pausedTime=0;
      for(const s of spans)if(r.pause.includes(s.status_key))pausedTime+=workingMs(Math.max(start,Date.parse(s.started_at)),Math.min(end,s.ended_at?Date.parse(s.ended_at):end),cfg);
      elapsed=Math.max(0,elapsed-pausedTime);const target=r.goals[t.priority]*60000,paused=!finished&&r.pause.includes(t.workflow_status),state=finished!==null?'completed':terminal?'stopped':paused?'paused':'running';
      return {id:r.id,name:r.name,visible_to_customer:Boolean(r.visible_to_customer),state,elapsed_ms:elapsed,target_ms:target,remaining_ms:target-elapsed,breached:elapsed>target,started_at:new Date(start).toISOString(),finished_at:finished===null?null:new Date(finished).toISOString(),due_at:state==='running'?(elapsed>target?deadline(start,target+pausedTime,cfg):deadline(bound,target-elapsed,cfg)):null,history_complete:Boolean(t.tracking_complete)};
    });
  }
  return {metrics};
}
