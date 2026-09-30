import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';

const read=path=>readFileSync(path,'utf8');
const write=(path,content)=>writeFileSync(path,content);
const replace=(path,from,to)=>{const source=read(path);if(!source.includes(from))throw new Error(`Missing patch anchor in ${path}`);write(path,source.replace(from,to));};

// Version metadata.
const pkg=JSON.parse(read('package.json'));pkg.version='2.0.0';write('package.json',JSON.stringify(pkg,null,2)+'\n');
const lock=JSON.parse(read('package-lock.json'));lock.version='2.0.0';lock.packages[''].version='2.0.0';write('package-lock.json',JSON.stringify(lock,null,2)+'\n');
write('lib/version.mjs',"export const VERSION='2.0.0';\nexport const SCHEMA_VERSION=9;\n");

// Wire schema 9 into startup.
let server=read('server.mjs');
if(!server.includes("import {migrateV9} from './lib/migration-v9.mjs';"))server=server.replace("import {migrateV8} from './lib/migration-v8.mjs';", "import {migrateV8} from './lib/migration-v8.mjs';\nimport {migrateV9} from './lib/migration-v9.mjs';");
server=server.replace("if (schemaVersion > 8) throw new Error('Baza wymaga nowszej wersji aplikacji.');","if (schemaVersion > 9) throw new Error('Baza wymaga nowszej wersji aplikacji.');");
if(!server.includes("user_version<9)migrateV9"))server=server.replace("if(db.prepare('PRAGMA user_version').get().user_version<8)migrateV8(db);", "if(db.prepare('PRAGMA user_version').get().user_version<8)migrateV8(db);\nif(db.prepare('PRAGMA user_version').get().user_version<9)migrateV9(db);");
write('server.mjs',server);

write('lib/migration-v9.mjs',`import {txFor} from './core.mjs';

export function migrateV9(db){
  const version=db.prepare('PRAGMA user_version').get().user_version;
  if(version===9)return;
  if(version!==8)throw new Error('Migracja v9 wymaga bazy v8.');
  txFor(db)(()=>{
    db.exec(\`
      CREATE TABLE ui_preferences(
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        sidebar_collapsed INTEGER NOT NULL DEFAULT 0 CHECK(sidebar_collapsed IN (0,1)),
        density TEXT NOT NULL DEFAULT 'comfortable' CHECK(density IN ('comfortable','compact')),
        locale TEXT NOT NULL DEFAULT 'pl',
        home_route TEXT NOT NULL DEFAULT '#/queue',
        version INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE project_service_settings(
        project_id INTEGER PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
        config TEXT NOT NULL DEFAULT '{}',
        version INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE integration_health(
        integration_key TEXT PRIMARY KEY,
        state TEXT NOT NULL DEFAULT 'unknown' CHECK(state IN ('unknown','connected','warning','error','disabled')),
        message TEXT NOT NULL DEFAULT '',
        latency_ms INTEGER,
        details TEXT NOT NULL DEFAULT '{}',
        checked_at TEXT,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE service_catalog_categories(
        id INTEGER PRIMARY KEY,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        icon TEXT NOT NULL DEFAULT 'service',
        sort_order INTEGER NOT NULL DEFAULT 10,
        enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(project_id,name)
      );
      CREATE INDEX idx_catalog_categories_project ON service_catalog_categories(project_id,sort_order,id);
      CREATE TABLE service_catalog_category_types(
        category_id INTEGER NOT NULL REFERENCES service_catalog_categories(id) ON DELETE CASCADE,
        request_type_id INTEGER NOT NULL REFERENCES request_types(id) ON DELETE CASCADE,
        sort_order INTEGER NOT NULL DEFAULT 10,
        PRIMARY KEY(category_id,request_type_id)
      );
      ALTER TABLE v8_saved_views ADD COLUMN columns TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE v8_saved_views ADD COLUMN sort_key TEXT NOT NULL DEFAULT 'updated_at';
      ALTER TABLE v8_saved_views ADD COLUMN sort_dir TEXT NOT NULL DEFAULT 'desc' CHECK(sort_dir IN ('asc','desc'));
      ALTER TABLE v8_saved_views ADD COLUMN density TEXT NOT NULL DEFAULT 'comfortable' CHECK(density IN ('comfortable','compact'));
    \`);
    const stamp=new Date().toISOString();
    const saveProject=db.prepare('INSERT INTO project_service_settings(project_id,config,updated_at) VALUES(?,?,?)');
    const addCategory=db.prepare("INSERT INTO service_catalog_categories(project_id,name,description,icon,sort_order,created_at,updated_at) VALUES(?,?,?,?,10,?,?)");
    const mapType=db.prepare('INSERT OR IGNORE INTO service_catalog_category_types(category_id,request_type_id,sort_order) VALUES(?,?,?)');
    for(const p of db.prepare('SELECT * FROM projects').all()){
      saveProject.run(p.id,JSON.stringify({
        portal:{access:p.portal_access||'members',slug:p.portal_slug||null,title:p.portal_title||p.name,description:p.portal_description||''},
        requests:{number_padding:Number(p.number_padding||0)},
        navigation:{show_knowledge:true,show_assets:true,show_reports:true},
        workspace:{default_view:'queue',density:'comfortable'}
      }),stamp);
      if(p.project_type==='external'){
        const categoryId=Number(addCategory.run(p.id,'Ogólne','Najczęściej używane typy zgłoszeń','service',stamp,stamp).lastInsertRowid);
        const types=db.prepare('SELECT id FROM request_types WHERE project_id=? AND enabled=1 AND portal_visible=1 ORDER BY sort_order,id').all(p.id);
        types.forEach((row,index)=>mapType.run(categoryId,row.id,(index+1)*10));
      }
    }
    const health=db.prepare('INSERT INTO integration_health(integration_key,state,updated_at) VALUES(?,?,?)');
    for(const key of ['directory','sso','smtp','github','updater'])health.run(key,'unknown',stamp);
    db.exec('PRAGMA user_version=9; PRAGMA optimize;');
  });
}
`);

