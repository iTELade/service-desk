import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const css=readFileSync(new URL('../public/release-1.1.4-layout.css',import.meta.url),'utf8');
const index=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const ui=readFileSync(new URL('../public/release-1.2.0.js',import.meta.url),'utf8');

test('1.2.3 rebuild removes the fixed-sidebar grid-flow collapse at its source',()=>{
  assert.match(css,/Service Desk 1\.2\.3 — agent workspace rebuilt/);
  assert.match(css,/body\.v114-agent \.workspace\{display:block!important;width:100%!important/);
  assert.match(css,/body\.v114-agent \.workspace-content\{display:block!important;width:calc\(100% - var\(--desk-sidebar\)\)!important/);
  assert.match(css,/margin:0 0 0 var\(--desk-sidebar\)!important/);
  assert.match(css,/body\.v114-agent #main\{display:block!important;width:100%!important/);
  assert.match(css,/word-break:normal!important;overflow-wrap:normal!important/);
});

test('1.2.3 rebuild protects queue board projects users settings and ticket layouts',()=>{
  for(const selector of [
    'agent-route-queue .metrics',
    'agent-route-queue form.filters',
    'agent-route-board .kanban',
    'agent-route-projects .project-grid',
    'agent-route-users table',
    'agent-route-settings .settings-center',
    '.ticket-layout'
  ]) assert.ok(css.includes(selector),`missing rebuilt layout for ${selector}`);
  assert.match(css,/@media\(max-width:1180px\)/);
  assert.match(css,/@media\(max-width:860px\)/);
  assert.match(css,/@media\(max-width:620px\)/);
});

test('1.3.0 release metadata and browser cache marker stay aligned',()=>{
  assert.match(ui,/const VERSION='1\.3\.0'/);
  assert.match(index,/release-1\.1\.4-layout\.css\?v=1\.3\.0/);
  assert.match(index,/release-1\.2\.0\.js\?v=1\.3\.0/);
});
