import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';

const source = readFileSync(new URL('../public/settings-nav-complete.js', import.meta.url), 'utf8');

function boot(html, hash = '#/settings') {
  const dom = new JSDOM(html, {url:`https://desk.example/${hash}`, runScripts:'outside-only'});
  const {window} = dom;
  window.queueMicrotask = queueMicrotask;
  window.eval(source);
  return dom;
}

async function settle() {
  await new Promise(resolve => setTimeout(resolve, 0));
  await new Promise(resolve => setTimeout(resolve, 0));
}

test('Settings recovery clears stale center marker after legacy settings overwrites the native center', async () => {
  const dom = boot(`<!doctype html><html><body><main id="main" data-settings-center-version="1.0.3">
    <h1>Ustawienia systemu</h1>
    <section><h2>Organizacja i rejestracja</h2><form data-form="settings"></form></section>
    <section><h2>Domyślna poczta SMTP</h2><form data-v6="smtp"></form></section>
  </main></body></html>`);
  await settle();
  const main = dom.window.document.querySelector('#main');
  assert.equal(main.dataset.settingsCenterVersion, undefined);
  assert.equal(main.dataset.settingsRecovery, '1.0.5');
  assert.match(main.innerHTML, /settings-center-recover-1\.0\.5/);
});

test('Settings recovery does not disturb an already mounted native center', async () => {
  const dom = boot(`<!doctype html><html><body><main id="main" data-settings-center-version="1.0.3">
    <div class="settings-center"><aside class="settings-nav"></aside><section class="settings-content"></section></div>
  </main></body></html>`);
  await settle();
  const main = dom.window.document.querySelector('#main');
  assert.equal(main.dataset.settingsCenterVersion, '1.0.3');
  assert.equal(main.dataset.settingsRecovery, undefined);
});

test('complete Settings navigation exposes every administration group and critical 0.8 modules', async () => {
  const groups = ['Ogólne','Tożsamość i dostęp','Zarządzanie usługami','Komunikacja','Integracje','Zasoby / CMDB','System'];
  const nav = groups.map(name => `<div class="settings-nav-group"><h3>${name}</h3></div>`).join('');
  const dom = boot(`<!doctype html><html><body><main id="main" data-settings-center-version="1.0.3">
    <span class="version-chip">Wersja 1.0.3</span><div class="settings-center"><aside class="settings-nav">${nav}</aside><section class="settings-content"></section></div>
  </main></body></html>`);
  await settle();
  const doc = dom.window.document;
  assert.equal(doc.querySelector('.version-chip').textContent, 'Wersja 1.0.5');
  const hrefs = [...doc.querySelectorAll('.settings-nav-link')].map(a => a.getAttribute('href'));
  for (const expected of [
    '/#/users','/#/directory','/#/admin/sso','/#/projects','/#/admin/templates',
    '/#/admin/mail','/#/admin/mail-templates','/#/admin/sync','/#/admin/knowledge',
    '/#/admin/api-tokens','/#/admin/webhooks','/#/settings?section=github',
    '/#/settings?section=plugins','/#/admin/assets','/#/settings?section=audit',
    '/#/admin/updates','/#/admin/events','/#/admin-settings'
  ]) assert.ok(hrefs.includes(expected), `missing Settings link ${expected}`);
});
