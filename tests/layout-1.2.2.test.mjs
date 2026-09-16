import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const css=readFileSync(new URL('../public/release-1.1.4-layout.css',import.meta.url),'utf8');
const index=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const ui=readFileSync(new URL('../public/release-1.2.0.js',import.meta.url),'utf8');

test('1.2.2 forces the agent main content back to a full-width block flow',()=>{
  assert.match(css,/1\.2\.2 — production layout repair/);
  assert.match(css,/body\.v114-agent #main\{display:block!important;width:100%!important;max-width:none!important/);
  assert.match(css,/body\.v114-agent #main>\.page-heading\{display:flex!important;width:100%!important/);
  assert.match(css,/word-break:normal!important;overflow-wrap:normal!important/);
});

test('1.2.2 keeps queue board projects users and settings layouts responsive',()=>{
  for(const selector of [
    'agent-route-queue .metrics',
    'agent-route-queue form.filters',
    'agent-route-board .kanban',
    'agent-route-projects .project-grid',
    'agent-route-users table',
    'agent-route-settings #main>.settings-center'
  ]) assert.ok(css.includes(selector),`missing layout repair for ${selector}`);
  assert.match(css,/@media\(max-width:860px\)/);
  assert.match(css,/@media\(max-width:620px\)/);
});

test('1.2.2 release metadata and browser cache marker stay aligned',()=>{
  assert.match(ui,/const VERSION='1\.2\.2'/);
  assert.match(index,/release-1\.1\.4-layout\.css\?v=1\.2\.2/);
  assert.match(index,/release-1\.2\.0\.js\?v=1\.2\.2/);
});
