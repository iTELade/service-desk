import {randomInt,randomBytes,createHash} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync,readdirSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {fail} from './core.mjs';
const hash=v=>createHash('sha256').update(v).digest('hex');
// Only a successful password + email verification may create this marker.
// Consume before opening SQLite or starting any background integrations.
export function applyPendingReset(dataDir){
 const marker=join(dataDir,'reset-pending.json');
 if(existsSync(marker)){
  const job=JSON.parse(readFileSync(marker,'utf8'));if(job.action!=='factory-reset')throw Error('Nieprawidłowe zlecenie resetu.');
  for(const name of readdirSync(dataDir))if(name!=='reset-pending.json')rmSync(join(dataDir,name),{recursive:true,force:true});
  writeFileSync(join(dataDir,'disable-bootstrap'),'Reset wymaga nowego instalatora WWW.\n',{mode:0o600});
  writeFileSync(join(dataDir,'setup-token'),randomBytes(24).toString('hex'),{mode:0o600});
  rmSync(marker);
 }
 return existsSync(join(dataDir,'disable-bootstrap'));
}
export function createReset(db,{dataDir,accounts,checkPassword,onReset,canReset=()=>true,clock=Date.now}){
 const challenges=new Map();let pending=false;
 async function authorize(user,password){
  const current=db.prepare('SELECT * FROM users WHERE id=?').get(user.id);
  if(!current?.active||!current.directory_active||current.role!=='admin'||current.auth_source!=='local'||current.registration_state!=='active')fail(403,'Reset wymaga aktywnego lokalnego administratora.');
  if(!await checkPassword(password,current.password))fail(403,'Nieprawidłowe hasło administratora.');
  const fresh=db.prepare('SELECT * FROM users WHERE id=?').get(user.id);
  if(!fresh||fresh.version!==current.version||!fresh.active)fail(409,'Konto zmieniło się. Rozpocznij od nowa.');return fresh;
 }
 async function begin(user,b){
  if(pending)fail(409,'Reset już trwa.');if(!canReset())fail(409,'Zakończ aktualizację systemu przed resetem.');const u=await authorize(user,b.password);
  if(!accounts.settings().smtp_configured)fail(400,'Najpierw skonfiguruj główne SMTP i sprawdź wysyłkę.');
  const code=String(randomInt(100000,1000000));
  accounts.queue(u.email,'Potwierdzenie usunięcia danych Service Desk',`Kod resetu: ${code}\n\nUżycie kodu wraz z hasłem usuwa wszystkie konta, zgłoszenia i konfigurację aplikacji. Kod jest ważny 10 minut. Jeśli nie zlecałeś resetu, nie używaj go.`);
  challenges.set(u.id,{hash:hash(code),version:u.version,email:u.email,until:clock()+600000,attempts:0});return {ok:true};
 }
 async function confirm(user,b){
  if(pending)fail(409,'Reset już trwa.');if(!canReset())fail(409,'Zakończ aktualizację systemu przed resetem.');const c=challenges.get(user.id);
  if(!c||c.until<clock()||c.attempts>=5)fail(400,'Kod wygasł lub przekroczono liczbę prób.');
  c.attempts++;
  if(b.confirmation!=='USUŃ WSZYSTKO'||hash(String(b.code))!==c.hash)fail(400,'Nieprawidłowy kod lub tekst potwierdzenia.');
  const u=await authorize(user,b.password);
  if(c.version!==u.version||c.email!==u.email)fail(409,'Konto zmieniło się. Rozpocznij od nowa.');
  if(pending)fail(409,'Reset już trwa.');if(!canReset())fail(409,'Zakończ aktualizację systemu przed resetem.');
  writeFileSync(join(dataDir,'reset-pending.json'),JSON.stringify({action:'factory-reset',at:new Date(clock()).toISOString()}),{mode:0o600,flag:'wx'});
  pending=true;challenges.clear();onReset();return {ok:true,restarting:true};
 }
 return {begin,confirm,pending:()=>pending};
}