// 2.0 entry point: one product design system, one shell controller.
write('public/index.html',`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="description" content="Service Desk — IT service management, support portal and team workspace.">
  <title>Service Desk</title>
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <link rel="stylesheet" href="/app.css?v=2.0.0">
  <link rel="stylesheet" href="/design-system.css?v=2.0.0">
  <script src="/i18n.js?v=2.0.0"></script>
  <script src="/security.js?v=2.0.0"></script>
  <script type="module" src="/app.js?v=2.0.0"></script>
  <script type="module" src="/settings-center.js?v=2.0.0"></script>
  <script defer src="/release-1.1.2.js?v=2.0.0"></script>
  <script defer src="/product-shell.js?v=2.0.0"></script>
</head>
<body class="sd20">
  <a class="skip" href="#main">Skip to content</a>
  <div id="app"><main id="main" class="loading">Loading Service Desk…</main></div>
  <div id="notices" class="notices" role="status" aria-live="polite"></div>
  <dialog id="modal"></dialog>
  <noscript>Enable JavaScript to use the Service Desk portal.</noscript>
</body>
</html>
`);

write('public/product-shell.js',`(()=>{
'use strict';
const VERSION='2.0.0';
const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
const route=()=>location.hash.split('?')[0]||'#/';
const routeName=value=>{
  if(value.startsWith('#/ticket/'))return 'ticket';
  if(value.startsWith('#/project/')&&value.includes('/settings'))return 'project-settings';
  if(value.startsWith('#/portal'))return 'portal';
  return value.startsWith('#/')?(value.slice(2).split('/')[0]||'home'):'home';
};
const labels={queue:'Queues',board:'Board',projects:'Projects',users:'Customers & people',settings:'Administration',ticket:'Request',portal:'Help center',reports:'Reports'};
function navGroup(link){const href=link.getAttribute('href')||'';if(/queue|board/.test(href))return 'Work';if(/projects|assets|knowledge|reports/.test(href))return 'Service management';if(/users|organizations/.test(href))return 'People';if(/settings|admin/.test(href))return 'Administration';return 'More';}
function decorateNavigation(){
  const nav=$('.workspace .sidebar nav');if(!nav)return;
  nav.classList.add('sd20-nav');
  if(nav.dataset.sd20Decorated==='1')return;
  nav.dataset.sd20Decorated='1';
  const seen=new Set();
  for(const link of $$(':scope > a',nav)){
    const group=navGroup(link);link.dataset.sd20Group=group;link.classList.add('sd20-nav-link');
    if(!seen.has(group)){
      const title=document.createElement('div');title.className='sd20-nav-group';title.textContent=group;nav.insertBefore(title,link);seen.add(group);
    }
  }
}
function decorateShell(){
  const workspace=$('.workspace');if(!workspace)return;
  workspace.classList.add('sd20-shell');workspace.dataset.productVersion=VERSION;
  const sidebar=$('.sidebar',workspace);if(sidebar)sidebar.classList.add('sd20-sidebar');
  const brand=$('.brand span',workspace);if(brand)brand.textContent='iTELade Service Management';
  const content=$('.workspace-content',workspace);if(content)content.classList.add('sd20-workspace');
  const topbar=$('.topbar',workspace);if(topbar){topbar.classList.add('sd20-topbar');if(!$('.sd20-context',topbar)){const context=document.createElement('div');context.className='sd20-context';const name=routeName(route());context.innerHTML='<span>Service Management</span><strong>'+String(labels[name]||name||'Workspace')+'</strong>';topbar.prepend(context);}}
  decorateNavigation();
}
function decorateMain(){
  const main=$('#main');if(!main)return;
  const name=routeName(route());
  document.body.dataset.sd20Route=name;main.classList.add('sd20-main','sd20-'+name);
  const heading=$('.page-heading',main);if(heading)heading.classList.add('sd20-page-heading');
  $$('.panel,.detail-panel',main).forEach(el=>el.classList.add('sd20-surface'));
  $$('table',main).forEach(el=>el.classList.add('sd20-table'));
  $$('.pill',main).forEach(el=>el.classList.add('sd20-status'));
  if(name==='queue'){
    main.classList.add('sd20-queue-workspace');
    $('.metrics',main)?.classList.add('sd20-metrics');
    $('.filters',main)?.classList.add('sd20-filters');
    $('.table-scroll',main)?.classList.add('sd20-queue-table');
  }
  if(name==='ticket'){
    main.classList.add('sd20-ticket-workspace');
    $('.ticket-layout',main)?.classList.add('sd20-ticket-layout');
    $('.ticket-sidebar',main)?.classList.add('sd20-inspector');
    $('.conversation',main)?.classList.add('sd20-activity');
  }
  if(name==='settings')decorateSettings(main);
  if(name==='project-settings')main.classList.add('sd20-project-settings');
  if(name==='portal')main.classList.add('sd20-customer-portal');
}
function decorateSettings(main){
  const center=$('.settings-center',main);if(!center)return;
  center.classList.add('sd20-settings-center');
  const nav=$('.settings-nav',center);if(nav){nav.classList.add('sd20-settings-nav');if(!$('.sd20-settings-search',nav)){const wrap=document.createElement('label');wrap.className='sd20-settings-search';wrap.innerHTML='<span>Search settings</span><input type="search" placeholder="Search settings…" autocomplete="off">';nav.prepend(wrap);const input=$('input',wrap);input.addEventListener('input',()=>{const needle=input.value.trim().toLowerCase();$$('.settings-nav-link,.settings-nav-group',nav).forEach(el=>{if(el===wrap)return;const match=!needle||el.textContent.toLowerCase().includes(needle);el.hidden=!match&&el.classList.contains('settings-nav-link');});});}}
  $('.settings-content',center)?.classList.add('sd20-settings-content');
  $('.version-chip',main)?.classList.add('sd20-version-chip');
}
let scheduled=false;
function apply(){scheduled=false;decorateShell();decorateMain();}
function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(apply);}
addEventListener('hashchange',schedule);
new MutationObserver(schedule).observe(document.documentElement,{subtree:true,childList:true});
schedule();
})();
`);

