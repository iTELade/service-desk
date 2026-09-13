import nodemailer from 'nodemailer';
import {secretStore} from './secrets.mjs';
import {fail,text,email,integer,boolean,txFor} from './core.mjs';

export function createSmtp(db,{dataDir,env=process.env,transport:injectedTransport,transportFactory=c=>nodemailer.createTransport(c)}){
  const secrets=secretStore(dataDir),tx=txFor(db);let cached,cachedVersion;
  if(!db.prepare('SELECT id FROM smtp_settings WHERE id=1').get()){
    const enabled=Boolean(env.SMTP_HOST&&env.SMTP_FROM_EMAIL&&env.SMTP_PORT);
    const config={enabled,host:env.SMTP_HOST||'',port:Number(env.SMTP_PORT)||587,secure:env.SMTP_SECURE==='1',user:env.SMTP_USER||'',from_email:env.SMTP_FROM_EMAIL||'',imported_from_env:enabled};
    db.prepare('INSERT INTO smtp_settings(id,config,secret) VALUES(1,?,?)').run(JSON.stringify(config),secrets.seal(env.SMTP_PASS||''));
  }
  const row=()=>db.prepare('SELECT * FROM smtp_settings WHERE id=1').get();
  function settings(){const r=row(),c=JSON.parse(r.config);return {...c,version:r.version,has_password:Boolean(secrets.open(r.secret)),configured:Boolean(injectedTransport||c.enabled&&c.host&&c.from_email&&(!c.user||secrets.open(r.secret)))};}
  function validate(b){const c={enabled:boolean(b.enabled??true,'SMTP aktywne'),host:text(b.host??'','Serwer SMTP',0,253),port:integer(b.port??587,'Port SMTP',1,65535),secure:boolean(b.secure??false,'Połączenie TLS'),user:text(b.user??'','Login SMTP',0,300),from_email:b.from_email?email(b.from_email):'',imported_from_env:false};if(c.enabled&&(!c.host||!c.from_email))fail(400,'Podaj serwer i adres nadawcy SMTP.');if(/[\s/:@]/.test(c.host))fail(400,'Serwer SMTP: sama nazwa lub IPv4, bez protokołu i portu.');return c;}
  function transport(){if(injectedTransport)return injectedTransport;const r=row(),c=JSON.parse(r.config);if(!c.enabled)fail(503,'Skonfiguruj SMTP w ustawieniach systemu.');if(cached&&cachedVersion===r.version)return cached;cached?.close?.();cachedVersion=r.version;cached=transportFactory({host:c.host,port:c.port,secure:c.secure,requireTLS:!c.secure,...(c.user?{auth:{user:c.user,pass:secrets.open(r.secret)}}:{}),tls:{minVersion:'TLSv1.2',rejectUnauthorized:true},connectionTimeout:8000,greetingTimeout:8000,socketTimeout:15000,dnsTimeout:5000,disableFileAccess:true,disableUrlAccess:true,logger:false,debug:false});return cached;}
  function save(b,u){if(u.role!=='admin')fail(403,'Wymagany administrator.');return tx(()=>{const old=row();if(b.version!==old.version)fail(409,'SMTP zmieniło się. Odśwież ustawienia.');const c=validate(b),password=b.password?text(b.password,'Hasło SMTP',1,4000):b.clear_password===true?'':secrets.open(old.secret);if(c.enabled&&c.user&&!password)fail(400,'Uzupełnij hasło SMTP.');db.prepare('UPDATE smtp_settings SET config=?,secret=?,version=version+1 WHERE id=1').run(JSON.stringify(c),secrets.seal(password));return settings();});}
  async function send(message){return transport().sendMail({...message,disableFileAccess:true,disableUrlAccess:true});}
  async function test(u,brand){if(u.role!=='admin')fail(403,'Wymagany administrator.');try{await transport().verify();await send({from:{name:brand,address:settings().from_email||'test@example.test'},to:{address:u.email},subject:'Test poczty — '+brand,text:'Połączenie SMTP działa. To wiadomość testowa wysłana z ustawień systemu.'});return {message:'Serwer SMTP przyjął wiadomość testową dla '+u.email+'. Sprawdź skrzynkę i spam.'};}catch(e){fail(502,'SMTP: '+String(e.code||'DELIVERY_FAILED')+'. Sprawdź serwer, uwierzytelnienie i uprawnienie do wysyłania z tego adresu.');}}
  return {settings,save,send,test,stop(){cached?.close?.();}};
}
