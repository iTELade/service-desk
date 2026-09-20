import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const index=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const version=readFileSync(new URL('../lib/version.mjs',import.meta.url),'utf8');
const release=readFileSync(new URL('../RELEASE_NOTES_1.4.3.md',import.meta.url),'utf8');

test('1.4.3 keeps schema 8 and advances the application/cache boundary',()=>{
  assert.match(version,/VERSION='1\.4\.3'/);
  assert.match(version,/SCHEMA_VERSION=8/);
  for(const asset of ['app.css','app.js','settings-center.js','security.js','release-1.1.2.js','release-1.2.0.js'])assert.ok(index.includes('/'+asset+'?v=1.4.3'),`missing 1.4.3 cache key for ${asset}`);
});

test('1.4.3 introduces a dedicated customer portal presentation',()=>{
  for(const token of ['data-sd143-customer-style','sd143-customer-portal','sd143-portal-home','sd143-project-portal','sd143-project-shell','sd143-request-list','sd143-customer-ticket','sd143-ticket-card','sd143-customer-queue','sd143-portal-request-dialog'])assert.ok(index.includes(token),`missing customer portal token ${token}`);
  assert.match(index,/Potrzebujesz pomocy\? Wyszukaj usługę/);
  assert.match(index,/Opisz swoją sprawę/);
  assert.match(index,/Aktywność/);
});

test('1.4.3 renders release notes instead of exposing raw markdown pre blocks',()=>{
  for(const token of ['renderMarkdown','release-notes-rendered','appendInline','pre.replaceWith(rendered)'])assert.ok(index.includes(token),`missing release-note renderer token ${token}`);
  assert.match(index,/document\.createElement\('strong'\)/);
  assert.match(index,/document\.createElement\('code'\)/);
  assert.match(index,/https\?:\\\/\\\//);
});

test('1.4.3 release notes document customer-only scope and no migration',()=>{
  assert.match(release,/customer-facing portal experience/i);
  assert.match(release,/Database schema remains \*\*8\*\*/);
  assert.match(release,/No migration is required/);
  assert.match(release,/raw Markdown/);
});
