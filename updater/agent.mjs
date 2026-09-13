import {readFileSync,existsSync,unlinkSync,mkdirSync,chownSync,chmodSync} from 'node:fs';
import {join} from 'node:path';
import {Docker} from './docker.mjs';
import {createEngine} from './engine.mjs';
import {secretStore} from '../lib/secrets.mjs';
const dataDir=process.env.DATA_DIR||'/app/data',controlDir=process.env.CONTROL_DIR||'/app/control',backupDir=process.env.BACKUP_DIR||'/app/backups',target=process.env.DESK_CONTAINER_NAME||'itelade-desk';
if(!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,100}$/.test(target))throw new Error('Invalid target');
mkdirSync(controlDir,{recursive:true});chownSync(controlDir,1000,1000);chmodSync(controlDir,0o700);
// Run exactly one agent; the fixed container name prevents duplicate Compose replicas.
const engine=createEngine({docker:new Docker(),dataDir,controlDir,backupDir,target});
await engine.recover();
const heartbeat=()=>engine.write('heartbeat.json',{at:new Date().toISOString()});heartbeat();setInterval(heartbeat,5000);
for(;;){const requestFile=join(controlDir,'request.json');if(existsSync(requestFile)){
  try{if(engine.read('journal.json')?.phase==='rollback_failed')throw new Error('Recovery required');const r=JSON.parse(secretStore(dataDir).open(readFileSync(requestFile,'utf8')));unlinkSync(requestFile);await engine.run(r);}catch{try{unlinkSync(requestFile);}catch{}console.error('Nie wykonano zlecenia aktualizacji. Sprawdź status odzyskiwania.');}
}await new Promise(r=>setTimeout(r,2000));}
