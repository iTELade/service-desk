import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const index=read('public/index.html');
const css=index.match(/<style data-sd151-hotfix>([\s\S]*?)<\/style>/)?.[1]||'';
const live=index.match(/<script data-sd151-live-guard>([\s\S]*?)<\/script>/)?.[1]||'';
const ui=index.match(/<script data-sd151-ui(?:\s[^>]*)?>([\s\S]*?)<\/script>/)?.[1]||'';
const version=read('lib/version.mjs');

test('1.6.0 version and cache boundary are aligned',()=>{
  assert.match(version,/VERSION='1\.6\.0'/);
  assert.match(version,/SCHEMA_VERSION=8/);
  for(const asset of ['app.css','i18n.js','app.js','settings-center.js','security.js','release-1.1.2.js','release-1.2.0.js'])assert.ok(index.includes(`${asset}?v=1.6.0`),`missing 1.6.0 cache key for ${asset}`);
  assert.ok(css&&live&&ui,'contained compatibility/bootstrap protections must remain active');
});

test('1.5.1 clamps user and comment avatars to a safe fixed size',()=>{
  assert.match(css,/\.comment-avatar\{/);
  for(const rule of ['width:32px!important','height:32px!important','max-width:32px!important','max-height:32px!important','object-fit:cover!important'])assert.ok(css.includes(rule),`missing avatar rule ${rule}`);
  assert.match(css,/body\.jsm-route-users tbody td:first-child/);
});

test('1.5.1 queue live refresh protection survives 1.6 and runs before app.js',()=>{
  assert.ok(index.indexOf('data-sd151-live-guard')<index.indexOf('/app.js?v=1.6.0'));
  assert.match(live,/refreshQueueInPlace/);
  assert.match(live,/patchQueue\(data,stats\)/);
  assert.doesNotMatch(live,/\broute\s*\(/);
});

test('1.6 keeps the visible version chip aligned after legacy controllers run',()=>{
  assert.match(ui,/VERSION='1\.6\.0'/);
  assert.match(ui,/\.version-chip/);
  assert.match(ui,/MutationObserver/);
});
