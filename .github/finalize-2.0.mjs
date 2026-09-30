import {readFileSync,writeFileSync} from 'node:fs';
const read=p=>readFileSync(p,'utf8');
const write=(p,s)=>writeFileSync(p,s);
const edit=(p,fn)=>write(p,fn(read(p)));

// Active 2.0 runtime markers.
edit('public/settings-center.js',s=>s.replaceAll('1.6.2','2.0.0'));

// Serve the new product shell and design system.
edit('server.mjs',s=>{
  if(!s.includes("['/design-system.css'"))s=s.replace("['/app.css', ['app.css', 'text/css; charset=utf-8']],","['/app.css', ['app.css', 'text/css; charset=utf-8']],\n  ['/design-system.css', ['design-system.css', 'text/css; charset=utf-8']],");
  if(!s.includes("['/product-shell.js'"))s=s.replace("['/app.js', ['app.js', 'text/javascript; charset=utf-8']],","['/app.js', ['app.js', 'text/javascript; charset=utf-8']],\n  ['/product-shell.js', ['product-shell.js', 'text/javascript; charset=utf-8']],");
  return s;
});

// Generated CURRENT release tests must understand schema 9.
edit('scripts/run-tests.mjs',s=>s.replace("  .replaceAll(escapedHistorical,escapedCurrent)","  .replaceAll(escapedHistorical,escapedCurrent)\n  .replaceAll('assert.equal(SCHEMA_VERSION,8)','assert.equal(SCHEMA_VERSION,9)')"));

// Current-version assertions with escaped semver literals.
for(const p of ['tests/customer-portal-1.4.3.test.mjs','tests/hotfix-1.5.1.test.mjs','tests/hotfix-1.6.1.test.mjs','tests/queue-refresh-1.4.2.test.mjs','tests/release-trigger-1.6.2.test.mjs','tests/update-progress-1.2.1.test.mjs','tests/ui-1.6.0-agent-experience.test.mjs']){
  edit(p,s=>s.replaceAll('1\\\\.6\\\\.2','2\\\\.0\\\\.0'));
}
edit('tests/customer-portal-1.4.3.test.mjs',s=>s.replace("SCHEMA_VERSION=8","SCHEMA_VERSION=9").replaceAll("'release-1.2.0.js'","'product-shell.js'").replaceAll('missing 2.0.0 cache key','missing 2.0.0 cache key'));

// 2.0 active asset boundary; old 1.x visuals remain in the repository only for rollback/history.
write('tests/settings-static-assets.test.mjs',`import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const index=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
test('2.0.0 index references only served canonical assets',()=>{
  for(const [url,file] of [['/app.css','app.css'],['/design-system.css','design-system.css'],['/i18n.js','i18n.js'],['/security.js','security.js'],['/app.js','app.js'],['/settings-center.js','settings-center.js'],['/release-1.1.2.js','release-1.1.2.js'],['/product-shell.js','product-shell.js']]){
    assert.ok(index.includes(url+'?v=2.0.0'),'index must reference '+url);
    assert.ok(server.includes("['"+url+"', ['"+file+"',"),'server must serve '+url);
  }
  assert.doesNotMatch(index,/<style\\b/i);assert.doesNotMatch(index,/<script(?![^>]*\\bsrc=)[^>]*>/i);
  for(const retired of ['/release-1.1.2.css','/agent-experience-1.6.css','/release-1.2.0.js','/agent-experience-1.6.js','/settings.css','/settings-nav-complete.js'])assert.ok(!index.includes(retired+'?v='),'retired presentation must not be active: '+retired);
});
`);
write('tests/layout-1.2.2.test.mjs',`import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('../public/app.css',import.meta.url),'utf8');
const index=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const ui=readFileSync(new URL('../public/release-1.2.0.js',import.meta.url),'utf8');
const security=readFileSync(new URL('../public/security.js',import.meta.url),'utf8');
test('1.5 functional shell remains available as a compatibility implementation',()=>{assert.match(ui,/function decorateTopbar\\(\\)/);assert.match(ui,/function addManagementNavigation\\(\\)/);assert.match(css,/\\.workspace-content/);});
test('1.5 base design continues to cover operational product surfaces',()=>{for(const selector of ['.metrics{','.filters{','.kanban{','.ticket-layout{','.portal-workspace{'])assert.ok(css.includes(selector),selector);});
test('2.0.0 cache boundary loads the unified presentation and CSP-safe compatibility behavior',()=>{
  for(const asset of ['app.css','design-system.css','security.js','app.js','settings-center.js','release-1.1.2.js','product-shell.js'])assert.ok(index.includes('/'+asset+'?v=2.0.0'),asset);
  for(const retired of ['release-1.1.2.css','agent-experience-1.6.css','release-1.2.0.js','agent-experience-1.6.js'])assert.ok(!index.includes('/'+retired+'?v='),retired);
  assert.match(security,/queueRefreshGuard=VERSION/);assert.doesNotMatch(index,/<style\\b/i);assert.doesNotMatch(index,/<script(?![^>]*\\bsrc=)[^>]*>/i);
});
`);

// Keep historical direct-controller tests historical; active 2.0 tests cover the new shell.
edit('tests/ui-1.5.0-dom.test.mjs',s=>s.replaceAll("'Wersja 2.0.0'","'Wersja 1.6.2'"));
edit('tests/ui-1.6.0-agent-experience.test.mjs',s=>s.replaceAll("'Wersja 2.0.0'","'Wersja 1.6.2'"));

// CSP and release metadata tests now validate the new active boundary.
edit('tests/hotfix-1.6.1.test.mjs',s=>s
  .replace("assert.match(index,/release-1\\\\.1\\\\.2\\\\.css\\\\?v=2\\\\.0\\\\.0/);","assert.match(index,/design-system\\\\.css\\\\?v=2\\\\.0\\\\.0/); assert.doesNotMatch(index,/release-1\\\\.1\\\\.2\\\\.css\\\\?v=/);")
  .replace("assert.match(validation,/# Walidacja 2\\\\.0\\\\.0/);\n  assert.match(validation,/\\/healthz.*`2\\\\.0\\\\.0`/);","assert.match(validation,/Service Desk 2.0/); assert.match(validation,/schema 8 -> 9 migration/i);")
);

// New UI regex should treat '?' literally.
edit('tests/ui-2.0.test.mjs',s=>s.replace("assert.match(index,/design-system.css?v=2.0.0/)","assert.ok(index.includes('/design-system.css?v=2.0.0'))"));

// sqlite rows have a null prototype; compare values, not prototypes.
edit('tests/v9.test.mjs',s=>s.replace("assert.deepEqual(view,{columns:'[]',sort_key:'updated_at',sort_dir:'desc',density:'comfortable'});","assert.deepEqual({...view},{columns:'[]',sort_key:'updated_at',sort_dir:'desc',density:'comfortable'});"));

console.log('Service Desk 2.0 final validation patches applied.');
