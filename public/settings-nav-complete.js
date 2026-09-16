const SETTINGS_NAV_VERSION = '1.3.2';

const DIRECT_SETTINGS_LINKS = {
  'Ogólne': [
    ['Organizacja i rejestracja', '/#/settings?section=general'],
    ['Wygląd i marka', '/#/settings?section=branding']
  ],
  'Tożsamość i dostęp': [
    ['Użytkownicy', '/#/users'],
    ['Katalog LDAP / Active Directory', '/#/directory'],
    ['Logowanie SSO / OIDC', '/#/admin/sso'],
    ['MFA i moje konto', '/#/profile'],
    ['Wnioski o zmiany profilu', '/#/admin/approvals']
  ],
  'Zarządzanie usługami': [
    ['Projekty', '/#/projects'],
    ['Szablony workflow i statusów', '/#/admin/templates'],
    ['Firmy i grupy klientów', '/#/admin/organizations'],
    ['Zatwierdzenia obiegu', '/#/settings?section=approvals']
  ],
  'Komunikacja': [
    ['Domyślna poczta SMTP i kolejka', '/#/settings?section=communication'],
    ['Skrzynki zespołów · IMAP i SMTP', '/#/admin/mail'],
    ['Szablony powiadomień e-mail', '/#/admin/mail-templates']
  ],
  'Integracje': [
    ['Przegląd integracji', '/#/settings?section=integrations'],
    ['Synchronizacja projektów', '/#/admin/sync'],
    ['GitHub Issues', '/#/settings?section=github'],
    ['Webhooki', '/#/admin/webhooks'],
    ['Baza wiedzy', '/#/admin/knowledge'],
    ['Tokeny API', '/#/admin/api-tokens'],
    ['Wtyczki', '/#/settings?section=plugins']
  ],
  'Zasoby / CMDB': [
    ['Przegląd zasobów / CMDB', '/#/settings?section=assets'],
    ['Katalog środków trwałych', '/#/admin/assets']
  ],
  'System': [
    ['Diagnostyka i utrzymanie', '/#/settings?section=system'],
    ['Audyt', '/#/settings?section=audit'],
    ['Wersja i aktualizacje', '/#/admin/updates'],
    ['Błędy modułów', '/#/admin/events'],
    ['Zaawansowane ustawienia systemu', '/#/admin-settings']
  ]
};

function isSettingsRoute() {
  return location.hash === '#/settings' || location.hash.startsWith('#/settings?');
}

function settingsCenterPresent(main = document.querySelector('#main')) {
  return Boolean(main?.querySelector('.settings-center'));
}

function looksLikeLegacySettings(main = document.querySelector('#main')) {
  if (!main) return false;
  return Boolean(
    main.querySelector('[data-form="settings"]') ||
    main.querySelector('[data-v6="smtp"]') ||
    main.textContent?.includes('Organizacja i rejestracja') ||
    main.textContent?.includes('Domyślna poczta SMTP')
  );
}

function recoverSettingsCenter() {
  if (!isSettingsRoute()) return;
  const main = document.querySelector('#main');
  if (!main || settingsCenterPresent(main) || !looksLikeLegacySettings(main)) return;
  if (main.dataset.settingsRecovery === SETTINGS_NAV_VERSION) return;
  delete main.dataset.settingsCenterVersion;
  main.dataset.settingsRecovery = SETTINGS_NAV_VERSION;
  main.append(document.createComment(`settings-center-recover-${SETTINGS_NAV_VERSION}`));
}

function completeSettingsNavigation() {
  if (!isSettingsRoute()) return;
  const main = document.querySelector('#main');
  const nav = document.querySelector('.settings-nav');
  const version = document.querySelector('.version-chip');
  const versionLabel = `Wersja ${SETTINGS_NAV_VERSION}`;
  if (version && version.textContent !== versionLabel) version.textContent = versionLabel;
  if (!nav) {
    recoverSettingsCenter();
    return;
  }
  if (main?.dataset.settingsRecovery) delete main.dataset.settingsRecovery;

  for (const group of nav.querySelectorAll('.settings-nav-group')) {
    const title = group.querySelector('h3')?.textContent?.replace(/^[^A-Za-zĄĆĘŁŃÓŚŹŻ]+/,'')?.trim();
    const links = DIRECT_SETTINGS_LINKS[title];
    if (!links) continue;
    const labels = new Set([...group.querySelectorAll('button')].map(button => button.textContent.trim()));
    for (const [label, href] of links) {
      if (labels.has(label) || group.querySelector(`a[href="${href}"]`)) continue;
      const link = document.createElement('a');
      link.className = 'settings-nav-link';
      link.href = href;
      link.textContent = label;
      group.append(link);
    }
  }
}

function currentRoute() {
  return location.hash.split('?')[0] || '#/';
}

