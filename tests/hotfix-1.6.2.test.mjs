import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('1.6.2 scopes pending create attachments to submit',()=>{
  const s=read('public/release-1.1.2.js');
  assert.match(s,/pendingCreateFiles=null/);
  assert.match(s,/form\.addEventListener\('submit'/);
  assert.doesNotMatch(s,/addEventListener\('change',e=>pendingCreateFiles=/);
  assert.match(s,/pendingCreateFiles\?\.files\?\.length/);
});

test('1.6.2 queue refresh understands implicit select defaults',()=>{
  const s=read('public/security.js');
  assert.match(s,/!el\.multiple&&!defaults\.length&&options\[0\]/);
});

test('1.6.2 SLA risk is an API filter and dashboard metric',()=>{
  const ui=read('public/release-1.1.2.js'),server=read('server.mjs'),v8=read('lib/v8.mjs');
  assert.match(ui,/quick==='sla_risk'\)n\.set\('sla_risk','1'\)/);
  assert.match(server,/search\.get\('sla_risk'\)==='1'/);
  assert.match(server,/Number\(s\.remaining_ms\).*0\.25/);
  assert.match(v8,/sla_at_risk:slaAtRisk/);
});

test('1.6.2 Settings decorators share one current version',()=>{
  assert.match(read('public/agent-experience-1.6.js'),/VERSION='1\.6\.2'/);
  assert.match(read('public/release-1.1.3.js'),/VERSION='1\.6\.2'/);
  assert.match(read('public/settings-nav-complete.js'),/SETTINGS_NAV_VERSION = '1\.6\.2'/);
});

test('1.6.2 English coverage includes reproduced mixed-language labels',()=>{
  const s=read('public/i18n.js');
  for(const label of ['OBSŁUGA I REALIZACJA','Baza wiedzy','Poczta i powiadomienia','Komentarze','Załączniki'])assert.ok(s.includes(label));
});

test('1.6.2 publishing verifies committed checksums before release',()=>{
  const s=read('.github/workflows/publish-version.yml');
  assert.match(s,/sha256sum -c MANIFEST\.sha256/);
  assert.doesNotMatch(s,/Refresh repository checksum manifest/);
});
