import {mailAllowed} from './mail-access.mjs';
import {maintenance} from './maintenance.mjs';
import {createSmtp} from './smtp.mjs';
import {username,parts} from './usernames.mjs';
import {emailHtml} from './mail-template.mjs';
import {randomBytes,createHash} from 'node:crypto';
import {now,fail,txFor,text,choice,email} from './core.mjs';
import {secretStore} from './secrets.mjs';
const digest=v=>createHash('sha256').update(v).digest('hex');
export function createAccounts(db,{origin,encodePassword,dataDir,transport:injectedTransport,env=process.env}){
  const tx=txFor(db),secrets=secretStore(dataDir);
  const smtp=createSmtp(db,{dataDir,env,transport:injectedTransport});
  let sending=false;
  const settings=()=>{const r=db.prepare('SELECT * FROM app_settings WHERE id=1').get();return {language:'en',...JSON.parse(r.config),version:r.version,smtp_configured:smtp.settings().configured};};
  const publicConfig=()=>{const s=settings();return {brand_name:s.brand_name,registration_mode:s.registration_mode,language:s.language,password_reset_available:smtp.settings().configured,email_registration_available:smtp.settings().configured};};
  function save(b){
    const old=settings();if(b.version!==old.version)fail(409,'Ustawienia zmieniły się. Odśwież stronę.');
    const mode=choice(b.registration_mode,['closed','approval','email'],'tryb rejestracji');
    if(mode==='email'&&!smtp.settings().configured)fail(400,'Najpierw skonfiguruj SMTP w ustawieniach systemu.');
    const language=choice(b.language??old.language??'en',['en','pl'],'język systemu');
    const brand=text(b.brand_name,'Nazwa systemu',2,80);
    if(!Array.isArray(b.allowed_domains)||b.allowed_domains.length>100)fail(400,'Nieprawidłowa lista domen.');
    const domains=[...new Set(b.allowed_domains.map(d=>{d=text(d,'Domena',3,253).toLowerCase();if(!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(d))fail(400,'Nieprawidłowa domena rejestracji.');return d;}))];
    db.prepare('UPDATE app_settings SET config=?,version=version+1 WHERE id=1').run(JSON.stringify({...JSON.parse(db.prepare('SELECT config FROM app_settings WHERE id=1').get().config),brand_name:brand,company_name:text(b.company_name??old.company_name??brand,'Nazwa organizacji',2,100),registration_mode:mode,allowed_domains:domains,language}));
    return settings();
  }
  function queue(recipient,subject,body){
    if(!smtp.settings().configured)fail(503,'SMTP nie jest skonfigurowane.');
    db.prepare('INSERT INTO mail_outbox(recipient,subject,body,next_attempt,created_at) VALUES(?,?,?,?,?)').run(recipient,subject,secrets.seal(body),Date.now(),now());
  }
  function issueToken(u,purpose){
    const raw=randomBytes(32).toString('hex');
    db.prepare('DELETE FROM account_tokens WHERE user_id=? AND purpose=?').run(u.id,purpose);
    db.prepare('INSERT INTO account_tokens(token,user_id,purpose,expires_at) VALUES(?,?,?,?)').run(digest(raw),u.id,purpose,Date.now()+(purpose==='verify'?24*3600000:30*60000));
    const s=settings(),url=origin+'/#/'+(purpose==='verify'?'verify':'reset')+'/'+raw;
    queue(u.email,purpose==='verify'?`${s.brand_name} — potwierdź adres e-mail`:`${s.brand_name} — zmiana hasła`,`${s.brand_name}\n\n${purpose==='verify'?'Potwierdź swój adres e-mail, aby aktywować konto.':'Otrzymaliśmy prośbę o zmianę hasła do Twojego konta.'}\n\n${url}\n\nLink jest jednorazowy i ważny ${purpose==='verify'?'24 godziny':'30 minut'}. Jeśli to nie Ty wysłałeś tę prośbę, zignoruj wiadomość.`);
  }
  async function register(b){
    const s=settings();if(s.registration_mode==='closed')fail(403,'Samodzielna rejestracja jest wyłączona.');
    if(s.registration_mode==='email'&&!smtp.settings().configured)fail(503,'Rejestracja e-mail jest chwilowo niedostępna.');
    if(Object.hasOwn(b,'username'))fail(400,'Nazwę konta nadaje system.');
    const mail=email(b.email),name=text(b.first_name!==undefined?b.first_name+' '+(b.last_name||''):b.name,'Imię i nazwisko',2,100),n=parts(name);
    if(s.allowed_domains.length&&!s.allowed_domains.includes(mail.slice(mail.lastIndexOf('@')+1)))fail(400,'Rejestracja z tej domeny nie jest dostępna.');
    const encoded=await encodePassword(b.password);
    if(settings().version!==s.version)fail(409,'Zasady rejestracji zmieniły się. Odśwież stronę i spróbuj ponownie.');
    tx(()=>{
      if(db.prepare('SELECT id FROM users WHERE email=?').get(mail))return;
      const id=Number(db.prepare("INSERT INTO users(email,name,password,role,active,must_change,created_at,is_internal,registration_state) VALUES(?,?,?,'customer',1,0,?,0,?)").run(mail,name,encoded,now(),s.registration_mode==='email'?'pending_email':'pending_approval').lastInsertRowid);
      db.prepare('UPDATE users SET first_name=?,last_name=?,username=? WHERE id=?').run(n.first_name,n.last_name,username(db,n.first_name,n.last_name),id);
      if(s.registration_mode==='email')issueToken({id,email:mail},'verify');
    });
    return {message:s.registration_mode==='email'?'Jeśli konto można zarejestrować, otrzymasz wiadomość z linkiem aktywacyjnym.':'Jeśli konto można zarejestrować, administrator otrzyma zgłoszenie do zatwierdzenia. Po zatwierdzeniu możesz się zalogować.'};
  }
  function resend(mail,purpose){
    mail=email(mail);const u=db.prepare('SELECT * FROM users WHERE email=?').get(mail);
    if(smtp.settings().configured&&u?.auth_source==='local'&&u.account_kind==='human'&&!u.sso_only&&u.active&&((purpose==='verify'&&u.registration_state==='pending_email')||(purpose==='reset'&&u.registration_state==='active'))){
      tx(()=>issueToken(u,purpose));
    }
    return {message:'Jeśli konto spełnia warunki, otrzymasz wiadomość z dalszymi instrukcjami.'};
  }
  function tokenUser(raw,purpose){
    if(typeof raw!=='string'||!/^[a-f0-9]{64}$/.test(raw))fail(400,'Link jest nieprawidłowy lub wygasł.');
    const record=db.prepare('SELECT a.*,u.auth_source,u.active,u.registration_state FROM account_tokens a JOIN users u ON u.id=a.user_id WHERE a.token=? AND a.purpose=? AND a.expires_at>?').get(digest(raw),purpose,Date.now());
    if(!record||record.auth_source!=='local'||!record.active)fail(400,'Link jest nieprawidłowy lub wygasł.');
    return record;
  }
  function verify(raw){
    tx(()=>{const r=tokenUser(raw,'verify');if(r.registration_state!=='pending_email')fail(400,'Konto nie oczekuje potwierdzenia adresu.');db.prepare("UPDATE users SET registration_state='active',email_verified=1,version=version+1 WHERE id=?").run(r.user_id);db.prepare('DELETE FROM account_tokens WHERE user_id=? AND purpose=?').run(r.user_id,'verify');});
    return {message:'Adres potwierdzony. Możesz się zalogować.'};
  }
  async function reset(raw,password){
    tokenUser(raw,'reset');const encoded=await encodePassword(password);
    tx(()=>{const r=tokenUser(raw,'reset');if(r.registration_state!=='active')fail(400,'Konto jest nieaktywne.');db.prepare('UPDATE users SET password=?,must_change=0,version=version+1 WHERE id=?').run(encoded,r.user_id);db.prepare('DELETE FROM sessions WHERE user_id=?').run(r.user_id);db.prepare('DELETE FROM account_tokens WHERE user_id=?').run(r.user_id);});
    return {message:'Hasło zostało zmienione. Zaloguj się ponownie.'};
  }
  async function flush(){if(maintenance())return;
    if(sending||!smtp.settings().configured)return;sending=true;
    try{
      for(const m of db.prepare("SELECT * FROM mail_outbox WHERE status='queued' AND channel_id IS NULL AND next_attempt<=? ORDER BY id LIMIT 10").all(Date.now())){
        const metadata=m.metadata?JSON.parse(secrets.open(m.metadata)):{};if(!mailAllowed(db,m,metadata)){db.prepare("UPDATE mail_outbox SET status='failed',body='',metadata=NULL,last_error='Odbiorca utracił dostęp.' WHERE id=?").run(m.id);continue;}delete metadata.desk_internal;
        try{await smtp.send({from:{name:settings().brand_name,address:smtp.settings().from_email||'test@example.test'},to:{address:m.recipient},subject:m.subject,text:secrets.open(m.body),html:emailHtml({brand:settings().brand_name,title:m.subject,body:secrets.open(m.body),url:origin}),...metadata,disableFileAccess:true,disableUrlAccess:true});db.prepare("UPDATE mail_outbox SET status='sent',body='',attempts=attempts+1,last_error=NULL WHERE id=?").run(m.id);}
        catch(e){const attempts=m.attempts+1;db.prepare('UPDATE mail_outbox SET attempts=?,status=?,next_attempt=?,last_error=? WHERE id=?').run(attempts,attempts>=5?'failed':'queued',Date.now()+Math.min(30,2**attempts)*60000,String(e.code||'DELIVERY_FAILED').slice(0,80),m.id);}
      }
      db.prepare('DELETE FROM account_tokens WHERE expires_at<?').run(Date.now());
    }finally{sending=false;}
  }
  const timer=setInterval(()=>void flush(),5000).unref();
  return {smtp,settings,publicConfig,save,register,resend,verify,reset,flush,queue,status(){return db.prepare('SELECT id,recipient,subject,status,attempts,created_at,last_error FROM mail_outbox ORDER BY id DESC LIMIT 30').all();},stop(){clearInterval(timer);smtp.stop();}};
}
