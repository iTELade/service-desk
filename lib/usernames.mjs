import {fail,text} from './core.mjs';
const letters=s=>String(s||'').toLowerCase().replace(/ł/g,'l').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
export function parts(name){const a=String(name||'').trim().split(/\s+/);return {first_name:a.shift()||'',last_name:a.join(' ')};}
export function username(db,first,last,override,exclude=0){
  const used=v=>db.prepare('SELECT id FROM users WHERE username=? AND id<>?').get(v,exclude);
  if(override!==undefined){const v=text(override,'Nazwa użytkownika',2,80).toLowerCase();if(!/^[a-z0-9][a-z0-9._-]+$/.test(v))fail(400,'Nazwa użytkownika: litery, cyfry, kropka, myślnik lub podkreślenie.');if(used(v))fail(409,'Nazwa użytkownika jest zajęta.');return v;}
  const f=letters(first),l=letters(last).slice(0,5),base=(l+f.slice(0,Math.max(2,7-l.length))).padEnd(7,'0');
  if(!used(base))return base;
  for(let n=Math.max(2,7-l.length)+1;n<=f.length;n++){const v=l+f.slice(0,n);if(!used(v))return v;}
  for(let n=2;n<100000;n++){const v=base+n;if(!used(v))return v;}
  fail(409,'Nie można wygenerować unikalnej nazwy konta.');
}
