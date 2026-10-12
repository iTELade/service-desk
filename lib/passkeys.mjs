import { randomBytes, createHash } from 'node:crypto';
import { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse } from '@simplewebauthn/server';
import { fail, text, integer, now, txFor } from './core.mjs';

const digest = value => createHash('sha256').update(String(value)).digest('hex');
export function createPasskeys(db, { origin, clock = Date.now, verifier = {} }) {
  const rpID = new URL(origin).hostname, tx = txFor(db);
  const userHandle = u => createHash('sha256').update('service-desk-passkey:' + u.id + ':' + u.created_at).digest();
  const active = u => u?.active && u.directory_active && u.registration_state === 'active' && u.account_kind === 'human';
  function eligible(u) {
    if (!active(u) || u.must_change || u.sso_only || u.auth_source === 'ldap' || u.auth_source === 'sso') fail(403, 'Klucze dostępu bez hasła są dostępne dla aktywnych kont lokalnych. Dla kont katalogowych użyj firmowego LDAP/SSO.');
  }
  function list(u) {
    return db.prepare('SELECT id,name,device_type,backed_up,created_at,last_used_at FROM passkeys WHERE user_id=? ORDER BY id').all(u.id);
  }
  function challenge(purpose, options, u = null) {
    db.prepare('DELETE FROM passkey_challenges WHERE expires<?').run(clock());
    const token = randomBytes(32).toString('base64url');
    db.prepare('INSERT INTO passkey_challenges VALUES(?,?,?,?,?,?)').run(digest(token), u?.id ?? null, purpose, options.challenge, clock() + 300000, u?.version ?? null);
    return { token, publicKey: options };
  }
  function take(token, purpose, u = null) {
    const row = tx(() => {
      const r = db.prepare('SELECT * FROM passkey_challenges WHERE token=? AND purpose=?').get(digest(token), purpose);
      if (r) db.prepare('DELETE FROM passkey_challenges WHERE token=?').run(r.token);
      return r;
    });
    if (!row || row.expires < clock() || (u && (row.user_id !== u.id || row.account_version !== u.version))) fail(401, 'Próba klucza dostępu wygasła. Rozpocznij ponownie.');
    return row;
  }
  function grant(u, sessionToken) {
    db.prepare('INSERT INTO reauth_grants VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET session_token=excluded.session_token,expires=excluded.expires').run(u.id, sessionToken, clock() + 300000);
  }
  function requireGrant(u) {
    eligible(u);
    const r = db.prepare('SELECT * FROM reauth_grants WHERE user_id=?').get(u.id);
    if (!r || r.expires < clock() || r.session_token !== u.token) fail(403, 'Najpierw potwierdź hasło lub użyj istniejącego klucza dostępu.');
  }
  async function registrationOptions(u) {
    requireGrant(u);
    const options = await generateRegistrationOptions({ rpName: 'Service Desk', rpID, userName: u.email, userID: userHandle(u), userDisplayName: u.name, attestationType: 'none',supportedAlgorithmIDs:[-7,-257], authenticatorSelection: { residentKey: 'required', userVerification: 'required' }, excludeCredentials: db.prepare('SELECT credential_id,transports FROM passkeys WHERE user_id=?').all(u.id).map(k => ({ id: k.credential_id, transports: JSON.parse(k.transports) })) });
    return challenge('register', options, u);
  }
  async function register(u, b) {
    requireGrant(u);
    const c = take(b.token, 'register', u);
    let result;
    try { result = await (verifier.registration || verifyRegistrationResponse)({ response: b.credential, expectedChallenge: c.challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true,supportedAlgorithmIDs:[-7,-257] }); } catch { fail(400, 'Nie udało się zweryfikować klucza dostępu.'); }
    if (!result.verified) fail(401, 'Klucz dostępu nie został potwierdzony.');
    const info = result.registrationInfo, key = info.credential, fresh = db.prepare('SELECT * FROM users WHERE id=?').get(u.id);
    eligible(fresh); if (fresh.version !== c.account_version) fail(409, 'Konto zmieniło się. Zaloguj się ponownie.');
    const name = text(b.name || 'Klucz dostępu', 'Nazwa klucza', 1, 100);
    tx(() => {
      if (db.prepare('SELECT 1 FROM passkeys WHERE credential_id=?').get(key.id)) fail(409, 'Ten klucz jest już zarejestrowany.');
      if (list(u).length >= 20) fail(400, 'Maksymalnie 20 kluczy dostępu.');
      db.prepare('INSERT INTO passkeys(user_id,credential_id,public_key,counter,name,transports,device_type,backed_up,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(u.id, key.id, Buffer.from(key.publicKey), key.counter, name, JSON.stringify(key.transports || []), info.credentialDeviceType, Number(info.credentialBackedUp), now());
      audit(u, 'passkey.registered', { name });
    });
    return list(u);
  }
  async function options(u = null) {
    if (u) eligible(u);
    return challenge(u ? 'reauth' : 'login', await generateAuthenticationOptions({ rpID, userVerification: 'required', ...(u ? { allowCredentials: db.prepare('SELECT credential_id,transports FROM passkeys WHERE user_id=?').all(u.id).map(k => ({ id: k.credential_id, transports: JSON.parse(k.transports) })) } : {}) }), u);
  }
  async function verify(b, sessionUser = null) {
    const c = take(b.token, sessionUser ? 'reauth' : 'login', sessionUser);
    const key = db.prepare('SELECT * FROM passkeys WHERE credential_id=?').get(String(b.credential?.id || ''));
    if (!key || (sessionUser && key.user_id !== sessionUser.id)) fail(401, 'Nieprawidłowy klucz dostępu.');
    const u = db.prepare('SELECT * FROM users WHERE id=?').get(key.user_id); eligible(u);
    if (b.credential?.response?.userHandle && b.credential.response.userHandle !== userHandle(u).toString('base64url')) fail(401, 'Nieprawidłowy właściciel klucza.');
    let result;
    try { result = await (verifier.authentication || verifyAuthenticationResponse)({ response: b.credential, expectedChallenge: c.challenge, expectedOrigin: origin, expectedRPID: rpID, credential: { id: key.credential_id, publicKey: new Uint8Array(key.public_key), counter: key.counter, transports: JSON.parse(key.transports) }, requireUserVerification: true }); } catch { fail(401, 'Nie udało się potwierdzić logowania kluczem.'); }
    if (!result.verified) fail(401, 'Nieprawidłowy klucz dostępu.');
    return tx(() => {
      const fresh = db.prepare('SELECT * FROM users WHERE id=?').get(u.id); eligible(fresh);
      if (fresh.version !== u.version || !db.prepare('SELECT 1 FROM passkeys WHERE id=?').get(key.id)) fail(401, 'Konto lub klucz zmieniły się. Rozpocznij ponownie.');
      db.prepare('UPDATE passkeys SET counter=?,device_type=?,backed_up=?,last_used_at=? WHERE id=?').run(result.authenticationInfo.newCounter, result.authenticationInfo.credentialDeviceType, Number(result.authenticationInfo.credentialBackedUp), now(), key.id);
      audit(fresh, sessionUser ? 'passkey.reauthenticated' : 'passkey.login', { key_id: key.id });
      if (sessionUser) grant(sessionUser, sessionUser.token);
      return fresh;
    });
  }
  function remove(u, id) {
    requireGrant(u); integer(id, 'Klucz');
    const k = db.prepare('SELECT * FROM passkeys WHERE id=? AND user_id=?').get(id, u.id);
    if (!k) fail(404, 'Klucz niedostępny.');
    tx(() => { db.prepare('DELETE FROM passkeys WHERE id=?').run(id); audit(u, 'passkey.revoked', { key_id: id }); });
    return list(u);
  }
  function audit(u, action, details) { db.prepare('INSERT INTO audit_events(actor_id,action,details,created_at) VALUES(?,?,?,?)').run(u.id, action, JSON.stringify(details), now()); }
  return { list, grant, registrationOptions, register, options, verify, remove };
}
