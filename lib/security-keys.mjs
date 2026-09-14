import {createHash,createPublicKey,randomBytes,verify as verifySignature,timingSafeEqual} from 'node:crypto';
import {fail,text,integer} from './core.mjs';

const b64u=b=>Buffer.from(b).toString('base64url');
const from64=s=>Buffer.from(String(s||''),'base64url');
const sha=b=>createHash('sha256').update(b).digest();
const digest=s=>sha(String(s)).toString('hex');

function cbor(bytes,offset=0){
  const b=Buffer.from(bytes);let p=offset;
  const readLen=ai=>{if(ai<24)return ai;if(ai===24)return b[p++];if(ai===25){const v=b.readUInt16BE(p);p+=2;return v;}if(ai===26){const v=b.readUInt32BE(p);p+=4;return v;}throw new Error('Unsupported CBOR length.');};
  const read=()=>{
    const head=b[p++],major=head>>5,ai=head&31,len=readLen(ai);
    if(major===0)return len;
    if(major===1)return -1-len;
    if(major===2){const v=b.subarray(p,p+len);p+=len;return v;}
    if(major===3){const v=b.subarray(p,p+len).toString('utf8');p+=len;return v;}
    if(major===4){const a=[];for(let i=0;i<len;i++)a.push(read());return a;}
    if(major===5){const m=new Map();for(let i=0;i<len;i++)m.set(read(),read());return m;}
    if(major===7){if(ai===20)return false;if(ai===21)return true;if(ai===22)return null;}
    throw new Error('Unsupported CBOR value.');
  };
  const value=read();return {value,offset:p};
}
function clientData(encoded,type,expectedChallenge,origin){
  let raw;try{raw=from64(encoded);}catch{fail(400,'Invalid WebAuthn client data.');}
  let c;try{c=JSON.parse(raw.toString('utf8'));}catch{fail(400,'Invalid WebAuthn client data.');}
  if(c.type!==type||c.challenge!==expectedChallenge||c.origin!==origin)fail(401,'WebAuthn challenge or origin is invalid.');
  return {raw,c};
}
function authData(encoded,rpId){
  const b=from64(encoded);if(b.length<37)fail(400,'Invalid authenticator data.');
  const expected=sha(rpId);if(!timingSafeEqual(b.subarray(0,32),expected))fail(401,'Security key RP ID mismatch.');
  const flags=b[32],count=b.readUInt32BE(33);if(!(flags&1))fail(401,'User presence was not confirmed.');
  return {b,flags,count};
}
function parseAttestation(encoded,rpId){
  let obj;try{obj=cbor(from64(encoded)).value;}catch{fail(400,'Invalid security-key attestation.');}
  const raw=obj instanceof Map?obj.get('authData'):null;if(!Buffer.isBuffer(raw)||raw.length<55)fail(400,'Attestation does not contain authenticator data.');
  const expected=sha(rpId);if(!timingSafeEqual(raw.subarray(0,32),expected))fail(401,'Security key RP ID mismatch.');
  const flags=raw[32];if(!(flags&1)||!(flags&0x40))fail(401,'Security key did not provide attested credential data.');
  const count=raw.readUInt32BE(33),credLen=raw.readUInt16BE(53),start=55,end=start+credLen;if(end>=raw.length)fail(400,'Invalid credential identifier.');
  const credId=raw.subarray(start,end);let key;try{key=cbor(raw,end).value;}catch{fail(400,'Invalid credential public key.');}
  if(!(key instanceof Map)||key.get(1)!==2||key.get(3)!==-7||key.get(-1)!==1||!Buffer.isBuffer(key.get(-2))||!Buffer.isBuffer(key.get(-3)))fail(400,'This release supports ES256/P-256 security keys.');
  return {credential_id:b64u(credId),x:b64u(key.get(-2)),y:b64u(key.get(-3)),count};
}
function publicKey(row){return createPublicKey({key:{kty:'EC',crv:'P-256',x:row.public_x,y:row.public_y},format:'jwk'});}

