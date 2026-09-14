import {createReset,applyPendingReset} from './lib/reset.mjs';
import {migrateV7} from './lib/migration-v7.mjs';
import {createMfa} from './lib/mfa.mjs';
import {createUpdates} from './lib/updates.mjs';
import {maintenance} from './lib/maintenance.mjs';
import http from 'node:http';
import {createInstallation} from './lib/installation.mjs';
import {VERSION} from './lib/version.mjs';
import {createDesk} from './lib/desk.mjs';
import {createIdentity} from './lib/identity.mjs';
import {createSso} from './lib/sso.mjs';
import {createExtensions} from './lib/extensions.mjs';
import {migrateV6} from './lib/migration-v6.mjs';
import {migrateV5} from './lib/migration-v5.mjs';
import { migrateV2,migrateV3,migrateV4 } from './lib/migrations.mjs';
import {createCatalog} from './lib/catalog.mjs';
import {createWorkflows,workflowEvents} from './lib/workflows.mjs';
import { createProjects } from './lib/projects.mjs';
import { createDirectory } from './lib/directory.mjs';
import { createAccounts } from './lib/accounts.mjs';
import { defaultSla } from './lib/core.mjs';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, createHash, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const hashPassword = promisify(scrypt);
const prod = process.env.NODE_ENV === 'production';
const origin = new URL(process.env.APP_URL || 'http://localhost:3000').origin;
if (prod && !origin.startsWith('https://')) throw new Error('APP_URL musi używać HTTPS w produkcji.');
const cookieName = prod ? '__Host-itelade_session' : 'itelade_session';
const dataDir = process.env.DATA_DIR || join(root, 'data');
mkdirSync(dataDir, { recursive: true, mode: 0o700 });
const resetBootstrap = applyPendingReset(dataDir);
const db = new DatabaseSync(join(dataDir, 'desk.sqlite'));
db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
const schemaVersion = db.prepare('PRAGMA user_version').get().user_version;
if (schemaVersion > 7) throw new Error('Baza wymaga nowszej wersji aplikacji.');
if (!schemaVersion) {
  db.exec(`BEGIN IMMEDIATE;
    CREATE TABLE users (
      id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      name TEXT NOT NULL, password TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin','agent','customer')),
      active INTEGER NOT NULL DEFAULT 1, must_change INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
    CREATE TABLE sessions (
      token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
      csrf TEXT NOT NULL, expires_at INTEGER NOT NULL
    );
    CREATE INDEX idx_sessions_user ON sessions(user_id);
    CREATE TABLE projects (
      id INTEGER PRIMARY KEY, key TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL CHECK(kind IN ('service','software')),
      next_number INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
    );
    CREATE TABLE tickets (
      id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id),
      key TEXT NOT NULL UNIQUE, title TEXT NOT NULL, description TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('incident','request','task','bug','story')),
      priority TEXT NOT NULL CHECK(priority IN ('P1','P2','P3','P4')),
      status TEXT NOT NULL CHECK(status IN ('open','in_progress','waiting','resolved','closed')),
      reporter_id INTEGER NOT NULL REFERENCES users(id), assignee_id INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, first_response_at TEXT,
      resolved_at TEXT, version INTEGER NOT NULL DEFAULT 1
    );
    CREATE INDEX idx_tickets_reporter_updated ON tickets(reporter_id,updated_at);
    CREATE INDEX idx_tickets_project_status ON tickets(project_id,status);
    CREATE INDEX idx_tickets_assignee_status ON tickets(assignee_id,status);
    CREATE INDEX idx_tickets_updated ON tickets(updated_at);
    CREATE TABLE comments (
      id INTEGER PRIMARY KEY, ticket_id INTEGER NOT NULL REFERENCES tickets(id),
      author_id INTEGER NOT NULL REFERENCES users(id), body TEXT NOT NULL,
      internal INTEGER NOT NULL CHECK(internal IN (0,1)), created_at TEXT NOT NULL
    );
    CREATE INDEX idx_comments_ticket ON comments(ticket_id,id);
    CREATE TABLE activity (
      id INTEGER PRIMARY KEY, ticket_id INTEGER NOT NULL REFERENCES tickets(id),
      actor_id INTEGER NOT NULL REFERENCES users(id), body TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE INDEX idx_activity_ticket ON activity(ticket_id,id);
    PRAGMA user_version=1;
    COMMIT;`);
}

const statuses = { open: 'Nowe', in_progress: 'W trakcie', waiting: 'Oczekuje na klienta', resolved: 'Rozwiązane', closed: 'Zamknięte' };
const priorities = { P1: 'Krytyczny', P2: 'Wysoki', P3: 'Normalny', P4: 'Niski' };
const types = { incident: 'Incydent', request: 'Wniosek o usługę', task: 'Zadanie', bug: 'Błąd', story: 'Historyjka' };

