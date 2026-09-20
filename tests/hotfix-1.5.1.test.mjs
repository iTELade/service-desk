import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const index=read('public/index.html');
const css=read('public/hotfix-1.5.1.css');
const live=read('public/queue-refresh-1.5.1.js');
const ui=read('public/hotfix-1.5.1-ui.js');
const version=read('lib/version.mjs');

test('1.5.1 version and hotfix assets are aligned',()=>{
  assert.match(version,/VERSION='1\.5\.1'/);
  assert.match(version,/SCHEMA_VERSION=8/);
  for(const asset of ['app.css','hotfix-1.5.1.css','i18n.js','queue-refresh-1.5.1.js','app.js','settings-center.js','security.js','release-1.1.2.js','release-1.2.0.js','hotfix-1.5.1-ui.js'])assert.ok(index.includes(`${asset}?v=1.5.1`),`missing 1.5.1 cache key for ${asset}`);
});

test('1.5.1 clamps user and comment avatars to a safe fixed size',()=>{
  assert.match(css,/\.comment-avatar\{/);
  for(const rule of ['width:32px!important','height:32px!important','max-width:32px!important','max-height:32px!important','object-fit:cover!important'])assert.ok(css.includes(rule),`missing avatar rule ${rule}`);
  assert.match(css,/body\.jsm-route-users tbody td:first-child/);
});

test('1.5.1 queue live refresh is loaded before app.js and never calls route',()=>{
  assert.ok(index.indexOf('/queue-refresh-1.5.1.js?v=1.5.1')<index.indexOf('/app.js?v=1.5.1'));
  assert.match(live,/refreshQueueInPlace/);
  assert.match(live,/patchQueue\(data,stats\)/);
  assert.doesNotMatch(live,/\broute\s*\(/);
});

test('1.5.1 keeps the visible version chip aligned after legacy controllers run',()=>{
  assert.match(ui,/const VERSION='1\.5\.1'/);
  assert.match(ui,/\.version-chip/);
  assert.match(ui,/MutationObserver/);
});
