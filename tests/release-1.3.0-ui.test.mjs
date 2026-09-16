import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const index=read('public/index.html');
const server=read('server.mjs');
const css=read('public/release-1.3.0.css');
const navcss=read('public/release-1.3.0-nav.css');
const ui=read('public/release-1.3.0.js');

test('1.3.0 assets are wired and served',()=>{
  for(const f of ['release-1.1.4.css','release-1.1.4-layout.css','release-1.3.0.css','release-1.3.0-nav.css','release-1.3.0.js']){
    assert.ok(index.includes('/'+f+'?v=1.3.0'));
    assert.ok(server.includes("['/"+f+"', ['"+f+"',"));
  }
});

test('1.3.0 covers agent, auth and portal surfaces',()=>{
  assert.match(ui,/v130-auth/);
  assert.match(ui,/v130-portal/);
  assert.match(ui,/v130-public-portal/);
  assert.match(ui,/v114-agent/);
  assert.match(css,/Customer portal shell/);
  assert.match(css,/Login, registration, MFA/);
});

test('1.3.0 keeps Jira-style issue and collapsible navigation',()=>{
  assert.match(navcss,/v130-sidebar-collapsed/);
  assert.match(ui,/desk\.sidebar\.collapsed/);
  assert.match(ui,/ticketPolish/);
  assert.match(ui,/addAdminNav/);
});

test('1.3.0 cache busting is consistent',()=>{
  assert.ok(!index.includes('?v=1.1.3'));
  assert.ok(!index.includes('release-1.1.4.js'));
});
