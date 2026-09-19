import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const index=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const version=readFileSync(new URL('../lib/version.mjs',import.meta.url),'utf8');
const guard=index.match(/<script data-sd142-live-guard>([\s\S]*?)<\/script>/)?.[1]||'';

test('1.4.2 installs the queue refresh guard before the application module',()=>{
  assert.ok(guard,'queue refresh guard must be embedded in index');
  assert.ok(index.indexOf('data-sd142-live-guard')<index.indexOf('/app.js?v=1.4.2'),'guard must execute before app.js registers live refresh');
  assert.match(version,/VERSION='1\.4\.2'/);
});

test('1.4.2 ignores ticking SLA countdown values when deciding whether the queue changed',()=>{
  assert.match(guard,/stableTicketSignature/);
  assert.match(guard,/Boolean\(s\.breached\)/);
  assert.match(guard,/s\.due_at/);
  assert.doesNotMatch(guard,/remaining_ms/);
  assert.match(app,/setInterval\(\(\)=>void refreshLiveView\(\),5000\)/);
  assert.match(guard,/Number\(delay\)===5000&&isLiveRefresh\(fn\)/);
});

test('1.4.2 never replaces queue UI while the operator is searching or editing controls',()=>{
  assert.match(guard,/\.workspace-content input/);
  assert.match(guard,/dirtyControl/);
  assert.match(guard,/r112-search-results:not\(\[hidden\]\)/);
  assert.match(guard,/active\.matches\?\.\('input,textarea,select,\[contenteditable="true"\]'\)/);
  assert.match(guard,/type==='focus'&&isLiveRefresh\(listener\)/);
});

test('1.4.2 still performs live refresh when stable ticket data really changes',()=>{
  assert.match(guard,/if\(stable===lastStable\)return/);
  assert.match(guard,/lastStable=stable;\s*fn\(\)/);
  assert.match(guard,/t\.version/);
  assert.match(guard,/t\.workflow_version/);
  assert.match(guard,/t\.updated_at/);
});
