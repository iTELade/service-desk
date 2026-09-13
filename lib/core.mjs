export const now = () => new Date().toISOString();
export const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
let transactionId=0;
export const txFor = db => fn => {const s='desk_tx_'+(++transactionId);db.exec(`SAVEPOINT ${s}`);try{const r=fn();db.exec(`RELEASE ${s}`);return r;}catch(e){db.exec(`ROLLBACK TO ${s}; RELEASE ${s}`);throw e;}};
export const text = (v, name, min=1, max=200) => {
  if(typeof v!=='string' || v.trim().length<min || v.trim().length>max) fail(400,`${name}: wymagane od ${min} do ${max} znaków.`);
  return v.trim();
};
export const choice = (v, values, name) => { if(!values.includes(v)) fail(400,`Nieprawidłowe pole: ${name}.`); return v; };
export const integer = (v, name, min=1, max=2147483647) => { if(!Number.isSafeInteger(v)||v<min||v>max)fail(400,`${name}: wymagana liczba całkowita od ${min} do ${max}.`);return v; };
export const boolean = (v, name) => {if(typeof v!=='boolean')fail(400,`${name}: wymagane tak lub nie.`);return v;};
export const email = v => {const result=text(v,'E-mail',3,254).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result))fail(400,'Nieprawidłowy e-mail.');return result;};
export const defaultSla = {P1:[60,480],P2:[240,1440],P3:[1440,4320],P4:[2880,10080]};
export function validateSla(value) {
  if(!value||Array.isArray(value)||typeof value!=='object')fail(400,'Nieprawidłowa polityka terminów.');
  const result={};
  for(const k of Object.keys(defaultSla)){
    if(!Array.isArray(value[k])||value[k].length!==2)fail(400,`Uzupełnij terminy dla ${k}.`);
    result[k]=value[k].map(n=>integer(n,'Termin w minutach',1,525600));
    if(result[k][0]>result[k][1])fail(400,'Termin odpowiedzi nie może przekraczać terminu rozwiązania.');
  }
  return result;
}
export const roleRank = {requester:1,agent:2,manager:3};
