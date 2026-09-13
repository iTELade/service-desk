import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixture.mjs';
import {createDirectory,directoryDefaults,normalizeEntry} from '../lib/directory.mjs';
const entry=(id='01',overrides={})=>({dn:`CN=Person${id},OU=ITELADE,DC=ad,DC=itelade,DC=pl`,objectGUID:Buffer.from(id.padStart(32,'0'),'hex'),sAMAccountName:'person'+id,mail:'person'+id+'@example.test',displayName:'Person '+id,memberOf:['CN=Support,OU=Groups,DC=ad,DC=itelade,DC=pl'],userAccountControl:'512',accountExpires:'0',...overrides});
function setup(){
  const f=fixture(),state={entries:[entry()],fail:false,partial:false,refs:false,binds:[],searches:[],startTLS:[]};
  const project=f.projects.create({key:'HELP',name:'Wsparcie',portal_access:'members'},f.admin);
  const directory=createDirectory(f.db,f.projects,{dataDir:f.dataDir,clientFactory:()=>({
    async startTLS(tls){state.startTLS.push(tls);},
    async bind(dn,password){state.binds.push({dn,password});if(state.fail||password==='wrong')throw new Error('Testowe zerwanie połączenia');},
    async *searchPaginated(){yield {searchEntries:state.entries,searchReferences:state.refs?['ldap://other.test']:[]};if(state.partial)throw new Error('Partial result');},
    async search(base,config){state.searches.push(config);return {searchEntries:[state.entries[0]],searchReferences:[]};},
    async unbind(){}
  })});
  const config={...directoryDefaults,enabled:true,bind_dn:'service@example.test',mappings:[{group_dn:'CN=Support,OU=Groups,DC=ad,DC=itelade,DC=pl',project_id:project.id,role:'agent'}]};
  directory.save({version:0,config,bind_password:'Test-only-directory-password'},f.admin);
  return {...f,directory,state,project,config,close(){directory.stop();f.close();}};
}
test('LDAP: pełny podgląd, szyfrowanie hasła, import i stabilna tożsamość po zmianie DN/e-maila',async()=>{
  const f=setup();try{
    const preview=await f.directory.getPreview(f.admin);assert.equal(preview.created,1);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM users WHERE account_kind=CHAR(104,117,109,97,110)').get().n,1);
    assert.ok(!JSON.stringify(f.directory.output()).includes('Test-only-directory-password'));
    assert.ok(!f.db.prepare('SELECT secret FROM ldap_settings').get().secret.includes('Test-only-directory-password'));
    f.directory.apply({preview_id:preview.preview_id},f.admin);let u=f.db.prepare("SELECT * FROM users WHERE auth_source='ldap'").get();assert.equal(u.role,'agent');assert.equal(u.is_internal,1);assert.equal(u.must_change,0);assert.equal(u.password,'LDAP');
    assert.equal(f.projects.canWork(u,f.project),true);const id=u.id;
    assert.equal(await f.directory.authenticate(u,'Test-only-user-password'),true);assert.equal(await f.directory.authenticate(u,''),false);assert.equal(await f.directory.authenticate(u,'wrong'),false);
    f.state.entries=[entry('01',{dn:'CN=Moved,OU=Users,DC=ad,DC=itelade,DC=pl',mail:'renamed@example.test',sAMAccountName:'renamed',displayName:'Nowa nazwa'})];
    const changed=await f.directory.getPreview(f.admin);assert.equal(changed.updated,1);f.directory.apply({preview_id:changed.preview_id},f.admin);
    u=f.db.prepare('SELECT * FROM users WHERE id=?').get(id);assert.equal(u.email,'renamed@example.test');assert.equal(u.ldap_login,'renamed');assert.equal(u.ldap_dn,f.state.entries[0].dn);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM users WHERE account_kind=CHAR(104,117,109,97,110)').get().n,2);
    assert.throws(()=>f.directory.apply({preview_id:changed.preview_id},f.admin),/Podgląd/);
  }finally{f.close();}
});
test('LDAP: awaria, częściowy wynik i referral nie wyłączają kont ani nie zmieniają danych',async()=>{
  const f=setup();try{
    f.directory.apply({preview_id:(await f.directory.getPreview(f.admin)).preview_id},f.admin);
    const snapshot=()=>JSON.stringify(f.db.prepare('SELECT * FROM users ORDER BY id').all());const before=snapshot();
    for(const flag of ['fail','partial','refs']){f.state[flag]=true;await assert.rejects(f.directory.getPreview(f.admin));assert.equal(snapshot(),before);f.state[flag]=false;}
  }finally{f.close();}
});
test('LDAP: konflikt z kontem lokalnym blokuje cały import, bez automatycznego łączenia kont',async()=>{
  const f=setup();try{
    f.state.entries=[entry(),entry('02',{mail:'admin@example.test'})];const p=await f.directory.getPreview(f.admin);assert.equal(p.conflicts.length,1);
    assert.throws(()=>f.directory.apply({preview_id:p.preview_id},f.admin),/konflikty/);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM users WHERE account_kind=CHAR(104,117,109,97,110)').get().n,1);assert.equal(f.db.prepare('SELECT role FROM users WHERE id=1').get().role,'admin');
  }finally{f.close();}
});
test('LDAP: pusty katalog wymaga świadomego zatwierdzenia, konta i historia pozostają',async()=>{
  const f=setup();try{
    f.directory.apply({preview_id:(await f.directory.getPreview(f.admin)).preview_id},f.admin);const u=f.db.prepare("SELECT * FROM users WHERE auth_source='ldap'").get();
    f.db.prepare('INSERT INTO sessions(token,user_id,csrf,expires_at) VALUES(?,?,?,?)').run('test-session',u.id,'test-csrf',Date.now()+60000);
    f.state.entries=[];const p=await f.directory.getPreview(f.admin);assert.equal(p.disabled,1);assert.equal(p.empty,true);
    assert.throws(()=>f.directory.apply({preview_id:p.preview_id},f.admin),/potwierdzenia/);
    f.directory.apply({preview_id:p.preview_id,confirm_deactivation:true},f.admin);assert.equal(f.db.prepare('SELECT directory_active FROM users WHERE id=?').get(u.id).directory_active,0);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM sessions').get().n,0);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM users WHERE account_kind=CHAR(104,117,109,97,110)').get().n,2);assert.equal(f.db.prepare('SELECT active FROM users WHERE id=1').get().active,1);
  }finally{f.close();}
});
test('LDAP: zmiana grup odbiera uprawnienia z LDAP; ręczne członkostwo i lokalna blokada pozostają',async()=>{
  const f=setup();try{
    f.directory.apply({preview_id:(await f.directory.getPreview(f.admin)).preview_id},f.admin);let u=f.db.prepare("SELECT * FROM users WHERE auth_source='ldap'").get();
    f.projects.setMember(f.project.id,u.id,'requester',f.admin);f.db.prepare('UPDATE users SET active=0 WHERE id=?').run(u.id);
    f.state.entries=[entry('01',{memberOf:[]})];f.directory.apply({preview_id:(await f.directory.getPreview(f.admin)).preview_id},f.admin);
    u=f.db.prepare('SELECT * FROM users WHERE id=?').get(u.id);assert.equal(u.active,0);assert.equal(u.role,'customer');assert.equal(f.projects.canWork(u,f.project),false);
    assert.deepEqual(f.db.prepare('SELECT source,role FROM project_members WHERE user_id=?').all(u.id).map(r=>({...r})),[{source:'manual',role:'requester'}]);
  }finally{f.close();}
});
test('LDAP: zmiana kont po podglądzie blokuje zastosowanie nieaktualnego planu',async()=>{
  const f=setup();try{const p=await f.directory.getPreview(f.admin);f.db.prepare('UPDATE users SET version=version+1 WHERE id=1').run();assert.throws(()=>f.directory.apply({preview_id:p.preview_id},f.admin),/Podgląd/);}finally{f.close();}
});
test('LDAP: automatyczna synchronizacja zatrzymuje masowe wyłączenia i nie usuwa kont',async()=>{
  const f=setup();try{
    f.directory.apply({preview_id:(await f.directory.getPreview(f.admin)).preview_id},f.admin);
    const raw=f.db.prepare('SELECT config FROM ldap_settings').get();f.db.prepare('UPDATE ldap_settings SET config=?').run(JSON.stringify({...JSON.parse(raw.config),interval_minutes:5}));
    const RealDate=Date.now;Date.now=()=>RealDate()+600000;
    try{f.state.entries=[];await f.directory.automatic();}finally{Date.now=RealDate;}
    assert.equal(f.db.prepare('SELECT status FROM ldap_runs ORDER BY id DESC LIMIT 1').get().status,'blocked');assert.equal(f.db.prepare("SELECT directory_active FROM users WHERE auth_source='ldap'").get().directory_active,1);
  }finally{f.close();}
});
test('LDAP: konto wyłączone/wygasłe, niepełne grupy i próba filtra nie dają dostępu',async()=>{
  const f=setup();try{
    assert.equal(normalizeEntry(entry('01',{userAccountControl:'514'}),f.config).active,false);
    assert.equal(normalizeEntry(entry('01',{accountExpires:'1'}),f.config).active,false);
    assert.throws(()=>normalizeEntry(entry('01',{'memberOf;range=0-1499':['CN=A']}),f.config),/niepełną/);
    f.state.entries=[entry('01',{sAMAccountName:'a*)(mail=*)'})];f.directory.apply({preview_id:(await f.directory.getPreview(f.admin)).preview_id},f.admin);
    const u=f.db.prepare("SELECT * FROM users WHERE auth_source='ldap'").get();assert.equal(await f.directory.authenticate(u,'valid-test-password'),true);
    assert.match(f.state.searches[0].filter,/\\2a\\29\\28mail=/);
    f.state.entries=[entry('01',{sAMAccountName:u.ldap_login,userAccountControl:'514'})];assert.equal(await f.directory.authenticate(u,'valid-test-password'),false);
  }finally{f.close();}
});
test('LDAP: StartTLS z weryfikacją certyfikatu i blokada zmiany UID po imporcie',async()=>{
  const f=setup();try{
    f.directory.save({version:1,config:{url:'ldap://dc.example.test:389'}},f.admin);await f.directory.getPreview(f.admin);assert.equal(f.state.startTLS[0].rejectUnauthorized,true);assert.equal(f.state.startTLS[0].minVersion,'TLSv1.2');
    f.directory.apply({preview_id:(await f.directory.getPreview(f.admin)).preview_id},f.admin);
    assert.throws(()=>f.directory.save({version:2,config:{uid_attribute:'entryUUID'}},f.admin),/zablokowany/);
    assert.throws(()=>f.directory.save({version:2,config:{url:'ldap://user:password@dc.test'}},f.admin),/Podaj/);
  }finally{f.close();}
});
