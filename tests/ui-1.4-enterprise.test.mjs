import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const index=read('public/index.html');
const css=read('public/app.css');
const ui=read('public/release-1.2.0.js');
const features=read('public/release-1.1.2.js');
const agent=read('public/agent-experience-1.6.js');
const agentCss=read('public/agent-experience-1.6.css');
const version=read('lib/version.mjs');

test('1.6 product boundary is versioned without a schema migration',()=>{
  assert.match(version,/VERSION='1\.6\.0'/);
  assert.match(version,/SCHEMA_VERSION=8/);
  assert.match(index,/\?v=1\.6\.0/);
});

test('1.6 keeps all agreed operational feature modules active',()=>{
  assert.match(features,/installGlobalSearch/);
  assert.match(features,/installQueueTools/);
  assert.match(features,/installAttachments/);
  assert.match(features,/queue-preferences/);
  assert.match(features,/saved-view|v8\/views/);
  assert.ok(index.includes('/release-1.1.2.js?v=1.6.0'));
});

test('1.5 service navigation preserves Knowledge Base Assets and mail entry points',()=>{
  for(const label of ['Baza wiedzy','Assets / CMDB','Kanały pocztowe'])assert.ok(ui.includes(label),`missing navigation item ${label}`);
  for(const href of ['#/admin/knowledge','#/admin/assets','#/admin/mail'])assert.ok(ui.includes(href),`missing route ${href}`);
});

test('1.5 queue retains saved views sorting quick filters columns and SLA readability',()=>{
  for(const token of ['jsm-queue-workspace','sd14-view-settings','r112-queue-tools','filters','sla-ok','overdue'])assert.ok(css.includes(token),`missing queue style ${token}`);
  assert.match(ui,/keepNewest\(\$\$\('\[data-r112-queue-tools\]'/);
});

test('1.6 ticket adds work-item activity and inspector while retaining operational modules',()=>{
  for(const token of ['jira16-ticket','jira16-activity-tabs','jira16-conversation-panel','jira16-inspector'])assert.ok(agent.includes(token),`missing agent controller ${token}`);
  for(const token of ['.jira16-ticket .ticket-layout','.jira16-ticket .ticket-sidebar','.jira16-ticket .sla-block'])assert.ok(agentCss.includes(token),`missing 1.6 ticket style ${token}`);
  for(const token of ['jsm-ticket-header','ticket-layout','ticket-sidebar','comment.internal','sla-block','sd14-history','r112-attachments'])assert.ok(css.includes(token),`missing base ticket style ${token}`);
  assert.match(ui,/rebuildTicket/);
  assert.match(ui,/conversation\.after\(attachments\)/);
});

test('1.6 covers board projects users settings portal auth dialogs and responsive behavior',()=>{
  for(const token of ['.kanban{','.project-grid,','.settings-shell,.settings-center{','.portal-workspace{','.auth-layout{','dialog{','@media(max-width:820px)'])assert.ok(css.includes(token),`missing 1.5 surface ${token}`);
  for(const route of ["'#/queue':{name:'queue'","'#/board':{name:'board'","'#/projects':{name:'projects'","'#/users':{name:'users'"])assert.ok(ui.includes(route),`missing route mapping ${route}`);
  assert.match(ui,/startsWith\('#\/ticket\/'\)\)name='ticket'/);
  assert.match(ui,/name='settings'/);
  assert.match(ui,/body\.classList\.add\('jsm-surface-agent','jsm-route-'\+name,'agent-route-'\+name\)/);
  assert.match(agent,/decorateSettings/);
});

test('1.6 keeps old release CSS presentation stack retired',()=>{
  for(const retired of ['release-1.1.2.css','release-1.1.4.css','release-1.2.0.css','settings.css','settings-nav-complete.js','data-sd143-customer-style','data-sd143-customer-ui'])assert.doesNotMatch(index,new RegExp(retired.replaceAll('.','\\.')));
  assert.match(css,/Service Desk 1\.5\.0/);
  assert.match(agentCss,/Service Desk 1\.6\.0/);
});

test('1.6 remains light-only',()=>{
  assert.match(css,/color-scheme:light/);
  assert.match(ui,/forceLightTheme/);
  assert.doesNotMatch(css,/@media\s*\(prefers-color-scheme:\s*dark\)/);
});