write('public/design-system.css',`:root{
  --sd20-bg:#f7f8fa;--sd20-surface:#fff;--sd20-surface-subtle:#f1f3f6;--sd20-border:#dfe1e6;
  --sd20-text:#172b4d;--sd20-muted:#626f86;--sd20-accent:#0c66e4;--sd20-accent-soft:#e9f2ff;
  --sd20-danger:#c9372c;--sd20-warning:#a54800;--sd20-success:#216e4e;--sd20-sidebar:#101214;
  --sd20-sidebar-text:#c7d1db;--sd20-radius:8px;--sd20-radius-lg:12px;--sd20-shadow:0 1px 2px rgba(9,30,66,.08);
  --sd20-sidebar-width:248px;--sd20-topbar-height:60px;--sd20-gap:24px;font-family:Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
}
body.sd20{background:var(--sd20-bg);color:var(--sd20-text)}
body.sd20 .workspace.sd20-shell{display:block;min-height:100vh;background:var(--sd20-bg)}
body.sd20 .sd20-sidebar{position:fixed;inset:0 auto 0 0;width:var(--sd20-sidebar-width);z-index:40;background:var(--sd20-sidebar);border:0;padding:16px 12px;color:var(--sd20-sidebar-text);overflow:auto}
body.sd20 .sd20-sidebar .brand{display:flex;align-items:center;gap:10px;padding:8px 10px 18px;color:#fff;font-weight:700;text-decoration:none}
body.sd20 .sd20-sidebar .brand img{width:30px;height:30px}
body.sd20 .sd20-nav{display:flex;flex-direction:column;gap:2px}
body.sd20 .sd20-nav-group{padding:18px 10px 6px;color:#8c9bab;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
body.sd20 .sd20-nav-link{display:flex;align-items:center;min-height:36px;padding:7px 10px;border-radius:6px;color:var(--sd20-sidebar-text);text-decoration:none;font-size:14px;font-weight:550}
body.sd20 .sd20-nav-link:hover{background:#202326;color:#fff}
body.sd20 .sd20-nav-link.selected,body.sd20 .sd20-nav-link[aria-current="page"]{background:#1f4f86;color:#fff}
body.sd20 .sd20-workspace{min-height:100vh;margin-left:var(--sd20-sidebar-width);width:calc(100% - var(--sd20-sidebar-width));background:var(--sd20-bg)}
body.sd20 .sd20-topbar{position:sticky;top:0;z-index:30;min-height:var(--sd20-topbar-height);display:flex;align-items:center;gap:18px;padding:8px 28px;background:rgba(255,255,255,.96);border-bottom:1px solid var(--sd20-border);box-shadow:none;backdrop-filter:blur(10px)}
body.sd20 .sd20-context{display:flex;flex-direction:column;min-width:150px;line-height:1.2}body.sd20 .sd20-context span{font-size:11px;color:var(--sd20-muted)}body.sd20 .sd20-context strong{font-size:14px;color:var(--sd20-text)}
body.sd20 .sd20-main{max-width:1600px;margin:0 auto;padding:28px 32px 64px}
body.sd20 .sd20-page-heading{margin:0 0 20px;padding:0;border:0;background:transparent}body.sd20 .sd20-page-heading h1{font-size:24px;line-height:1.25;letter-spacing:-.02em;color:var(--sd20-text)}
body.sd20 button,body.sd20 .button{border-radius:6px;box-shadow:none;font-weight:600}body.sd20 button.primary,body.sd20 .primary{background:var(--sd20-accent);border-color:var(--sd20-accent);color:#fff}
body.sd20 input,body.sd20 select,body.sd20 textarea{border:1px solid #8590a2;border-radius:6px;background:#fff;color:var(--sd20-text);box-shadow:none}body.sd20 input:focus,body.sd20 select:focus,body.sd20 textarea:focus{border-color:var(--sd20-accent);outline:2px solid #85b8ff;outline-offset:1px}
body.sd20 .sd20-surface,body.sd20 .panel,body.sd20 .detail-panel{background:var(--sd20-surface);border:1px solid var(--sd20-border);border-radius:var(--sd20-radius-lg);box-shadow:var(--sd20-shadow)}
body.sd20 .sd20-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:18px}body.sd20 .sd20-metrics>div{background:var(--sd20-surface);border:1px solid var(--sd20-border);border-radius:var(--sd20-radius);padding:14px 16px;box-shadow:none}body.sd20 .sd20-metrics span{font-size:12px;color:var(--sd20-muted)}body.sd20 .sd20-metrics strong{display:block;margin-top:4px;font-size:22px}
body.sd20 .sd20-filters{display:flex;align-items:end;gap:12px;padding:14px 16px;margin:0 0 12px;background:var(--sd20-surface);border:1px solid var(--sd20-border);border-radius:var(--sd20-radius)}
body.sd20 .sd20-queue-table{border:1px solid var(--sd20-border);border-radius:var(--sd20-radius);background:#fff;overflow:auto}
body.sd20 .sd20-table{width:100%;border-collapse:separate;border-spacing:0;background:#fff}body.sd20 .sd20-table th{position:sticky;top:0;background:var(--sd20-surface-subtle);color:var(--sd20-muted);font-size:11px;text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid var(--sd20-border);padding:10px 12px}body.sd20 .sd20-table td{padding:11px 12px;border-bottom:1px solid #eef0f3}body.sd20 .sd20-table tbody tr:hover{background:#f7f9fb}
body.sd20 .sd20-status{border-radius:999px;padding:3px 8px;font-size:12px;font-weight:650;background:var(--sd20-surface-subtle);color:var(--sd20-text)}
body.sd20 .sd20-ticket-layout{display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:24px;align-items:start}body.sd20 .sd20-inspector{position:sticky;top:calc(var(--sd20-topbar-height) + 20px);display:flex;flex-direction:column;gap:12px}body.sd20 .sd20-activity .comment{border:0;border-bottom:1px solid #eef0f3;border-radius:0;background:transparent;padding:16px 0}
body.sd20 .sd20-settings-center{display:grid!important;grid-template-columns:280px minmax(0,1fr);gap:28px;align-items:start}body.sd20 .sd20-settings-nav{position:sticky;top:calc(var(--sd20-topbar-height) + 20px);max-height:calc(100vh - var(--sd20-topbar-height) - 40px);overflow:auto;background:var(--sd20-surface);border:1px solid var(--sd20-border);border-radius:var(--sd20-radius-lg);padding:10px;box-shadow:none}body.sd20 .sd20-settings-search{display:block;padding:8px 6px 12px;border-bottom:1px solid var(--sd20-border);margin-bottom:8px}body.sd20 .sd20-settings-search span{display:block;margin-bottom:6px;font-size:11px;font-weight:700;color:var(--sd20-muted);text-transform:uppercase;letter-spacing:.05em}body.sd20 .sd20-settings-search input{width:100%}body.sd20 .settings-nav-group h3{margin:14px 8px 5px;font-size:11px;color:var(--sd20-muted);text-transform:uppercase;letter-spacing:.05em}body.sd20 .settings-nav-link{display:block;padding:8px 10px;border-radius:6px;color:var(--sd20-text);text-decoration:none}body.sd20 .settings-nav-link:hover{background:var(--sd20-surface-subtle)}body.sd20 .settings-nav-link.active,body.sd20 .settings-nav-link[aria-current="page"]{background:var(--sd20-accent-soft);color:#0055cc;font-weight:650}body.sd20 .sd20-settings-content{min-width:0;background:transparent}body.sd20 .sd20-version-chip{background:var(--sd20-accent-soft);color:#0055cc;border-radius:999px;padding:4px 8px;font-size:12px}
body.sd20 .sd20-customer-portal{max-width:1180px}body.sd20 .sd20-customer-portal .page-heading{text-align:center;padding:32px 0 18px}body.sd20 .sd20-customer-portal .panel{box-shadow:none}
@media (max-width:1100px){:root{--sd20-sidebar-width:216px}body.sd20 .sd20-ticket-layout{grid-template-columns:1fr 300px}body.sd20 .sd20-main{padding:24px}}
@media (max-width:820px){body.sd20 .sd20-sidebar{position:relative;width:100%;min-height:auto}body.sd20 .sd20-workspace{margin-left:0;width:100%}body.sd20 .sd20-nav{flex-direction:row;overflow:auto}body.sd20 .sd20-nav-group{display:none}body.sd20 .sd20-nav-link{white-space:nowrap}body.sd20 .sd20-topbar{position:sticky;padding:8px 14px}body.sd20 .sd20-context{display:none}body.sd20 .sd20-main{padding:18px 14px 48px}body.sd20 .sd20-ticket-layout,body.sd20 .sd20-settings-center{grid-template-columns:1fr}body.sd20 .sd20-inspector,body.sd20 .sd20-settings-nav{position:relative;top:auto;max-height:none}body.sd20 .sd20-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}}
`);

