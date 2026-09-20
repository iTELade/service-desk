import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const index=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const guard=index.match(/<script data-sd151-live-guard>([\s\S]*?)<\/script>/)?.[1]||'';
const version=readFileSync(new URL('../lib/version.mjs',import.meta.url),'utf8');

test('1.5.1 queue refresh guard loads before the application live refresh',()=>{
  assert.match(version,/VERSION='1\.5\.1'/);
  assert.ok(guard,'inline queue refresh guard must exist');
  assert.ok(index.indexOf('data-sd151-live-guard')<index.indexOf('/app.js?v=1.5.1'));
  assert.match(guard,/queueRefreshGuard=VERSION/);
  assert.match(app,/setInterval\(\(\)=>void refreshLiveView\(\),5000\)/);
});

test('1.5.1 keeps five-second live polling but never routes the queue to refresh it',()=>{
  assert.match(guard,/nativeSetInterval\(\(\)=>void guardedRefresh\(refreshCallback\),5000\)/);
  assert.match(guard,/refreshQueueInPlace/);
  assert.match(guard,/patchQueue\(data,stats\)/);
  assert.doesNotMatch(guard,/\broute\s*\(/);
  assert.doesNotMatch(guard,/location\.reload/);
});

test('1.5.1 patches queue rows, metrics and SLA in place',()=>{
  assert.match(guard,/\.metrics>div strong/);
  assert.match(guard,/\.panel \.table-scroll table/);
  assert.match(guard,/patchRow/);
  assert.match(guard,/sameShape/);
  assert.match(guard,/remaining_ms/);
  assert.match(guard,/\.pagination/);
});

test('1.5.1 queue refresh does not touch global search and pauses for dirty queue filters',()=>{
  assert.doesNotMatch(guard,/r112-global-search/);
  assert.match(guard,/#main form\.filters/);
  assert.match(guard,/dirtyControl/);
  assert.match(guard,/queueEditorBusy/);
});
