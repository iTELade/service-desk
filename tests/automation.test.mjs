import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture,legacyDb} from './fixture.mjs';
import {migrateV2,migrateV3,migrateV4} from '../lib/migrations.mjs';
import {createWorkflows} from '../lib/workflows.mjs';

const day=86400000;
const rule=(id,event,from,actions,extra={})=>({id,name:id,enabled:true,event,from,match:'all',conditions:[],actions,...extra});
const message=body=>({type:'comment',body,internal:false});
function setup(){
  const f=fixture();let time=Date.parse('2026-09-11T10:00:00.000Z');
  const p=f.projects.create({key:'AUTO',name:'iTELade automatyzacja'},f.admin),w=createWorkflows(f.db,f.projects,{clock:()=>time});
  f.db.prepare("INSERT INTO users(id,email,name,password,role,must_change,created_at) VALUES(20,'client@example.test','Klient','TEST','customer',0,?)").run(new Date(time).toISOString());
  const get=id=>f.db.prepare('SELECT * FROM tickets WHERE id=?').get(id);
  function create(){const stamp=new Date(time).toISOString(),n=f.db.prepare('SELECT COUNT(*) n FROM tickets').get().n+1;
    const result=f.db.prepare("INSERT INTO tickets(project_id,key,number,title,description,type,priority,status,workflow_status,reporter_id,created_at,updated_at) VALUES(?,?,?,'Problem z LDAP','Opis','incident','P3','open','open',20,?,?)").run(p.id,`AUTO-${n}`,n,stamp,stamp);const id=Number(result.lastInsertRowid);w.run(get(id),'ticket_created',f.admin);return id;}
  function state(id,key){const before=get(id),status=w.get(p.id).statuses.find(s=>s.key===key);assert.ok(status);
    f.db.prepare('UPDATE tickets SET status=?,workflow_status=?,resolved_at=?,updated_at=?,version=version+1 WHERE id=?').run(status.category,key,['resolved','closed'].includes(status.category)?before.resolved_at||new Date(time).toISOString():null,new Date(time).toISOString(),id);w.automation.onChange(before,f.admin);}
  function save(rules){return w.save(p.id,{...w.get(p.id),rules},f.admin);}
  function reply(id){w.run(get(id),'customer_reply',{id:20});}
  const jobs=id=>f.db.prepare("SELECT * FROM automation_jobs WHERE ticket_id=? AND status='queued' ORDER BY id").all(id);
  const comments=id=>f.db.prepare('SELECT * FROM comments WHERE ticket_id=? ORDER BY id').all(id);
  function preset(){return save([
    rule('notice','status_changed','resolved',[message('Dzień dobry {{reporter.name}}, sprawa {{ticket.key}} została rozwiązana. {{ticket.status}}. Za 5 dni zamknięcie.')]),
    rule('reopen','customer_reply','resolved',[{type:'status',value:'open'},{type:'unlock'},message('Otrzymaliśmy odpowiedź w sprawie {{ticket.key}}.')]),
    rule('autoclose','status_elapsed','resolved',[{type:'status',value:'closed'},{type:'lock'},message('Sprawa {{ticket.key}} została zamknięta.')],{after:{value:5,unit:'days'}})
  ]);}
  return {...f,p,w,get,create,state,save,reply,jobs,comments,preset,advance(ms){time+=ms;},clock:()=>time};
}

