import {maintenance} from './maintenance.mjs';
import {parts} from './usernames.mjs';
import {Client,Filter,FilterParser} from 'ldapts';
import {createHash,randomBytes} from 'node:crypto';
import {isIP} from 'node:net';
import {now,fail,txFor,text,choice,integer,boolean,email,roleRank} from './core.mjs';
import {secretStore} from './secrets.mjs';

export const directoryDefaults={enabled:false,url:'ldaps://dc.ad.itelade.pl:636',bind_dn:'',base_dn:'OU=ITELADE,DC=ad,DC=itelade,DC=pl',user_filter:'(&(objectCategory=person)(objectClass=user)(mail=*))',uid_attribute:'objectGUID',login_attribute:'sAMAccountName',email_attribute:'mail',name_attribute:'displayName',group_attribute:'memberOf',default_role:'customer',is_internal:true,interval_minutes:0,disable_missing:true,max_disable_percent:25,ca_pem:'',mappings:[]};
const digest=v=>createHash('sha256').update(v).digest('hex');
const attr=(entry,name)=>entry[Object.keys(entry).find(k=>k.toLowerCase()===name.toLowerCase())];
const values=v=>v===undefined?[]:Array.isArray(v)?v:[v];
const first=v=>values(v)[0];
export function normalizeEntry(entry,c){
  const raw=first(attr(entry,c.uid_attribute));
  if(raw===undefined||raw===null||String(raw)==='')throw new Error('Wpis LDAP bez trwałego identyfikatora.');
  const uid=Buffer.isBuffer(raw)?'bin:'+raw.toString('hex'):'str:'+String(raw);
  if(uid.length>512)throw new Error('Identyfikator LDAP jest za długi.');
  const login=text(String(first(attr(entry,c.login_attribute))??''),'Login LDAP',1,254).toLowerCase();
  const mail=email(String(first(attr(entry,c.email_attribute))??''));
  const name=text(String(first(attr(entry,c.name_attribute))??login),'Nazwa LDAP',1,100);
  const dn=text(entry.dn,'DN użytkownika',1,4096);
  if(Object.keys(entry).some(k=>k.toLowerCase().startsWith(c.group_attribute.toLowerCase()+';range=')))throw new Error('Serwer zwrócił niepełną listę grup (range). Synchronizacja zatrzymana.');
  const groups=values(attr(entry,c.group_attribute)).map(v=>String(v).trim().toLowerCase());
  const uac=Number(first(attr(entry,'userAccountControl'))||0);
  let active=(uac&2)===0 && String(first(attr(entry,'nsAccountLock'))||'').toLowerCase()!=='true';
  const expires=String(first(attr(entry,'accountExpires'))||'0');
  if(/^\d+$/.test(expires)){const n=BigInt(expires);if(n!==0n&&n!==9223372036854775807n&&n/10000n-11644473600000n<BigInt(Date.now()))active=false;}
  const memberships=new Map();
  for(const m of c.mappings)if(groups.includes(m.group_dn.toLowerCase())){const old=memberships.get(m.project_id);if(!old||roleRank[m.role]>roleRank[old])memberships.set(m.project_id,m.role);}
  const role=c.default_role==='agent'||[...memberships.values()].some(r=>r!=='requester')?'agent':'customer';
  return {uid,login,email:mail,name,dn,active,role,is_internal:c.is_internal,memberships:[...memberships].map(([project_id,role])=>({project_id,role}))};
}
export function createDirectory(db,projects,{dataDir,clientFactory}={}){
  const secrets=secretStore(dataDir),tx=txFor(db);
  let busy=false,preview=null,lastAutomatic=0,stopped=false;
  const settings=()=>{const r=db.prepare('SELECT * FROM ldap_settings WHERE id=1').get();return r?{...r,config:JSON.parse(r.config)}:{config:{...directoryDefaults},secret:null,version:0};};
  const output=()=>{const s=settings();return {config:s.config,version:s.version,has_password:Boolean(s.secret),busy,runs:db.prepare('SELECT * FROM ldap_runs ORDER BY id DESC LIMIT 20').all().map(r=>({...r,summary:JSON.parse(r.summary)}))};};
  function validate(b){
    const c={};for(const k of Object.keys(directoryDefaults))c[k]=b[k]??directoryDefaults[k];
    for(const k of ['enabled','is_internal','disable_missing'])c[k]=boolean(c[k],k);
    let url;try{url=new URL(c.url);}catch{fail(400,'Nieprawidłowy adres LDAP.');}
    if(!['ldaps:','ldap:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||url.pathname&&url.pathname!=='/')fail(400,'Podaj ldaps://host:636 albo ldap://host:389. LDAP zawsze używa TLS.');
    c.url=url.origin==='null'?url.href.replace(/\/$/,''):url.origin;
    c.bind_dn=text(c.bind_dn,'Konto odczytu LDAP',c.enabled?1:0,4096);
    c.base_dn=text(c.base_dn,'Base DN',1,4096);c.user_filter=text(c.user_filter,'Filtr',3,8000);
    try{FilterParser.parseString(c.user_filter);}catch{fail(400,'Nieprawidłowa składnia filtra LDAP.');}
    for(const k of ['uid_attribute','login_attribute','email_attribute','name_attribute','group_attribute']){c[k]=text(c[k],k,1,80);if(!/^[a-zA-Z][a-zA-Z0-9-]*$/.test(c[k]))fail(400,'Nieprawidłowa nazwa atrybutu LDAP.');}
    c.default_role=choice(c.default_role,['customer','agent'],'domyślna rola');
    c.interval_minutes=integer(c.interval_minutes,'Interwał',0,1440);if(c.interval_minutes>0&&c.interval_minutes<5)fail(400,'Minimalny interwał to 5 minut.');
    c.max_disable_percent=integer(c.max_disable_percent,'Limit wyłączeń',0,100);
    c.ca_pem=text(c.ca_pem,'Certyfikat CA',0,32000);if(c.ca_pem&&!c.ca_pem.includes('-----BEGIN CERTIFICATE-----'))fail(400,'Certyfikat CA musi mieć format PEM.');
    if(!Array.isArray(c.mappings)||c.mappings.length>100)fail(400,'Maksymalnie 100 mapowań grup.');
    c.mappings=c.mappings.map(m=>{const p=projects.project(integer(m.project_id,'Projekt'));if(!p)fail(400,'Projekt z mapowania nie istnieje.');const role=choice(m.role,['requester','agent','manager'],'rola');if(p.project_type==='internal'&&role==='requester')fail(400,'Projekt wewnętrzny nie przyjmuje klientów.');return {group_dn:text(m.group_dn,'DN grupy',1,4096),project_id:p.id,role};});
    return c;
  }
  function save(b,user){
    if(busy)fail(409,'Poczekaj na zakończenie operacji LDAP.');
    const old=settings();if(b.version!==old.version)fail(409,'Konfiguracja LDAP zmieniła się. Odśwież ją.');
    const c=validate({...old.config,...b.config});
    if(c.uid_attribute!==old.config.uid_attribute&&db.prepare("SELECT id FROM users WHERE auth_source='ldap' LIMIT 1").get())fail(409,'Atrybut trwałego identyfikatora jest zablokowany po pierwszym imporcie.');
    if(b.bind_password!==undefined&&(typeof b.bind_password!=='string'||b.bind_password.length>1024))fail(400,'Hasło LDAP: maksymalnie 1024 znaki.');
    const password=b.bind_password===undefined||b.bind_password===''?null:b.bind_password;
    const secret=password?secrets.seal(password):old.secret;
    if(c.enabled&&!secret)fail(400,'Uzupełnij hasło konta odczytu.');
    tx(()=>{
      db.prepare('INSERT INTO ldap_settings(id,config,secret,version) VALUES(1,?,?,1) ON CONFLICT(id) DO UPDATE SET config=excluded.config,secret=excluded.secret,version=ldap_settings.version+1').run(JSON.stringify(c),secret);
      // Nowe filtry i mapowania wymagają ponownego uwierzytelnienia kont LDAP.
      db.prepare("DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE auth_source='ldap')").run();
      projects.audit(null,user,'ldap.configured',{enabled:c.enabled,interval_minutes:c.interval_minutes,mapping_count:c.mappings.length});
    });
    preview=null;lastAutomatic=Date.now();return output();
  }
  async function withClient(c,fn){
    const hostname=new URL(c.url).hostname.replace(/^\[|\]$/g,''),startTLS=c.url.startsWith('ldap://');
    const tlsOptions={minVersion:'TLSv1.2',rejectUnauthorized:true,host:hostname,...(!isIP(hostname)?{servername:hostname}:{}),...(c.ca_pem?{ca:c.ca_pem}:{})};
    // ldapts treats any constructor tlsOptions as implicit TLS; pass them only for LDAPS.
    const client=clientFactory?clientFactory(c):new Client({url:c.url,connectTimeout:5000,timeout:8000,...(startTLS?{}:{tlsOptions}),strictDN:true});
    let timer;
    try{
      return await Promise.race([(async()=>{if(startTLS)await client.startTLS(tlsOptions);return fn(client);})(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Przekroczono czas operacji LDAP.')),120000);})]);
    }finally{clearTimeout(timer);await client.unbind().catch(()=>{});}
  }
  function requireSettings(){const s=settings();if(!s.config.enabled||!s.secret)fail(503,'LDAP jest wyłączony lub nie ma hasła konta odczytu.');return s;}
  async function readDirectory(s){
    return withClient(s.config,async client=>{
      await client.bind(s.config.bind_dn,secrets.open(s.secret));
      const c=s.config,rows=[];
      for await(const result of client.searchPaginated(c.base_dn,{scope:'sub',filter:c.user_filter,paged:{pageSize:200},sizeLimit:0,timeLimit:15,attributes:[c.uid_attribute,c.login_attribute,c.email_attribute,c.name_attribute,c.group_attribute,'userAccountControl','accountExpires','nsAccountLock'],explicitBufferAttributes:c.uid_attribute.toLowerCase()==='objectguid'?[c.uid_attribute]:[]})){
        if(result.searchReferences?.length)throw new Error('LDAP zwrócił odwołania do innego katalogu. Wynik jest niepełny.');
        for(const entry of result.searchEntries)rows.push(normalizeEntry(entry,c));
        if(rows.length>10000)throw new Error('Limit synchronizacji wynosi 10000 kont. Zawęź filtr.');
      }
      return rows;
    });
  }
  const fingerprint=()=>digest(JSON.stringify([db.prepare('SELECT id,email,role,active,auth_source,ldap_uid,ldap_login,directory_active,is_internal,registration_state,version FROM users ORDER BY id').all(),db.prepare('SELECT * FROM project_members ORDER BY project_id,user_id,source').all(),db.prepare('SELECT id,version FROM projects ORDER BY id').all()]));
  function plan(rows,c){
    const summary={created:0,updated:0,disabled:0,unchanged:0,total:rows.length,conflicts:[],large_disable:false,empty:rows.length===0,sample:rows.slice(0,20).map(r=>({name:r.name,email:r.email,login:r.login,role:r.role,active:r.active}))};
    const existing=db.prepare("SELECT * FROM users WHERE auth_source='ldap'").all(),byUid=new Map(existing.map(u=>[u.ldap_uid,u]));
    const seenUid=new Set(),seenEmail=new Set(),seenLogin=new Set();
    for(const r of rows){
      if(seenUid.has(r.uid)||seenEmail.has(r.email)||seenLogin.has(r.login)){summary.conflicts.push('Powtarzający się identyfikator, e-mail lub login: '+r.email);continue;}
      seenUid.add(r.uid);seenEmail.add(r.email);seenLogin.add(r.login);
      const same=byUid.get(r.uid),collision=db.prepare('SELECT id,auth_source FROM users WHERE email=?').get(r.email),loginCollision=db.prepare('SELECT id FROM users WHERE ldap_login=? OR username=?').get(r.login,r.login);
      if((collision&&collision.id!==same?.id)||(loginCollision&&loginCollision.id!==same?.id)){summary.conflicts.push('Adres lub login jest już zajęty: '+r.email);continue;}
      if(!same){summary.created++;continue;}
      const oldMemberships=db.prepare("SELECT project_id,role FROM project_members WHERE user_id=? AND source='ldap' ORDER BY project_id").all(same.id);
      const changed=same.name!==r.name||same.email!==r.email||same.ldap_dn!==r.dn||same.ldap_login!==r.login||same.role!==r.role||Boolean(same.directory_active)!==r.active||Boolean(same.is_internal)!==r.is_internal||JSON.stringify(oldMemberships)!==JSON.stringify([...r.memberships].sort((a,b)=>a.project_id-b.project_id));
      if(changed)summary.updated++;else summary.unchanged++;
      if(same.directory_active&&!r.active)summary.disabled++;
    }
    if(c.disable_missing)summary.disabled+=existing.filter(u=>u.directory_active&&!seenUid.has(u.ldap_uid)).length;
    const active=existing.filter(u=>u.directory_active).length;
    summary.large_disable=active>0&&summary.disabled/active*100>c.max_disable_percent;
    return summary;
  }
  const createRun=kind=>Number(db.prepare('INSERT INTO ldap_runs(kind,status,summary,created_at) VALUES(?,?,?,?)').run(kind,'running','{}',now()).lastInsertRowid);
  const finish=(id,status,summary)=>db.prepare('UPDATE ldap_runs SET status=?,summary=?,finished_at=? WHERE id=?').run(status,JSON.stringify(summary),now(),id);
  function safeError(e){if(e.status)return e.message;if(e.code===49)return 'LDAP odrzucił dane logowania konta odczytu.';if(/cert|certificate|TLS|self.signed|altname/i.test(e.message))return 'Błąd certyfikatu TLS. Sprawdź nazwę serwera i certyfikat CA.';if(/niepeł|Limit|identyfikator|range|Przekroczono/.test(e.message))return e.message;return 'Operacja LDAP nie powiodła się. Sprawdź połączenie, Base DN, filtr i uprawnienia konta odczytu.';}
  async function getPreview(user){
    if(busy)fail(409,'Operacja LDAP już trwa.');busy=true;const id=createRun('preview');
    try{const s=requireSettings(),rows=await readDirectory(s),summary=plan(rows,s.config);preview={token:randomBytes(24).toString('hex'),expires:Date.now()+5*60000,rows,summary,version:s.version,fingerprint:fingerprint()};finish(id,'preview',summary);return {preview_id:preview.token,...summary};}
    catch(e){finish(id,'failed',{error:safeError(e)});fail(502,safeError(e));}finally{busy=false;}
  }
  function commitRows(rows,c,summary,user){
    if(summary.conflicts.length)fail(409,'Najpierw usuń konflikty kont. Nie wykonano żadnej zmiany.');
    return tx(()=>{
      const seen=new Set();
      for(const r of rows){
        let u=db.prepare("SELECT * FROM users WHERE auth_source='ldap' AND ldap_uid=?").get(r.uid);
        if(!u){
          const id=db.prepare("INSERT INTO users(email,name,password,role,active,must_change,created_at,auth_source,ldap_uid,ldap_dn,ldap_login,directory_active,is_internal,email_verified) VALUES(?,?,'LDAP',?,1,0,?,'ldap',?,?,?,?,?,1)").run(r.email,r.name,r.role,now(),r.uid,r.dn,r.login,Number(r.active),Number(r.is_internal)).lastInsertRowid;
          u=db.prepare('SELECT * FROM users WHERE id=?').get(id);
        }
        seen.add(u.id);
        const old=db.prepare("SELECT project_id,role FROM project_members WHERE user_id=? AND source='ldap' ORDER BY project_id").all(u.id);
        const changed=u.email!==r.email||u.name!==r.name||u.ldap_login!==r.login||u.ldap_dn!==r.dn||u.role!==r.role||Boolean(u.directory_active)!==r.active||Boolean(u.is_internal)!==r.is_internal||JSON.stringify(old)!==JSON.stringify([...r.memberships].sort((a,b)=>a.project_id-b.project_id));
        {const n=parts(r.name);db.prepare('UPDATE users SET username=?,first_name=?,last_name=? WHERE id=?').run(r.login,n.first_name,n.last_name,u.id);}
        if(changed){db.prepare('UPDATE users SET email=?,name=?,role=?,ldap_dn=?,ldap_login=?,directory_active=?,is_internal=?,version=version+1 WHERE id=?').run(r.email,r.name,r.role,r.dn,r.login,Number(r.active),Number(r.is_internal),u.id);db.prepare('DELETE FROM sessions WHERE user_id=?').run(u.id);}
        db.prepare("DELETE FROM project_members WHERE user_id=? AND source='ldap'").run(u.id);
        if(r.active)for(const m of r.memberships)db.prepare("INSERT INTO project_members(project_id,user_id,role,source) VALUES(?,?,?,'ldap')").run(m.project_id,u.id,m.role);
        projects.clearAssignments(u.id);
      }
      if(c.disable_missing)for(const u of db.prepare("SELECT id FROM users WHERE auth_source='ldap'").all())if(!seen.has(u.id)){
        db.prepare('UPDATE users SET directory_active=0,version=version+1 WHERE id=?').run(u.id);
        db.prepare('DELETE FROM sessions WHERE user_id=?').run(u.id);
        db.prepare("DELETE FROM project_members WHERE user_id=? AND source='ldap'").run(u.id);
        projects.clearAssignments(u.id);
      }
      projects.audit(null,user,'ldap.synchronized',{created:summary.created,updated:summary.updated,disabled:summary.disabled,total:summary.total});
      return summary;
    });
  }
  function apply(b,user){
    if(busy)fail(409,'Operacja LDAP już trwa.');
    const p=preview,s=requireSettings();
    if(!p||p.token!==b.preview_id||p.expires<Date.now()||p.version!==s.version||p.fingerprint!==fingerprint())fail(409,'Podgląd wygasł lub dane zmieniły się. Pobierz nowy podgląd.');
    if((p.summary.large_disable||p.summary.empty)&&b.confirm_deactivation!==true)fail(409,'Podgląd wymaga potwierdzenia pustego katalogu lub dużej liczby wyłączeń.');
    const id=createRun('manual');
    try{const result=commitRows(p.rows,s.config,p.summary,user);finish(id,'success',result);preview=null;return result;}catch(e){finish(id,'failed',{error:safeError(e)});throw e;}
  }
  async function authenticate(user,password){
    if(typeof password!=='string'||!password.length||password.length>256)return false;
    const s=settings();if(!s.config.enabled||!s.secret)return false;
    const c=s.config;
    try{return await withClient(c,async client=>{
      await client.bind(c.bind_dn,secrets.open(s.secret));
      const filter=`(&${c.user_filter}(${c.login_attribute}=${Filter.escape(user.ldap_login)}))`;
      const result=await client.search(c.base_dn,{scope:'sub',filter,sizeLimit:2,timeLimit:8,attributes:[c.uid_attribute,c.login_attribute,c.email_attribute,c.name_attribute,c.group_attribute,'userAccountControl','accountExpires','nsAccountLock'],explicitBufferAttributes:c.uid_attribute.toLowerCase()==='objectguid'?[c.uid_attribute]:[]});
      if(result.searchReferences?.length||result.searchEntries.length!==1)return false;
      const r=normalizeEntry(result.searchEntries[0],c);
      if(r.uid!==user.ldap_uid||!r.active)return false;
      await client.bind(r.dn,password);
      return true;
    });}catch{return false;}
  }
  async function automatic(){if(maintenance())return;
    if(stopped||busy)return;const s=settings(),c=s.config;
    if(!c.enabled||!c.interval_minutes||Date.now()-lastAutomatic<c.interval_minutes*60000)return;
    lastAutomatic=Date.now();busy=true;const id=createRun('scheduled');
    try{const rows=await readDirectory(requireSettings()),summary=plan(rows,c);if(summary.empty||summary.large_disable||summary.conflicts.length){finish(id,'blocked',summary);return;}commitRows(rows,c,summary,null);finish(id,'success',summary);}
    catch(e){finish(id,'failed',{error:safeError(e)});}finally{busy=false;}
  }
  const timer=setInterval(()=>void automatic(),30000).unref();
  return {output,save,getPreview,apply,authenticate,automatic,stop(){stopped=true;clearInterval(timer);},settings};
}