const now = () => new Date().toISOString();
const digest = value => createHash('sha256').update(value).digest('hex');
const safeUser = u => ({ id: u.id, name: u.name, email: u.email, role: u.role, active: Boolean(u.active), must_change: Boolean(u.must_change), auth_source:u.auth_source, is_internal:Boolean(u.is_internal), directory_active:Boolean(u.directory_active), registration_state:u.registration_state, email_verified:Boolean(u.email_verified), version:u.version,sso_only:Boolean(u.sso_only),username:u.username,first_name:u.first_name,last_name:u.last_name,account_kind:u.account_kind,theme:u.theme,avatar_url:'/api/avatars/'+u.id });
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const staff = u => u.role === 'admin' || u.role === 'agent';
const tx = fn => { db.exec('BEGIN IMMEDIATE'); try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } };
const textValue = (v, label, min = 1, max = 200) => {
  if (typeof v !== 'string' || v.trim().length < min || v.trim().length > max) fail(400, `${label}: wymagane od ${min} do ${max} znaków.`);
  return v.trim();
};
const choice = (value, values, label) => {
  if (typeof value !== 'string' || !Object.hasOwn(values, value)) fail(400, `Nieprawidłowe pole: ${label}.`);
  return value;
};
const emailValue = v => { const email = textValue(v, 'E-mail', 3, 254).toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'Nieprawidłowy adres e-mail.'); return email; };
const passwordValue = p => { if (typeof p !== 'string' || p.length < 12 || p.length > 256) fail(400, 'Hasło musi mieć od 12 do 256 znaków.'); return p; };
async function encodePassword(value) {
  passwordValue(value);
  const salt = randomBytes(16).toString('hex');
  const key = await hashPassword(value, salt, 64, { N: 16384, r: 8, p: 1 });
  return `${salt}:${key.toString('hex')}`;
}
async function checkPassword(value, encoded) {
  if (typeof value !== 'string' || value.length > 256) return false;
  const [salt, stored] = encoded.split(':');
  if (!salt || !/^[a-f0-9]{128}$/.test(stored || '')) return false;
  const key = await hashPassword(value, salt, 64, { N: 16384, r: 8, p: 1 });
  return timingSafeEqual(key, Buffer.from(stored, 'hex'));
}
if (!resetBootstrap && !db.prepare('SELECT id FROM users LIMIT 1').get() && process.env.BOOTSTRAP_ADMIN_EMAIL && process.env.BOOTSTRAP_ADMIN_PASSWORD) {
  const email = emailValue(process.env.BOOTSTRAP_ADMIN_EMAIL);
  const encoded = await encodePassword(process.env.BOOTSTRAP_ADMIN_PASSWORD);
  tx(() => {
    db.prepare("INSERT INTO users(email,name,password,role,created_at) VALUES(?,?,?,'admin',?)").run(email, 'Administrator', encoded, now());
    db.prepare("INSERT INTO projects(key,name,description,kind,created_at) VALUES('IT','Centrum wsparcia','Zgłoś problem lub poproś o dostęp do usługi.','service',?)").run(now());
  });
}
if(db.prepare('PRAGMA user_version').get().user_version<2)migrateV2(db);
if(db.prepare('PRAGMA user_version').get().user_version<3)migrateV3(db);
if(db.prepare('PRAGMA user_version').get().user_version<4)migrateV4(db);
if(db.prepare('PRAGMA user_version').get().user_version<5)migrateV5(db);
if(db.prepare('PRAGMA user_version').get().user_version<6)migrateV6(db);
migrateV7(db);
// Fresh installations do not need the legacy built-in automation account.
if(!schemaVersion&&!db.prepare('SELECT id FROM projects LIMIT 1').get())db.prepare("DELETE FROM users WHERE email='bot@desk.invalid' AND password='!service'").run();
const mfa=createMfa(db,{dataDir});
const projects = createProjects(db);
const installation=createInstallation(db,{dataDir,encodePassword,projects});
if(installation.required())console.log('Kod instalacji WWW: '+installation.token());
const updates=createUpdates(db,projects,{dataDir,controlDir:process.env.CONTROL_DIR});
const catalog=createCatalog(db,projects),workflows=createWorkflows(db,projects);
const directory = createDirectory(db,projects,{dataDir});
const accounts = createAccounts(db,{origin,encodePassword,dataDir,env:resetBootstrap?{}:process.env});
const desk=createDesk(db,projects,catalog,workflows),identity=createIdentity(db,projects,accounts,{origin,encodePassword}),sso=createSso(db,projects,{origin,dataDir});
const reset=createReset(db,{dataDir,accounts,checkPassword,canReset:()=>!maintenance()&&!(process.env.CONTROL_DIR&&existsSync(join(process.env.CONTROL_DIR,'request.json'))),onReset:()=>{setTimeout(()=>process.exit(0),150).unref();}});
const extensions=createExtensions(db,projects,catalog,workflows,desk,accounts,identity,sso,{origin,dataDir});
// Wyrównuje koszt sprawdzenia nieistniejącego konta. Nie jest hasłem żadnego użytkownika.
const dummyPassword = await encodePassword(randomBytes(32).toString('hex'));
delete process.env.BOOTSTRAP_ADMIN_PASSWORD;

const rateBuckets = new Map();
function rateLimit(key, max) {
  const stamp = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.until < stamp) {
    if (rateBuckets.size >= 10000) fail(429, 'Zbyt wiele prób. Spróbuj później.');
    rateBuckets.set(key, { until: stamp + 15 * 60000, count: 1 });
  } else if (++bucket.count > max) fail(429, 'Zbyt wiele prób. Spróbuj za 15 minut.');
}
const housekeeping = setInterval(() => {
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  for (const [k, v] of rateBuckets) if (v.until < Date.now()) rateBuckets.delete(k);
}, 60000).unref();

function cookie(value, maxAge) {
  return `${cookieName}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${prod ? '; Secure' : ''}`;
}
function session(req) {
  const raw = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  if (!raw || !/^[a-f0-9]{64}$/.test(raw)) return null;
  return db.prepare(`SELECT u.*, s.csrf, s.token FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token=? AND s.expires_at>? AND u.active=1 AND u.directory_active=1 AND u.registration_state='active' AND u.account_kind='human'`).get(digest(raw), Date.now()) || null;
}
function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; font-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
  res.setHeader('Cache-Control', 'no-store');
  if (prod) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
}
function json(res, code, value) { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); }
async function body(req) {
  if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) fail(415, 'Wymagany format JSON.');
  const parts = []; let bytes = 0;
  for await (const part of req) { bytes += part.length; if (bytes > 4 * 1024 * 1024) fail(413, 'Przekroczony rozmiar żądania.'); parts.push(part); }
  let value;
  try { value = JSON.parse(Buffer.concat(parts).toString('utf8')); } catch { fail(400, 'Nieprawidłowy JSON.'); }
  if (!value || Array.isArray(value) || typeof value !== 'object') fail(400, 'Wymagany obiekt JSON.');
  return value;
}
const ticketSelect = `SELECT t.*, p.name project_name, p.key project_key, p.project_type, p.archived project_archived,
  p.sla_policy, r.name reporter_name, a.name assignee_name FROM tickets t JOIN projects p ON p.id=t.project_id
  JOIN users r ON r.id=t.reporter_id LEFT JOIN users a ON a.id=t.assignee_id`;
