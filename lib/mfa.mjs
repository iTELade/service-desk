import {randomBytes,createHmac,createHash,timingSafeEqual} from 'node:crypto';
import {fail,txFor} from './core.mjs';
import {secretStore} from './secrets.mjs';
const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const hash=v=>createHash('sha256').update(v).digest('hex');
export function base32(bytes){let bits=0,value=0,out='';for(const b of bytes){value=(value<<8)|b;bits+=8;while(bits>=5){out+=alphabet[(value>>>(bits-5))&31];bits-=5;}}if(bits)out+=alphabet[(value<<(5-bits))&31];return out;}
function decode(s){let bits=0,value=0,out=[];for(const c of s){const n=alphabet.indexOf(c);if(n<0)throw Error('Invalid base32');value=(value<<5)|n;bits+=5;if(bits>=8){out.push((value>>>(bits-8))&255);bits-=8;}}return Buffer.from(out);}
export function totp(secret,step,digits=6){const b=Buffer.alloc(8);b.writeBigUInt64BE(BigInt(step));const h=createHmac('sha1',decode(secret)).update(b).digest(),o=h.at(-1)&15;return String((h.readUInt32BE(o)&0x7fffffff)%10**digits).padStart(digits,'0');}
export function createMfa(db,{dataDir,clock=Date.now}){
  const audit=(id,action)=>db.prepare('INSERT INTO audit_events(actor_id,action,details,created_at) VALUES(?,?,?,?)').run(id,action,'{}',new Date(clock()).toISOString());
  const secrets=secretStore(dataDir),tx=txFor(db),row=id=>db.prepare('SELECT * FROM user_mfa WHERE user_id=?').get(id);
  function status(u){const r=row(u.id);return {enabled:Boolean(r?.enabled),recovery_remaining:r?.enabled?JSON.parse(r.recovery).length:0};}
  function setup(u){if(row(u.id)?.enabled)fail(409,'Najpierw wyłącz obecną konfigurację 2FA.');const key=base32(randomBytes(20));db.prepare('INSERT INTO user_mfa(user_id,secret,pending_until) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET secret=excluded.secret,pending_until=excluded.pending_until,last_step=-1').run(u.id,secrets.seal(key),clock()+600000);return {secret:key,uri:'otpauth://totp/'+encodeURIComponent('Service Desk:'+u.email)+'?secret='+key+'&issuer=Service%20Desk&algorithm=SHA1&digits=6&period=30'};}
  function consume(id,code,{pending=false}={}){const r=row(id);if(!r||(!pending&&!r.enabled)||(pending&&r.pending_until<clock()))return false;code=String(code||'').replace(/[\s-]/g,'');
    if(/^\d{6}$/.test(code)){const step=Math.floor(clock()/30000);for(const s of [step-1,step,step+1])if(s>r.last_step&&timingSafeEqual(Buffer.from(code),Buffer.from(totp(secrets.open(r.secret),s))))return Boolean(db.prepare('UPDATE user_mfa SET last_step=? WHERE user_id=? AND last_step<?').run(s,id,s).changes);}
    if(!pending&&/^[a-f0-9]{20}$/.test(code)){const codes=JSON.parse(r.recovery),i=codes.indexOf(hash(code));if(i>=0){codes.splice(i,1);db.prepare('UPDATE user_mfa SET recovery=? WHERE user_id=?').run(JSON.stringify(codes),id);return true;}}return false;
  }
  function enable(u,code){return tx(()=>{if(row(u.id)?.enabled)fail(409,'2FA jest już aktywne.');if(!consume(u.id,code,{pending:true}))fail(400,'Nieprawidłowy kod lub wygasła konfiguracja.');const recovery=Array.from({length:10},()=>randomBytes(10).toString('hex'));db.prepare('UPDATE user_mfa SET enabled=1,recovery=?,pending_until=0 WHERE user_id=?').run(JSON.stringify(recovery.map(hash)),u.id);db.prepare('DELETE FROM sessions WHERE user_id=? AND token<>?').run(u.id,u.token||'');audit(u.id,'mfa.enabled');return {recovery_codes:recovery};});}
  function disable(u,code){if(!consume(u.id,code))fail(400,'Nieprawidłowy kod 2FA.');db.prepare('DELETE FROM user_mfa WHERE user_id=?').run(u.id);db.prepare('DELETE FROM mfa_challenges WHERE user_id=?').run(u.id);audit(u.id,'mfa.disabled');return {ok:true};}
  function challenge(u){db.prepare('DELETE FROM mfa_challenges WHERE expires<? OR user_id=?').run(clock(),u.id);const token=randomBytes(32).toString('hex');db.prepare('INSERT INTO mfa_challenges(token,user_id,user_version,expires) VALUES(?,?,?,?)').run(hash(token),u.id,u.version,clock()+300000);return token;}
  function verify(token,code){const c=db.prepare('SELECT * FROM mfa_challenges WHERE token=?').get(hash(String(token||'')));if(!c||c.expires<clock()||c.attempts>=5)fail(401,'Weryfikacja wygasła. Zaloguj się ponownie.');db.prepare('UPDATE mfa_challenges SET attempts=attempts+1 WHERE token=?').run(c.token);const u=db.prepare('SELECT * FROM users WHERE id=?').get(c.user_id);if(!u?.active||!u.directory_active||u.registration_state!=='active'||u.version!==c.user_version||!consume(u.id,code))fail(401,'Nieprawidłowy kod lub konto jest wyłączone.');db.prepare('DELETE FROM mfa_challenges WHERE token=?').run(c.token);return u;}
  return {status,setup,enable,disable,challenge,verify,consume};
}
