import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const css=readFileSync(new URL('../public/app.css',import.meta.url),'utf8');
const index=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const ui=readFileSync(new URL('../public/release-1.2.0.js',import.meta.url),'utf8');

test('1.5 shell separates global header, navigation rail and workspace content',()=>{
  assert.match(css,/\.sidebar\{position:fixed;inset:var\(--j-header\)/);
  assert.match(css,/\.brand\{position:fixed/);
  assert.match(css,/\.topbar\{position:fixed/);
  assert.match(css,/\.workspace-content\{position:relative;min-width:0;margin-left:var\(--j-sidebar\)/);
  assert.match(css,/body\.sd14-sidebar-collapsed \.workspace-content/);
  assert.match(ui,/function decorateTopbar\(\)/);
  assert.match(ui,/function addManagementNavigation\(\)/);
});

test('1.5 design system covers every primary product surface',()=>{
  for(const selector of ['.metrics{','.filters{','.kanban{','.project-grid,','.settings-shell,.settings-center{','.ticket-layout{','.portal-workspace{','.auth-layout{','dialog{'])assert.ok(css.includes(selector),`missing 1.5 styling for ${selector}`);
  assert.match(css,/@media\(max-width:1380px\)/);
  assert.match(css,/@media\(max-width:1080px\)/);
  assert.match(css,/@media\(max-width:820px\)/);
  assert.match(css,/@media\(max-width:620px\)/);
});

test('1.6 cache boundary loads canonical presentation plus contained compatibility bootstrap',()=>{
  assert.match(ui,/const VERSION='1\.5\.0'/);
  assert.match(index,/app\.css\?v=1\.6\.0/);
  assert.match(index,/agent-experience-1\.6\.css\?v=1\.6\.0/);
  assert.match(index,/release-1\.2\.0\.js\?v=1\.6\.0/);
  assert.match(index,/agent-experience-1\.6\.js\?v=1\.6\.0/);
  assert.match(index,/data-sd151-live-guard/);
  assert.match(index,/data-sd151-hotfix/);
  assert.doesNotMatch(index,/data-sd143-customer-style|data-sd143-customer-ui/);
  assert.doesNotMatch(index,/release-1\.1\.4-layout\.css\?v=/);
});
