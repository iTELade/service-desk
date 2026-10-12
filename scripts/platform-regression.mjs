import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { chromium, firefox, webkit } from 'playwright';

const dataDir = mkdtempSync(join(tmpdir(), 'desk22-platform-')), probe = createServer();
await new Promise(r => probe.listen(0, '127.0.0.1', r)); const port = probe.address().port; await new Promise(r => probe.close(r));
const base = 'http://127.0.0.1:' + port, engine = process.env.DESK_BROWSER_ENGINE || 'chromium';
const server = spawn(process.execPath, ['server.mjs'], { env: { ...process.env, NODE_ENV: 'test', APP_URL: base, HOST: '127.0.0.1', PORT: String(port), DATA_DIR: dataDir }, stdio: ['ignore', 'pipe', 'pipe'] });
let logs = '', browser, count = 0; const errors = [];
server.stderr.on('data', c => logs += c);
const check = (name, value) => { assert.ok(value, name); console.log('PASS ' + name); count++; };
try {
  await new Promise((r, j) => { server.stdout.on('data', c => String(c).includes('porcie') && r()); server.once('exit', () => j(Error(logs))); setTimeout(() => j(Error('Startup ' + logs)), 15000).unref(); });
  browser = await ({ chromium, firefox, webkit }[engine]).launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const password = 'Platform-test-password-2026';
  await context.request.post(base + '/api/setup', { headers: { Origin: base }, data: { token: readFileSync(join(dataDir, 'setup-token'), 'utf8').trim(), company_name: 'QA', brand_name: 'QA', first_name: 'QA', last_name: 'Admin', email: 'platform@x.test', password } });
  const login = await context.request.post(base + '/api/login', { headers: { Origin: base }, data: { email: 'platform@x.test', password } }); check('Login', login.ok()); const { csrf } = await login.json();
  const api = async (path, data, method='POST') => { const r = await context.request.fetch(base + '/api' + path, { method: data ? method : 'GET', headers: { Origin: base, 'X-CSRF-Token': csrf }, ...(data ? { data } : {}) }); assert.ok(r.ok(), path + ': ' + await r.text()); return r.json(); };
  const settings=await api('/settings');await api('/settings',{...settings,language:'pl'},'PATCH');
  const page = await context.newPage(); page.on('pageerror', err => errors.push(err.message));
  await page.goto(base + '/#/blueprints22'); await page.getByRole('heading', { name: 'Szablony i drafty projektów', exact: true }).waitFor();
  check('Built-in project templates', await page.getByRole('heading', { name: 'HR + IT', exact: true }).count() === 1);
  await page.locator('.template-grid > section').filter({ has: page.getByRole('heading', { name: 'HR + IT', exact: true }) }).getByRole('button', { name: 'Utwórz draft', exact: true }).click();
  await page.locator('dialog input[name=name]').fill('QA HR IT'); await page.locator('dialog button[type=submit]').click();
  await page.getByRole('button', { name: 'Podgląd i aktywacja' }).waitFor();
  check('Draft has no tickets', (await api('/tickets')).total === 0);
  await page.getByRole('button', { name: 'Podgląd i aktywacja' }).click(); await page.getByRole('button', { name: 'Sprawdź podgląd' }).click(); await page.getByRole('button', { name: 'Aktywuj projekty' }).waitFor();
  check('Preview creates no projects', (await api('/projects')).length === 0);
  await page.getByRole('button', { name: 'Aktywuj projekty' }).click(); await page.locator('dialog').waitFor({ state: 'hidden' });
  const projects = await api('/projects'); check('Package created two projects', projects.length === 2); check('Synchronization configured', (await api('/desk/sync')).length === 1);
  const p = projects.find(p => p.key === 'HR');
  for (const [path, title] of [['plugins22', 'Pluginy zewnętrzne'], ['jobs22', 'Zaplanowane zadania'], ['operations22?project=' + p.id, 'Procesy i spójność projektu'], ['preferences22', 'Powiadomienia i zastępstwa'], ['recycle22', 'Kosz'], ['reports22', 'Raporty okresowe']]) {
    await page.goto(base + '/#/' + path); await page.getByRole('heading', { name: title, exact: true }).waitFor(); check('Route ' + path, true);
  }
  const forms = await api('/projects/' + p.id + '/request-types?surface=manage'), form = forms.find(f => f.enabled);
  const t = await api('/tickets', { project_id: p.id, title: 'Platform flow', description: 'Synthetic process test', request_type_id: form.id, request_type_version: form.version, type: 'request' });
  await page.goto(base + '/#/ticket/' + t.key); await page.getByRole('heading', { name: 'Następny krok', exact: true }).waitFor();
  check('Diagnostics action', await page.getByRole('button', { name: 'Dlaczego?', exact: true }).count() === 1);
  await page.getByRole('button', { name: 'Dlaczego?', exact: true }).click(); await page.locator('dialog').getByRole('heading', { name: 'Dlaczego?', exact: true }).waitFor(); check('Diagnostic dialog', true); await page.keyboard.press('Escape');
  // Passkey registration and login use actual browser-generated cryptographic credentials.
  // This is a virtual authenticator, not evidence of physical iPhone/hybrid interoperability.
  if (engine === 'chromium') {
    const cdp = await context.newCDPSession(page); await cdp.send('WebAuthn.enable');
    await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', ctap2Version: 'ctap2_1', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
    await api('/passkeys/reauth', { password });
    const registered = await page.evaluate(async () => {
      const session = window.DeskSession(), post = async (path, data = {}) => { const r = await fetch('/api/passkeys/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrf }, body: JSON.stringify(data) }); const b = await r.json(); if (!r.ok) throw Error(b.error); return b; };
      const encode = b => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''), decode = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), c => c.charCodeAt(0));
      const p = await post('register-options'), o = p.publicKey; o.challenge = decode(o.challenge); o.user.id = decode(o.user.id); o.excludeCredentials = o.excludeCredentials.map(c => ({ ...c, id: decode(c.id) }));
      const c = await navigator.credentials.create({ publicKey: o });
      await post('register', { token: p.token, name: 'Virtual platform key', credential: { id: c.id, rawId: encode(c.rawId), type: c.type, clientExtensionResults: c.getClientExtensionResults(), response: { clientDataJSON: encode(c.response.clientDataJSON), attestationObject: encode(c.response.attestationObject), transports: c.response.getTransports() } } }); return true;
    }); check('Virtual passkey registration', registered);
    await api('/logout', {}); await page.goto(base + '/#/login'); await page.getByRole('button', { name: /Zaloguj kluczem dostępu/ }).click(); await page.waitForURL(/#\/queue/); await page.waitForFunction(() => Boolean(window.DeskSession?.()?.user)); check('Virtual passkey passwordless login', true);
  }
  check('No browser exceptions', errors.length === 0); console.log(JSON.stringify({ engine, checks: count, physical_iphone_verified: false }));
} finally { await browser?.close(); server.kill('SIGTERM'); rmSync(dataDir, { recursive: true, force: true }); }
