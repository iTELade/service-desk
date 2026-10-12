// Real Service Desk + pinned standalone Knowledge Base, isolated temporary data.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { networkInterfaces } from 'node:os';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium, firefox, webkit } from 'playwright';
import { allowedAddress } from '../lib/webhooks.mjs';
import { inspectTextContrast } from './visual-contrast.mjs';
const source = resolve(process.env.DESK_KB_SOURCE || 'fixtures/knowledge-base');
assert.ok(
  existsSync(join(source, 'server.mjs')),
  'Provide the standalone Knowledge Base checkout through DESK_KB_SOURCE',
);
let address;
try {
  address = Object.values(networkInterfaces())
    .flat()
    .find(
      (a) =>
        a.family === 'IPv4' &&
        !a.internal &&
        allowedAddress(a.address, true) &&
        !allowedAddress(a.address, false),
    )?.address;
} catch {}
async function port() {
  const s = createServer();
  await new Promise((r) => s.listen(0, '0.0.0.0', r));
  const p = s.address().port;
  await new Promise((r) => s.close(r));
  return p;
}
const dir = mkdtempSync(join(tmpdir(), 'desk-kb-regression-')),
  children = [];
let browser,
  count = 0,
  logs = '';
const check = (name, value) => {
  assert.ok(value, name);
  count++;
  console.log('PASS ' + name);
};
async function start(cwd, args, env, url) {
  const child = spawn(process.execPath, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);
  child.stderr.on('data', (d) => (logs += d));
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(url + '/healthz')).ok) return child;
    } catch {}
    if (child.exitCode !== null) throw Error('Server failed: ' + logs);
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error('Startup timed out: ' + logs);
}
try {
  const kp = await port(),
    kb = 'http://' + (address || '127.0.0.1') + ':' + kp,
    provider = address ? kb : 'http://kb.test.invalid:' + kp;
  const kbChild = await start(
    source,
    ['server.mjs'],
    { PORT: String(kp), KB_DATA_DIR: join(dir, 'kb'), KB_SECURE_COOKIE: 'false' },
    kb,
  );
  const dp = await port(),
    desk = 'http://127.0.0.1:' + dp;
  const args = ['server.mjs'];
  if (!address) {
    // Test-only socket adapter for restricted local runtimes with only loopback.
    // The production transport still vets and pins 10.99.0.2; only this test child
    // maps its socket to the real standalone KB on loopback. No application flag.
    const hook = join(dir, 'network-test-adapter.mjs');
    writeFileSync(
      hook,
      `import dns from 'node:dns';import http from 'node:http';import {syncBuiltinESMExports} from 'node:module';
const lookup=dns.promises.lookup.bind(dns.promises);dns.promises.lookup=async(host,opts)=>host==='kb.test.invalid'?[{address:'10.99.0.2',family:4}]:lookup(host,opts);
const request=http.request.bind(http);http.request=(url,opts,done)=>{if(new URL(url).hostname==='kb.test.invalid'){const pin=opts.lookup;opts={...opts,lookup:(host,options,callback)=>pin(host,options,(err,selected,family)=>{if(err)return callback(err);const answer=options.all?selected[0].address:selected;if(answer!=='10.99.0.2')throw Error('Unvetted test address');return options.all?callback(null,[{address:'127.0.0.1',family:4}]):callback(null,'127.0.0.1',4);})};}return request(url,opts,done);};syncBuiltinESMExports();`,
    );
    args.unshift('--import', hook);
    console.log(
      'Local test-only socket adapter; real KB process and bearer API. CI uses private networking when available.',
    );
  }
  await start(
    process.cwd(),
    args,
    { PORT: String(dp), HOST: '127.0.0.1', APP_URL: desk, DATA_DIR: join(dir, 'desk'), NODE_ENV: 'test' },
    desk,
  );
  const engine = process.env.DESK_BROWSER_ENGINE || 'chromium';
  browser = await { chromium, firefox, webkit }[engine].launch({
    headless: true,
    ...(process.env.DESK_BROWSER_EXECUTABLE && engine === 'chromium'
      ? {
          executablePath: process.env.DESK_BROWSER_EXECUTABLE,
          args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--disable-software-rasterizer'],
        }
      : {}),
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }),
    kc = await browser.newContext();
  const ks = await kc.request.post(kb + '/api/setup', {
    data: { name: 'KB QA', email: 'kb@x.test', password: 'Knowledge-regression-2026' },
  });
  check('Real KB installation', ks.status() === 201);
  const kcsrf = (await ks.json()).csrf;
  const kapi = async (path, data, method = 'POST') => {
    const r = await kc.request.fetch(kb + path, {
      method: data === undefined ? 'GET' : method,
      headers: { 'X-CSRF-Token': kcsrf },
      ...(data === undefined ? {} : { data }),
    });
    assert.ok(r.ok(), path + ' ' + (await r.text()));
    return r.json();
  };
  const pub = (await kapi('/api/spaces', { key: 'PUB', name: 'Public help', visibility: 'public' })).space;
  const priv = (
    await kapi('/api/spaces', { key: 'OPS', name: 'Internal operations', visibility: 'internal' })
  ).space;
  const publish = async (space, title, content, visibility) => {
    const p = (
      await kapi('/api/pages', {
        spaceId: space.id,
        title,
        content,
        summary: 'QA integration article',
        language: 'pl',
        visibility,
      })
    ).page;
    return (await kapi('/api/pages/' + p.id + '/publish', {})).page;
  };
  const publicPage = await publish(
    pub,
    'VPN access recovery',
    '# VPN\n\nVPN connection failure recovery. <script>window.kbInjected=true</script>',
    'public',
  );
  const internalPage = await publish(
    priv,
    'VPN admin procedure',
    'Internal-only-marker: reset VPN gateway credentials.',
    'internal',
  );
  const mixedPage = await publish(
    priv,
    'VPN private space exposure',
    'Must remain unavailable anonymously.',
    'public',
  );
  const bodyPage = await publish(
    pub,
    'Recovery procedure',
    'Wireguard handshake unavailable: approved diagnostic steps.',
    'public',
  );
  const created = await kapi('/api/admin/tokens', {
    name: 'Desk integration QA',
    scopes: ['health', 'search', 'read'],
    visibilities: ['internal'],
  });
  const setup = await context.request.post(desk + '/api/setup', {
    headers: { Origin: desk },
    data: {
      token: readFileSync(join(dir, 'desk', 'setup-token'), 'utf8').trim(),
      company_name: 'KB QA',
      brand_name: 'KB QA',
      first_name: 'QA',
      last_name: 'Admin',
      email: 'desk@x.test',
      password: 'Desk-knowledge-2026',
    },
  });
  check('Real Desk installation', setup.status() === 201);
  const login = await context.request.post(desk + '/api/login', {
      headers: { Origin: desk },
      data: { email: 'desk@x.test', password: 'Desk-knowledge-2026' },
    }),
    { csrf } = await login.json();
  const api = async (path, data, method = 'POST') => {
    const r = await context.request.fetch(desk + '/api' + path, {
      method: data === undefined ? 'GET' : method,
      headers: { Origin: desk, 'X-CSRF-Token': csrf },
      ...(data === undefined ? {} : { data }),
    });
    assert.ok(r.ok(), path + ' ' + (await r.text()));
    return r.json();
  };
  const settings = await api('/settings');
  await api('/settings', { ...settings, language: 'pl' }, 'PATCH');
  const p = await api('/projects', {
      key: 'KA',
      name: 'Knowledge integration QA',
      project_type: 'external',
      portal_access: 'authenticated',
    }),
    t = await api('/tickets', {
      project_id: p.id,
      title: 'Remote access unavailable',
      description: 'VPN connection failure. Need account reset.',
      type: 'incident',
      priority: 'P3',
    });
  const page = await context.newPage(),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  async function go(route) {
    const target = desk + '/#/' + route;
    if (page.url() !== target) {
      if (page.url().startsWith(desk + '/'))
        await page.evaluate((hash) => {
          location.hash = hash;
        }, '#/' + route);
      else await page.goto(target);
    }
    await page.waitForFunction(
      (r) =>
        document.querySelector('#main')?.dataset.workspaceRoute === r &&
        document.querySelector('#main')?.dataset.workspaceReady === '1',
      route,
    );
  }
  await go('admin/knowledge');
  const form = page.locator('[data-v7=knowledge]');
  await form.locator('[name=base_url]').fill(provider);
  await form.locator('[name=public_url]').fill('https://knowledge.example.test');
  await form.locator('[name=token]').fill(created.secret);
  await form.locator('[name=enabled]').check();
  await form.locator('[name=allow_private]').check();
  await form.locator('[name=space_ids]').fill(pub.id + ', ' + priv.id);
  await form.locator('[type=submit]').click();
  await page.waitForTimeout(250);
  let cfg = await api('/desk/knowledge');
  check(
    'Existing Settings KB integration saves encrypted token',
    cfg.has_token && cfg.enabled && !JSON.stringify(cfg).includes(created.secret),
  );
  await page.locator('[data-kb-test]').click();
  await page.waitForFunction(
    () => document.querySelector('[data-kb-test]') && !document.querySelector('[data-kb-test]').disabled,
  );
  const tested = await api('/desk/knowledge');
  if (!tested.last_health?.ok) console.log('KB TEST FAILURE ' + tested.last_health?.message);
  check('Real health/search/read handshake in Settings', tested.last_health?.ok === true);
  await go('ticket/' + t.key);
  await page.waitForSelector('[data-kb-results] [data-kb-open]');
  check(
    'Agent gets automatic suggestions from real KB',
    (await page.locator('[data-kb-results]').innerText()).includes(publicPage.title),
  );
  await page.locator('[data-kb-results] [data-kb-open="' + publicPage.id + '"]').click();
  await page.waitForSelector('.w21-kb-content');
  check(
    'Remote Markdown safely previewed without HTML execution',
    (await page.locator('.w21-kb-content script').count()) === 0 &&
      (await page.evaluate(() => window.kbInjected === undefined)),
  );
  await page.locator('[data-kb-pin]').click();
  await page.waitForSelector('[data-kb-links] [data-kb-open="' + publicPage.id + '"]');
  check(
    'Stable external page reference persisted',
    (await api('/desk/knowledge/tickets/' + t.key + '/links')).links[0].article.id === publicPage.id,
  );
  await page.locator('[data-kb-links] [data-kb-open]').first().click();
  await page.waitForSelector('[data-kb-insert]');
  await page.locator('[data-kb-insert]').click();
  await page.waitForFunction(() => !document.querySelector('#modal').open);
  check(
    'Public article inserts only a draft link',
    (await page.locator('[data-w21-composer] [name=body]').inputValue()).includes('/#/page/' + publicPage.id),
  );
  check('Article insertion does not send a comment', (await api('/tickets/' + t.key)).comments.length === 0);
  await page.locator('[data-kb-results] [data-kb-open="' + mixedPage.id + '"]').click();
  await page.waitForSelector('[data-kb-insert]');
  await page.locator('[data-kb-insert]').click();
  await page.waitForFunction(() =>
    document.querySelector('[data-kb-modal-status]')?.textContent.includes('nie jest dostępny publicznie'),
  );
  check(
    'Public page inside internal space cannot enter public draft',
    !(await page.locator('[data-w21-composer] [name=body]').inputValue()).includes(mixedPage.title),
  );
  await page.locator('[data-kb-close]').click();
  await page.locator('[data-w21-composer] [name=internal]').check();
  await page.locator('[data-kb-results] [data-kb-open="' + internalPage.id + '"]').click();
  await page.waitForSelector('[data-kb-insert]');
  await page.locator('[data-kb-insert]').click();
  await page.waitForFunction(() => !document.querySelector('#modal').open);
  check(
    'Private article can enter internal draft',
    (await page.locator('[data-w21-composer] [name=body]').inputValue()).includes(internalPage.title),
  );
  await page.locator('[data-w21-composer] [name=internal]').uncheck();
  check(
    'Internal KB draft remains separate from public draft',
    !(await page.locator('[data-w21-composer] [name=body]').inputValue()).includes(internalPage.title),
  );
  const bodyTicket = await api('/tickets', {
    project_id: p.id,
    title: 'Generic issue',
    description: 'Wireguard handshake unavailable',
    type: 'incident',
    priority: 'P3',
  });
  const fromBody = await api('/desk/knowledge/search', { ticket_key: bodyTicket.key, suggest: true });
  check(
    'Description-only matching reaches KB article content',
    fromBody.results.some((r) => r.id === bodyPage.id),
  );
  for (const theme of ['light', 'dark']) {
    await api('/desk/profile/theme', { theme });
    await page.reload();
    await go('ticket/' + t.key);
    await page.waitForSelector('[data-kb-results] [data-kb-open]');
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.waitForTimeout(180);
      await page.evaluate(async () => {
        await document.fonts.ready;
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
      if (overflow)
        console.log(
          'KB OVERFLOW ' +
            JSON.stringify(
              await page.evaluate(() => ({
                viewport: innerWidth,
                scroll: document.documentElement.scrollWidth,
                elements: [...document.querySelectorAll('body *')]
                  .filter(
                    (e) =>
                      e.getBoundingClientRect().right > innerWidth + 2 &&
                      getComputedStyle(e).position !== 'fixed',
                  )
                  .slice(0, 15)
                  .map((e) => ({
                    tag: e.tagName,
                    cls: e.className,
                    right: e.getBoundingClientRect().right,
                    width: e.getBoundingClientRect().width,
                    text: e.textContent.slice(0, 100),
                  })),
              })),
            ),
        );
      check('KB panel overflow ' + theme + ' ' + width, !overflow);
      const contrast = await page.evaluate(inspectTextContrast);
      if (contrast.length) console.log('KB CONTRAST ' + JSON.stringify(contrast.slice(0, 10)));
      check('KB panel contrast ' + theme + ' ' + width, contrast.length === 0);
    }
  }
  const { user } = await api('/users', {
    first_name: 'Client',
    last_name: 'QA',
    email: 'kb-client@x.test',
    role: 'customer',
    password: 'Knowledge-client-2026',
  });
  const client = await browser.newContext();
  const cl = await client.request.post(desk + '/api/login', {
    headers: { Origin: desk },
    data: { email: user.email, password: 'Knowledge-client-2026' },
  });
  const clientCsrf = (await cl.json()).csrf;
  const denied = await client.request.post(desk + '/api/desk/knowledge/search', {
    headers: { Origin: desk, 'X-CSRF-Token': clientCsrf },
    data: { project_id: p.id, q: 'VPN' },
  });
  check('Clients cannot consume privileged KB token', denied.status() === 404);
  await kapi('/api/admin/tokens/' + created.token.id + '/revoke', {});
  const revoked = await api('/desk/knowledge/tickets/' + t.key + '/links');
  check(
    'Revoked token hides previously linked article metadata',
    revoked.links[0].unavailable === true && revoked.links[0].article === undefined,
  );
  await page.locator('.topbar [data-action=refresh]').click();
  await page.waitForFunction(() =>
    document.querySelector('[data-kb-state]')?.textContent.includes('chwilowo niedostępna'),
  );
  check(
    'KB failure leaves ticket operational',
    (await page.locator('[data-w21-composer] [name=body]').isVisible()) &&
      !(await page.locator('#main').innerText()).includes('Nie udało się wczytać widoku'),
  );
  check(
    'Failed KB search clears old suggestions',
    (await page.locator('[data-kb-results] [data-kb-open]').count()) === 0,
  );
  const health = await api('/desk/knowledge/test', {});
  check('Revoked token fails connection check', health.ok === false);
  check('No browser runtime exceptions ' + JSON.stringify(errors), errors.length === 0);
  await client.close();
  await kc.close();
  console.log('Knowledge integration regression ' + engine + ': ' + count + ' checks passed.');
} finally {
  await browser?.close();
  for (const c of children) {
    if (c.exitCode === null) {
      c.kill('SIGTERM');
      await new Promise((r) => {
        c.once('exit', r);
        setTimeout(() => {
          c.kill('SIGKILL');
          r();
        }, 2000).unref();
      });
    }
  }
  rmSync(dir, { recursive: true, force: true });
}