function forceLightTheme() {
  const root = document.documentElement;
  if (root.dataset.theme !== 'light') root.dataset.theme = 'light';
  root.style.colorScheme = 'light';

  for (const select of document.querySelectorAll('select')) {
    if (select.dataset.sd132LightNormalized === '1') continue;
    const values = [...select.options].map(option => String(option.value || '').toLowerCase());
    if (!values.includes('light') || (!values.includes('dark') && !values.includes('system'))) continue;
    select.dataset.sd132LightNormalized = '1';
    select.value = 'light';
    for (const option of [...select.options]) {
      if (String(option.value).toLowerCase() !== 'light') option.remove();
    }
    if (select.options[0]) select.options[0].textContent = 'Jasny';
  }
  for (const input of document.querySelectorAll('input[type="radio"]')) {
    if (!['dark','system'].includes(String(input.value || '').toLowerCase())) continue;
    const label = input.closest('label');
    if (label) label.hidden = true; else input.hidden = true;
  }
}

function keepNewest(nodes) {
  if (!nodes.length) return null;
  const keep = nodes[nodes.length - 1];
  for (const node of nodes.slice(0, -1)) node.remove();
  return keep;
}

let queueSnapshotHTML = '';
let queueSnapshotHeight = 0;

function clearQueueGhost() {
  document.querySelector('.sd132-queue-ghost')?.remove();
  const main = document.querySelector('#main');
  if (main) {
    main.classList.remove('sd132-queue-loading');
    main.style.removeProperty('min-height');
  }
}

function sanitizeQueueGhost(ghost) {
  ghost.setAttribute('aria-hidden', 'true');
  for (const node of ghost.querySelectorAll('*')) {
    node.removeAttribute('id');
    for (const attr of [...node.attributes]) {
      if (attr.name.startsWith('data-')) node.removeAttribute(attr.name);
    }
    if (/^(A|BUTTON|INPUT|SELECT|TEXTAREA|SUMMARY)$/.test(node.tagName)) node.tabIndex = -1;
  }
}

function showQueueGhost(main) {
  if (!queueSnapshotHTML || document.querySelector('.sd132-queue-ghost')) return;
  const host = main.closest('.workspace-content');
  if (!host) return;
  const ghost = document.createElement('div');
  ghost.className = 'sd132-queue-ghost';
  ghost.innerHTML = queueSnapshotHTML;
  sanitizeQueueGhost(ghost);
  host.append(ghost);
  ghost.style.left = `${main.offsetLeft}px`;
  ghost.style.top = `${main.offsetTop}px`;
  ghost.style.width = `${main.offsetWidth}px`;
  ghost.style.minHeight = `${Math.max(1, queueSnapshotHeight)}px`;
  main.style.minHeight = `${Math.max(1, queueSnapshotHeight)}px`;
  main.classList.add('sd132-queue-loading');
}

function captureQueueSnapshot(main) {
  if (!main || main.querySelector('.loading') || !main.querySelector('table')) return;
  queueSnapshotHTML = main.innerHTML;
  queueSnapshotHeight = main.getBoundingClientRect().height;
}

function repairQueueSurface() {
  if (currentRoute() !== '#/queue') {
    clearQueueGhost();
    queueSnapshotHTML = '';
    queueSnapshotHeight = 0;
    return;
  }
  const main = document.querySelector('#main');
  if (!main) return;
  if (main.querySelector('.loading')) {
    showQueueGhost(main);
    return;
  }

  clearQueueGhost();
  main.classList.add('sd13-queue', 'sd131-queue', 'sd132-queue');
  document.documentElement.dataset.deskUi = SETTINGS_NAV_VERSION;
  main.querySelectorAll('.r113-page-help,.r113-metric-icon').forEach(node => node.remove());

  const heading = main.querySelector('.page-heading');
  const metrics = main.querySelector('.metrics');
  const tabs = main.querySelector('.tabs');
  const filters = main.querySelector('form.filters');
  const panel = [...main.querySelectorAll('.panel')].find(node => node.querySelector('table'));
  if (!heading || !metrics || !tabs || !filters || !panel) return;

  let hero = main.querySelector('.sd13-queue-hero');
  if (!hero) {
    hero = document.createElement('section');
    hero.className = 'sd13-queue-hero';
    main.insertBefore(hero, metrics);
  }
  if (heading.parentElement !== hero) hero.append(heading);

  const title = heading.querySelector('h1');
  if (title && !heading.querySelector('.sd13-queue-subtitle')) {
    const subtitle = document.createElement('p');
    subtitle.className = 'sd13-queue-subtitle';
    subtitle.textContent = 'Przeglądaj, filtruj i obsługuj zgłoszenia w jednym czytelnym widoku.';
    title.after(subtitle);
  }

  let workspace = main.querySelector('.sd13-queue-workspace');
  if (!workspace) {
    workspace = document.createElement('section');
    workspace.className = 'sd13-queue-workspace';
    workspace.setAttribute('aria-label', 'Kolejka zgłoszeń');
    metrics.after(workspace);
  }
  if (tabs.parentElement !== workspace) workspace.append(tabs);

  let viewSettings = workspace.querySelector('.sd131-view-settings');
  if (!viewSettings) {
    viewSettings = document.createElement('details');
    viewSettings.className = 'sd131-view-settings';
    viewSettings.innerHTML = '<summary>Widok i sortowanie</summary><div class="sd131-view-settings-body"></div>';
    tabs.after(viewSettings);
  }

  const tools = keepNewest([...main.querySelectorAll('[data-r112-queue-tools]')]);
  if (tools) {
    const body = viewSettings.querySelector('.sd131-view-settings-body');
    if (tools.parentElement !== body) body.append(tools);
  }

  main.querySelectorAll('.sd13-queue-preferences-slot').forEach(slot => {
    if (!slot.children.length) slot.remove();
  });

  if (filters.parentElement !== workspace) workspace.append(filters);
  if (panel.parentElement !== workspace) workspace.append(panel);
  panel.classList.add('sd13-queue-table');

  const directWorkspaces = [...main.children].filter(node => node.classList?.contains('sd13-queue-workspace'));
  for (const duplicate of directWorkspaces.slice(1)) {
    while (duplicate.firstChild) directWorkspaces[0].append(duplicate.firstChild);
    duplicate.remove();
  }

  captureQueueSnapshot(main);
}