write('tests/v9.test.mjs',`import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {migrateV9} from '../lib/migration-v9.mjs';

test('schema 9 migrates schema 8 data and seeds 2.0 workspace metadata',()=>{
  const db=new DatabaseSync(':memory:');
  db.exec(\`
    PRAGMA foreign_keys=ON;
    CREATE TABLE users(id INTEGER PRIMARY KEY);
    CREATE TABLE projects(id INTEGER PRIMARY KEY,name TEXT,key TEXT,project_type TEXT,portal_access TEXT,portal_slug TEXT,portal_title TEXT,portal_description TEXT,number_padding INTEGER);
    CREATE TABLE request_types(id INTEGER PRIMARY KEY,project_id INTEGER,enabled INTEGER,portal_visible INTEGER,sort_order INTEGER);
    CREATE TABLE v8_saved_views(id INTEGER PRIMARY KEY,owner_id INTEGER,name TEXT,project_id INTEGER,filters TEXT,shared INTEGER,is_default INTEGER,version INTEGER,created_at TEXT,updated_at TEXT);
    INSERT INTO users VALUES(1);
    INSERT INTO projects VALUES(1,'Centrum Wsparcia','CW','external','authenticated','cw','Centrum Wsparcia','Portal',5);
    INSERT INTO request_types VALUES(10,1,1,1,10);
    INSERT INTO v8_saved_views VALUES(1,1,'Moja kolejka',1,'{}',0,1,1,datetime('now'),datetime('now'));
    PRAGMA user_version=8;
  \`);
  migrateV9(db);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version,9);
  const settings=db.prepare('SELECT * FROM project_service_settings WHERE project_id=1').get();
  assert.equal(JSON.parse(settings.config).portal.slug,'cw');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM service_catalog_categories').get().n,1);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM service_catalog_category_types').get().n,1);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM integration_health').get().n,5);
  const view=db.prepare('SELECT columns,sort_key,sort_dir,density FROM v8_saved_views WHERE id=1').get();
  assert.deepEqual(view,{columns:'[]',sort_key:'updated_at',sort_dir:'desc',density:'comfortable'});
});
`);

