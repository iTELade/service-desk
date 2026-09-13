import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture,legacyDb} from './fixture.mjs';
import {migrateV2,migrateV3} from '../lib/migrations.mjs';
import {validateFields,validateValues,createCatalog} from '../lib/catalog.mjs';
import {createWorkflows} from '../lib/workflows.mjs';
const rejects=(fn,status)=>assert.throws(fn,e=>e.status===status);

test('Migracja v2 → v3 zachowuje identyfikatory, numery, sesje, komentarze i statusy; jest idempotentna',()=>{
  const db=legacyDb();try{
    db.prepare("INSERT INTO projects(id,key,name,kind,created_at) VALUES(7,'LEG','Historyczny','service',?)").run(new Date().toISOString());
    db.prepare("INSERT INTO tickets(id,project_id,key,title,description,type,priority,status,reporter_id,created_at,updated_at,version) VALUES(11,7,'LEG-42','Historyczna sprawa','Treść oryginalna','incident','P2','waiting',1,?,?,9)").run(new Date().toISOString(),new Date().toISOString());
    db.prepare("INSERT INTO comments(ticket_id,author_id,body,internal,created_at) VALUES(11,1,'Notatka',1,?)").run(new Date().toISOString());
    migrateV2(db);db.prepare("INSERT INTO sessions VALUES('session-test',1,'csrf-test',9999999999999)").run();
    const old=db.prepare('SELECT * FROM tickets WHERE id=11').get();migrateV3(db);migrateV3(db);
    const t=db.prepare('SELECT * FROM tickets WHERE id=11').get();for(const k of Object.keys(old))assert.equal(t[k],old[k]);
    assert.equal(t.workflow_status,'waiting');assert.equal(JSON.parse(t.form_snapshot).name,'Incydent');assert.deepEqual(JSON.parse(t.custom_values),{});
    assert.equal(db.prepare('SELECT COUNT(*) n FROM comments').get().n,1);assert.equal(db.prepare('SELECT COUNT(*) n FROM sessions').get().n,1);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM request_types').get().n,5);assert.equal(db.prepare('PRAGMA user_version').get().user_version,3);
    assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  }finally{db.close();}
});

test('Własne pola: walidacja typów, dat, limitów, wielokrotnego wyboru i pól wymaganych',()=>{
  const fields=validateFields([
    {key:'reason',label:'Powód',type:'text',required:true,max_length:8},
    {key:'count',label:'Liczba',type:'number',min:1,max:5},
    {key:'date',label:'Data',type:'date'},
    {key:'options',label:'Opcje',type:'multiselect',options:['A','B']},
    {key:'agree',label:'Zgoda',type:'checkbox',required:true},
    {key:'link',label:'Adres',type:'url'},
    {key:'email',label:'E-mail',type:'email'}
  ]);
  const valid={reason:'Praca',count:2,date:'2028-02-29',options:['A','B'],agree:true,link:'https://example.test/a',email:'TEST@example.test'};
  assert.equal(validateValues(fields,valid).email,'test@example.test');
  for(const patch of [{reason:'Za długi tekst'},{count:0},{count:'2'},{date:'2026-02-29'},{date:'2026-13-01'},{options:['C']},{options:['A','A']},{agree:false},{link:'javascript:alert(1)'},{email:'bad-address'},{unknown:'data'},{reason:'   '}])rejects(()=>validateValues(fields,{...valid,...patch}),400);
  rejects(()=>validateValues(fields,{}),400);
  for(const key of ['constructor','prototype','__proto__','a.b'])rejects(()=>validateFields([{key,label:'Pole',type:'text'}]),400);
  rejects(()=>validateFields([{key:'a',label:'A',type:'text'},{key:'a',label:'B',type:'date'}]),400);
  rejects(()=>validateFields([{key:'x',label:'X',type:'select',options:['a','a']}]),400);
});

test('Prywatne pola: klient nie widzi schematu, nie może ich nadpisać; edycja publicznych zachowuje prywatne wartości',()=>{
  const f=fixture();try{
    const catalog=createCatalog(f.db,f.projects),fields=validateFields([{key:'reason',label:'Powód',type:'text',required:true},{key:'private',label:'PRIVATE_LABEL',type:'text',visibility:'internal',required:true}]);
    const t={form_snapshot:JSON.stringify({name:'Formularz',fields}),custom_values:JSON.stringify({reason:'Wartość',private:'PRIVATE_VALUE'})};
    assert.ok(!JSON.stringify(catalog.ticket(t,false)).includes('PRIVATE'));
    assert.equal(JSON.parse(catalog.editValues(t,{reason:'Zmieniona'},false)).private,'PRIVATE_VALUE');
    rejects(()=>catalog.editValues(t,{private:'Próba'},false),403);
    rejects(()=>catalog.editValues(t,{reason:''},false),400);
    assert.deepEqual(validateValues(fields,{reason:'Klient'},false),{reason:'Klient'});
    rejects(()=>validateValues(fields,{reason:'Zespół'},true),400);
  }finally{f.close();}
});

test('Obiegi: izolacja projektów, graf osiągalny, jednoznaczne reguły i kontrola uprawnień przejść',()=>{
  const f=fixture();try{
    const p=f.projects.create({key:'WF',name:'Workflow'},f.admin),p2=f.projects.create({key:'WZ',name:'Inny obieg'},f.admin),workflows=createWorkflows(f.db,f.projects);
    let w=workflows.get(p.id);w.statuses.push({key:'answered',name:'Klient odpowiedział',category:'in_progress'});
    rejects(()=>workflows.save(p.id,w,f.admin),400);
    w.transitions.push({from:'waiting',to:'answered',actor:'team',name:'Odpowiedź otrzymana'});
    w.rules=[{name:'Klient odpowiedział',event:'customer_reply',from:'waiting',to:'answered',enabled:true}];
    const saved=workflows.save(p.id,w,f.admin);assert.equal(saved.version,2);assert.equal(workflows.get(p2.id).statuses.length,5);
    rejects(()=>workflows.save(p.id,w,f.admin),409);
    rejects(()=>workflows.save(p.id,{...saved,rules:[...saved.rules,...saved.rules]},f.admin),400);
    rejects(()=>workflows.save(p.id,{...saved,rules:[{...saved.rules[0],event:'ticket_created'}]},f.admin),400);
    const t={project_id:p.id,workflow_status:'waiting',status:'waiting'};
    rejects(()=>workflows.transition(t,{workflow_status:'answered',workflow_version:2},false),403);
    assert.equal(workflows.transition(t,{workflow_status:'answered',workflow_version:2},true).category,'in_progress');
    rejects(()=>workflows.transition(t,{workflow_status:'answered',workflow_version:1},true),409);
    rejects(()=>workflows.transition(t,{workflow_status:'unknown',workflow_version:2},true),403);
  }finally{f.close();}
});
