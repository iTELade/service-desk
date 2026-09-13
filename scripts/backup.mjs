import {DatabaseSync} from 'node:sqlite';
import {existsSync,mkdirSync,copyFileSync,chmodSync,rmSync,constants,readFileSync} from 'node:fs';
import {resolve,dirname,isAbsolute,join} from 'node:path';
process.umask(0o077);
const dataDir=resolve(process.env.DATA_DIR||'./data'),file=join(dataDir,'desk.sqlite'),key=join(dataDir,'master.key');
if(!existsSync(file))throw new Error('Nie znaleziono bazy.');
const dest=process.argv[2];
if(!dest||!isAbsolute(dest))throw new Error('Podaj bezwzględną ścieżkę nowej kopii SQLite.');
const keyDest=dest+'.master.key';
if(existsSync(dest)||existsSync(keyDest))throw new Error('Plik kopii już istnieje. Wybierz nową nazwę.');
mkdirSync(dirname(dest),{recursive:true,mode:0o700});
const db=new DatabaseSync(file);let keyCopied=false,dbCopied=false;
try{
  db.exec('PRAGMA busy_timeout=10000;');
  if(db.prepare('PRAGMA user_version').get().user_version>=2){
    if(!existsSync(key)||readFileSync(key).length!==32)throw new Error('Brakuje poprawnego master.key. Kopia nie byłaby kompletna.');
    copyFileSync(key,keyDest,constants.COPYFILE_EXCL);keyCopied=true;chmodSync(keyDest,0o600);
  }
  db.prepare('VACUUM INTO ?').run(dest);dbCopied=true;chmodSync(dest,0o600);
  console.log(keyCopied?'Utworzono spójną kopię SQLite i klucza szyfrowania (.master.key).':'Utworzono spójną kopię bazy v1.');
}catch(e){if(keyCopied)rmSync(keyDest,{force:true});if(dbCopied)rmSync(dest,{force:true});throw e;}finally{db.close();}
