import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const index=read('public/index.html');
const css=read('public/release-1.1.2.css');
const live=read('public/security.js');
const agent=read('public/agent-experience-1.6.js');
const version=read('lib/version.mjs');

test('1.6.1 version and cache boundary are aligned',()=>{
  assert.match(version,/VERSION='1\.6\.1'/);
  assert.match(version,/SCHEMA_VERSION=8/);
  for(const asset of ['app.css','release-1.1.2.css','i18n.js','security.js','app.js','settings-center.js','release-1.1.2.js','release-1.2.0.js','agent-experience-1.6.js'])assert.ok(index.includes(`${asset}?v=1.6.1`),`missing 1.6.1 cache key for ${asset}`);
});

test('1.5.1 avatar safety survives 1.6.1 as CSP-safe external CSS',()=>{
  assert.match(css,/\.comment-avatar\{/);
  for(const rule of ['width:32px!important','height:32px!important','max-width:32px!important','max-height:32px!important','object-fit:cover!important'])assert.ok(css.includes(rule),`missing avatar rule ${rule}`);
  assert.match(css,/body\.jsm-route-users tbody td:first-child/);
});

test('1.5.1 queue live refresh protection survives 1.6.1 and runs before app.js',()=>{
  assert.ok(index.indexOf('/security.js?v=1.6.1')<index.indexOf('/app.js?v=1.6.1'));
  assert.match(live,/refreshQueueInPlace/);
  assert.match(live,/patchQueue\(data,stats\)/);
  assert.doesNotMatch(live,/\broute\s*\(/);
});

test('1.6.1 keeps visible version chips idempotent',()=>{
  assert.match(agent,/VERSION='1\.6\.1'/);
  assert.match(agent,/\.version-chip/);
  assert.match(agent,/if\(chip\.textContent!==next\)chip\.textContent=next/);
});
