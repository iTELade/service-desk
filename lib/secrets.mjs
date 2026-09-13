import {randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
import {readFileSync,writeFileSync,chmodSync} from 'node:fs';
import {join} from 'node:path';
export function secretStore(dataDir){
  const path=join(dataDir,'master.key');
  try{writeFileSync(path,randomBytes(32),{flag:'wx',mode:0o600});}catch(e){if(e.code!=='EEXIST')throw e;}
  chmodSync(path,0o600);
  const key=readFileSync(path);if(key.length!==32)throw new Error('Nieprawidłowy plik master.key.');
  return {
    seal(value){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from('itelade-desk:v2'));const bytes=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);return [iv,cipher.getAuthTag(),bytes].map(b=>b.toString('base64')).join('.');},
    open(value){try{const [iv,tag,bytes]=value.split('.').map(x=>Buffer.from(x,'base64'));const cipher=createDecipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from('itelade-desk:v2'));cipher.setAuthTag(tag);return Buffer.concat([cipher.update(bytes),cipher.final()]).toString('utf8');}catch{throw new Error('Nie można odczytać sekretu. Przywróć master.key z kopii lub zapisz hasło ponownie.');}}
  };
}
