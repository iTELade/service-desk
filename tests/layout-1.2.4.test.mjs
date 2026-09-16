import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const ui=readFileSync(new URL('../public/release-1.2.0.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/release-1.2.0.css',import.meta.url),'utf8');
const nav=readFileSync(new URL('../public/release-1.2.0-nav.css',import.meta.url),'utf8');
const index=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const version=readFileSync(new URL('../lib/version.mjs',import.meta.url),'utf8');

test('1.3.0 rebuilds queue as one canonical work surface',()=>{
  assert.match(css,/Service Desk 1\.3\.0 — canonical agent UI rebuild/);
  assert.match(ui,/function rebuildQueue\(\)/);
  assert.match(ui,/sd13-queue-workspace/);
  assert.match(ui,/sd13-queue-preferences-slot/);
  assert.match(ui,/panel\.classList\.add\('sd13-queue-table'\)/);
  assert.match(css,/agent-route-queue #main\.sd13-queue/);
  assert.match(css,/agent-route-queue \.metrics/);
  assert.match(css,/agent-route-queue \.sd13-queue-table/);
  assert.match(css,/agent-route-queue \.r112-queue-tools/);
});

test('1.3.0 rebuilds ticket structure and deduplicates asynchronous attachments',()=>{
  assert.match(ui,/function rebuildTicket\(\)/);
  assert.match(ui,/sd13-ticket-header/);
  assert.match(ui,/primary\.dataset\.ticketPrimary='1'/);
  assert.match(ui,/const attachments=\$\$\('\[data-r112-attachments\]'/);
  assert.match(ui,/attachments\.slice\(1\)\.forEach\(x=>x\.remove\(\)\)/);
  assert.match(ui,/conversation\.after\(keep\)/);
  assert.match(css,/grid-template-columns:minmax\(0,1fr\) 350px/);
  assert.match(css,/agent-route-ticket \.ticket-sidebar/);
  assert.match(css,/agent-route-ticket \.r112-upload/);
});

test('1.3.0 retires the injected 1.2.4 layout and aligns the responsive shell',()=>{
  assert.match(ui,/function disableLegacy124Style\(\)/);
  assert.match(ui,/1\.2\.4 injected layout retired by 1\.3\.0/);
  assert.match(nav,/workspace-content\{width:calc\(100% - 68px\)!important;margin-left:68px!important/);
  assert.match(css,/@media\(max-width:1280px\)/);
  assert.match(css,/@media\(max-width:980px\)/);
  assert.match(css,/@media\(max-width:720px\)/);
  assert.match(css,/@media\(max-width:520px\)/);
});

test('1.3.0 runtime and cache markers are aligned',()=>{
  assert.match(version,/VERSION='1\.3\.0'/);
  assert.match(ui,/const VERSION='1\.3\.0'/);
  assert.match(index,/app\.js\?v=1\.3\.0/);
  assert.match(index,/release-1\.2\.0\.js\?v=1\.3\.0/);
  assert.doesNotMatch(index,/\?v=1\.2\.4/);
});
