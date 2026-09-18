import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const center = readFileSync(new URL('../public/settings-center.js', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../public/release-1.2.0.js', import.meta.url), 'utf8');

test('settings route is owned by the native Settings Center and cannot render legacy settings', () => {
  assert.match(app, /case 'settings':content=await settingsView\(\);break;/);
  assert.doesNotMatch(app, /case 'settings':content=await legacySettingsView\(\);break;/);
  const view = app.match(/async function settingsView\(\)\{([^}]*)\}/)?.[1] || '';
  assert.ok(view, 'settingsView must exist');
  assert.doesNotMatch(view, /legacySettingsView/);
  assert.match(view, /settings-center-bootstrap/);
});

test('1.4 grouped administration still exposes every required management area', () => {
  for (const group of ['Ogólne','Tożsamość i dostęp','Zarządzanie usługami','Komunikacja','Integracje','Zasoby / CMDB','System']) assert.ok(center.includes(group) || ui.includes(group), `missing group ${group}`);
  for (const href of ['/#/users','/#/directory','/#/admin/sso','/#/admin/approvals','/#/projects','/#/admin/templates','/#/admin/organizations','/#/admin/mail','/#/admin/mail-templates','/#/admin/sync','/#/admin/knowledge','/#/admin/api-tokens','/#/admin/webhooks','/#/admin/assets','/#/admin/updates','/#/admin/events','/#/admin-settings']) assert.ok(ui.includes(href), `missing administration link ${href}`);
});

test('1.4 controller owns Settings recovery and product version label', () => {
  assert.match(center, /const SETTINGS_VERSION='1\.2\.1';/);
  assert.match(ui, /const VERSION='1\.4\.0';/);
  assert.match(ui, /function recoverSettingsCenter\(\)/);
  assert.match(ui, /chip\.textContent='Wersja '\+VERSION/);
});
