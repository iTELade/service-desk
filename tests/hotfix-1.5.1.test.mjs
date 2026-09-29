import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const index=read('public/index.html');
const css=read('public/hotfix-1.6.1.css');
const live=read('public/hotfix-1.6.1.js');
const agent=read('public/agent-experience-1.6.js');
const version=read('lib/version.mjs');

test('1.6.1 version and cache boundary are aligned',()=>{
  assert.match(version,/VERSION='1\.6\.1'/);
  assert.match(version,/SCHEMA_VERSION=8/);
  for(const asset of ['app.css','i18n.js','app.js','settings-center.js','security.js','release-1.1.2.js','release-1.2.0.js','agent-experience-1.6.js'])assert.ok(index.includes(`${asset}?v=1.6.1`),`missing 1.6.1 cache key for ${asset}`);
  assert.ok(index.includes('hotfix-1.6.1.css?v=1.6.1')&&index.includes('hotfix-1.6.1.js?v=1.6.1'));
});

test('1.5.1 avatar safety survives 1.6.1 as a CSP-safe external stylesheet',()=>{
  assert.match(css,/\.comment-avatar\{/);
  for(const rule of ['width:32px!important','height:32px!important','max-width:32px!important','max-height:32px!important','object-fit:cover!important'])assert.ok(css.includes(rule),`missing avatar rule ${rule}`);
  assert.match(css,/body\.jsm-route-users tbody td:first-child/);
});

test('1.5.1 queue live refresh protection survives 1.6.1 and runs before app.js',()=>{
  assert.ok(index.indexOf('/hotfix-1.6.1.js?v=1.6.1')<index.indexOf('/app.js?v=1.6.1'));
  assert.match(live,/refreshQueueInPlace/);
  assert.match(live,/patchQueue\(data,stats\)/);
  assert.doesNotMatch(live,/\broute\s*\(/);
});

test('1.6.1 keeps the visible version chip aligned without an inline mutation loop',()=>{
  assert.match(agent,/VERSION='1\.6\.1'/);
  assert.match(agent,/\.version-chip/);
  assert.match(agent,/if\(chip\.textContent!==next\)chip\.textContent=next/);
});
