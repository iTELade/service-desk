const SETTINGS_NAV_VERSION = '1.2.4';

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
