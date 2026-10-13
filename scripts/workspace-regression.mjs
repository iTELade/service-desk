import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { chromium, firefox, webkit } from 'playwright';
import { inspectTextContrast } from './visual-contrast.mjs';
const engine = process.env.DESK_BROWSER_ENGINE || 'chromium';
const dataDir = mkdtempSync(join(tmpdir(), 'desk21-browser-')),
  probe = createServer();
await new Promise((r) => probe.listen(0, '127.0.0.1', r));
const port = probe.address().port;
await new Promise((r) => probe.close(r));
const base = 'http://127.0.0.1:' + port;
const server = spawn(process.execPath, ['server.mjs'], {
  env: {
    ...process.env,
    NODE_ENV: 'test',
    APP_URL: base,
    HOST: '127.0.0.1',
    PORT: String(port),
    DATA_DIR: dataDir,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '',
  browser,
  count = 0;
server.stderr.on('data', (c) => (logs += c));
const check = (name, value) => {
  assert.ok(value, name);
  count++;
  console.log('PASS ' + name);
};
try {
  await new Promise((r, j) => {
    server.stdout.on('data', (c) => String(c).includes('porcie') && r());
    server.on('exit', () => j(Error(logs)));
    setTimeout(() => j(Error('Startup ' + logs)), 15000).unref();
  });
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
    errors = [];
  const setup = await context.request.post(base + '/api/setup', {
    headers: { Origin: base },
    data: {
      token: readFileSync(join(dataDir, 'setup-token'), 'utf8').trim(),
      company_name: 'Workspace QA',
      brand_name: 'Workspace QA',
      first_name: 'QA',
      last_name: 'Admin',
      email: 'workspace@x.test',
      password: 'Browser-workspace-2026',
    },
  });
  check('2.1 clean installation', setup.status() === 201);
  const login = await context.request.post(base + '/api/login', {
      headers: { Origin: base },
      data: { email: 'workspace@x.test', password: 'Browser-workspace-2026' },
    }),
    { csrf } = await login.json();
  const api = async (path, data, method = 'POST') => {
    const r = await context.request.fetch(base + '/api' + path, {
      method: data === undefined ? 'GET' : method,
      headers: { Origin: base, 'X-CSRF-Token': csrf },
      ...(data === undefined ? {} : { data }),
    });
    assert.ok(r.ok(), path + ' ' + (await r.text()));
    return r.json();
  };
  const settings = await api('/settings');
  await api('/settings', { ...settings, language: 'pl' }, 'PATCH');
  const p = await api('/projects', {
      key: 'WS',
      name: 'Workspace test service',
      project_type: 'external',
      portal_access: 'authenticated',
    }),
    t = await api('/tickets', {
      project_id: p.id,
      title: 'VPN connection failure',
      description: 'A synthetic issue for the full workspace regression.',
      priority: 'P2',
      type: 'incident',
    });
  const service = await api('/desk/v21/services', {
      project_id: p.id,
      name: 'Corporate VPN',
      description: 'Remote connectivity',
    }),
    dependency = await api('/desk/v21/services', { project_id: p.id, name: 'Directory service' });
  await api('/desk/v21/services/' + service.id + '/dependencies', { depends_on: dependency.id });
  const incident = await api('/desk/v21/cases', {
    project_id: p.id,
    kind: 'incident',
    title: 'Connectivity outage',
    summary: 'Synthetic incident',
    service_id: service.id,
  });
  await api('/desk/v21/cases/' + incident.id + '/tickets', { key: t.key });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') console.log('CONSOLE ' + m.text().slice(0, 180));
  });
  async function go(route) {
    await page.goto(base + '/#/' + route);
    await page.waitForFunction(
      (route) =>
        document.querySelector('#main')?.dataset.workspaceRoute === route &&
        document.querySelector('#main')?.dataset.workspaceReady === '1',
      route,
    );
    await page.waitForFunction(() => !document.querySelector('#main .loading'));
    await page.waitForTimeout(200);
    check(
      'Render 2.1 ' + route,
      !(await page.locator('#main').innerText()).includes('Nie udało się wczytać'),
    );
  }
  await go('queue?project=' + p.id);
  await page.locator('[data-preview="' + t.key + '"]').click();
  await page.waitForSelector('.w21-preview h2');
  check(
    'Split preview loads actual ticket',
    (await page.locator('.w21-preview h2').innerText()) === 'VPN connection failure',
  );
  await page.locator('[data-preview-close]').click();
  await page.locator('[data-inline-priority="' + t.key + '"]').selectOption('P1');
  await page.waitForTimeout(200);
  check('Inline priority persisted', (await api('/tickets/' + t.key)).ticket.priority === 'P1');
  await page.locator('[data-inline-status="' + t.key + '"]').selectOption('in_progress');
  await page.waitForTimeout(250);
  check('Inline status persisted', (await api('/tickets/' + t.key)).ticket.status === 'in_progress');
  await page.locator('[data-select-ticket="' + t.key + '"]').check();
  check('Bulk selection', (await page.locator('[data-selection-count]').innerText()) === '1');
  await page.locator('[data-favorite]').click();
  await page.locator('[data-w21-modal] [name=name]').fill('My urgent queue');
  await page.locator('[data-w21-modal] [type=submit]').click();
  await page.waitForTimeout(250);
  check(
    'Favorite saved to server',
    (await api('/desk/v21/preferences')).config.favorites.some((x) => x.name === 'My urgent queue'),
  );
  await go('ticket/' + t.key);
  await page.locator('[data-w21-composer] textarea[name=body]').fill('Public draft kept across navigation');
  await go('reports');
  await go('ticket/' + t.key);
  check(
    'Public draft restored',
    (await page.locator('[data-w21-composer] textarea[name=body]').inputValue()) ===
      'Public draft kept across navigation',
  );
  await page.locator('[data-w21-composer] [name=internal]').check();
  await page.locator('[data-w21-composer] textarea[name=body]').fill('Private investigation draft');
  await page.locator('[data-w21-composer] [name=internal]').uncheck();
  check(
    'Public/internal drafts separated',
    (await page.locator('[data-w21-composer] textarea[name=body]').inputValue()) ===
      'Public draft kept across navigation',
  );
  await page.locator('[data-w21-composer] [name=workflow_status]').selectOption('waiting');
  await page.locator('[data-w21-composer] [type=submit]').click();
  await page.waitForTimeout(350);
  let detail = await api('/tickets/' + t.key);
  check(
    'Send + status committed together',
    detail.ticket.status === 'waiting' &&
      detail.comments.some((c) => c.body === 'Public draft kept across navigation'),
  );
  await page.locator('[data-worklog]').click();
  await page.locator('[data-w21-modal] [name=minutes]').fill('25');
  await page.locator('[data-w21-modal] [name=body]').fill('Investigated VPN configuration');
  await page.locator('[data-w21-modal] [type=submit]').click();
  await page.waitForTimeout(300);
  check('Worklog persisted', (await api('/desk/v21/tickets/' + t.key)).worklogs[0].minutes === 25);
  await page.locator('[data-checklist-add] [name=label]').fill('Verify VPN fix');
  await page.locator('[data-checklist-add] button').click();
  await page.waitForSelector('[data-checklist]');
  await page.locator('[data-checklist]').check();
  await page.waitForTimeout(250);
  check('Checklist completion persisted', (await api('/desk/v21/tickets/' + t.key)).checklist[0].done === 1);
  await go('case/' + incident.id);
  await page.locator('[data-case-task-add] [name=label]').fill('Validate recovery');
  await page.locator('[data-case-task-add] button').click();
  await page.waitForSelector('[data-case-task]');
  check('Operational task persisted', (await api('/desk/v21/cases/' + incident.id)).tasks.length === 1);
  await page.locator('[data-case-message] [name=body]').fill('Incident update to linked customers');
  await page.locator('[data-case-message] [name=public]').check();
  await page.locator('[data-case-message] [type=submit]').click();
  await page.waitForTimeout(300);
  check(
    'Incident communication reaches ticket',
    (await api('/tickets/' + t.key)).comments.some((c) => c.body === 'Incident update to linked customers'),
  );
  await go('workflow/' + p.id);
  check('Workflow SVG nodes visible', (await page.locator('[data-wf-node]').count()) >= 5);
  await page.locator('[data-wf-node]').first().focus();
  const before = await page.locator('[data-wf-node]').first().getAttribute('transform');
  await page.keyboard.press('ArrowRight');
  check(
    'Workflow keyboard positioning',
    (await page.locator('[data-wf-node]').first().getAttribute('transform')) !== before,
  );
  await page.locator('[data-wf-status]').click();
  await page.locator('[data-w21-modal] [name=key]').fill('triage');
  await page.locator('[data-w21-modal] [name=name]').fill('Triage');
  await page.locator('[data-w21-modal] [type=submit]').click();
  await page.locator('[data-wf-port="open"]').focus();
  await page.keyboard.press('Enter');
  await page.locator('[data-wf-node="triage"]').focus();
  await page.keyboard.press('Enter');
  await page.locator('[data-w21-modal] [type=submit]').click();
  check(
    'Workflow keyboard connector creates edge',
    (await page.locator('[data-wf-edge][aria-label*="triage"]').count()) === 1,
  );
  await page.locator('[data-wf-save]').click();
  await page.waitForTimeout(200);
  check('Workflow draft saved', (await api('/desk/v21/workflow/' + p.id)).version > 0);
  await page.locator('[data-wf-publish]').click();
  await page.waitForTimeout(250);
  check('Workflow publication persisted', (await api('/desk/v21/workflow/' + p.id)).base_version > 1);
  await page.keyboard.press('Control+k');
  await page.waitForSelector('[data-command-search]');
  await page.locator('[data-command-search]').fill(t.key);
  await page.waitForTimeout(400);
  check(
    'Command palette finds accessible ticket',
    (await page.locator('[data-command-results]').innerText()).includes(t.key),
  );
  await page.keyboard.press('Escape');
  const similarTicket = await api('/tickets', {
    project_id: p.id,
    title: 'VPN connection failure',
    description: 'A related VPN request',
    priority: 'P3',
    type: 'incident',
  });
  const otherProject = await api('/projects', {
    key: 'SX',
    name: 'Assistance disabled project',
    project_type: 'external',
    portal_access: 'authenticated',
  });
  await go('assist/' + p.id);
  check('Assistance disabled by default', !(await page.locator('[name=similar]').isChecked()));
  for (const name of ['similar', 'attention', 'handover'])
    await page.locator('[data-assistance-settings] [name=' + name + ']').check();
  await page.locator('[data-assistance-settings] [type=submit]').click();
  await page.waitForTimeout(350);
  const assistance = await api('/desk/v21/assistance/' + p.id);
  check(
    'Project assistance settings saved',
    assistance.config.similar && assistance.config.handover && assistance.config.attention,
  );
  await go('ticket/' + t.key);
  check(
    'Similar ticket inspector shows actual accessible ticket',
    (await page.locator('#main').innerText()).includes(similarTicket.key),
  );
  await page.locator('[data-smart-link="' + similarTicket.key + '"]').click();
  await page.waitForTimeout(350);
  check(
    'Manual related link persisted',
    (await api('/tickets/' + t.key)).ticket.links.some((l) => l.key === similarTicket.key),
  );
  await page.locator('[data-handover]').click();
  check(
    'Handover contains ticket and worklog',
    (await page.locator('[data-handover-text]').inputValue()).includes(t.key) &&
      (await page.locator('[data-handover-text]').inputValue()).includes('25 min'),
  );
  await page.locator('[data-close-handover]').click();
  check(
    'Attention shows unassigned ticket',
    (await page.locator('.w21-attention').innerText()).includes('Brak opiekuna'),
  );
  await page.locator('.topbar [data-action=create]').click();
  check(
    'Create defaults to current ticket project',
    (await page.locator('[data-form=create-ticket] [name=project_id]').inputValue()) === String(p.id),
  );
  await page.locator('[data-form=create-ticket] [name=title]').fill('VPN connection failure');
  await page.waitForSelector('.w21-smart-create .w21-similar-item');
  check(
    'Create form shows similar existing tickets',
    (await page.locator('.w21-smart-create').innerText()).includes(t.key),
  );
  await page.locator('[data-form=create-ticket] [name=project_id]').selectOption(String(otherProject.id));
  check('Disabled project clears previous suggestions', await page.locator('.w21-smart-create').isHidden());
  await page.keyboard.press('Escape');
  const { user } = await api('/users', {
    first_name: 'QA',
    last_name: 'Customer',
    email: 'customer21@x.test',
    role: 'customer',
    password: 'Customer-browser-2026',
  });
  const clientContext = await browser.newContext(),
    clientLogin = await clientContext.request.post(base + '/api/login', {
      headers: { Origin: base },
      data: { email: 'customer21@x.test', password: 'Customer-browser-2026' },
    });
  check('Customer login', clientLogin.ok());
  const clientCsrf = (await clientLogin.json()).csrf;
  const ct = await api('/tickets', {
    project_id: p.id,
    title: 'Customer CSAT test',
    description: 'Customer CSAT regression',
    priority: 'P3',
    type: 'incident',
    reporter_id: user.id,
  });
  detail = await api('/tickets/' + ct.key);
  await api(
    '/tickets/' + ct.key,
    { version: detail.ticket.version, status: 'resolved', resolution_text: 'Fixed for QA' },
    'PATCH',
  );
  const clientPage = await clientContext.newPage();
  clientPage.on('pageerror', (e) => errors.push(e.message));
  await clientPage.goto(base + '/#/ticket/' + ct.key);
  await clientPage.waitForSelector('[data-csat]');
  await clientPage.locator('[data-csat] [name=rating]').selectOption('5');
  await clientPage.locator('[data-csat] [name=body]').fill('Excellent support');
  await clientPage.locator('[data-csat] [type=submit]').click();
  await clientPage.waitForTimeout(250);
  check('Customer CSAT persisted', (await api('/desk/v21/tickets/' + ct.key)).csat.rating === 5);
  check('Customer has no worklogs UI', (await clientPage.locator('[data-worklog]').count()) === 0);
  const denied = await clientContext.request.get(base + '/api/desk/v21/reports');
  check('Reports denied to customer', denied.status() === 403);
  await clientContext.close();
  const archivedTicket = await api('/tickets', {
    project_id: otherProject.id,
    title: 'Archived assistance ticket',
    description: 'Archive remains readable',
    priority: 'P3',
    type: 'incident',
  });
  const archivedConfig = await api('/desk/v21/assistance/' + otherProject.id, {
    version: (await api('/desk/v21/assistance/' + otherProject.id)).version,
    config: { similar: true, attention: true, handover: true, threshold: 35, stale_days: 3 },
  });
  await api('/projects/' + otherProject.id, { version: archivedConfig.version, archived: true }, 'PATCH');
  await page.reload();
  await go('ticket/' + archivedTicket.key);
  check(
    'Archived project ticket remains readable with assistance enabled',
    (await page.locator('[data-handover]').isVisible()) &&
      (await page.locator('[data-smart-link]').count()) === 0,
  );
  const routes = [
    'queue?project=' + p.id,
    'ticket/' + t.key,
    'reports',
    'cases?kind=incident',
    'cases?kind=problem',
    'cases?kind=change',
    'case/' + incident.id,
    'services',
    'service/' + service.id,
    'calendar',
    'workflow/' + p.id,
    'assist/' + p.id,
    'replies/' + p.id,
    'integrations',
    'portal',
  ];
  if (process.env.DESK_SCREENSHOTS) mkdirSync(process.env.DESK_SCREENSHOTS, { recursive: true });
  for (const width of [390, 768, 1280, 1440])
    for (const theme of ['light', 'dark']) {
      await api('/desk/profile/theme', { theme });
      await page.setViewportSize({ width, height: 1000 });
      await page.reload();
      for (const route of routes) {
        await go(route);
        await page.waitForFunction((theme) => document.documentElement.dataset.theme === theme, theme);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
        if (overflow)
          console.log(
            'OVERFLOW ' +
              JSON.stringify(
                await page.evaluate(() =>
                  [...document.querySelectorAll('body *')]
                    .filter(
                      (e) =>
                        e.getBoundingClientRect().right > innerWidth + 2 &&
                        getComputedStyle(e).position !== 'fixed',
                    )
                    .slice(0, 12)
                    .map((e) => ({
                      tag: e.tagName,
                      cls: e.className,
                      right: e.getBoundingClientRect().right,
                      width: e.getBoundingClientRect().width,
                    })),
                ),
              ),
          );
        check('2.1 no page overflow ' + width + ' ' + theme + ' ' + route, !overflow);
        check('No stuck loading state', (await page.locator('#main .loading').count()) === 0);
        const contrast = await page.evaluate(inspectTextContrast);
        if (contrast.length) console.log('THEME SURFACES ' + JSON.stringify(await page.evaluate(() => {
          const selectors = ['html', 'body', '.workspace', '.workspace-content', '.topbar', '#main', '.w21-queue-nav'];
          return selectors.map(selector => { const el = document.querySelector(selector); if (!el) return {selector}; const s = getComputedStyle(el); return {selector, classes: el.className, background: s.backgroundColor, surface: s.getPropertyValue('--w21-surface'), bg: s.getPropertyValue('--sd20-bg')}; });
        })));
        if (contrast.length) console.log('CONTRAST ' + JSON.stringify(contrast.slice(0, 12)));
        check('2.1 text contrast ' + width + ' ' + theme + ' ' + route, contrast.length === 0);
        if (width === 1440 && route.startsWith('queue?')) {
          await page.locator('.topbar [data-action=create]').hover();
          await page.waitForTimeout(180);
          const hoverContrast = await page.evaluate(inspectTextContrast);
          if(hoverContrast.length) console.log('HOVER CONTRAST '+JSON.stringify(hoverContrast.slice(0,12)));
          check('Topbar create hover contrast ' + theme, hoverContrast.length === 0);
          await page.mouse.move(0,0);
        }
        if (width === 1440 && process.env.DESK_SCREENSHOTS) {
          mkdirSync(join(process.env.DESK_SCREENSHOTS, theme), { recursive: true });
          await page.screenshot({
            path: join(process.env.DESK_SCREENSHOTS, theme, route.replaceAll(/[\/?=&]/g, '-') + '.png'),
            fullPage: true,
          });
        }
      }
    }
  check('No browser exceptions ' + JSON.stringify(errors), errors.length === 0);
  console.log('Workspace regression: ' + count + ' checks passed.');
} finally {
  await browser?.close();
  server.kill('SIGTERM');
  rmSync(dataDir, { recursive: true, force: true });
}
