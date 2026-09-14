import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const center = readFileSync(new URL('../public/settings-center.js', import.meta.url), 'utf8');
const nav = readFileSync(new URL('../public/settings-nav-complete.js', import.meta.url), 'utf8');

test('settings route is owned by the native Settings Center and cannot render legacy settings', () => {
  assert.match(app, /case 'settings':content=await settingsView\(\);break;/);
  assert.doesNotMatch(app, /case 'settings':content=await legacySettingsView\(\);break;/);
  const view = app.match(/async function settingsView\(\)\{([^}]*)\}/)?.[1] || '';
  assert.ok(view, 'settingsView must exist');
  assert.doesNotMatch(view, /legacySettingsView/);
  assert.match(view, /settings-center-bootstrap/);
});

test('native Settings Center and navigation expose all legacy administration areas in grouped UI', () => {
  for (const group of ['Ogólne','Tożsamość i dostęp','Zarządzanie usługami','Komunikacja','Integracje','Zasoby / CMDB','System']) {
    assert.ok(center.includes(group) || nav.includes(group), `missing group ${group}`);
  }
  for (const href of [
    '/#/users','/#/directory','/#/admin/sso','/#/admin/approvals',
    '/#/projects','/#/admin/templates','/#/admin/organizations',
    '/#/admin/mail','/#/admin/mail-templates','/#/admin/sync','/#/admin/knowledge',
    '/#/admin/api-tokens','/#/admin/webhooks','/#/admin/assets','/#/admin/updates',
    '/#/admin/events','/#/admin-settings'
  ]) assert.ok(nav.includes(href), `missing legacy administration link ${href}`);

  for (const label of [
    'Katalog LDAP / Active Directory','Logowanie SSO / OIDC','Wnioski o zmiany profilu',
    'Szablony workflow i statusów','Firmy i grupy klientów','Skrzynki zespołów · IMAP i SMTP',
    'Szablony powiadomień e-mail','Synchronizacja projektów','Webhooki','Baza wiedzy','Tokeny API',
    'Katalog środków trwałych','Wersja i aktualizacje','Błędy modułów'
  ]) assert.ok(nav.includes(label), `missing legacy Settings label ${label}`);
});

test('Settings Center asset versions are aligned with 1.0.6', () => {
  assert.match(center, /const SETTINGS_VERSION='1\.0\.6';/);
  assert.match(nav, /const SETTINGS_NAV_VERSION = '1\.0\.6';/);
});
