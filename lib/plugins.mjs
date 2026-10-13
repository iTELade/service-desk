import { normalizePluginHooks } from './plugin-ui-contract.mjs';
import {fail,now,text,boolean,txFor} from './core.mjs';
import {VERSION} from './version.mjs';

const ID=/^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;
const SEMVER=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/;
const CAPABILITIES=new Set([
  'form.field','admin.settings','project.settings','portal.panel','ticket.panel','ticket.action',
  'workflow.condition','workflow.action','automation.trigger','automation.action',
  'dashboard.widget','notification.provider','import.provider','export.provider',
  'integration.connector','asset.extension','scheduled.job','event.listener',
  'migration','locale'
]);

function versionParts(v){const m=String(v).match(/^(\d+)\.(\d+)\.(\d+)/);return m?m.slice(1).map(Number):[0,0,0];}
function cmp(a,b){const x=versionParts(a),y=versionParts(b);for(let i=0;i<3;i++){if(x[i]!==y[i])return x[i]-y[i];}return 0;}
function compatible(range){
  const value=String(range||'>=1.0.0').trim();
  if(value==='*')return true;
  const m=value.match(/^(>=|>|<=|<|=)?\s*(\d+\.\d+\.\d+)$/);if(!m)return false;
  const c=cmp(VERSION,m[2]);return ({'>=':c>=0,'>':c>0,'<=':c<=0,'<':c<0,'=':c===0,'':c===0})[m[1]||''];
}

