import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const index=read('public/index.html');
const bootstrap=read('public/security.js');
const css=read('public/release-1.1.2.css');
const r112=read('public/release-1.1.2.js');
const agent=read('public/agent-experience-1.6.js');
const backend112=read('lib/release-112.mjs');
const lifecycle=read('lib/lifecycle.mjs');
const extensions=read('lib/extensions.mjs');
const version=read('lib/version.mjs');
const validation=read('VALIDATION.md');

test('1.6.2 uses CSP-safe served assets without inline script/style blocks',()=>{
  assert.match(index,/release-1\.1\.2\.css\?v=1\.6\.2/);
  assert.ok(index.indexOf('/security.js?v=1.6.2')<index.indexOf('/app.js?v=1.6.2'));
  assert.doesNotMatch(index,/<style\b/i);
  assert.doesNotMatch(index,/<script(?![^>]*\bsrc=)[^>]*>/i);
  assert.match(css,/\.comment-avatar\{[^}]*width:32px!important[^}]*height:32px!important/);
  assert.match(bootstrap,/queueRefreshGuard=VERSION/);
});

test('1.6.2 queue preferences remount and recognize stable/localized column labels',()=>{
  assert.doesNotMatch(r112,/lastQueueKey/);
  assert.match(r112,/headerAliases/);
  assert.match(r112,/route==='#\/queue'&&!document\.querySelector\('\[data-r112-queue-tools\]'\)/);
});

test('1.6.2 blocks archived attachment mutation and purges attachments on ticket delete',()=>{
  assert.match(backend112,/t\.archived_at\|\|p\?\.archived/);
  assert.match(lifecycle,/DELETE FROM r112_attachments WHERE ticket_id=\?/);
});

test('1.6.2 lookup accepts unpadded ticket numbers and stale mentions return 404',()=>{
  assert.match(lifecycle,/\\d\{1,10\}/);
  assert.match(extensions,/if\(!t\)fail\(404,'Nieznana sprawa\.'\)/);
});

test('1.6.2 settings mutation and activity tab accessibility regressions are covered',()=>{
  assert.match(agent,/if\(chip\.textContent!==next\)chip\.textContent=next/);
  for(const key of ['ArrowRight','ArrowDown','ArrowLeft','ArrowUp','Home','End'])assert.ok(agent.includes(key));
  assert.match(agent,/aria-controls/);
  assert.match(agent,/aria-labelledby/);
  assert.ok(agent.includes("setAttribute('role','tabpanel')"));
});

test('1.6.2 create dialog receives attachment control',()=>{
  assert.ok(r112.includes('create-ticket'));
  assert.ok(r112.includes('pendingCreateFiles'));
});

test('1.6.2 version and validation documentation are current',()=>{
  assert.match(version,/VERSION='1\.6\.2'/);
  assert.match(validation,/# Walidacja 1\.6\.2/);
  assert.match(validation,/\/healthz.*`1\.6\.2`/);
});
