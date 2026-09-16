import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL('../'+path, import.meta.url), 'utf8');
const css = read('public/release-1.1.4.css');
const layout = read('public/release-1.1.4-layout.css');
const ui = read('public/release-1.1.4.js');
const nav = read('public/settings-nav-complete.js');

test('1.1.4 agent UI is scoped to staff workspace and route classes',()=>{
  assert.match(ui,/v114-agent/);
  assert.match(ui,/staffWorkspace/);
  assert.match(ui,/agent-route-ticket/);
  assert.match(ui,/agent-route-settings/);
  assert.match(ui,/agent-route-queue/);
});

test('1.1.4 Jira-inspired shell uses light content surface and dedicated navigation',()=>{
  assert.match(css,/--v114-bg:#f7f8f9/);
  assert.match(css,/--v114-surface:#ffffff/);
  assert.match(css,/--v114-sidebar:#0d2a4f/);
  assert.match(css,/\.topbar\{/);
  assert.match(css,/\.sidebar\{/);
});

test('1.1.4 ticket detail keeps a Jira-style two-column issue layout',()=>{
  assert.match(layout,/\.ticket-layout\{display:grid/);
  assert.match(layout,/grid-template-columns:minmax\(0,1fr\) 360px/);
  assert.match(layout,/\.ticket-sidebar\{position:sticky/);
  assert.match(layout,/form\[data-form="comment"\]/);
});

test('1.1.4 settings navigation suppresses duplicated native section links',()=>{
  assert.match(nav,/SETTINGS_NAV_VERSION = '1\.1\.4'/);
  assert.match(nav,/labels\.has\(label\)/);
  assert.match(nav,/group\.querySelector\(`a\[href=/);
});
