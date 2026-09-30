import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const index=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const guard=readFileSync(new URL('../public/security.js',import.meta.url),'utf8');
const liveGuard=guard.split('\n\n(() => {')[0];
const version=readFileSync(new URL('../lib/version.mjs',import.meta.url),'utf8');

test('2.0.0 queue refresh guard loads before the application live refresh',()=>{
  assert.match(version,/VERSION='2\.0\.0'/);
  assert.ok(index.indexOf('/security.js?v=2.0.0')<index.indexOf('/app.js?v=2.0.0'));
  assert.match(liveGuard,/queueRefreshGuard=VERSION/);
  assert.match(app,/setInterval\(\(\)=>void refreshLiveView\(\),5000\)/);
});

test('1.5.1 keeps five-second live polling but never routes the queue to refresh it',()=>{
  assert.match(liveGuard,/nativeSetInterval\(\(\)=>void guardedRefresh\(refreshCallback\),5000\)/);
  assert.match(liveGuard,/refreshQueueInPlace/);
  assert.match(liveGuard,/patchQueue\(data,stats\)/);
  assert.doesNotMatch(liveGuard,/\broute\s*\(/);
  assert.doesNotMatch(liveGuard,/location\.reload/);
});

test('1.5.1 patches queue rows, metrics and SLA in place',()=>{
  assert.match(liveGuard,/\.metrics>div strong/);
  assert.match(liveGuard,/\.panel \.table-scroll table/);
  assert.match(liveGuard,/patchRow/);
  assert.match(liveGuard,/sameShape/);
  assert.match(liveGuard,/remaining_ms/);
  assert.match(liveGuard,/\.pagination/);
});

test('1.5.1 queue refresh does not touch global search and pauses for dirty queue filters',()=>{
  assert.doesNotMatch(liveGuard,/r112-global-search/);
  assert.match(liveGuard,/#main form\.filters/);
  assert.match(liveGuard,/dirtyControl/);
  assert.match(liveGuard,/queueEditorBusy/);
});
