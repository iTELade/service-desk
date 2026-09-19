import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const index=read('public/index.html');
const css=read('public/app.css');
const ui=read('public/release-1.2.0.js');
const features=read('public/release-1.1.2.js');
const version=read('lib/version.mjs');

test('1.4.2 product boundary is versioned without a schema migration',()=>{
  assert.match(version,/VERSION='1\.4\.2'/);
  assert.match(version,/SCHEMA_VERSION=8/);
  assert.match(index,/\?v=1\.4\.2/);
});

test('1.4 keeps all agreed operational feature modules active',()=>{
  assert.match(features,/installGlobalSearch/);
  assert.match(features,/installQueueTools/);
  assert.match(features,/installAttachments/);
  assert.match(features,/queue-preferences/);
  assert.match(features,/saved-view|v8\/views/);
  assert.ok(index.includes('/release-1.1.2.js?v=1.4.2'));
});

test('1.4 enterprise navigation preserves Knowledge Base Assets and mail entry points',()=>{
  for(const label of ['Baza wiedzy','Assets / CMDB','Kanały pocztowe'])assert.ok(ui.includes(label),`missing navigation item ${label}`);
  for(const href of ['#/admin/knowledge','#/admin/assets','#/admin/mail'])assert.ok(ui.includes(href),`missing route ${href}`);
});

test('1.4 queue retains saved views sorting quick filters columns and SLA readability',()=>{
  for(const token of ['sd14-queue-workspace','sd14-view-settings','r112-queue-tools','filters','sla-ok','overdue'])assert.ok(css.includes(token),`missing queue style ${token}`);
  assert.match(ui,/keepNewest\(\$\$\('\[data-r112-queue-tools\]'/);
});

test('1.4 ticket keeps workflow comments internal notes SLA history and attachments readable',()=>{
  for(const token of ['sd14-ticket-header','ticket-layout','ticket-sidebar','comment.internal','sla-block','sd14-history','r112-attachments'])assert.ok(css.includes(token),`missing ticket style ${token}`);
  assert.match(ui,/rebuildTicketWorkspace/);
  assert.match(ui,/conversation\.after\(attachments\)/);
});

test('1.4 covers board projects users settings portal auth dialogs and responsive behavior',()=>{
  for(const token of ['.kanban{','.project-grid,','agent-route-users','.settings-center{','.portal-workspace{','.auth-layout{','dialog{','@media(max-width:820px)'])assert.ok(css.includes(token),`missing enterprise surface ${token}`);
});

test('1.4.1 premium visual system remains active in 1.4.2',()=>{
  for(const token of ['Service Desk 1.4.1 — WOW enterprise hotfix','--wow-navy','#0b1731','sd141Rise','linear-gradient(118deg,#0c2145','version-chip::after'])assert.ok(css.includes(token),`missing 1.4.1 premium style token ${token}`);
  assert.doesNotMatch(index,/release-1\.1\.2\.css/);
  assert.doesNotMatch(index,/release-1\.1\.4\.css/);
  assert.doesNotMatch(index,/release-1\.2\.0\.css/);
  assert.doesNotMatch(index,/settings\.css/);
  assert.doesNotMatch(index,/settings-nav-complete\.js/);
});

test('1.4 remains light-only',()=>{
  assert.match(css,/color-scheme:light/);
  assert.match(ui,/forceLightTheme/);
  assert.doesNotMatch(css,/@media\s*\(prefers-color-scheme:\s*dark\)/);
});