function repairTicketSurface() {
  if (!currentRoute().startsWith('#/ticket/')) return;
  const main = document.querySelector('#main');
  if (!main || main.querySelector('.loading')) return;
  const layout = main.querySelector('.ticket-layout');
  const heading = main.querySelector('.page-heading');
  if (!layout || !heading) return;

  main.classList.add('sd13-ticket', 'sd131-ticket', 'sd132-ticket');
  document.documentElement.dataset.deskUi = SETTINGS_NAV_VERSION;

  let header = main.querySelector('.sd13-ticket-header');
  if (!header) {
    header = document.createElement('section');
    header.className = 'sd13-ticket-header';
    main.insertBefore(header, layout);
  }

  const breadcrumb = main.querySelector('.breadcrumb');
  const current = main.querySelector('.ticket-current-status');
  const transitions = main.querySelector('.transition-bar');
  const tools = main.querySelector('.ticket-tools');
  if (breadcrumb && breadcrumb.parentElement !== header) header.append(breadcrumb);

  let titleRow = header.querySelector('.sd13-ticket-title-row');
  if (!titleRow) {
    titleRow = document.createElement('div');
    titleRow.className = 'sd13-ticket-title-row';
    if (breadcrumb) breadcrumb.after(titleRow); else header.prepend(titleRow);
  }
  if (heading.parentElement !== titleRow) titleRow.append(heading);
  if (current && current.parentElement !== header) header.append(current);
  if (transitions && transitions.parentElement !== header) header.append(transitions);
  if (tools && tools.parentElement !== header) header.append(tools);

  const primary = layout.firstElementChild;
  if (primary) primary.classList.add('sd13-ticket-main');

  const attachments = keepNewest([...main.querySelectorAll('[data-r112-attachments]')]);
  if (attachments && primary && attachments.parentElement !== primary) {
    const conversation = [...primary.querySelectorAll('.detail-panel')].find(panel => panel.querySelector('.conversation'));
    if (conversation) conversation.after(attachments); else primary.append(attachments);
  }

  const headers = [...main.children].filter(node => node.classList?.contains('sd13-ticket-header'));
  for (const duplicate of headers.slice(1)) duplicate.remove();
}

function repairCanonicalSurfaces() {
  forceLightTheme();
  repairQueueSurface();
  repairTicketSurface();
}

let completionScheduled = false;
function scheduleSettingsNavigation() {
  if (completionScheduled) return;
  completionScheduled = true;
  requestAnimationFrame(() => {
    completionScheduled = false;
    forceLightTheme();
    completeSettingsNavigation();
    repairCanonicalSurfaces();
  });
}

const observer = new MutationObserver(scheduleSettingsNavigation);
observer.observe(document.documentElement, {childList: true, subtree: true, attributes: true, attributeFilter: ['data-theme']});
window.addEventListener('hashchange', () => {
  if (currentRoute() !== '#/queue') {
    queueSnapshotHTML = '';
    queueSnapshotHeight = 0;
    clearQueueGhost();
  }
  scheduleSettingsNavigation();
});
window.addEventListener('DOMContentLoaded', scheduleSettingsNavigation);
forceLightTheme();
if (document.readyState !== 'loading') scheduleSettingsNavigation();
