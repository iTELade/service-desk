import { DatabaseSync } from 'node:sqlite';
import { createInterface } from 'node:readline/promises';
import { randomBytes, scrypt } from 'node:crypto';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Nowe hasło wprowadź przez ukryty prompt skryptu reset-password.sh na hoście.
// Skrypt nie akceptuje hasła w argumentach ani nie wypisuje go do logów.
const file = resolve(process.env.DATA_DIR || './data', 'desk.sqlite');
if (!existsSync(file)) throw new Error('Nie znaleziono bazy.');
const rl = createInterface({input:process.stdin,terminal:false});
const input = [];
for await (const line of rl) {input.push(line); if(input.length===2){rl.close();break;}}
const [email,password] = input;
if(!email || !password || password.length<12 || password.length>256) throw new Error('Wymagany e-mail i hasło o długości 12–256 znaków.');
const db = new DatabaseSync(file);
db.exec('PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;');
const user = db.prepare('SELECT * FROM users WHERE email=?').get(email.toLowerCase());
if(!user) throw new Error('Nie znaleziono konta.');
if(user.auth_source && user.auth_source!=='local')throw new Error('Hasłem konta LDAP zarządza katalog firmowy.');
const salt=randomBytes(16).toString('hex'), key=await promisify(scrypt)(password,salt,64,{N:16384,r:8,p:1});
db.exec('BEGIN IMMEDIATE');
try{
  if(user.auth_source){
    const current=db.prepare('SELECT version FROM users WHERE id=?').get(user.id);
    if(current.version!==user.version)throw new Error('Konto zmieniło się. Ponów reset.');
    db.prepare('UPDATE users SET password=?,must_change=1,version=version+1 WHERE id=?').run(`${salt}:${key.toString('hex')}`,user.id);
    db.prepare('DELETE FROM account_tokens WHERE user_id=?').run(user.id);
  }else db.prepare('UPDATE users SET password=?,must_change=1 WHERE id=?').run(`${salt}:${key.toString('hex')}`,user.id);
  db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);
  db.exec('COMMIT');
}catch(e){db.exec('ROLLBACK');throw e;}
db.close();
console.log('Hasło zresetowane. Użytkownik ustawi własne hasło po zalogowaniu.');
