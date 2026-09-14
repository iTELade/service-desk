const DIRECT_SETTINGS_LINKS = {
  'Tożsamość i dostęp': [
    ['Użytkownicy', '/#/users'],
    ['LDAP / Active Directory', '/#/directory'],
    ['SSO / OIDC', '/#/admin/sso']
  ],
  'Zarządzanie usługami': [
    ['Projekty', '/#/projects'],
    ['Szablony workflow', '/#/admin/templates']
  ],
  'Komunikacja': [
    ['Skrzynki zespołów', '/#/admin/mail'],
    ['Szablony powiadomień', '/#/admin/mail-templates']
  ],
  'Integracje': [
    ['Baza wiedzy', '/#/admin/knowledge'],
    ['Tokeny API', '/#/admin/api-tokens'],
    ['Webhooki', '/#/admin/webhooks']
  ],
  'Zasoby / CMDB': [
    ['Katalog środków trwałych', '/#/admin/assets']
  ],
  'System': [
    ['Aktualizacje', '/#/admin/updates'],
    ['Błędy modułów', '/#/admin/events']
  ]
};

function completeSettingsNavigation() {
  const nav = document.querySelector('.settings-nav');
  if (!nav) return;

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

const observer = new MutationObserver(completeSettingsNavigation);
observer.observe(document.documentElement, {childList: true, subtree: true});
window.addEventListener('hashchange', completeSettingsNavigation);
window.addEventListener('DOMContentLoaded', completeSettingsNavigation);
if (document.readyState !== 'loading') completeSettingsNavigation();