test('Migracja v3 → v4 zachowuje obiegi, sprawy, sesje i komentarze bez ponownego zasiewania konfiguracji',()=>{
  const db=legacyDb();try{
    db.exec("INSERT INTO projects(id,key,name,kind,created_at) VALUES(1,'IT','Firma','service','2026-09-01T00:00:00.000Z');");
    migrateV2(db);migrateV3(db);
    const config=JSON.parse(db.prepare('SELECT config FROM project_workflows WHERE project_id=1').get().config);config.statuses.push({key:'answered_custom',name:'Udzielono odpowiedzi',category:'in_progress'});
    db.prepare('UPDATE project_workflows SET config=?,version=8 WHERE project_id=1').run(JSON.stringify(config));
    db.exec("INSERT INTO tickets(id,project_id,key,number,title,description,type,priority,status,workflow_status,reporter_id,created_at,updated_at,version) VALUES(1,1,'IT-123',123,'Historyczna','Opis','incident','P2','in_progress','answered_custom',1,'2026-09-01','2026-09-02',14);");
    db.exec("INSERT INTO sessions VALUES('keep-session',1,'keep-csrf',9999999999999); INSERT INTO comments(ticket_id,author_id,body,internal,created_at) VALUES(1,1,'Keep note',1,'2026-09-02');");
    const before=db.prepare('SELECT * FROM tickets').get();migrateV4(db);migrateV4(db);
    const after=db.prepare('SELECT * FROM tickets').get();for(const k of Object.keys(before))assert.equal(after[k],before[k]);
    assert.equal(db.prepare('SELECT config FROM project_workflows').get().config,JSON.stringify(config));
    assert.equal(db.prepare('SELECT version FROM project_workflows').get().version,8);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM sessions').get().n,1);assert.equal(db.prepare('SELECT body FROM comments').get().body,'Keep note');
    assert.equal(db.prepare('SELECT COUNT(*) n FROM automation_jobs').get().n,0);assert.equal(db.prepare('PRAGMA user_version').get().user_version,4);
    assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  }finally{db.close();}
});

test('Pięć dni: wiadomość bota, dokładna granica czasu, ostateczna blokada i wykonanie tylko raz',()=>{
  const f=setup();try{
    f.preset();const id=f.create();f.state(id,'resolved');
    assert.equal(f.comments(id).length,1);assert.match(f.comments(id)[0].body,/Dzień dobry Klient, sprawa AUTO-1/);
    assert.equal(f.jobs(id)[0].due_at,f.clock()+5*day);assert.equal(f.w.ticket(f.get(id),false).auto_close_at,new Date(f.clock()+5*day).toISOString());
    f.advance(5*day-1);f.w.automation.processDue();assert.equal(f.get(id).status,'resolved');
    f.advance(1);f.w.automation.processDue();assert.equal(f.get(id).status,'closed');assert.equal(f.get(id).customer_reply_locked,1);
    assert.deepEqual(f.w.transitions(f.get(id),false),[]);assert.deepEqual(f.w.transitions(f.get(id),true),[]);
    assert.equal(f.comments(id).length,2);f.w.automation.processDue();assert.equal(f.comments(id).length,2);
    // Zapis niezmienionej mapy i nowa instancja silnika nie powielają zakończonej pracy.
    f.w.save(f.p.id,f.w.get(f.p.id),f.admin);createWorkflows(f.db,f.projects,{clock:f.clock}).automation.processDue();assert.equal(f.comments(id).length,2);
    assert.throws(()=>f.state(id,'open'),/DESK_FINAL_CLOSED/);assert.equal(f.get(id).customer_reply_locked,1);
  }finally{f.close();}
});

test('Odpowiedź przed terminem anuluje stary harmonogram, a kolejne rozwiązanie rozpoczyna pełne pięć dni',()=>{
  const f=setup();try{
    f.preset();const id=f.create();f.state(id,'resolved');f.advance(5*day-1);f.reply(id);
    assert.equal(f.get(id).status,'open');assert.equal(f.get(id).resolved_at,null);assert.equal(f.jobs(id).length,0);
    f.advance(2);f.w.automation.processDue();assert.equal(f.get(id).status,'open');
    f.state(id,'resolved');assert.equal(f.jobs(id)[0].due_at,f.clock()+5*day);assert.equal(f.comments(id).length,3);
    f.advance(5*day);f.w.automation.processDue();assert.equal(f.get(id).status,'closed');assert.equal(f.comments(id).length,4);
  }finally{f.close();}
});

test('Restart silnika zachowuje termin, spóźnione zadanie zostaje wykonane po wznowieniu',()=>{
  const f=setup();try{
    f.preset();const id=f.create();f.state(id,'resolved');const deadline=f.jobs(id)[0].due_at;
    const restarted=createWorkflows(f.db,f.projects,{clock:f.clock});assert.equal(f.jobs(id)[0].due_at,deadline);
    f.advance(6*day);restarted.automation.processDue();restarted.automation.processDue();assert.equal(f.get(id).status,'closed');assert.equal(f.comments(id).length,2);
  }finally{f.close();}
});