function ticketFor(key, user) {
  const t = db.prepare(`${ticketSelect} WHERE t.key=? OR t.id=(SELECT ticket_id FROM ticket_aliases WHERE key=?) ORDER BY t.key=? DESC LIMIT 1`).get(key,key,key);
  if (!t || !projects.canRead(user,projects.project(t.project_id),t)) fail(404,'Nie znaleziono zgłoszenia.');
  return t;
}
function ticketWithSla(t,user) {
  const policy = {...defaultSla,...JSON.parse(t.sla_policy)}, p=projects.project(t.project_id);
  const {sla_policy,form_snapshot,custom_values,automation_state_since,automation_cycle,automation_customer_at,...out}=t,canWork=projects.canWork(user,p);
  return {...out,...catalog.ticket(t,canWork),...workflows.ticket(t,canWork),...desk.detail(t,user),can_work:canWork,project_archived:Boolean(t.project_archived),response_due_at:new Date(Date.parse(t.created_at)+policy[t.priority][0]*60000).toISOString(),resolution_due_at:new Date(Date.parse(t.created_at)+policy[t.priority][1]*60000).toISOString()};
}
function record(ticketId, userId, message) {
  db.prepare('INSERT INTO activity(ticket_id,actor_id,body,created_at) VALUES(?,?,?,?)').run(ticketId, userId, message, now());
}
function assignee(value,p) {
  if (value === null) return null;
  if (!Number.isSafeInteger(value)) fail(400,'Nieprawidłowy opiekun zgłoszenia.');
  const u=db.prepare("SELECT * FROM users WHERE id=? AND active=1 AND directory_active=1 AND registration_state='active'").get(value);
  if (!u || !projects.canWork(u,p)) fail(400,'Opiekun musi mieć dostęp do obsługi tego projektu.');
  return value;
}
function ticketFilters(search, user) {
  const scope=projects.ticketScope(user,{own:search.get('own')==='1'});
  const terms=[scope.sql,'t.deleted_at IS NULL'],values=[...scope.values];
  const arch=search.get('archived');if(arch!=='all')terms.push(arch==='1'?'t.archived_at IS NOT NULL':'t.archived_at IS NULL');
  const q = search.get('q')?.trim();
  if (q) { if (q.length > 200) fail(400, 'Wyszukiwanie jest za długie.'); terms.push("(t.title LIKE ? ESCAPE '\\' OR t.key LIKE ? ESCAPE '\\')"); const pattern = '%' + q.replace(/[\\%_]/g, '\\$&') + '%'; values.push(pattern, pattern); }
  if(search.get('scope')==='mine'){terms.push('t.reporter_id=?');values.push(user.id);}
  if(search.get('scope')==='company'){terms.push('t.organization_id IN (SELECT organization_id FROM organization_members WHERE user_id=?)');values.push(user.id);}
  if (search.get('project')) { const id=Number(search.get('project'));if(!Number.isSafeInteger(id)||id<1)fail(400,'Nieprawidłowy projekt.');terms.push('t.project_id=?'); values.push(id); }
  if (search.get('status')) { terms.push('t.status=?'); values.push(choice(search.get('status'), statuses, 'status')); }
  if (search.get('priority')) { terms.push('t.priority=?'); values.push(choice(search.get('priority'), priorities, 'priorytet')); }
  if(search.get('state')){
    const states=search.get('state').split(',');if(states.length>30)fail(400,'Zbyt wiele statusów w filtrze.');
    const sub=[];for(const value of states){const match=value.match(/^([1-9][0-9]*):([a-z][a-z0-9_]{0,49})$/);if(!match)fail(400,'Nieprawidłowy filtr statusu.');sub.push('(t.project_id=? AND t.workflow_status=?)');values.push(Number(match[1]),match[2]);}
    terms.push('('+sub.join(' OR ')+')');
  }
  if(search.get('type')){terms.push('t.type=?');values.push(choice(search.get('type'),types,'typ'));}
  if(search.get('assignee')){
    const value=search.get('assignee');
    if(value==='unassigned')terms.push('t.assignee_id IS NULL');
    else {const id=value==='me'?user.id:Number(value);if(!Number.isSafeInteger(id)||id<1)fail(400,'Nieprawidłowy opiekun.');terms.push('t.assignee_id=?');values.push(id);}
  }
  for(const [name,op] of [['created_from','>='],['created_to','<=']])if(search.get(name)){
    const value=search.get(name);if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)fail(400,'Nieprawidłowa data filtra.');
    terms.push('t.created_at '+op+' ?');values.push(value+(name==='created_from'?'T00:00:00.000Z':'T23:59:59.999Z'));
  }
  if(search.get('created_from')&&search.get('created_to')&&search.get('created_from')>search.get('created_to'))fail(400,'Początek zakresu nie może przypadać po końcu.');
  if (search.get('queue') === 'mine') { terms.push('t.assignee_id=?'); values.push(user.id); }
  if (search.get('queue') === 'unassigned') terms.push('t.assignee_id IS NULL');
  if (['active','mine','unassigned'].includes(search.get('queue'))) terms.push("t.status NOT IN ('resolved','closed')");
  const clause = terms.length ? ` WHERE ${terms.join(' AND ')}` : '';
  return {clause,values};
}
function queryTickets(search,user){
  const {clause,values}=ticketFilters(search,user);
  const sort=choice(search.get('sort')||'updated_desc',{updated_desc:1,created_desc:1,created_asc:1,priority:1},'sortowanie');
  const order={updated_desc:'t.updated_at DESC,t.id DESC',created_desc:'t.created_at DESC,t.id DESC',created_asc:'t.created_at,t.id',priority:'t.priority,t.updated_at DESC,t.id DESC'}[sort];
  const size = Math.min(100, Math.max(1, Number(search.get('limit')) || 25));
  const page = Math.max(1, Math.floor(Number(search.get('page')) || 1));
  if (!Number.isSafeInteger(page) || !Number.isSafeInteger(size) || (page - 1) * size > 10000000) fail(400, 'Nieprawidłowa strona.');
  return {
    total: db.prepare('SELECT COUNT(*) n FROM tickets t' + clause).get(...values).n,
    tickets: db.prepare(ticketSelect + clause + ' ORDER BY '+order+' LIMIT ? OFFSET ?').all(...values, size, (page - 1) * size).map(t=>ticketWithSla(t,user)),
    page, limit: size
  };
}

