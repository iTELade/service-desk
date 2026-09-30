import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('../public/app.css',import.meta.url),'utf8');
const index=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const ui=readFileSync(new URL('../public/release-1.2.0.js',import.meta.url),'utf8');
const security=readFileSync(new URL('../public/security.js',import.meta.url),'utf8');
test('1.5 functional shell remains available as a compatibility implementation',()=>{assert.match(ui,/function decorateTopbar\(\)/);assert.match(ui,/function addManagementNavigation\(\)/);assert.match(css,/\.workspace-content/);});
test('1.5 base design continues to cover operational product surfaces',()=>{for(const selector of ['.metrics{','.filters{','.kanban{','.ticket-layout{','.portal-workspace{'])assert.ok(css.includes(selector),selector);});
test('2.0.1 cache boundary loads the unified presentation and CSP-safe compatibility behavior',()=>{
  for(const asset of ['app.css','design-system.css','security.js','app.js','settings-center.js','release-1.1.2.js','product-shell.js'])assert.ok(index.includes('/'+asset+'?v=2.0.1'),asset);
  for(const retired of ['release-1.1.2.css','agent-experience-1.6.css','release-1.2.0.js','agent-experience-1.6.js'])assert.ok(!index.includes('/'+retired+'?v='),retired);
  assert.match(security,/queueRefreshGuard=VERSION/);assert.doesNotMatch(index,/<style\b/i);assert.doesNotMatch(index,/<script(?![^>]*\bsrc=)[^>]*>/i);
});
