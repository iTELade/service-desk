import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const legacy=read('public/release-1.2.0.js'),base=read('public/app.css'),index=read('public/index.html'),version=read('lib/version.mjs'),security=read('public/security.js'),design=read('public/design-system.css');
test('2.0 has one canonical active presentation boundary',()=>{assert.match(index,/\/app\.css\?v=2\.0\.0/);assert.match(index,/\/design-system\.css\?v=2\.0\.0/);assert.doesNotMatch(index,/agent-experience-1\.6/);assert.doesNotMatch(index,/release-1\.2\.0\.js/);});
test('legacy functional queue rebuild remains available during 2.0 compatibility phase',()=>{assert.match(legacy,/function rebuildQueue\(\)/);assert.match(legacy,/keepNewest/);assert.match(base,/sd14-queue-ghost/);});
test('legacy functional ticket rebuild remains available during 2.0 compatibility phase',()=>{assert.match(legacy,/function rebuildTicket\(\)/);assert.match(legacy,/sd14-ticket-main/);assert.match(design,/\.sd20-ticket-layout/);});
test('2.0 version, schema and active browser cache markers are aligned',()=>{assert.match(version,/VERSION='2\.0\.0'/);assert.match(version,/SCHEMA_VERSION=9/);assert.match(security,/VERSION='2\.0\.0'/);for(const asset of ['app.js','security.js','design-system.css','product-shell.js'])assert.ok(index.includes('/'+asset+'?v=2.0.0'));assert.doesNotMatch(index,/<script(?![^>]*\bsrc=)[^>]*>/i);});
