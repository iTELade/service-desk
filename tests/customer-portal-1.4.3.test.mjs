import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const index=read('public/index.html');
const css=read('public/app.css');
const ui=read('public/release-1.2.0.js');
const version=read('lib/version.mjs');
const release=read('RELEASE_NOTES_1.5.0.md');

test('1.5.0 keeps schema 8 and advances the application/cache boundary',()=>{
  assert.match(version,/VERSION='1\.5\.0'/);
  assert.match(version,/SCHEMA_VERSION=8/);
  for(const asset of ['app.css','app.js','settings-center.js','security.js','release-1.1.2.js','release-1.2.0.js'])assert.ok(index.includes('/'+asset+'?v=1.5.0'),`missing 1.5.0 cache key for ${asset}`);
});

test('1.5.0 customer experience is part of the canonical design system instead of an inline overlay',()=>{
  assert.doesNotMatch(index,/data-sd143-customer-style|data-sd143-customer-ui/);
  for(const token of ['.portal-workspace{','.jsm-portal-home','.jsm-portal-project-shell','.jsm-request-list','.jsm-customer-ticket','.jsm-customer-case','.jsm-customer-queue','.jsm-portal-request-dialog'])assert.ok(css.includes(token),`missing customer surface ${token}`);
  for(const token of ['decoratePortalHome','decorateProjectPortal','decorateCustomerTicket','decorateCustomerQueue','decorateDialog'])assert.ok(ui.includes(token),`missing customer controller ${token}`);
  assert.match(ui,/Jak możemy Ci pomóc\?/);
  assert.match(ui,/Utwórz zgłoszenie/);
  assert.match(ui,/Aktywność/);
});

test('1.5.0 keeps safe release note rendering in the shared controller',()=>{
  for(const token of ['renderMarkdown','release-notes-rendered','appendInline','pre.replaceWith(rendered)'])assert.ok(ui.includes(token),`missing release-note renderer token ${token}`);
  assert.match(ui,/document\.createElement\('strong'\)/);
  assert.match(ui,/document\.createElement\('code'\)/);
  assert.doesNotMatch(ui,/release.*innerHTML\s*=\s*raw/i);
});

test('1.5.0 release notes document full-product scope and no migration',()=>{
  assert.match(release,/full product UI rebuild/i);
  assert.match(release,/Database schema remains \*\*8\*\*/);
  assert.match(release,/No database migration is required/);
  assert.match(release,/Queues/);
  assert.match(release,/Administration Center/);
});