write('tests/ui-2.0.test.mjs',`import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const shell=readFileSync(new URL('../public/product-shell.js',import.meta.url),'utf8');
const index=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/design-system.css',import.meta.url),'utf8');
const boot=(hash,main)=>{const dom=new JSDOM(\`<!doctype html><body class="sd20"><div class="workspace"><aside class="sidebar"><a class="brand"><span>Desk</span></a><nav><a href="#/queue">Kolejki</a><a href="#/projects">Projekty</a><a href="#/users">Użytkownicy</a><a href="#/settings">Ustawienia</a></nav></aside><div class="workspace-content"><header class="topbar"></header><main id="main">\${main}</main></div></div></body>\`,{url:'https://desk.example/'+hash,runScripts:'outside-only'});dom.window.requestAnimationFrame=fn=>dom.window.setTimeout(fn,0);dom.window.eval(shell);return dom;};
const settle=()=>new Promise(resolve=>setTimeout(resolve,10));
test('2.0 index uses one design system and retires active visual release overlays',()=>{assert.match(index,/design-system\.css\?v=2\.0\.0/);assert.match(index,/product-shell\.js\?v=2\.0\.0/);assert.doesNotMatch(index,/agent-experience-1\.6/);assert.doesNotMatch(index,/release-1\.2\.0/);});
test('2.0 shell groups navigation and adds route context',async()=>{const dom=boot('#/queue','<div class="page-heading"><h1>Kolejki</h1></div><div class="metrics"></div><form class="filters"></form><div class="table-scroll"><table></table></div>');await settle();const d=dom.window.document;assert.equal(d.querySelector('.brand span').textContent,'iTELade Service Management');assert.ok(d.querySelector('.sd20-nav-group'));assert.ok(d.querySelector('.sd20-context'));assert.ok(d.querySelector('#main').classList.contains('sd20-queue-workspace'));});
test('2.0 Settings gains dedicated administration navigation surface and search',async()=>{const dom=boot('#/settings','<span class="version-chip">Wersja 2.0.0</span><div class="settings-center"><aside class="settings-nav"><a class="settings-nav-link">LDAP / AD</a></aside><section class="settings-content"></section></div>');await settle();const d=dom.window.document;assert.ok(d.querySelector('.sd20-settings-center'));assert.ok(d.querySelector('.sd20-settings-search input'));});
test('2.0 design system defines shell, queue, ticket, settings and responsive portal primitives',()=>{for(const token of ['--sd20-sidebar-width','.sd20-queue-table','.sd20-ticket-layout','.sd20-settings-center','.sd20-customer-portal','@media (max-width:820px)'])assert.ok(css.includes(token),token);});
`);

