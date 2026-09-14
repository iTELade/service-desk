import {randomUUID} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync,renameSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {fail,now} from './core.mjs';
import {secretStore} from './secrets.mjs';
import {githubRelease,repository,newer} from './releases.mjs';
export const RELEASE_REPOSITORY='iTELade/service-desk';
import {VERSION,SCHEMA_VERSION} from './version.mjs';

export function createUpdates(db,projects,{dataDir,controlDir,fetcher=fetch}){
  const secrets=secretStore(dataDir),admin=u=>{if(u.role!=='admin')fail(403,'Aktualizacje obsługuje administrator.');};let checking=false;
  if(!db.prepare('SELECT id FROM release_settings WHERE id=1').get())db.prepare('INSERT INTO release_settings(id,secret) VALUES(1,?)').run(secrets.seal(''));
  const row=()=>db.prepare('SELECT * FROM release_settings WHERE id=1').get();
  {const c=JSON.parse(row().config);db.prepare('UPDATE release_settings SET config=? WHERE id=1').run(JSON.stringify({...c,repository:RELEASE_REPOSITORY,automatic_checks:true,...(c.repository&&c.repository!==RELEASE_REPOSITORY?{latest:null,checked_at:null}:{})}));}
  const jsonFile=name=>{try{return JSON.parse(readFileSync(join(controlDir,name),'utf8'));}catch{return null;}};
  function status(u){admin(u);const r=row(),config=JSON.parse(r.config),agent=controlDir?jsonFile('heartbeat.json'):null,job=controlDir?jsonFile('status.json'):null;return {...config,version:r.version,current_version:VERSION,schema:SCHEMA_VERSION,has_token:Boolean(r.secret&&secrets.open(r.secret)),agent_available:Boolean(agent&&Date.now()-Date.parse(agent.at)<30000),job,update_available:Boolean(config.latest&&newer(config.latest.version,VERSION))};}
  function save(b,u){admin(u);const r=row();if(r.version!==b.version)fail(409,'Konfiguracja wydań zmieniła się.');if(b.repository&&b.repository!==RELEASE_REPOSITORY)fail(400,'Repozytorium aktualizacji jest stałe.');const repo=RELEASE_REPOSITORY,old=JSON.parse(r.config),config={repository:repo,...(repo===old.repository?{latest:old.latest,checked_at:old.checked_at}:{}),automatic_checks:true};db.prepare('UPDATE release_settings SET config=?,secret=?,version=version+1 WHERE id=1').run(JSON.stringify(config),b.token?secrets.seal(String(b.token).slice(0,2000)):b.clear_token?secrets.seal(''):r.secret);projects.audit(null,u,'updates.configured',{repository:repo});return status(u);}
  async function check(u){admin(u);if(checking)fail(409,'Sprawdzanie wydania już trwa.');checking=true;try{const r=row(),cfg=JSON.parse(r.config);if(!cfg.repository)fail(400,'Najpierw podaj repozytorium GitHub.');const latest=await githubRelease(cfg.repository,{token:r.secret?secrets.open(r.secret):'',fetcher});if(row().version!==r.version)fail(409,'Konfiguracja zmieniła się podczas sprawdzania.');db.prepare('UPDATE release_settings SET config=? WHERE id=1').run(JSON.stringify({...cfg,latest,checked_at:now(),last_error:null}));return status(u);}catch(e){const r=row(),c=JSON.parse(r.config);db.prepare('UPDATE release_settings SET config=? WHERE id=1').run(JSON.stringify({...c,checked_at:now(),last_error:e.status?e.message:'Nie udało się połączyć z GitHub.'}));throw e;}finally{checking=false;}}
  function request(b,u){admin(u);const s=status(u);if(!s.agent_available)fail(503,'Uruchom kontener aktualizatora według UPDATES.md.');if(!s.latest||b.version!==s.latest.version||!newer(s.latest.version,VERSION))fail(409,'Najpierw sprawdź dostępne wydanie.');if(s.latest.minimum_schema>SCHEMA_VERSION||s.latest.schema<SCHEMA_VERSION)fail(409,'Wydanie nie obsługuje obecnego schematu. Wymagana aktualizacja pośrednia.');if(existsSync(join(controlDir,'request.json'))||s.job&&['queued','pulling','backing_up','starting','checking','rollback'].includes(s.job.phase))fail(409,'Aktualizacja już trwa.');
    const id=randomUUID(),r=row(),request={id,repo:s.repository,tag:s.latest.tag,version:s.latest.version,current_version:VERSION,schema:SCHEMA_VERSION,token:r.secret?secrets.open(r.secret):'',requested_at:now()};
    mkdirSync(controlDir,{recursive:true,mode:0o700});const temporary=join(controlDir,'request-'+id+'.tmp');writeFileSync(temporary,secrets.seal(JSON.stringify(request)),{mode:0o600,flag:'wx'});renameSync(temporary,join(controlDir,'request.json'));projects.audit(null,u,'updates.requested',{job_id:id,version:request.version});return {id,message:'Zlecono aktualizację. Etapy będą widoczne poniżej.'};
  }
  function maintenance(){return Boolean(controlDir&&existsSync(join(controlDir,'maintenance.json')));}
  let timer;function start(){timer=setInterval(()=>{const r=row(),c=JSON.parse(r.config);if(!c.repository||c.automatic_checks===false||checking||maintenance()||Date.now()-Date.parse(c.checked_at||'1970-01-01')<6*3600000)return;const u=db.prepare("SELECT * FROM users WHERE role='admin' AND active=1 AND account_kind='human' LIMIT 1").get();if(u)void check(u).catch(()=>{});},60000).unref();}
  return {status,save,check,request,maintenance,start,stop(){clearInterval(timer);}};
}
