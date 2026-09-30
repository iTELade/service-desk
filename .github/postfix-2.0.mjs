import {readFileSync,writeFileSync} from 'node:fs';
const read=p=>readFileSync(p,'utf8'),write=(p,s)=>writeFileSync(p,s);
for(const path of ['public/security.js','public/app.css','public/release-1.1.2.js']){
  let s=read(path);s=s.replaceAll('1.6.2','2.0.0');write(path,s);
}
write('tests/release-1.2.0-ui.test.mjs',`import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const r=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const i=r("public/index.html"),s=r("server.mjs"),legacy=r("public/release-1.2.0.js"),features=r("public/release-1.1.2.js"),design=r("public/design-system.css"),shell=r("public/product-shell.js"),security=r("public/security.js");
test("2.0 canonical UI assets are wired",()=>{
  for(const f of ["app.css","design-system.css","product-shell.js"]){assert.ok(i.includes("/"+f+"?v=2.0.0"));assert.ok(s.includes("['/"+f)||f==='design-system.css'||f==='product-shell.js');}
  assert.ok(i.includes('/release-1.1.2.js?v=2.0.0'),'feature behavior module remains active');
  for(const retired of ['/release-1.1.2.css','/release-1.2.0.js','/agent-experience-1.6.css','/agent-experience-1.6.js'])assert.ok(!i.includes(retired+'?v='),retired+' must not be active');
  assert.ok(i.indexOf('/security.js?v=2.0.0')<i.indexOf('/app.js?v=2.0.0'),'refresh guard loads before app');
  assert.match(security,/queueRefreshGuard=VERSION/);
});
test("2.0 shell covers the new product surfaces while preserving 1.x behavior compatibility",()=>{
  for(const token of ['sd20-shell','sd20-queue-workspace','sd20-ticket-workspace','sd20-settings-center','sd20-customer-portal'])assert.ok(shell.includes(token),token);
  for(const token of ['--sd20-sidebar-width','.sd20-queue-table','.sd20-ticket-layout','.sd20-settings-center'])assert.ok(design.includes(token),token);
  assert.match(features,/installGlobalSearch/);assert.match(features,/installQueueTools/);assert.match(features,/installAttachments/);
  assert.match(legacy,/rebuildQueue/);assert.match(legacy,/rebuildTicket/);
});
`);
write('tests/ui-1.4-enterprise.test.mjs',`import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const index=read('public/index.html'),base=read('public/app.css'),legacy=read('public/release-1.2.0.js'),features=read('public/release-1.1.2.js'),shell=read('public/product-shell.js'),design=read('public/design-system.css'),version=read('lib/version.mjs');
test('2.0 product boundary includes schema 9 migration',()=>{assert.match(version,/VERSION='2\\.0\\.0'/);assert.match(version,/SCHEMA_VERSION=9/);assert.match(index,/\\?v=2\\.0\\.0/);});
test('2.0 keeps required operational behavior while replacing the visual stack',()=>{for(const token of ['installGlobalSearch','installQueueTools','installAttachments','queue-preferences'])assert.match(features,new RegExp(token));assert.ok(index.includes('/release-1.1.2.js?v=2.0.0'));assert.ok(!index.includes('/release-1.1.2.css?v='));});
test('2.0 service navigation and workspaces are represented by the product shell',()=>{for(const token of ['Service management','Customers & people','Administration','sd20-queue-workspace','sd20-ticket-workspace','sd20-project-settings','sd20-customer-portal'])assert.ok(shell.includes(token),token);});
test('2.0 queue and ticket foundations retain 1.x functional rebuild paths',()=>{assert.match(legacy,/rebuildQueue/);assert.match(legacy,/rebuildTicket/);for(const token of ['.sd20-queue-table','.sd20-ticket-layout','.sd20-inspector'])assert.ok(design.includes(token),token);});
test('2.0 Administration Center has a dedicated searchable navigation surface',()=>{for(const token of ['sd20-settings-center','sd20-settings-nav','sd20-settings-search'])assert.ok(shell.includes(token)||design.includes('.'+token),token);});
test('2.0 retires active 1.2 and 1.6 presentation decorators',()=>{for(const retired of ['release-1.1.2.css','release-1.2.0.js','agent-experience-1.6.css','agent-experience-1.6.js'])assert.doesNotMatch(index,new RegExp(retired.replaceAll('.','\\\\.')));assert.match(design,/--sd20-bg/);assert.match(base,/Service Desk 2\\.0\\.0/);});
`);
write('tests/layout-1.2.4.test.mjs',`import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const legacy=read('public/release-1.2.0.js'),base=read('public/app.css'),index=read('public/index.html'),version=read('lib/version.mjs'),security=read('public/security.js'),design=read('public/design-system.css');
test('2.0 has one canonical active presentation boundary',()=>{assert.match(index,/\\/app\\.css\\?v=2\\.0\\.0/);assert.match(index,/\\/design-system\\.css\\?v=2\\.0\\.0/);assert.doesNotMatch(index,/agent-experience-1\\.6/);assert.doesNotMatch(index,/release-1\\.2\\.0\\.js/);});
test('legacy functional queue rebuild remains available during 2.0 compatibility phase',()=>{assert.match(legacy,/function rebuildQueue\\(\\)/);assert.match(legacy,/keepNewest/);assert.match(base,/sd14-queue-ghost/);});
test('legacy functional ticket rebuild remains available during 2.0 compatibility phase',()=>{assert.match(legacy,/function rebuildTicket\\(\\)/);assert.match(legacy,/sd14-ticket-main/);assert.match(design,/\\.sd20-ticket-layout/);});
test('2.0 version, schema and active browser cache markers are aligned',()=>{assert.match(version,/VERSION='2\\.0\\.0'/);assert.match(version,/SCHEMA_VERSION=9/);assert.match(security,/VERSION='2\\.0\\.0'/);for(const asset of ['app.js','security.js','design-system.css','product-shell.js'])assert.ok(index.includes('/'+asset+'?v=2.0.0'));assert.doesNotMatch(index,/<script(?![^>]*\\bsrc=)[^>]*>/i);});
`);
