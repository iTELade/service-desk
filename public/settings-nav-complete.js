const SETTINGS_NAV_VERSION = '1.0.5';

const DIRECT_SETTINGS_LINKS = {
  'Ogólne': [
    ['Organizacja i rejestracja', '/#/settings?section=general'],
    ['Wygląd i marka', '/#/settings?section=branding']
  ],
  'Tożsamość i dostęp': [
    ['Użytkownicy', '/#/users'],
    ['LDAP / Active Directory', '/#/directory'],
    ['SSO / OIDC', '/#/admin/sso'],
    ['MFA i moje konto', '/#/profile']
  ],
  'Zarządzanie usługami': [
    ['Projekty', '/#/projects'],
    ['Szablony workflow', '/#/admin/templates'],
    ['Zatwierdzenia', '/#/settings?section=approvals'],
    ['Organizacje klientów', '/#/settings?section=organizations']
  ],
  'Komunikacja': [
    ['Poczta SMTP i kolejka', '/#/settings?section=communication'],
    ['Skrzynki zespołów', '/#/admin/mail'],
    ['Szablony powiadomień', '/#/admin/mail-templates']
  ],
  'Integracje': [
    ['Przegląd integracji', '/#/settings?section=integrations'],
    ['GitHub Issues', '/#/settings?section=github'],
    ['Synchronizacja projektów', '/#/admin/sync'],
    ['Baza wiedzy', '/#/admin/knowledge'],
    ['Tokeny API', '/#/admin/api-tokens'],
    ['Webhooki', '/#/admin/webhooks'],
    ['Wtyczki', '/#/settings?section=plugins']
  ],
  'Zasoby / CMDB': [
    ['Środki trwałe / CMDB', '/#/settings?section=assets'],
    ['Katalog środków trwałych', '/#/admin/assets']
  ],
  'System': [
    ['Diagnostyka i utrzymanie', '/#/settings?section=system'],
    ['Audyt', '/#/settings?section=audit'],
    ['Aktualizacje', '/#/admin/updates'],
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

  // settings-center.js may render before app.js finishes its own async route.
  // If app.js then replaces only main.innerHTML, the data marker survives and
  // settings-center.js incorrectly thinks its interface is still mounted.
  // Clear that stale marker and create one child-list mutation so its observer
  // performs a real re-render.
  delete main.dataset.settingsCenterVersion;
  main.dataset.settingsRecovery = SETTINGS_NAV_VERSION;
  main.append(document.createComment(`settings-center-recover-${SETTINGS_NAV_VERSION}`));
}

function completeSettingsNavigation() {
  if (!isSettingsRoute()) return;

  const nav = document.querySelector('.settings-nav');
  const version = document.querySelector('.version-chip');
  const versionLabel = `Wersja ${SETTINGS_NAV_VERSION}`;
  if (version && version.textContent !== versionLabel) version.textContent = versionLabel;
  if (!nav) {
    recoverSettingsCenter();
    return;
  }

  for (const group of nav.querySelectorAll('.settings-nav-group')) {
    const title = group.querySelector('h3')?.textContent?.trim();
    const links = DIRECT_SETTINGS_LINKS[title];
    if (!links) continue;

    for (const [label, href] of links) {
      if (group.querySelector(`a[href="${href}"]`)) continue;
      const link = document.createElement('a');
      link.className = 'settings-nav-link';
      link.href = href;
      link.textContent = label;
      group.append(link);
    }
  }
}

let completionScheduled = false;
function scheduleSettingsNavigation() {
  if (completionScheduled) return;
  completionScheduled = true;
  queueMicrotask(() => {
    completionScheduled = false;
    completeSettingsNavigation();
  });
}

const observer = new MutationObserver(scheduleSettingsNavigation);
observer.observe(document.documentElement, {childList: true, subtree: true});
window.addEventListener('hashchange', scheduleSettingsNavigation);
window.addEventListener('DOMContentLoaded', scheduleSettingsNavigation);
if (document.readyState !== 'loading') scheduleSettingsNavigation();
