import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const ui=readFileSync(new URL('../public/release-1.2.0.js',import.meta.url),'utf8');
const index=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const version=readFileSync(new URL('../lib/version.mjs',import.meta.url),'utf8');

test('1.2.4 rebuilds queue as a coherent JSM-style work surface',()=>{
  assert.match(ui,/Service Desk 1\.2\.4 — queue and ticket views rebuilt/);
  assert.match(ui,/agent-route-queue \.metrics/);
  assert.match(ui,/agent-route-queue \.r112-queue-tools/);
  assert.match(ui,/agent-route-queue form\.filters/);
  assert.match(ui,/agent-route-queue \.v120-issue-list/);
  assert.match(ui,/main\.classList\.add\('v124-queue'\)/);
});

test('1.2.4 rebuilds ticket content and keeps one attachment surface',()=>{
  assert.match(ui,/grid-template-columns:minmax\(0,1fr\) 340px/);
  assert.match(ui,/main\.classList\.add\('v124-ticket'\)/);
  assert.match(ui,/const attachments=\$\$\('\[data-r112-attachments\]'/);
  assert.match(ui,/for\(const duplicate of attachments\.slice\(1\)\)duplicate\.remove\(\)/);
  assert.match(ui,/if\(left&&keep\.parentElement!==left\)left\.append\(keep\)/);
  assert.match(ui,/agent-route-ticket \.ticket-sidebar/);
  assert.match(ui,/agent-route-ticket \.r112-upload/);
});

test('1.2.4 runtime and cache markers are aligned',()=>{
  assert.match(version,/VERSION='1\.2\.4'/);
  assert.match(ui,/const VERSION='1\.2\.4'/);
  assert.match(index,/app\.js\?v=1\.2\.4/);
  assert.match(index,/release-1\.2\.0\.js\?v=1\.2\.4/);
  assert.doesNotMatch(index,/\?v=1\.2\.3/);
});