test('Nowa reguła daje historycznej sprawie pełny okres; zapis mapy nie przesuwa terminu, wyłączenie anuluje',()=>{
  const f=setup();try{
    const id=f.create();f.state(id,'resolved');f.advance(30*day);f.preset();let deadline=f.jobs(id)[0].due_at;
    assert.equal(deadline,f.clock()+5*day);f.advance(day);
    let w=f.w.get(f.p.id);w.statuses.find(s=>s.key==='resolved').name='Gotowe — do potwierdzenia';f.w.save(f.p.id,w,f.admin);assert.equal(f.jobs(id)[0].due_at,deadline);
    w=f.w.get(f.p.id);w.rules.find(r=>r.id==='autoclose').enabled=false;f.w.save(f.p.id,w,f.admin);assert.equal(f.jobs(id).length,0);
    f.advance(6*day);f.w.automation.processDue();assert.equal(f.get(id).status,'resolved');
    w=f.w.get(f.p.id);w.rules.find(r=>r.id==='autoclose').enabled=true;f.w.save(f.p.id,w,f.admin);assert.equal(f.jobs(id)[0].due_at,f.clock()+5*day);
  }finally{f.close();}
});

test('Brak odpowiedzi: licznik resetuje klient, komentarz agenta ani notatka nie przesuwają terminu',()=>{
  const f=setup();try{
    f.save([rule('reminder','silence_elapsed','waiting',[message('Przypomnienie {{ticket.key}}')],{after:{value:2,unit:'days'}})]);
    const id=f.create();f.state(id,'waiting');const original=f.jobs(id)[0].due_at;
    f.advance(day);f.w.run(f.get(id),'agent_reply',f.admin);f.w.run(f.get(id),'internal_note',f.admin);assert.equal(f.jobs(id)[0].due_at,original);
    f.reply(id);assert.equal(f.jobs(id)[0].due_at,f.clock()+2*day);f.advance(day);f.w.automation.processDue();assert.equal(f.comments(id).length,0);
    f.advance(day);f.w.automation.processDue();assert.equal(f.comments(id).length,1);assert.equal(f.jobs(id).length,0);
    f.w.save(f.p.id,f.w.get(f.p.id),f.admin);f.w.automation.processDue();assert.equal(f.comments(id).length,1);
  }finally{f.close();}
});

test('Warunki ORAZ/LUB, poprzedni status i kaskada zdarzeń działają bez zapętlenia komentarzy',()=>{
  const f=setup();try{
    f.save([
      rule('escalate','ticket_created','open',[{type:'priority',value:'P1'},{type:'assign',value:1}],{conditions:[{field:'priority',op:'eq',value:'P3'},{field:'type',op:'eq',value:'incident'}]}),
      rule('priority-note','priority_changed','*',[message('Krytyczna {{ticket.key}}')],{match:'any',conditions:[{field:'priority',op:'eq',value:'P1'},{field:'type',op:'eq',value:'bug'}]}),
      rule('agent-loop-guard','agent_reply','*',[message('Bot nie jest agentem')]),
      rule('close-note','ticket_closed','closed',[message('Zamknięcie przez wyzwalacz')],{conditions:[{field:'previous_status',op:'eq',value:'resolved'}]}),
      rule('loop-a','status_changed','in_progress',[{type:'status',value:'waiting'}]),
      rule('loop-b','status_changed','waiting',[{type:'status',value:'in_progress'}])
    ]);
    const id=f.create();assert.equal(f.get(id).priority,'P1');assert.equal(f.get(id).assignee_id,1);assert.equal(f.comments(id).length,1);
    f.state(id,'in_progress');assert.equal(f.get(id).status,'in_progress');assert.equal(f.db.prepare("SELECT COUNT(*) n FROM automation_runs WHERE rule_id IN ('loop-a','loop-b')").get().n,2);
    f.state(id,'resolved');f.state(id,'closed');assert.equal(f.comments(id).length,2);assert.match(f.comments(id)[1].body,/Zamknięcie przez wyzwalacz/);
  }finally{f.close();}
});