const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/app.css', ['app.css', 'text/css; charset=utf-8']],
  ['/favicon.svg', ['favicon.svg', 'image/svg+xml']]
]);
const server = http.createServer(async (req,res)=>{
  securityHeaders(res);
  try {
    const {pathname,searchParams}=new URL(req.url,origin),method=req.method;
    if(method==='GET'&&pathname==='/healthz'){db.prepare('SELECT 1').get();return json(res,200,{status:'ok',version:VERSION,schema:7});}
    if((reset.pending()||maintenance())&&pathname.startsWith('/api/')&&!(method==='GET'&&['/api/me','/api/meta','/api/public-config','/api/brand/logo','/api/desk/updates'].includes(pathname)))fail(503,'Trwa aktualizacja systemu. Spróbuj ponownie za chwilę.');
    const asset=assets.get(pathname)||(/^\/portal\/[a-z0-9]+(?:-[a-z0-9]+)*\/?$/.test(pathname)?assets.get('/'):null);
    if(asset&&['GET','HEAD'].includes(method)){const[file,type]=asset;res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'});return res.end(method==='HEAD'?'':readFileSync(join(root,'public',file)));}
    if(method==='GET'&&pathname==='/api/sso/callback'){const stateCookie=prod?'__Host-desk_sso':'desk_sso',browser=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(stateCookie+'='))?.slice(stateCookie.length+1);const u=await sso.callback(new URL(req.url,origin),browser);if(mfa.status(u).enabled){const challenge=mfa.challenge(u);res.setHeader('Set-Cookie',stateCookie+'=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'+(prod?'; Secure':''));res.writeHead(303,{Location:'/#/mfa/'+challenge});return res.end();}const token=randomBytes(32).toString('hex'),csrf=randomBytes(32).toString('hex');db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(digest(token),u.id,csrf,Date.now()+12*3600000);res.setHeader('Set-Cookie',[cookie(token,12*3600),stateCookie+'=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'+(prod?'; Secure':'')]);res.writeHead(303,{Location:'/#/queue'});return res.end();}
    if(method==='GET'&&/^\/api\/sso\/[1-9][0-9]*\/start$/.test(pathname)){rateLimit('sso-start',200);const result=await sso.begin(Number(pathname.split('/')[3]));res.setHeader('Set-Cookie',(prod?'__Host-desk_sso':'desk_sso')+'='+result.browser+'; Path=/; HttpOnly; SameSite=Lax; Max-Age=600'+(prod?'; Secure':''));res.writeHead(303,{Location:result.url});return res.end();}
    if(method==='POST'&&/^\/api\/hooks\/[1-9][0-9]*$/.test(pathname)){rateLimit('incoming-hook',500);const b=await body(req),result=extensions.webhooks.incoming(Number(pathname.split('/')[3]),req.headers.authorization,b);extensions.events();return json(res,200,result);}
    if(pathname.startsWith('/api/v1/')){rateLimit('public-api',2000);const b=method==='GET'?{}:await body(req),result=extensions.api.run(req.headers.authorization,method,pathname,searchParams,b,req.headers['idempotency-key']);extensions.events();return json(res,result.status,result.value);}
    if(!pathname.startsWith('/api/'))fail(404,'Nie znaleziono strony.');
    if(!['GET','POST','PATCH'].includes(method))fail(405,'Niedozwolona metoda.');
    if(method!=='GET'&&req.headers.origin!==origin)fail(403,'Nieprawidłowy adres strony. Sprawdź APP_URL.');
    if(method==='GET'&&pathname==='/api/public-config')return json(res,200,{...accounts.publicConfig(),setup_required:installation.required(),logo_url:installation.logo()?'/api/brand/logo':'/favicon.svg',version:VERSION,sso_providers:sso.list()});
    if(method==='GET'&&pathname==='/api/brand/logo'){const image=installation.logo();if(!image)fail(404,'Brak logo.');res.writeHead(200,{'Content-Type':image.mime});return res.end(Buffer.from(image.body));}
    if(method==='POST'&&pathname==='/api/setup'){rateLimit('setup',30);const b=await body(req);return json(res,201,await installation.complete(b));}
    if(installation.required())fail(503,'Dokończ instalację WWW.');
    if(method==='POST'&&pathname==='/api/login'){
      rateLimit('login-total',300);const b=await body(req),login=textValue(b.email,'E-mail lub login',1,254).toLowerCase();
      rateLimit('login:'+digest(login),15);
      const u=db.prepare('SELECT * FROM users WHERE email=? OR ldap_login=? OR username=? ORDER BY email=? DESC LIMIT 1').get(login,login,login,login);
      const valid=u?.auth_source==='ldap'?await directory.authenticate(u,b.password):await checkPassword(b.password,u?.password||dummyPassword);
      const fresh=u?db.prepare('SELECT * FROM users WHERE id=?').get(u.id):null;
      if(!valid||fresh?.sso_only||!fresh?.active||!fresh.directory_active||fresh.version!==u.version)fail(401,'Nieprawidłowy e-mail, login lub hasło albo konto jest wyłączone.');
      if(fresh.registration_state==='pending_approval')fail(403,'Konto oczekuje na zatwierdzenie przez administratora.');
      if(fresh.registration_state==='pending_email')fail(403,'Potwierdź adres e-mail za pomocą linku aktywacyjnego.');
      if(mfa.status(fresh).enabled)return json(res,200,{mfa_required:true,challenge:mfa.challenge(fresh)});
      const token=randomBytes(32).toString('hex'),csrf=randomBytes(32).toString('hex');
      db.prepare('INSERT INTO sessions(token,user_id,csrf,expires_at) VALUES(?,?,?,?)').run(digest(token),u.id,csrf,Date.now()+12*3600000);
      res.setHeader('Set-Cookie',cookie(token,12*3600));return json(res,200,{user:safeUser(fresh),csrf});
    }
    if(method==='POST'&&pathname==='/api/mfa/verify'){rateLimit('mfa-login',30);const b=await body(req),u=mfa.verify(b.challenge,b.code),token=randomBytes(32).toString('hex'),csrf=randomBytes(32).toString('hex');db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(digest(token),u.id,csrf,Date.now()+12*3600000);res.setHeader('Set-Cookie',cookie(token,12*3600));return json(res,200,{user:safeUser(u),csrf});}
    if(method==='POST'&&pathname==='/api/accept-invite'){rateLimit('invite',100);const b=await body(req);return json(res,200,await identity.acceptInvite(b.token,b.password));}
    if(method==='POST'&&['/api/register','/api/resend-verification','/api/forgot-password','/api/verify-email','/api/reset-password'].includes(pathname)){
      rateLimit('account-total',200);const b=await body(req);
      if(b.email)rateLimit('account:'+digest(String(b.email).trim().toLowerCase()),8);
      if(b.token)rateLimit('token:'+digest(String(b.token)),10);
      const result=pathname==='/api/register'?await accounts.register(b):pathname==='/api/verify-email'?accounts.verify(b.token):pathname==='/api/reset-password'?await accounts.reset(b.token,b.password):accounts.resend(b.email,pathname==='/api/forgot-password'?'reset':'verify');
      return json(res,200,result);
    }
    let user=session(req);
    function authenticate(){user=session(req);if(!user)fail(401,'Zaloguj się, aby kontynuować.');if(method!=='GET'&&req.headers['x-csrf-token']!==user.csrf)fail(403,'Sesja formularza wygasła. Odśwież stronę.');}
    function admin(){if(user.role!=='admin')fail(403,'Dostęp tylko dla administratora.');}
    async function readBody(){const b=await body(req);authenticate();if(user.must_change&&pathname!=='/api/password')fail(403,'Najpierw zmień hasło tymczasowe.');return b;}
    authenticate();
    if(pathname.startsWith('/api/mfa/')){rateLimit('mfa-settings:'+user.id,20);const action=pathname.split('/').at(-1);if(method==='GET'&&action==='status')return json(res,200,mfa.status(user));const b=await readBody();if(method!=='POST')fail(405,'Niedozwolona metoda.');if(action==='setup')return json(res,200,mfa.setup(user));if(action==='enable')return json(res,200,mfa.enable(user,b.code));if(action==='disable')return json(res,200,mfa.disable(user,b.code));fail(404,'Nieznana operacja.');}
    if(pathname==='/api/system/reset'&&method==='POST'){rateLimit('system-reset:'+user.id,10);const b=await readBody();const value=b.code?await reset.confirm(user,b):await reset.begin(user,b);return json(res,200,value);}
    if(method==='GET'&&pathname==='/api/me')return json(res,200,{user:safeUser(user),csrf:user.csrf});
    if(method==='POST'&&pathname==='/api/logout'){db.prepare('DELETE FROM sessions WHERE token=?').run(user.token);res.setHeader('Set-Cookie',cookie('',0));return json(res,200,{ok:true});}
    if(method==='POST'&&pathname==='/api/password'){
      rateLimit('password:'+user.id,10);const b=await readBody();
      if(user.auth_source==='ldap')fail(400,'Hasłem LDAP zarządza katalog firmowy.');
      const version=user.version;
      if(!await checkPassword(b.current_password,user.password))fail(400,'Obecne hasło jest nieprawidłowe.');
      if(b.new_password===b.current_password)fail(400,'Wybierz inne hasło.');
      const encoded=await encodePassword(b.new_password);authenticate();
      if(user.version!==version)fail(409,'Konto zmieniło się. Zaloguj się ponownie.');
      tx(()=>{db.prepare('UPDATE users SET password=?,must_change=0,version=version+1 WHERE id=?').run(encoded,user.id);db.prepare('DELETE FROM sessions WHERE user_id=? AND token<>?').run(user.id,user.token);db.prepare('DELETE FROM account_tokens WHERE user_id=?').run(user.id);});extensions.events();return json(res,200,{ok:true});
    }
    if(user.must_change)fail(403,'Najpierw zmień hasło tymczasowe.');
    if(method==='GET'&&/^\/api\/avatars\/[1-9][0-9]*$/.test(pathname)){const a=db.prepare('SELECT * FROM avatars WHERE user_id=?').get(Number(pathname.split('/')[3]));if(a){res.writeHead(200,{'Content-Type':a.mime,'Cache-Control':'no-store'});return res.end(Buffer.from(a.body));}res.writeHead(200,{'Content-Type':'image/svg+xml'});return res.end(readFileSync(join(root,'public/favicon.svg')));}
    if(pathname.startsWith('/api/desk/updates')){const b=method==='GET'?{}:await readBody();return json(res,200,method==='GET'?updates.status(user):pathname.endsWith('/check')?await updates.check(user):pathname.endsWith('/install')?updates.request(b,user):updates.save(b,user));}
    if(pathname==='/api/desk/brand-logo'&&method==='POST')return json(res,200,installation.saveLogo(await readBody(),user));
    const extensionResult=await extensions.handle(method,pathname,user,searchParams,readBody);if(extensionResult)return json(res,extensionResult.status,extensionResult.value);
    if(method==='GET'&&pathname==='/api/meta'){
      const visible=projects.list(user),assignees=[...new Map(visible.filter(p=>p.can_work).flatMap(p=>projects.agents(p,user)).map(a=>[a.id,a])).values()];
      return json(res,200,{statuses,priorities,types,workflow_events:workflowEvents,projects:visible,assignees,brand_name:accounts.settings().brand_name});
    }
    if(pathname==='/api/settings'){
      if(method==='GET'){admin();return json(res,200,accounts.settings());}
      if(method==='PATCH'){const b=await readBody();admin();const result=accounts.save(b);projects.audit(null,user,'settings.updated',{registration_mode:result.registration_mode,allowed_domains:result.allowed_domains});return json(res,200,result);}
    }
    if(pathname==='/api/mail-status'&&method==='GET'){admin();return json(res,200,accounts.status());}
    if(pathname==='/api/test-email'&&method==='POST'){await readBody();admin();rateLimit('test-mail',10);return json(res,200,await accounts.smtp.test(user,accounts.settings().brand_name));}
    if(pathname==='/api/ldap'){
      if(method==='GET'){admin();return json(res,200,directory.output());}
      if(method==='PATCH'){const b=await readBody();admin();return json(res,200,directory.save(b,user));}
    }
    if(pathname==='/api/ldap/preview'&&method==='POST'){await readBody();admin();rateLimit('ldap-preview',30);const result=await directory.getPreview(user);authenticate();admin();return json(res,200,result);}
    if(pathname==='/api/ldap/apply'&&method==='POST'){const b=await readBody();admin();return json(res,200,directory.apply(b,user));}
    if(pathname==='/api/projects'){
      if(method==='GET')return json(res,200,projects.list(user));
      if(method==='POST'){const b=await readBody();return json(res,201,projects.create(b,user));}
    }
    const catalogRoute=pathname.match(/^\/api\/projects\/([1-9][0-9]*)\/request-types(?:\/([1-9][0-9]*)(\/clone)?)?$/);
    if(catalogRoute){
      const id=Number(catalogRoute[1]),typeId=catalogRoute[2]?Number(catalogRoute[2]):null;
      if(method==='GET'&&!catalogRoute[3])return json(res,200,typeId?catalog.get(id,typeId,user):catalog.list(id,user,searchParams.get('surface')||'team'));
      if(method==='POST'&&catalogRoute[3]){await readBody();return json(res,201,catalog.clone(id,typeId,user));}
      if((method==='POST'&&!typeId)||(method==='PATCH'&&typeId&&!catalogRoute[3])){const b=await readBody();return json(res,typeId?200:201,catalog.save(id,typeId,b,user));}
    }
    const workflowRoute=pathname.match(/^\/api\/projects\/([1-9][0-9]*)\/workflow$/);
    if(workflowRoute){const id=Number(workflowRoute[1]);
      if(method==='GET'){projects.requireProject(id,user,true);return json(res,200,workflows.get(id));}
      if(method==='PATCH'){projects.requireProject(id,user,true);const b=await readBody(),current=workflows.get(id);if(['initial','statuses','transitions'].some(k=>b[k]!==undefined&&JSON.stringify(b[k])!==JSON.stringify(current[k])))fail(403,'Statusy i przejścia edytuj w szablonach w ustawieniach.');return json(res,200,workflows.save(id,{...current,version:b.version,rules:b.rules??current.rules},user));}
    }
    const automationRoute=pathname.match(/^\/api\/projects\/([1-9][0-9]*)\/automation(?:\/([1-9][0-9]*)\/retry)?$/);
    if(automationRoute){const id=Number(automationRoute[1]);
      if(method==='GET'&&!automationRoute[2]){projects.requireProject(id,user,true);return json(res,200,workflows.automation.history(id));}
      if(method==='POST'&&automationRoute[2]){await readBody();const p=projects.requireProject(id,user,true);if(p.archived)fail(409,'Projekt jest zarchiwizowany.');workflows.automation.retry(id,Number(automationRoute[2]));projects.audit(id,user,'automation.retry',{job_id:Number(automationRoute[2])});extensions.events();return json(res,200,{ok:true});}
    }
    const projectRoute=pathname.match(/^\/api\/projects\/([1-9][0-9]*)(?:\/(members|candidates|agents))?$/);
    if(projectRoute){
      const id=Number(projectRoute[1]),action=projectRoute[2];
      if(!action&&method==='GET'){
        const p=projects.requireProject(id,user);return json(res,200,{project:projects.view(p,user),members:projects.canManage(user,p)?projects.members(id,user):[],audit:projects.canManage(user,p)?db.prepare('SELECT a.id,a.action,a.details,a.created_at,u.name actor_name FROM audit_events a LEFT JOIN users u ON u.id=a.actor_id WHERE a.project_id=? ORDER BY a.id DESC LIMIT 50').all(id).map(a=>({...a,details:JSON.parse(a.details)})):[]});
      }
      if(!action&&method==='PATCH'){const b=await readBody();return json(res,200,projects.update(id,b,user));}
      if(action==='members'&&method==='GET')return json(res,200,projects.members(id,user));
      if(action==='members'&&method==='POST'){const b=await readBody();projects.setMember(id,b.user_id,b.role,user);return json(res,200,{ok:true});}
      if(action==='candidates'&&method==='GET')return json(res,200,projects.candidates(id,user,searchParams.get('q')||''));
      if(action==='agents'&&method==='GET')return json(res,200,projects.agents(projects.requireProject(id,user),user));
    }
    if(pathname==='/api/portals'&&method==='GET')return json(res,200,projects.list(user).filter(p=>projects.canPortal(user,p)));
    const portalRoute=pathname.match(/^\/api\/portals\/([a-z0-9]+(?:-[a-z0-9]+)*)$/);
    if(portalRoute&&method==='GET'){
      const p=db.prepare('SELECT * FROM projects WHERE portal_slug=?').get(portalRoute[1]);
      if(!p||!projects.canPortal(user,p))fail(404,'Portal nie istnieje lub Twoje konto nie ma do niego dostępu.');
      return json(res,200,projects.view(p,user));
    }
    if(method==='GET'&&pathname==='/api/tickets')return json(res,200,queryTickets(searchParams,user));
    if(method==='GET'&&pathname==='/api/stats'){
      const {clause,values}=ticketFilters(searchParams,user);
      const rows=db.prepare('SELECT t.status,COUNT(*) count FROM tickets t'+clause+' GROUP BY t.status').all(...values);
      return json(res,200,Object.fromEntries(Object.keys(statuses).map(s=>[s,rows.find(r=>r.status===s)?.count||0])));
    }
    if(method==='POST'&&pathname==='/api/tickets'){
      rateLimit('create:'+user.id,100);const b=await readBody();
      if(!Number.isSafeInteger(b.project_id))fail(400,'Wybierz projekt.');
      const p=projects.project(b.project_id);
      if(!p||(!projects.canWork(user,p)&&!projects.canPortal(user,p)))fail(403,'Projekt niedostępny.');
      if(p.archived)fail(409,'Projekt jest zarchiwizowany.');
      if(p.module_type==='assets')fail(400,'W katalogu urządzeń twórz środki trwałe; zgłoszenie wybierz w powiązanym projekcie.');
      const fromPortal=!projects.canWork(user,p)||b.from_portal===true;
      if(fromPortal&&!projects.canPortal(user,p))fail(403,'Portal niedostępny.');
      const form=catalog.prepare(p,b,fromPortal),title=textValue(form.title,'Temat',3,200),description=textValue(form.description,'Opis',3,20000),initial=workflows.start(p);
      const reporter=fromPortal?user.id:desk.reporter(p,b.reporter_id??user.id,user);
      const organization=desk.organization(p,reporter,b.organization_id??null);
      const owner=fromPortal?null:assignee(b.assignee_id??null,p);
      const key=tx(()=>{
        const current=projects.project(p.id),number=current.next_number;
        if(number>2000000000)fail(409,'Wyczerpano zakres numeracji projektu.');
        const key=projects.issueKey(current,number),stamp=now();
        db.prepare('UPDATE projects SET next_number=next_number+1,version=version+1 WHERE id=?').run(p.id);
        const result=db.prepare(`INSERT INTO tickets(project_id,key,number,title,description,type,priority,status,reporter_id,assignee_id,created_at,updated_at,request_type_id,form_snapshot,custom_values,workflow_status,created_by,organization_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(p.id,key,number,title,description,form.type,form.priority,initial.category,reporter,owner,stamp,stamp,form.id,form.snapshot,form.values,initial.key,user.id,organization);
        const id=Number(result.lastInsertRowid);if(b.asset_id!==undefined&&b.asset_id!==null){if(fromPortal)fail(403,'Urządzenia przypisuje zespół.');extensions.resources.attach(id,b.asset_id,false,user);}record(id,user.id,'Utworzono zgłoszenie; zgłaszający: '+db.prepare('SELECT name FROM users WHERE id=?').get(reporter).name+'.');projects.audit(p.id,user,'ticket.created',{ticket_id:id,created_by:user.id,reporter_id:reporter});workflows.run(db.prepare('SELECT * FROM tickets WHERE id=?').get(id),'ticket_created',user);return key;
      });extensions.events();return json(res,201,{key});
    }
    const ticketRoute=pathname.match(/^\/api\/tickets\/([A-Z][A-Z0-9]{1,9}-[0-9]{1,10})(\/comments)?$/);
    if(ticketRoute){
      let t=ticketFor(ticketRoute[1],user),p=projects.project(t.project_id),canWork=projects.canWork(user,p);
      if(method==='GET'&&!ticketRoute[2]){
        workflows.automation.processDue(t.id);t=ticketFor(ticketRoute[1],user);
        const comments=db.prepare(`SELECT c.id,c.body,c.internal,c.created_at,c.origin IN ('automation','sync') is_bot,u.name author_name,u.username,u.id author_id FROM comments c JOIN users u ON u.id=c.author_id WHERE c.ticket_id=?${canWork?'':' AND c.internal=0'} ORDER BY c.id`).all(t.id);
        const activity=!canWork?[]:db.prepare("SELECT a.id,a.body,a.created_at,CASE WHEN a.automation_rule IS NOT NULL THEN 'Automatyzacja' ELSE u.name END actor_name FROM activity a JOIN users u ON u.id=a.actor_id WHERE a.ticket_id=? ORDER BY a.id DESC").all(t.id);
        return json(res,200,{ticket:ticketWithSla(t,user),comments:comments.map(c=>desk.commentExtras(c,t,user)),activity,agents:projects.agents(p,user),sync:canWork?extensions.sync.available(t,user):[]});
      }
      if(method==='POST'&&ticketRoute[2]){
        rateLimit('comment:'+user.id,200);const b=await readBody(),content=textValue(b.body,'Wiadomość',1,20000);
        workflows.automation.processDue(t.id);t=ticketFor(ticketRoute[1],user);p=projects.project(t.project_id);canWork=projects.canWork(user,p);
        if(p.archived||t.archived_at)fail(409,'Projekt lub zgłoszenie jest zarchiwizowane.');
        if(b.internal!==undefined&&typeof b.internal!=='boolean')fail(400,'Nieprawidłowa widoczność wiadomości.');
        if(b.internal&&!canWork)fail(403,'Brak dostępu do notatek wewnętrznych.');
        if(!canWork&&t.customer_reply_locked)fail(409,'Możliwość odpowiedzi w tym zgłoszeniu została zamknięta. Utwórz nowe zgłoszenie, jeśli potrzebujesz pomocy.');
        if(t.status==='closed')fail(409,'Zamknięta sprawa jest ostateczna. Utwórz nowe lub sklonuj zgłoszenie.');
        tx(()=>{
          const stamp=now();db.prepare('INSERT INTO comments(ticket_id,author_id,body,internal,created_at) VALUES(?,?,?,?,?)').run(t.id,user.id,content,b.internal?1:0,stamp);
          const response=canWork&&!b.internal&&user.id!==t.reporter_id&&!t.first_response_at?stamp:t.first_response_at;
          db.prepare("UPDATE tickets SET first_response_at=?,updated_at=?,version=version+1,change_source='web' WHERE id=?").run(response,stamp,t.id);
          workflows.run(t,b.internal?'internal_note':canWork?'agent_reply':'customer_reply',user);
        });extensions.events();return json(res,201,{ok:true});
      }
      if(method==='PATCH'&&!ticketRoute[2]){
        const b=await readBody();workflows.automation.processDue(t.id);t=ticketFor(ticketRoute[1],user);p=projects.project(t.project_id);canWork=projects.canWork(user,p);
        if(p.archived||t.archived_at)fail(409,'Projekt lub zgłoszenie jest zarchiwizowane.');
        if(!canWork)fail(403,'Klient może dodawać odpowiedzi, ale nie może edytować zgłoszenia.');
        if(!canWork&&t.customer_reply_locked)fail(403,'Zgłoszenie jest zablokowane dla odpowiedzi i ponownego otwarcia przez klienta.');
        if(t.status==='closed')fail(409,'Zamknięta sprawa jest ostateczna. Możesz utworzyć nowe lub sklonować zgłoszenie.');
        if(b.version!==t.version)fail(409,'Zgłoszenie zmieniło się w tle. Odśwież je i ponów zmianę.');
        const allowed=canWork?['version','title','description','status','workflow_status','workflow_version','priority','type','assignee_id','custom_values','reporter_id','resolution_text','organization_id']:['version','status','workflow_status','workflow_version','custom_values'];
        if(Object.keys(b).some(k=>!allowed.includes(k)))fail(403,'Brak uprawnień do tej zmiany.');
        const next={...t};
        if(b.reporter_id!==undefined)next.reporter_id=desk.reporter(p,b.reporter_id,user);
        if(b.organization_id!==undefined||b.reporter_id!==undefined)next.organization_id=desk.organization(p,next.reporter_id,b.organization_id??null);
        if(b.resolution_text!==undefined)next.resolution_text=textValue(b.resolution_text,'Rozwiązanie',0,20000);
        for(const field of ['priority','type'])if(Object.hasOwn(b,field))next[field]=choice(b[field],{priority:priorities,type:types}[field],field);
        const transition=workflows.transition(t,b,canWork);next.status=transition.category;next.workflow_status=transition.key;
        if(b.custom_values!==undefined){if(t.status==='closed')fail(409,'Najpierw otwórz zgłoszenie ponownie.');next.custom_values=catalog.editValues(t,b.custom_values,canWork);}
        if(b.title!==undefined)next.title=textValue(b.title,'Temat',3,200);
        if(b.description!==undefined)next.description=textValue(b.description,'Opis',3,20000);
        if(b.assignee_id!==undefined)next.assignee_id=assignee(b.assignee_id,p);
        tx(()=>{
          const stamp=now(),done=['resolved','closed'].includes(next.status);
          db.prepare('UPDATE tickets SET title=?,description=?,status=?,priority=?,type=?,assignee_id=?,resolved_at=?,updated_at=?,version=version+1,workflow_status=?,custom_values=?,reporter_id=?,organization_id=?,resolution_text=?,change_source=?,last_actor_id=? WHERE id=?').run(next.title,next.description,next.status,next.priority,next.type,next.assignee_id,done?(t.resolved_at||stamp):null,stamp,next.workflow_status,next.custom_values,next.reporter_id,next.organization_id,next.resolution_text,'web',user.id,t.id);
          if(t.reporter_id!==next.reporter_id){record(t.id,user.id,`Zgłaszający: ${t.reporter_id} → ${next.reporter_id}.`);projects.audit(p.id,user,'ticket.reporter_changed',{ticket_id:t.id,before:t.reporter_id,after:next.reporter_id});}
          if(t.workflow_status!==next.workflow_status){const w=workflows.get(p.id);record(t.id,user.id,`Status: ${w.statuses.find(s=>s.key===t.workflow_status).name} → ${w.statuses.find(s=>s.key===next.workflow_status).name}.`);}
          if(t.custom_values!==next.custom_values)record(t.id,user.id,'Zmieniono dane formularza.');
          if(t.priority!==next.priority)record(t.id,user.id,`Priorytet: ${t.priority} → ${next.priority}.`);
          if(t.type!==next.type)record(t.id,user.id,`Typ: ${types[t.type]} → ${types[next.type]}.`);
          if(t.assignee_id!==next.assignee_id)record(t.id,user.id,'Opiekun: '+(next.assignee_id?db.prepare('SELECT name FROM users WHERE id=?').get(next.assignee_id).name:'Nieprzypisane')+'.');
          if(t.title!==next.title||t.description!==next.description)record(t.id,user.id,'Zmieniono temat lub opis zgłoszenia.');
          workflows.automation.onChange(t,user);
        });extensions.events();return json(res,200,{ok:true});
      }
    }
    if(pathname==='/api/users'){
      if(method==='GET'){admin();return json(res,200,db.prepare("SELECT * FROM users WHERE NOT (active=0 AND password='!' AND email='deleted-'||id||'@invalid.example') ORDER BY registration_state DESC,name").all().map(safeUser));}
      if(method==='POST'){
        const b=await readBody();admin();const created=await identity.create(b,user);return json(res,201,{user:safeUser(created)});
      }
    }
    const userOperation=pathname.match(/^\/api\/users\/([1-9][0-9]*)\/(avatar|delete)$/);
    if(userOperation&&method==='POST'){
      const b=await readBody();admin();const target=db.prepare('SELECT * FROM users WHERE id=?').get(Number(userOperation[1]));
      if(!target)fail(404,'Nie znaleziono użytkownika.');
      if(b.version!==target.version)fail(409,'Konto zmieniło się. Odśwież widok.');
      if(userOperation[2]==='avatar'){const result=identity.avatar(target,b);projects.audit(null,user,'user.avatar_updated',{user_id:target.id});return json(res,200,result);}
      if(target.id===user.id)fail(400,'Nie możesz usunąć swojego konta.');
      if(target.auth_source!=='local')fail(400,'Konto z katalogu zewnętrznego można zablokować. Usuń je u dostawcy tożsamości.');
      if(target.role==='admin'&&target.active&&db.prepare("SELECT COUNT(*) n FROM users WHERE role='admin' AND active=1 AND auth_source='local' AND registration_state='active'").get().n<2)fail(400,'Musi pozostać aktywny administrator lokalny.');
      tx(()=>{
        // Preserve historical authorship with an inactive, anonymized record.
        db.prepare("UPDATE users SET active=0,directory_active=0,name='Usunięty użytkownik #'||id,first_name='',last_name='',email='deleted-'||id||'@invalid.example',username='deleted-'||id,password='!',role='customer',version=version+1 WHERE id=?").run(target.id);
        for(const table of ['sessions','account_tokens','identity_tokens','avatars','user_mfa','mfa_challenges','project_members','organization_members','ticket_watchers'])db.prepare('DELETE FROM '+table+' WHERE user_id=?').run(target.id);
        db.prepare('UPDATE api_tokens SET revoked_at=? WHERE user_id=?').run(now(),target.id);
        db.prepare("UPDATE profile_requests SET state='rejected',reviewer_id=?,reviewed_at=? WHERE user_id=? AND state='pending'").run(user.id,now(),target.id);
        projects.clearAssignments(target.id);projects.audit(null,user,'user.deleted',{user_id:target.id});
      });return json(res,200,{ok:true});
    }
    const userRoute=pathname.match(/^\/api\/users\/([1-9][0-9]*)$/);
    if(userRoute&&method==='PATCH'){
      const b=await readBody();admin();let target=db.prepare('SELECT * FROM users WHERE id=?').get(Number(userRoute[1]));
      if(!target)fail(404,'Nie znaleziono użytkownika.');
      if(b.version!==target.version)fail(409,'Konto zmieniło się. Odśwież stronę.');
      if(Object.keys(b).some(k=>!['version','role','active','is_internal','new_password','approve','first_name','last_name','email'].includes(k)))fail(400,'Nieznane pole użytkownika.');
      if(target.auth_source==='ldap'&&['role','is_internal','new_password','approve','first_name','last_name','email'].some(k=>Object.hasOwn(b,k)))fail(400,'Rolę i dane tego konta ustala LDAP. Lokalnie możesz włączyć lub zablokować dostęp.');
      for(const key of ['active','is_internal','approve'])if(b[key]!==undefined&&typeof b[key]!=='boolean')fail(400,'Nieprawidłowe pole: '+key);
      const role=b.role===undefined?target.role:choice(b.role,{admin:1,agent:1,customer:1},'rola'),active=b.active===undefined?target.active:Number(b.active),internal=b.is_internal===undefined?target.is_internal:Number(b.is_internal);
      if(target.id===user.id&&(!active||role!=='admin'))fail(400,'Nie możesz odebrać sobie dostępu administratora.');
      if(b.approve&&target.registration_state!=='pending_approval')fail(400,'Konto nie oczekuje na zatwierdzenie administratora.');
      const first=b.first_name===undefined?target.first_name:textValue(b.first_name,'Imię',1,60),last=b.last_name===undefined?target.last_name:textValue(b.last_name,'Nazwisko',0,80),mail=b.email===undefined?target.email:emailValue(b.email);
      if(db.prepare('SELECT id FROM users WHERE email=? AND id<>?').get(mail,target.id))fail(409,'Adres e-mail jest już zajęty.');
      const encoded=b.new_password===undefined?target.password:await encodePassword(b.new_password);authenticate();admin();
      target=db.prepare('SELECT * FROM users WHERE id=?').get(target.id);if(b.version!==target.version)fail(409,'Konto zmieniło się. Odśwież stronę.');
      tx(()=>{
        if(target.role==='admin'&&(!active||role!=='admin')&&db.prepare("SELECT COUNT(*) n FROM users WHERE role='admin' AND active=1 AND auth_source='local' AND registration_state='active'").get().n<2)fail(400,'Musi pozostać aktywny administrator lokalny.');
        db.prepare('UPDATE users SET role=?,active=?,is_internal=?,password=?,must_change=?,registration_state=?,version=version+1 WHERE id=?').run(role,active,internal,encoded,b.new_password!==undefined?0:target.must_change,b.approve?'active':target.registration_state,target.id);
        db.prepare('UPDATE users SET first_name=?,last_name=?,name=?,email=? WHERE id=?').run(first,last,(first+' '+last).trim()||target.name,mail,target.id);
        db.prepare('DELETE FROM sessions WHERE user_id=?').run(target.id);db.prepare('DELETE FROM account_tokens WHERE user_id=?').run(target.id);projects.clearAssignments(target.id);
        projects.audit(null,user,b.approve?'user.approved':'user.updated',{user_id:target.id,role,active:Boolean(active),is_internal:Boolean(internal),password_reset:b.new_password!==undefined});
      });extensions.events();return json(res,200,{ok:true});
    }
    fail(404,'Nie znaleziono zasobu.');
  }catch(e){
    if(e.message?.includes('DESK_FINAL_CLOSED')){e.status=409;e.message='Zamknięte zgłoszenie jest ostateczne.';}
    if(e.message?.includes('DESK_RESOLUTION_REQUIRED')){e.status=400;e.message='Wpisz rozwiązanie wymagane przez projekt.';}
    if(!e.status)console.error('Błąd serwera:',e.message);
    if(!res.headersSent)json(res,e.status||500,{error:e.status?e.message:'Błąd serwera. Spróbuj ponownie.'});else res.end();
  }
});
server.requestTimeout=15000;server.headersTimeout=10000;server.maxRequestsPerSocket=100;
workflows.automation.start();extensions.start();updates.start();
server.listen(Number(process.env.PORT||3000),process.env.HOST||'0.0.0.0',()=>console.log(`Service Desk działa na porcie ${server.address().port}`));
let stopping=false;
function stop(){if(stopping)return;stopping=true;clearInterval(housekeeping);updates.stop();workflows.automation.stop();extensions.stop();directory.stop();accounts.stop();server.close(()=>{db.exec('PRAGMA wal_checkpoint(TRUNCATE)');db.close();process.exit(0);});setTimeout(()=>process.exit(1),10000).unref();}
process.on('SIGTERM',stop);process.on('SIGINT',stop);
