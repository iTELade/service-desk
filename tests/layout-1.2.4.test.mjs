import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const ui=readFileSync(new URL('../public/release-1.2.0.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/release-1.2.0.css',import.meta.url),'utf8');
const nav=readFileSync(new URL('../public/release-1.2.0-nav.css',import.meta.url),'utf8');
const repair=readFileSync(new URL('../public/settings-nav-complete.js',import.meta.url),'utf8');
const index=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const version=readFileSync(new URL('../lib/version.mjs',import.meta.url),'utf8');

test('1.3.x keeps queue as one canonical work surface',()=>{
  assert.match(css,/Service Desk 1\.3\.0 — canonical agent UI rebuild/);
  assert.match(ui,/function rebuildQueue\(\)/);
  assert.match(ui,/sd13-queue-workspace/);
  assert.match(repair,/sd13-queue-workspace/);
  assert.match(repair,/panel\.classList\.add\('sd13-queue-table'\)/);
  assert.match(nav,/QUEUE 1\.3\.2/);
  assert.match(nav,/sd131-view-settings/);
  assert.match(nav,/r113-metric-icon\{display:none!important/);
});

test('1.3.2 removes duplicate queue modules and keeps the newest interactive instance',()=>{
  assert.match(repair,/function keepNewest\(nodes\)/);
  assert.match(repair,/const keep = nodes\[nodes\.length - 1\]/);
  assert.match(repair,/node\.remove\(\)/);
  assert.match(repair,/\[data-r112-queue-tools\]/);
  assert.match(repair,/sd131-view-settings/);
  assert.match(repair,/main\.querySelectorAll\('\.r113-page-help,\.r113-metric-icon'\)/);
  assert.doesNotMatch(index,/release-1\.1\.3\.js\?v=/);
});

test('1.3.2 masks same-route queue loading without restoring stale interactive DOM',()=>{
  assert.match(repair,/let queueSnapshotHTML = ''/);
  assert.match(repair,/function showQueueGhost\(main\)/);
  assert.match(repair,/sanitizeQueueGhost\(ghost\)/);
  assert.match(repair,/attr\.name\.startsWith\('data-'\)/);
  assert.match(repair,/main\.classList\.add\('sd132-queue-loading'\)/);
  assert.match(repair,/function captureQueueSnapshot\(main\)/);
  assert.match(nav,/sd132-queue-ghost/);
  assert.doesNotMatch(repair,/main\.innerHTML=queueSnapshot/);
});

test('1.3.2 is light-only across agent, portal and auth surfaces',()=>{
  assert.match(repair,/function forceLightTheme\(\)/);
  assert.match(repair,/root\.dataset\.theme = 'light'/);
  assert.match(repair,/root\.style\.colorScheme = 'light'/);
  assert.match(nav,/html\[data-theme='dark'\],html\[data-theme='system'\]/);
  assert.match(nav,/body\.v120-auth,body\.v120-portal,body\.v120-public-portal/);
});

test('1.3.x rebuilds ticket structure and keeps newest asynchronous attachments',()=>{
  assert.match(ui,/function rebuildTicket\(\)/);
  assert.match(ui,/sd13-ticket-header/);
  assert.match(repair,/function repairTicketSurface\(\)/);
  assert.match(repair,/const attachments = keepNewest/);
  assert.match(repair,/conversation\.after\(attachments\)/);
  assert.match(nav,/Ticket readability polish/);
  assert.match(css,/agent-route-ticket \.ticket-sidebar/);
});

test('1.3.2 runtime and cache markers are aligned at the product boundary',()=>{
  assert.match(version,/VERSION='1\.3\.2'/);
  assert.match(repair,/SETTINGS_NAV_VERSION = '1\.3\.2'/);
  assert.match(index,/app\.js\?v=1\.3\.2/);
  assert.match(index,/release-1\.2\.0\.js\?v=1\.3\.2/);
  assert.doesNotMatch(index,/\?v=1\.3\.1/);
});
