import {randomBytes,timingSafeEqual} from 'node:crypto';
import {readFileSync,writeFileSync,unlinkSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {fail,text,email,now,txFor} from './core.mjs';
import {username} from './usernames.mjs';

export function raster(raw){
  if(typeof raw!=='string'||raw.length>3000000||!/^[A-Za-z0-9+/]+={0,2}$/.test(raw))fail(400,'Wybierz plik PNG, JPEG lub WebP.');
  const body=Buffer.from(raw,'base64');if(body.length>2*1024*1024)fail(413,'Obraz może mieć maksymalnie 2 MB.');
  let mime;
  if(body.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))mime='image/png';
  else if(body[0]===255&&body[1]===216&&body[2]===255)mime='image/jpeg';
  else if(body.toString('ascii',0,4)==='RIFF'&&body.toString('ascii',8,12)==='WEBP')mime='image/webp';
  else fail(400,'Wybierz plik PNG, JPEG lub WebP.');return {mime,body};
}
export function createInstallation(db,{dataDir,encodePassword,projects,env=process.env}){
  const tx=txFor(db),file=join(dataDir,'setup-token');
  const required=()=>!db.prepare('SELECT completed_at FROM installation WHERE id=1').get().completed_at;
  if(required()&&!existsSync(file))writeFileSync(file,env.SETUP_TOKEN||randomBytes(24).toString('hex'),{mode:0o600,flag:'wx'});
  function token(){return required()?readFileSync(file,'utf8').trim():null;}
  function assertToken(value){if(!required())fail(409,'Instalacja została już zakończona.');const a=Buffer.from(String(value||'')),b=Buffer.from(token());if(a.length!==b.length||!timingSafeEqual(a,b))fail(403,'Nieprawidłowy kod instalacji z logu kontenera.');}
  const logo=()=>db.prepare('SELECT * FROM brand_assets WHERE id=1').get();
  function saveLogo(b,u){if(u.role!=='admin')fail(403,'Logo zmienia administrator.');if(b.remove===true)db.exec('DELETE FROM brand_assets');else{const image=raster(b.data);db.prepare('INSERT INTO brand_assets VALUES(1,?,?,?) ON CONFLICT(id) DO UPDATE SET mime=excluded.mime,body=excluded.body,updated_at=excluded.updated_at').run(image.mime,image.body,now());}projects.audit(null,u,'branding.logo_updated',{});return {ok:true};}
  async function complete(b){
    assertToken(b.token);const company=text(b.company_name,'Nazwa organizacji',2,100),brand=text(b.brand_name||company+' Desk','Nazwa systemu',2,80),first=text(b.first_name,'Imię administratora',1,60),last=text(b.last_name||'','Nazwisko',0,80),mail=email(b.email),image=b.logo?raster(b.logo):null;
    const password=await encodePassword(b.password);
    const result=tx(()=>{assertToken(b.token);if(db.prepare("SELECT id FROM users WHERE role='admin' AND account_kind='human'").get())fail(409,'Administrator już istnieje.');const un=username(db,first,last);
      const id=Number(db.prepare("INSERT INTO users(email,name,first_name,last_name,username,password,role,must_change,is_internal,created_at) VALUES(?,?,?,?,?,?,'admin',0,1,?)").run(mail,(first+' '+last).trim(),first,last,un,password,now()).lastInsertRowid);
      const settings=JSON.parse(db.prepare('SELECT config FROM app_settings WHERE id=1').get().config);db.prepare('UPDATE app_settings SET config=?,version=version+1 WHERE id=1').run(JSON.stringify({...settings,brand_name:brand,company_name:company,registration_mode:'closed'}));
      if(image)db.prepare('INSERT INTO brand_assets VALUES(1,?,?,?)').run(image.mime,image.body,now());
      db.prepare('UPDATE installation SET completed_at=? WHERE id=1').run(now());projects.audit(null,{id},'installation.completed',{company_name:company});return {message:'Instalacja zakończona. Zaloguj się i utwórz pierwszy projekt.',email:mail};
    });
    try{unlinkSync(file);}catch{}return result;
  }
  return {required,token,complete,logo,saveLogo};
}
