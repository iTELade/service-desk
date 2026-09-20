import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const ui=readFileSync(new URL('../public/release-1.2.0.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/app.css',import.meta.url),'utf8');
const index=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const version=readFileSync(new URL('../lib/version.mjs',import.meta.url),'utf8');

test('1.5.0 is a clean presentation boundary, not the old 1.4 layered CSS stack',()=>{
  assert.match(css,/Service Desk 1\.5\.0 — Jira Service Management inspired workspace rebuild/);
  assert.match(index,/\/app\.css\?v=1\.5\.0/);
  for(const retired of ['settings.css','release-1.1.2.css','release-1.1.4.css','release-1.1.4-layout.css','release-1.2.0.css','release-1.2.0-nav.css','settings-nav-complete.js'])assert.ok(!index.includes('/'+retired+'?v='),`legacy presentation asset must be retired: ${retired}`);
});

test('1.5 queue is one work surface with safe refresh continuity',()=>{
  assert.match(ui,/function rebuildQueue\(\)/);
  assert.match(ui,/jsm-queue-workspace/);
  assert.match(ui,/sd14-view-settings/);
  assert.match(ui,/\[data-r112-queue-tools\]/);
  assert.match(ui,/function keepNewest\(nodes\)/);
  assert.match(ui,/let queueSnapshotHTML=''/);
  assert.match(ui,/function showQueueGhost\(main\)/);
  assert.match(ui,/sanitizeGhost\(ghost\)/);
  assert.doesNotMatch(ui,/main\.innerHTML=queueSnapshot/);
  assert.match(css,/sd14-queue-ghost/);
});

test('1.5 ticket uses a dedicated issue header, work column and sticky context rail',()=>{
  assert.match(ui,/function rebuildTicket\(\)/);
  assert.match(ui,/sd14-ticket-header/);
  assert.match(ui,/sd14-ticket-title-row/);
  assert.match(ui,/sd14-ticket-main/);
  assert.match(ui,/const attachments=keepNewest/);
  assert.match(css,/\.ticket-layout\{display:grid;grid-template-columns:minmax\(0,1fr\) 330px/);
  assert.match(css,/\.ticket-sidebar\{position:sticky/);
  assert.match(css,/\.sd14-history/);
});

test('1.5 remains one forced light product theme',()=>{
  assert.match(ui,/function forceLightTheme\(\)/);
  assert.match(ui,/root\.dataset\.theme='light'/);
  assert.match(ui,/root\.style\.colorScheme='light'/);
  assert.match(css,/html\[data-theme="dark"\],html\[data-theme="system"\]/);
  assert.doesNotMatch(css,/@media\s*\(prefers-color-scheme:\s*dark\)/);
});

test('1.5.0 version and browser cache markers are aligned',()=>{
  assert.match(version,/VERSION='1\.5\.0'/);
  assert.match(ui,/const VERSION='1\.5\.0'/);
  assert.match(index,/app\.js\?v=1\.5\.0/);
  assert.match(index,/release-1\.2\.0\.js\?v=1\.5\.0/);
});