export function createSecurityKeys(db,{origin,clock=Date.now}={}){
  const url=new URL(origin),rpId=url.hostname,rpName='Service Desk';
  const cleanup=()=>db.prepare('DELETE FROM v8_webauthn_challenges WHERE expires<?').run(clock());
  const keysFor=id=>db.prepare('SELECT id,name,credential_id,transports,created_at,last_used_at FROM v8_security_keys WHERE user_id=? ORDER BY id').all(id).map(k=>({...k,transports:JSON.parse(k.transports||'[]')}));
  const status=id=>({security_key_enabled:Boolean(db.prepare('SELECT 1 FROM v8_security_keys WHERE user_id=? LIMIT 1').get(id)),security_keys:keysFor(id)});
  const hasKeys=id=>status(id).security_key_enabled;
  function storeChallenge(userId,purpose,loginTokenHash=null){
    cleanup();const token=randomBytes(24).toString('base64url'),challenge=randomBytes(32).toString('base64url');
    db.prepare('INSERT INTO v8_webauthn_challenges(token,user_id,purpose,challenge,login_token_hash,expires) VALUES(?,?,?,?,?,?)').run(digest(token),userId,purpose,challenge,loginTokenHash,clock()+300000);
    return {token,challenge};
  }
  function registrationOptions(u){
    const c=storeChallenge(u.id,'register');
    return {token:c.token,publicKey:{challenge:c.challenge,rp:{name:rpName,id:rpId},user:{id:b64u(sha('user:'+u.id).subarray(0,16)),name:u.email,displayName:u.name},pubKeyCredParams:[{type:'public-key',alg:-7}],timeout:60000,attestation:'none',authenticatorSelection:{residentKey:'discouraged',userVerification:'preferred'},excludeCredentials:keysFor(u.id).map(k=>({type:'public-key',id:k.credential_id,transports:k.transports}))}};
  }
  function register(u,b){
    const token=digest(b.token),c=db.prepare("SELECT * FROM v8_webauthn_challenges WHERE token=? AND user_id=? AND purpose='register'").get(token,u.id);
    if(!c||c.expires<clock())fail(409,'Security-key registration expired. Start again.');
    const cred=b.credential;if(!cred||cred.type!=='public-key'||!cred.id||!cred.response?.clientDataJSON||!cred.response?.attestationObject)fail(400,'Invalid security-key credential.');
    clientData(cred.response.clientDataJSON,'webauthn.create',c.challenge,origin);
    const parsed=parseAttestation(cred.response.attestationObject,rpId);
    if(parsed.credential_id!==cred.id)fail(400,'Credential identifier mismatch.');
    const name=text(String(b.name||'Security key'),'Security key name',1,100),transports=Array.isArray(cred.response.transports)?cred.response.transports.filter(x=>['usb','nfc','ble','internal','hybrid'].includes(x)):[];
    try{db.prepare('INSERT INTO v8_security_keys(user_id,name,credential_id,public_x,public_y,sign_count,transports,created_at) VALUES(?,?,?,?,?,?,?,?)').run(u.id,name,parsed.credential_id,parsed.x,parsed.y,parsed.count,JSON.stringify(transports),new Date(clock()).toISOString());}
    catch(e){if(/UNIQUE/.test(String(e.message)))fail(409,'This security key is already registered.');throw e;}
    db.prepare('DELETE FROM v8_webauthn_challenges WHERE token=?').run(token);
    db.prepare('INSERT INTO audit_events(actor_id,action,details,created_at) VALUES(?,?,?,?)').run(u.id,'mfa.security_key_added',JSON.stringify({name}),new Date(clock()).toISOString());
    return status(u.id);
  }
  function remove(u,id){
    id=integer(Number(id),'Security key');const row=db.prepare('SELECT * FROM v8_security_keys WHERE id=? AND user_id=?').get(id,u.id);if(!row)fail(404,'Security key not found.');
    db.prepare('DELETE FROM v8_security_keys WHERE id=?').run(id);db.prepare('INSERT INTO audit_events(actor_id,action,details,created_at) VALUES(?,?,?,?)').run(u.id,'mfa.security_key_removed',JSON.stringify({name:row.name}),new Date(clock()).toISOString());return status(u.id);
  }
  function loginOptions(loginToken){
    cleanup();const hashToken=digest(loginToken),login=db.prepare('SELECT * FROM mfa_challenges WHERE token=?').get(hashToken);if(!login||login.expires<clock()||login.attempts>=5)fail(401,'Login verification expired.');
    const keys=keysFor(login.user_id);if(!keys.length)fail(404,'No security key is registered for this account.');
    const c=storeChallenge(login.user_id,'login',hashToken);
    return {token:c.token,publicKey:{challenge:c.challenge,rpId,timeout:60000,userVerification:'preferred',allowCredentials:keys.map(k=>({type:'public-key',id:k.credential_id,transports:k.transports}))}};
  }
  function verifyLogin(loginToken,b){
    cleanup();const loginHash=digest(loginToken),ct=digest(b.token),c=db.prepare("SELECT * FROM v8_webauthn_challenges WHERE token=? AND purpose='login' AND login_token_hash=?").get(ct,loginHash);
    if(!c||c.expires<clock())fail(401,'Security-key challenge expired.');
    const login=db.prepare('SELECT * FROM mfa_challenges WHERE token=?').get(loginHash);if(!login||login.expires<clock()||login.attempts>=5||login.user_id!==c.user_id)fail(401,'Login verification expired.');
    db.prepare('UPDATE mfa_challenges SET attempts=attempts+1 WHERE token=?').run(loginHash);
    const cred=b.credential;if(!cred||cred.type!=='public-key'||!cred.id||!cred.response?.clientDataJSON||!cred.response?.authenticatorData||!cred.response?.signature)fail(400,'Invalid security-key assertion.');
    const key=db.prepare('SELECT * FROM v8_security_keys WHERE user_id=? AND credential_id=?').get(c.user_id,cred.id);if(!key)fail(401,'Unknown security key.');
    const cd=clientData(cred.response.clientDataJSON,'webauthn.get',c.challenge,origin),ad=authData(cred.response.authenticatorData,rpId),signed=Buffer.concat([ad.b,sha(cd.raw)]),sig=from64(cred.response.signature);
    if(!verifySignature('sha256',signed,publicKey(key),sig))fail(401,'Security-key signature is invalid.');
    if(key.sign_count>0&&ad.count>0&&ad.count<=key.sign_count)fail(401,'Security-key counter check failed.');
    db.prepare('UPDATE v8_security_keys SET sign_count=?,last_used_at=? WHERE id=?').run(Math.max(key.sign_count,ad.count),new Date(clock()).toISOString(),key.id);
    db.prepare('DELETE FROM v8_webauthn_challenges WHERE token=?').run(ct);db.prepare('DELETE FROM mfa_challenges WHERE token=?').run(loginHash);
    const u=db.prepare('SELECT * FROM users WHERE id=?').get(c.user_id);if(!u?.active||!u.directory_active||u.registration_state!=='active')fail(401,'Account is disabled.');
    db.prepare('INSERT INTO audit_events(actor_id,action,details,created_at) VALUES(?,?,?,?)').run(u.id,'mfa.security_key_used',JSON.stringify({key_id:key.id}),new Date(clock()).toISOString());
    return u;
  }
  return {status,hasKeys,keysFor,registrationOptions,register,remove,loginOptions,verifyLogin};
}
