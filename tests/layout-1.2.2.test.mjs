import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const css=readFileSync(new URL('../public/app.css',import.meta.url),'utf8');
const index=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const ui=readFileSync(new URL('../public/release-1.2.0.js',import.meta.url),'utf8');

test('1.4 shell keeps fixed navigation outside normal content flow',()=>{
  assert.match(css,/\.sidebar\{position:fixed/);
  assert.match(css,/\.workspace-content\{position:relative;width:calc\(100% - var\(--sd-sidebar\)\)/);
  assert.match(css,/margin-left:var\(--sd-sidebar\)/);
  assert.match(css,/body\.sd14-sidebar-collapsed \.workspace-content/);
});

test('1.4 enterprise design covers every primary operating surface',()=>{
  for(const selector of ['.metrics{','.filters{','.kanban{','.project-grid,','.settings-center{','.ticket-layout{','.portal-workspace{','.auth-layout{']){
    assert.ok(css.includes(selector),`missing 1.4 styling for ${selector}`);
  }
  assert.match(css,/@media\(max-width:1380px\)/);
  assert.match(css,/@media\(max-width:1080px\)/);
  assert.match(css,/@media\(max-width:820px\)/);
  assert.match(css,/@media\(max-width:620px\)/);
});

test('1.4.1 cache boundary loads only the canonical presentation and 1.4 controller',()=>{
  assert.match(ui,/const VERSION='1\.4\.0'/);
  assert.match(index,/app\.css\?v=1\.4\.1/);
  assert.match(index,/release-1\.2\.0\.js\?v=1\.4\.1/);
  assert.doesNotMatch(index,/release-1\.1\.4-layout\.css\?v=/);
});