export function createPlugins(db){
  db.exec(`
    CREATE TABLE IF NOT EXISTS plugin_registry(
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      plugin_version TEXT NOT NULL,
      service_desk_range TEXT NOT NULL DEFAULT '>=1.0.0',
      manifest TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
      health TEXT NOT NULL DEFAULT 'ok',
      last_error TEXT,
      installed_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS plugin_events(
      id INTEGER PRIMARY KEY,
      plugin_id TEXT NOT NULL REFERENCES plugin_registry(id) ON DELETE CASCADE,
      event TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS plugin_data_versions(plugin_id TEXT PRIMARY KEY REFERENCES plugin_registry(id) ON DELETE CASCADE,data_version INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS plugin_migrations(id INTEGER PRIMARY KEY,plugin_id TEXT NOT NULL REFERENCES plugin_registry(id) ON DELETE CASCADE,user_id INTEGER NOT NULL REFERENCES users(id),request_key TEXT NOT NULL,payload TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','sent','completed','failed','paused','cancelled')),attempts INTEGER NOT NULL DEFAULT 0,run_at TEXT NOT NULL,created_at TEXT NOT NULL,result TEXT NOT NULL DEFAULT '{}',version INTEGER NOT NULL DEFAULT 1,UNIQUE(plugin_id,request_key));
    CREATE INDEX IF NOT EXISTS plugin_migration_due ON plugin_migrations(state,run_at);
    CREATE INDEX IF NOT EXISTS idx_plugin_events_plugin ON plugin_events(plugin_id,id DESC);
  `);
  const tx=txFor(db);
  const admin=u=>{if(u.role!=='admin')fail(403,'Administrator required.');};
  const parse=v=>{try{return JSON.parse(v);}catch{return {};}};
  function normalize(input){
    if(!input||typeof input!=='object'||Array.isArray(input))fail(400,'Plugin manifest must be an object.');
    const id=text(String(input.id||''),'Plugin ID',2,64).toLowerCase();if(!ID.test(id))fail(400,'Invalid plugin ID.');
    const name=text(String(input.name||id),'Plugin name',2,100);
    const version=text(String(input.version||''),'Plugin version',5,64);if(!SEMVER.test(version))fail(400,'Plugin version must use semantic versioning.');
    const serviceDesk=text(String(input.serviceDesk||'>=1.0.0'),'Service Desk compatibility',1,64);if(!compatible(serviceDesk))fail(409,`Plugin ${id} is not compatible with Service Desk ${VERSION}.`);
    const capabilities=Array.isArray(input.capabilities)?[...new Set(input.capabilities.map(String))]:[];
    for(const capability of capabilities)if(!CAPABILITIES.has(capability))fail(400,'Unknown plugin capability: '+capability);
    const permissions=Array.isArray(input.permissions)?[...new Set(input.permissions.map(x=>text(String(x),'Permission',1,100)))]:[];
    const locales=Array.isArray(input.locales)?[...new Set(input.locales.map(x=>String(x).toLowerCase()).filter(x=>/^[a-z]{2}(?:-[a-z]{2})?$/.test(x)))]:[];
    const subscriptions=input.subscriptions||[];
    if(!Array.isArray(subscriptions)||subscriptions.some(e=>!['ticket_created','ticket_updated','status_changed','comment_added'].includes(e)))fail(400,'Unknown plugin event subscription.');
    if(subscriptions.length&&(!capabilities.includes('event.listener')||!capabilities.includes('scheduled.job')))fail(400,'Event subscriptions require event.listener and scheduled.job.');
    const apiVersion=input.apiVersion??1;if(apiVersion!==1)fail(409,'Unsupported plugin API version.');
    const dependencies=input.dependencies||[];if(!Array.isArray(dependencies)||dependencies.length>30)fail(400,'Invalid plugin dependencies.');
    const normalizedDependencies=dependencies.map(d=>{if(!d||!ID.test(d.id)||!SEMVER.test(d.minimum))fail(400,'Invalid plugin dependency.');if(d.id===id)fail(400,'Plugin cannot depend on itself.');return {id:d.id,minimum:d.minimum};});
    const dataVersion=input.dataVersion??0;if(!Number.isSafeInteger(dataVersion)||dataVersion<0||dataVersion>1000000||(capabilities.includes('migration')&&dataVersion===0)||(!capabilities.includes('migration')&&dataVersion!==0))fail(400,'Migration requires a positive integer dataVersion.');
    return {id,name,version,serviceDesk,apiVersion,dataVersion,hooks:normalizePluginHooks(input.hooks||[],capabilities),subscriptions:[...new Set(subscriptions)],dependencies:normalizedDependencies,capabilities,permissions,locales,description:String(input.description||'').slice(0,1000),homepage:String(input.homepage||'').slice(0,500)};
  }
  function output(r){const manifest=parse(r.manifest);return {data_version:db.prepare('SELECT data_version FROM plugin_data_versions WHERE plugin_id=?').get(r.id)?.data_version||0,id:r.id,name:r.name,version:r.plugin_version,service_desk:r.service_desk_range,enabled:Boolean(r.enabled),health:r.health,last_error:r.last_error,installed_at:r.installed_at,updated_at:r.updated_at,revision:r.version,manifest};}
  function list(u){admin(u);return db.prepare('SELECT * FROM plugin_registry ORDER BY name').all().map(output);}
  function install(input,u){admin(u);const m=normalize(input),stamp=now();return tx(()=>{
    const old=db.prepare('SELECT * FROM plugin_registry WHERE id=?').get(m.id);
    if(old&&cmp(m.version,old.plugin_version)<0)fail(409,'Plugin downgrade is not allowed.');
    if(m.dataVersion<(db.prepare('SELECT data_version FROM plugin_data_versions WHERE plugin_id=?').get(m.id)?.data_version||0))fail(409,'Plugin data downgrade is not allowed.');
    const encoded=JSON.stringify(m);
    if(old&&db.prepare("SELECT 1 FROM sqlite_master WHERE name='platform_jobs'").get())db.prepare("UPDATE platform_jobs SET state='paused',version=version+1 WHERE plugin_id=? AND state='queued'").run(m.id);
    if(old)db.prepare("UPDATE plugin_registry SET enabled=0,name=?,plugin_version=?,service_desk_range=?,manifest=?,health='ok',last_error=NULL,updated_at=?,version=version+1 WHERE id=?").run(m.name,m.version,m.serviceDesk,encoded,stamp,m.id);
    else db.prepare('INSERT INTO plugin_registry(id,name,plugin_version,service_desk_range,manifest,installed_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(m.id,m.name,m.version,m.serviceDesk,encoded,stamp,stamp);
    db.prepare('INSERT INTO plugin_events(plugin_id,event,detail,created_at) VALUES(?,?,?,?)').run(m.id,old?'updated':'installed',m.version,stamp);
    return output(db.prepare('SELECT * FROM plugin_registry WHERE id=?').get(m.id));
  });}
  function setEnabled(id,value,u){admin(u);const row=db.prepare('SELECT * FROM plugin_registry WHERE id=?').get(id);if(!row)fail(404,'Plugin not found.');if(value){const manifest=parse(row.manifest);if(manifest.capabilities.includes('migration')&&(db.prepare('SELECT data_version FROM plugin_data_versions WHERE plugin_id=?').get(id)?.data_version||0)!==manifest.dataVersion)fail(409,'Complete the plugin data migration before enabling it.');for(const dep of parse(row.manifest).dependencies||[]){const installed=db.prepare('SELECT * FROM plugin_registry WHERE id=?').get(dep.id);if(!installed?.enabled||cmp(installed.plugin_version,dep.minimum)<0)fail(409,'Required plugin dependency is unavailable: '+dep.id);}}
    const enabled=Number(boolean(Boolean(value),'Plugin enabled')),stamp=now();db.prepare('UPDATE plugin_registry SET enabled=?,updated_at=?,version=version+1 WHERE id=?').run(enabled,stamp,id);if(!enabled&&db.prepare("SELECT 1 FROM sqlite_master WHERE name='platform_jobs'").get())db.prepare("UPDATE platform_jobs SET state='paused',version=version+1 WHERE plugin_id=? AND state='queued'").run(id);db.prepare('INSERT INTO plugin_events(plugin_id,event,detail,created_at) VALUES(?,?,?,?)').run(id,enabled?'enabled':'disabled','',stamp);return output(db.prepare('SELECT * FROM plugin_registry WHERE id=?').get(id));}
  function remove(id,u){admin(u);const row=db.prepare('SELECT * FROM plugin_registry WHERE id=?').get(id);if(!row)fail(404,'Plugin not found.');if(row.enabled)fail(409,'Disable the plugin before uninstalling it.');if(db.prepare("SELECT 1 FROM plugin_migrations WHERE plugin_id=? AND state IN ('queued','sent')").get(id))fail(409,'Cancel pending migrations before uninstalling.');db.prepare('DELETE FROM plugin_registry WHERE id=?').run(id);return {ok:true};}
  function events(id,u){admin(u);return db.prepare('SELECT * FROM plugin_events WHERE plugin_id=? ORDER BY id DESC LIMIT 100').all(id);}
  function health(){const rows=db.prepare('SELECT id,name,enabled,health,last_error FROM plugin_registry ORDER BY name').all();return {installed:rows.length,enabled:rows.filter(x=>x.enabled).length,failed:rows.filter(x=>x.health==='error').length,plugins:rows.map(x=>({...x,enabled:Boolean(x.enabled)}))};}
  return {list,install,setEnabled,remove,events,health,capabilities:[...CAPABILITIES]};
}