write('UI_2.0.md',`# Service Desk 2.0 UI architecture\n\nService Desk 2.0 replaces the active chain of visual release overlays with a single product design system and shell controller. The goal is a Jira Service Management-like information architecture without copying Atlassian screens 1:1.\n\n## Product shell\n- persistent service-management navigation rail;\n- sticky product top bar with route context;\n- one content canvas for queue, ticket, project and administration work;\n- responsive desktop/tablet/mobile rules;\n- shared tokens for surfaces, spacing, typography, status and interaction states.\n\n## Administration Center\nGlobal settings remain in /#/settings and are visually separated from project configuration. The left rail is searchable and intended for System, Identity & Access, Mail & Notifications, Security, Integrations, Updates and Advanced areas.\n\n## Project settings\nProject-level service configuration is persisted in schema 9 through project_service_settings. This is the home for request intake, portal presentation, queue defaults and project workspace behavior instead of mixing them with global administration.\n\n## Agent workspace\nQueues use a dense work surface with filters and a stable table. Tickets use a two-column workspace: activity/content on the left and a contextual inspector on the right.\n\n## Customer portal\nThe customer-facing route is intentionally visually simpler than the agent/admin application and is prepared for service catalog categories backed by schema 9.\n\n## Compatibility\nrelease-1.1.2.js is temporarily retained for behavior that has not yet been moved out of the 1.x compatibility layer. 1.2.x and 1.6 visual decorators are no longer active in index.html. New visual work belongs in design-system.css and structural shell work in product-shell.js.\n`);
write('MIGRATION_2.0.md',`# Database migration for Service Desk 2.0\n\nService Desk 2.0 upgrades SQLite schema 8 to schema 9 automatically during application startup.\n\n## Before upgrading\n1. Stop write traffic to the Service Desk.\n2. Create and verify a backup of DATA_DIR, especially desk.sqlite and related WAL/SHM files.\n3. Record the currently deployed image/tag and keep it available for rollback.\n4. Upgrade the application only after the backup is complete.\n\n## Schema 9 changes\n- ui_preferences: per-user shell density, locale and home route;\n- project_service_settings: project-local portal/workspace configuration;\n- integration_health: normalized connection/test state for LDAP, SSO, SMTP, GitHub and updater;\n- service_catalog_categories and service_catalog_category_types: portal catalog grouping;\n- v8_saved_views gains columns, sorting and density metadata for the new queue workspace.\n\nExisting tickets, comments, users, workflows, SLAs, assets and integrations are not deleted or renumbered. External projects receive a default catalog category populated with their currently portal-visible request types.\n\n## Rollback\nSchema 9 is forward-only. Do not start a 1.6.x binary against a migrated schema 9 database. To roll back the application, restore the verified schema 8 backup together with the previous application image.\n`);
write('RELEASE_NOTES_2.0.0.md',`# Service Desk 2.0.0 — release candidate\n\n## Major changes\n- New product shell and unified design system.\n- Administration Center visual rebuild with searchable settings navigation.\n- Queue, ticket inspector and customer portal visual foundations.\n- Active 1.2.x / 1.6.x visual decorators removed from index.html.\n- Database schema 9 with project service settings, service catalog categories, integration health and persisted workspace preferences.\n- Saved views extended with queue columns, sort order and density.\n\n## Upgrade requirement\n2.0.0 performs a forward-only schema 8 -> 9 migration. Back up DATA_DIR before deployment. A downgrade requires restoring the schema 8 backup.\n\n## Release gate\nDo not promote this candidate until CI is green and manual smoke tests cover login, queue, ticket editing/replies, project configuration, Administration Center, customer portal, LDAP/SSO, SMTP/mail ingestion, GitHub integration, updater and rollback.\n`);

