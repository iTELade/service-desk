import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture,legacyDb} from './fixture.mjs';
import {createAccounts} from '../lib/accounts.mjs';
import {migrateV2} from '../lib/migrations.mjs';
const config=a=>({version:a.settings().version,brand_name:'iTELade Desk',allowed_domains:[],registration_mode:'email'});
const rawToken=mail=>mail.text.match(/\/#\/(?:verify|reset)\/([a-f0-9]{64})/)[1];
function setup(smtp=true){const f=fixture(),sent=[];const accounts=createAccounts(f.db,{origin:'https://tickets.example.test',encodePassword:async v=>{if(v.length<12)throw new Error('Hasło za krótkie');return 'test-hash:'+v;},dataDir:f.dataDir,env:{},...(smtp?{transport:{async sendMail(m){sent.push(m);}}}:{})});return {...f,accounts,sent,close(){accounts.stop();f.close();}};}
test('Rejestracja e-mail: klient bez eskalacji, zaszyfrowana kolejka i jednorazowy link',async()=>{
  const f=setup();try{
    f.accounts.save(config(f.accounts));await f.accounts.register({name:'Test klient',email:'client@example.test',password:'test-password-client',role:'admin',is_internal:true,active:true});
    let u=f.db.prepare('SELECT * FROM users WHERE email=?').get('client@example.test');assert.equal(u.role,'customer');assert.equal(u.is_internal,0);assert.equal(u.registration_state,'pending_email');
    const queue=f.db.prepare('SELECT * FROM mail_outbox').get();assert.ok(!queue.body.includes('https://'));await f.accounts.flush();assert.equal(f.sent.length,1);const token=rawToken(f.sent[0]);assert.match(f.sent[0].text,/https:\/\/tickets.example.test/);
    assert.ok(!JSON.stringify(f.db.prepare('SELECT * FROM account_tokens').all()).includes(token));
    await assert.rejects(f.accounts.reset(token,'test-password-new'),/Link/);
    f.accounts.verify(token);u=f.db.prepare('SELECT * FROM users WHERE id=?').get(u.id);assert.equal(u.email_verified,1);assert.equal(u.registration_state,'active');
  }finally{f.close();}
});
test('Token aktywacji wygasa, jest jednorazowy i nie służy do resetu hasła',async()=>{
  const f=setup();try{
    f.accounts.save(config(f.accounts));await f.accounts.register({name:'Client',email:'client@example.test',password:'test-password-client'});await f.accounts.flush();const token=rawToken(f.sent[0]);
    await assert.rejects(f.accounts.reset(token,'test-password-new'),/Link/);
    f.accounts.verify(token);assert.equal(f.db.prepare("SELECT registration_state FROM users WHERE email='client@example.test'").get().registration_state,'active');assert.throws(()=>f.accounts.verify(token),/Link/);
    await f.accounts.register({name:'Expired',email:'expired@example.test',password:'test-password-client'});await f.accounts.flush();const expired=rawToken(f.sent[1]);f.db.prepare('UPDATE account_tokens SET expires_at=0').run();assert.throws(()=>f.accounts.verify(expired),/Link/);
  }finally{f.close();}
});
test('Reset hasła: bez ujawniania istnienia kont, jednorazowy token i unieważnienie sesji',async()=>{
  const f=setup();try{
    const exists=f.accounts.resend('admin@example.test','reset'),missing=f.accounts.resend('missing@example.test','reset');assert.deepEqual(exists,missing);await f.accounts.flush();assert.equal(f.sent.length,1);
    const token=rawToken(f.sent[0]);f.db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run('old-session',1,'old-csrf',Date.now()+60000);
    await f.accounts.reset(token,'test-new-password-admin');assert.equal(f.db.prepare('SELECT COUNT(*) n FROM sessions').get().n,0);assert.equal(f.db.prepare('SELECT password FROM users WHERE id=1').get().password,'test-hash:test-new-password-admin');await assert.rejects(f.accounts.reset(token,'test-other-password'),/Link/);
  }finally{f.close();}
});
test('Rejestracja: zatwierdzanie bez SMTP, blokada domen i zamknięta rejestracja',async()=>{
  const f=setup(false);try{
    assert.throws(()=>f.accounts.save(config(f.accounts)),/SMTP/);
    f.accounts.save({...config(f.accounts),registration_mode:'approval',allowed_domains:['itelade.pl']});
    await assert.rejects(f.accounts.register({name:'Client',email:'outside@example.test',password:'test-password-client'}),/domeny/);
    await f.accounts.register({name:'Client',email:'client@itelade.pl',password:'test-password-client'});assert.equal(f.db.prepare("SELECT registration_state FROM users WHERE email='client@itelade.pl'").get().registration_state,'pending_approval');
    f.accounts.save({...config(f.accounts),registration_mode:'closed'});await assert.rejects(f.accounts.register({name:'Other',email:'other@itelade.pl',password:'test-password-client'}),/wyłączona/);
    assert.throws(()=>f.accounts.save({...config(f.accounts),version:1,registration_mode:'approval'}),/zmieniły/);
  }finally{f.close();}
});
test('Ponowna rejestracja nie przejmuje istniejącego konta ani jego uprawnień',async()=>{
  const f=setup();try{const old={...f.db.prepare('SELECT * FROM users WHERE id=1').get()};await f.accounts.register({name:'Intruder',email:old.email,password:'test-intruder-password',role:'admin'});assert.deepEqual({...f.db.prepare('SELECT * FROM users WHERE id=1').get()},old);}finally{f.close();}
});
test('Błąd SMTP pozostawia wiadomość do ponowienia i nie zapisuje sekretów z błędu',async()=>{
  const f=fixture();const accounts=createAccounts(f.db,{origin:'https://test.example',dataDir:f.dataDir,encodePassword:async()=>'',env:{},transport:{async sendMail(){throw Object.assign(new Error('SECRET_RAW_SMTP_ERROR'),{code:'EAUTH'});}}});
  try{accounts.queue('admin@example.test','Test','Sekretna zawartość');await accounts.flush();const row=f.db.prepare('SELECT * FROM mail_outbox').get();assert.equal(row.status,'queued');assert.equal(row.attempts,1);assert.equal(row.last_error,'EAUTH');assert.ok(!JSON.stringify(row).includes('Sekretna zawartość'));assert.ok(!JSON.stringify(row).includes('SECRET_RAW_SMTP_ERROR'));}finally{accounts.stop();f.close();}
});
test('Migracja istniejących danych v1 zachowuje zgłoszenia, dostęp zespołu i historię',()=>{
  const db=legacyDb();try{
    db.prepare("INSERT INTO users VALUES(2,'client@example.test','Client','hash','customer',1,0,'2026-09-01')").run();
    db.prepare("INSERT INTO users VALUES(3,'agent@example.test','Agent','hash','agent',1,0,'2026-09-01')").run();
    db.prepare("INSERT INTO projects VALUES(7,'OLD','Legacy','Opis','service',43,'2026-09-01')").run();
    db.prepare("INSERT INTO tickets(id,project_id,key,title,description,type,priority,status,reporter_id,created_at,updated_at) VALUES(5,7,'OLD-42','Legacy issue','Treść','incident','P3','open',2,'2026-09-01','2026-09-01')").run();
    db.prepare("INSERT INTO comments VALUES(1,5,3,'Prywatna notatka',1,'2026-09-02')").run();db.prepare("INSERT INTO sessions VALUES('old',1,'csrf',9999999999999)").run();
    migrateV2(db);migrateV2(db);assert.equal(db.prepare('SELECT number FROM tickets WHERE id=5').get().number,42);assert.equal(db.prepare('SELECT next_number FROM projects WHERE id=7').get().next_number,43);assert.equal(db.prepare('SELECT COUNT(*) n FROM comments').get().n,1);assert.equal(db.prepare('SELECT COUNT(*) n FROM sessions').get().n,0);
    assert.equal(db.prepare('SELECT role FROM project_members WHERE user_id=3 AND project_id=7').get().role,'agent');assert.equal(db.prepare('SELECT role FROM project_members WHERE user_id=2 AND project_id=7').get().role,'requester');assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
  }finally{db.close();}
});