test('Błąd dowolnej akcji cofa całą regułę, historia pokazuje błąd, ponowienie jest idempotentne',()=>{
  const f=setup();try{
    f.db.prepare("INSERT INTO users(id,email,name,password,role,must_change,created_at,is_internal) VALUES(3,'agent@example.test','Agent','TEST','agent',0,?,1)").run(new Date(f.clock()).toISOString());
    f.projects.setMember(f.p.id,3,'agent',f.admin);
    f.save([rule('atomic','status_elapsed','waiting',[message('Nie może zostać częściowo zapisane'),{type:'assign',value:3}],{after:{value:1,unit:'minutes'}})]);
    const id=f.create();f.state(id,'waiting');f.db.exec('UPDATE users SET active=0 WHERE id=3');f.advance(60000);f.w.automation.processDue();
    assert.equal(f.comments(id).length,0);assert.equal(f.get(id).assignee_id,null);
    const history=f.w.automation.history(f.p.id);assert.equal(history.runs[0].status,'failed');assert.match(history.runs[0].detail,/utracił dostęp/);
    f.db.exec('UPDATE users SET active=1 WHERE id=3');f.w.automation.retry(f.p.id,history.jobs[0].id);assert.equal(f.comments(id).length,1);assert.equal(f.get(id).assignee_id,3);
    f.w.automation.processDue();assert.equal(f.comments(id).length,1);
  }finally{f.close();}
});

test('Warunki są ponownie sprawdzane w terminie; archiwum i zmiana statusu anulują wykonanie',()=>{
  const f=setup();try{
    f.save([rule('conditional','status_elapsed','waiting',[message('Priorytet P1')],{after:{value:1,unit:'hours'},conditions:[{field:'priority',op:'eq',value:'P1'}]})]);
    const a=f.create(),b=f.create(),c=f.create();f.state(a,'waiting');f.state(b,'waiting');f.state(c,'waiting');
    f.db.prepare("UPDATE tickets SET priority='P1' WHERE id=?").run(b);f.state(c,'open');f.advance(3600000);f.w.automation.processDue();
    assert.equal(f.comments(a).length,0);assert.equal(f.comments(b).length,1);assert.equal(f.comments(c).length,0);
    assert.equal(f.db.prepare("SELECT COUNT(*) n FROM automation_runs WHERE status='skipped'").get().n,1);
    f.state(c,'waiting');f.db.prepare('UPDATE projects SET archived=1 WHERE id=?').run(f.p.id);f.advance(3600000);f.w.automation.processDue();assert.equal(f.comments(c).length,0);
  }finally{f.close();}
});

test('Walidacja reguł odrzuca niedozwolone akcje, czasy, znaczniki i odwołania do obcych projektów',()=>{
  const f=setup();try{
    const invalid=[
      rule('bad','status_elapsed','*',[message('Test')],{after:{value:5,unit:'days'}}),
      rule('bad','status_elapsed','waiting',[message('Test')],{after:{value:-1,unit:'days'}}),
      rule('bad','status_elapsed','waiting',[message('Test')],{after:{value:367,unit:'days'}}),
      rule('bad','ticket_created','open',[{type:'shell',value:'command'}]),
      rule('bad','ticket_created','open',[message('{{user.password}}')]),
      rule('bad','ticket_created','open',[{type:'status',value:'missing'}]),
      rule('bad','ticket_created','open',[{type:'assign',value:20}]),
      rule('bad','ticket_created','open',[{type:'lock'},{type:'unlock'}]),
      rule('bad','ticket_created','open',[message('Test')],{conditions:[{field:'request_type_id',op:'eq',value:99999}]})
    ];
    for(const r of invalid)assert.throws(()=>f.save([r]),e=>e.status===400);
    assert.throws(()=>f.w.save(f.p.id,f.w.get(f.p.id),f.db.prepare('SELECT * FROM users WHERE id=20').get()),e=>e.status===404);
  }finally{f.close();}
});