let readme=read('README.md');if(!readme.includes('## Service Desk 2.0'))readme=readme.replace(/^# ([^\n]+)\n/,m=>m+'\n## Service Desk 2.0\n\nThe 2.0 line introduces a unified Jira Service Management-inspired product shell, schema 9 and a forward-only database migration. See `UI_2.0.md` and `MIGRATION_2.0.md` before upgrading.\n\n');write('README.md',readme);
let changelog=read('CHANGELOG.md');if(!changelog.includes('## 2.0.0'))changelog=`## 2.0.0 - release candidate\n\n- Replaced active visual release overlays with the Service Desk 2.0 design system and shell.\n- Added schema 9 and the 8 -> 9 migration for project workspace settings, service catalog categories, integration health and user UI preferences.\n- Extended saved queue views with columns, sort direction and density metadata.\n- Reworked Administration, queue, ticket and portal presentation for the 2.0 information architecture.\n\n${changelog}`;write('CHANGELOG.md',changelog);
let validation=read('VALIDATION.md');if(!validation.includes('Service Desk 2.0'))validation+=`\n\n## Service Desk 2.0\n\n- schema 8 -> 9 migration must pass tests/v9.test.mjs;\n- index.html must load design-system.css and product-shell.js with the current version;\n- active 1.2.x / 1.6.x visual decorator assets must not be loaded;\n- queue, ticket, Settings and portal shell primitives are covered by tests/ui-2.0.test.mjs;\n- production promotion additionally requires manual integration smoke tests listed in RELEASE_NOTES_2.0.0.md.\n`;write('VALIDATION.md',validation);

// Current-version assertions in historical regression tests follow the running product version.
for(const name of readdirSync('tests')){
  if(!name.endsWith('.test.mjs'))continue;
  const path=join('tests',name);let source=read(path);source=source.replaceAll('1.6.2','2.0.0');write(path,source);
}
// Static asset test now verifies the 2.0 entry point rather than the retired visual overlays.
const layoutPath='tests/layout-1.2.4.test.mjs';
let layout=read(layoutPath);
layout=layout.replace(/assert\.match\(index,\/\\\/app\\\.css\\\?v=2\\\.0\\\.0\/\);assert\.match\(index,\/\\\/release-1\\\.1\\\.2\\\.css\\\?v=2\\\.0\\\.0\/\);assert\.match\(index,\/\\\/agent-experience-1\\\.6\\\.css\\\?v=2\\\.0\\\.0\/\);/,"assert.match(index,/\\/app\\.css\\?v=2\\.0\\.0/);assert.match(index,/\\/design-system\\.css\\?v=2\\.0\\.0/);");
write(layoutPath,layout);

console.log('Service Desk 2.0 patch applied.');
