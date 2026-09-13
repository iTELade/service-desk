import {join} from 'node:path';
import {mkdirSync,writeFileSync,readFileSync,renameSync,existsSync,readdirSync,lstatSync,copyFileSync,chmodSync,chownSync,rmSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {githubRelease,newer} from '../lib/releases.mjs';
export function copyTree(source,target,preserveOwner=true){mkdirSync(target,{recursive:true,mode:0o700});for(const name of readdirSync(source)){const a=join(source,name),b=join(target,name),s=lstatSync(a);if(s.isSymbolicLink()||(!s.isFile()&&!s.isDirectory()))throw new Error('Unsupported data file');if(s.isDirectory())copyTree(a,b,preserveOwner);else copyFileSync(a,b);chmodSync(b,s.mode&0o777);if(preserveOwner&&process.getuid?.()===0)chownSync(b,s.uid,s.gid);}}
export function integrity(dir){const db=new DatabaseSync(join(dir,'desk.sqlite'));try{const rows=db.prepare('PRAGMA integrity_check').all();if(rows.length!==1||Object.values(rows[0])[0]!=='ok')throw new Error('Backup integrity check failed');}finally{db.close();}}
export function createEngine({docker,dataDir,controlDir,backupDir,target,alias='service-desk:current',preserveOwner=true,release=githubRelease,fetcher=fetch,wait=ms=>new Promise(r=>setTimeout(r,ms)),clock=()=>Date.now()}){
  mkdirSync(controlDir,{recursive:true,mode:0o700});mkdirSync(backupDir,{recursive:true,mode:0o700});
  function write(name,data){const path=join(name==='journal.json'?backupDir:controlDir,name),tmp=path+'.tmp';writeFileSync(tmp,JSON.stringify(data),{mode:0o600});if(name!=='journal.json'&&preserveOwner&&process.getuid?.()===0)chownSync(tmp,1000,1000);renameSync(tmp,path);}
  const read=name=>{try{return JSON.parse(readFileSync(join(name==='journal.json'?backupDir:controlDir,name),'utf8'));}catch{return null;}};
  const phase=(job,phase,message)=>{job.phase=phase;job.message=message;job.at=new Date(clock()).toISOString();write('journal.json',job);write('status.json',{id:job.id,phase,message,version:job.version,at:job.at,backup:job.backup});};
  async function healthy(id,version){for(let i=0;i<60;i++){const c=await docker.inspect(id);if(!c.State.Running)throw new Error('Candidate stopped');if(c.State.Health?.Status==='healthy'){if(version){const r=await fetcher('http://'+target+':3000/healthz',{signal:AbortSignal.timeout(5000)});const b=await r.json();if(!r.ok||b.version!==version)throw new Error('Unexpected running version');}return;}await wait(2000);}throw new Error('Health check timeout');}
  async function rollback(job){phase(job,'rollback','Przywracanie poprzedniej wersji i kopii danych.');
    // Resolve candidate by the fixed name if the daemon created it before journal write.
    let named;try{named=await docker.inspect(target);}catch(e){if(e.status!==404)throw e;}
    if(named&&named.Id!==job.oldId){if(named.State.Running)await docker.stop(named.Id);await docker.remove(named.Id);}
    const old=await docker.inspect(job.oldId);if(old.State.Running)await docker.stop(old.Id);
    if(job.backupReady){const failed=join(backupDir,job.id+'-failed');if(!existsSync(failed))copyTree(dataDir,failed,preserveOwner);integrity(job.backup);for(const n of readdirSync(dataDir))rmSync(join(dataDir,n),{force:true,recursive:true});copyTree(job.backup,dataDir,preserveOwner);}
    if(old.Name!=='/'+target)await docker.rename(old.Id,target);await docker.tag(job.oldImage,alias);await docker.start(old.Id);await healthy(old.Id);
    phase(job,'rolled_back','Aktualizacja nie powiodła się. Przywrócono poprzednią wersję i dane.');rmSync(join(controlDir,'maintenance.json'),{force:true});
  }
  async function recover(){const j=read('journal.json');if(!j||['done','rolled_back','failed'].includes(j.phase))return;if(j.phase==='committed'){phase(j,'done','Aktualizacja zakończona.');rmSync(join(controlDir,'maintenance.json'),{force:true});return;}if(j.oldId&&existsSync(join(controlDir,'maintenance.json')))try{await rollback(j);}catch{phase(j,'rollback_failed','Nie udało się przywrócić systemu. Pozostawiono tryb konserwacji. Przywróć kopię według UPDATES.md.');}else phase(j,'failed','Przerwano przed zatrzymaniem aplikacji. Można ponowić.');}
  async function run(request){const {id,repo,tag,version,schema,token}=request;if(!/^[a-f0-9-]{36}$/.test(id))throw new Error('Invalid job');const job={id,version,phase:'queued'};phase(job,'queued','Weryfikowanie wydania.');try{
    const m=await release(repo,{tag,token});if(m.version!==version||!newer(version,request.current_version)||schema<m.minimum_schema||m.schema<schema)throw new Error('Incompatible release');
    const old=await docker.inspect(target);if(old.Config.Labels?.['com.service-desk.managed']!=='1'||!old.State.Running||!old.Mounts.some(x=>x.Destination==='/app/data')||!old.Mounts.some(x=>x.Destination==='/app/control'))throw new Error('Container is not managed');
    Object.assign(job,{oldId:old.Id,oldImage:old.Image,backup:join(backupDir,id),rollbackName:target+'.rollback-'+id.slice(0,8)});phase(job,'pulling','Pobieranie obrazu przypiętego do SHA256.');await docker.pull(m.image,token,repo.split('/')[0]);
    write('maintenance.json',{id,at:new Date(clock()).toISOString()});phase(job,'backing_up','Zatrzymywanie aplikacji i tworzenie spójnej kopii.');await docker.stop(old.Id);copyTree(dataDir,job.backup,preserveOwner);integrity(job.backup);job.backupReady=true;phase(job,'starting','Uruchamianie nowej wersji; trwa migracja bazy.');
    await docker.rename(old.Id,job.rollbackName);const next=await docker.create(target,old,m.image);job.newId=next.Id;phase(job,'starting','Uruchamianie nowej wersji.');await docker.start(next.Id);phase(job,'checking','Sprawdzanie zdrowia i wersji aplikacji.');await healthy(next.Id,version);
    await docker.tag(m.image,alias);phase(job,'committed','Nowa wersja przeszła kontrolę.');rmSync(join(controlDir,'maintenance.json'),{force:true});phase(job,'done','Aktualizacja zakończona. Odśwież stronę.');
  }catch{if(job.phase==='committed'||job.phase==='done')throw new Error('Commit finalization required');if(job.oldId&&existsSync(join(controlDir,'maintenance.json'))){try{await rollback(job);}catch{phase(job,'rollback_failed','Przywracanie wymaga interwencji administratora. Dane kopii zachowano; tryb konserwacji pozostaje włączony.');}}else phase(job,'failed','Aktualizacja przerwana przed zmianą danych. Sprawdź wydanie, GHCR, token i dostępne miejsce.');}}
  return {run,recover,write,read};
}
