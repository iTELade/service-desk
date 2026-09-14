(() => {
  const pairs = [
    ['Klient','Customer'],['Kolejki','Queues'],['Tablica','Board'],['Portal klienta','Customer portal'],['Projekty','Projects'],
    ['Użytkownicy','Users'],['Ustawienia','Settings'],['Wyloguj','Sign out'],['Projekt','Project'],['Wszystkie projekty','All projects'],
    ['Utwórz zgłoszenie','Create ticket'],['Wczytywanie…','Loading…'],['Wczytywanie...','Loading...'],['Portale','Portals'],['Moje zgłoszenia','My tickets'],
    ['Panel zespołu','Team panel'],['Nowy projekt','New project'],['Administracja','Administration'],['Moje konto','My account'],
    ['Zaloguj się','Sign in'],['Hasło','Password'],['Nie pamiętasz hasła?','Forgot password?'],['Utwórz konto klienta','Create customer account'],
    ['Rejestracja wyłączona','Registration disabled'],['Utwórz konto','Create account'],['Imię','First name'],['Nazwisko','Last name'],
    ['E-mail','Email'],['Powtórz hasło','Repeat password'],['Zarejestruj konto','Register account'],['Wróć do logowania','Back to sign in'],
    ['Odzyskaj dostęp','Recover access'],['Potwierdź adres e-mail','Verify email address'],['Wyślij instrukcje','Send instructions'],
    ['Aktywuj konto','Activate account'],['Ustaw nowe hasło','Set a new password'],['Zapisz hasło','Save password'],['Zmień hasło','Change password'],
    ['Anuluj','Cancel'],['Szukaj','Search'],['Status','Status'],['Priorytet','Priority'],['Klasyfikacja','Classification'],
    ['Opiekun','Assignee'],['Wszyscy','All'],['Bieżące','Current'],['Zarchiwizowane','Archived'],['Bieżące i archiwum','Current and archived'],
    ['Sortowanie','Sort'],['Najnowsze','Newest'],['Najstarsze','Oldest'],['Najwyższy priorytet','Highest priority'],['Zastosuj','Apply'],['Wyczyść','Clear'],
    ['Nowe','New'],['W trakcie','In progress'],['Oczekuje na klienta','Waiting for customer'],['Rozwiązane','Resolved'],['Zamknięte','Closed'],
    ['Krytyczny','Critical'],['Wysoki','High'],['Normalny','Normal'],['Niski','Low'],['Incydent','Incident'],['Wniosek o usługę','Service request'],
    ['Zadanie','Task'],['Błąd','Bug'],['Historyjka','Story'],['Nieprzypisane','Unassigned'],['Brak zgłoszeń w tym widoku','No tickets in this view'],
    ['Poprzednia','Previous'],['Następna','Next'],['W czym możemy pomóc?','How can we help?'],['Twoje ostatnie zgłoszenia','Your recent tickets'],
    ['Zobacz wszystkie','View all'],['Ogólne','General'],['Formularze zgłoszeń','Request forms'],['Statusy i automatyzacja','Statuses and automation'],
    ['Portal','Portal'],['Zespół i dostęp','Team and access'],['SLA','SLA'],['Historia ustawień','Settings history'],['Dodaj użytkownika','Add user'],
    ['Użytkownik','User'],['Rola / typ','Role / type'],['Źródło','Source'],['Dostęp','Access'],['Zarządzanie','Management'],
    ['Edytuj','Edit'],['Konto aktywne lokalnie','Locally active account'],['Zapisz zmiany','Save changes'],['Katalog LDAP','LDAP directory'],
    ['Włącz LDAP','Enable LDAP'],['Adres serwera','Server address'],['Domyślna rola globalna','Default global role'],['Agent','Agent'],
    ['Klient / zgłaszający','Customer / requester'],['Zapisz konfigurację LDAP','Save LDAP configuration'],['Sprawdź i pokaż zmiany','Check and preview changes'],
    ['Historia synchronizacji','Synchronization history'],['Ustawienia systemu','System settings'],['Wersja i aktualizacje','Version and updates'],
    ['Organizacja i rejestracja','Organization and registration'],['Nazwa organizacji','Organization name'],['Nazwa systemu','System name'],
    ['Język systemu','System language'],['Angielski','English'],['Polski','Polish'],['Język obowiązuje wszystkich użytkowników i ekrany publiczne.','The language applies to all users and public screens.'],
    ['Domyślna poczta SMTP','Default SMTP'],['Kolejka poczty','Mail queue'],['Reset systemu','System reset'],['Powiadomienia','Notifications'],
    ['Baza wiedzy — integracja','Knowledge Base integration'],['API i tokeny','API and tokens'],['Webhooki','Webhooks'],['Środki trwałe','Assets'],
    ['Firmy i grupy klientów','Customer organizations'],['Synchronizacja projektów','Project synchronization'],['Poczta zespołów · IMAP i SMTP','Team mail · IMAP and SMTP'],
    ['Logowanie SSO','SSO login'],['Szablony statusów','Workflow templates'],['Błędy modułów','Module errors'],
    ['Administration Control Center','Centrum administracyjne'],['Back to Service Desk','Wróć do Service Desk'],['Dashboard','Panel'],
    ['Approvals','Zatwierdzenia'],['Organizations','Organizacje'],['Assets','Środki trwałe'],['Audit','Audyt'],
    ['Loading Service Desk…','Wczytywanie Service Desk…'],['Skip to content','Przejdź do treści'],['Enable JavaScript to use the Service Desk portal.','Włącz JavaScript, aby korzystać z portalu Service Desk.']
  ];

  let locale = 'en';
  let configLoaded = false;

  function normalize(value) { return value === 'pl' ? 'pl' : 'en'; }

  function translateText(value) {
    let out = String(value ?? '');
    for (const [pl, en] of pairs) {
      if (locale === 'en') out = out.replaceAll(pl, en);
      else out = out.replaceAll(en, pl);
    }
    return out;
  }

  function translateNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const p = node.parentElement;
      if (!p || ['SCRIPT','STYLE','TEXTAREA'].includes(p.tagName)) return;
      const translated = translateText(node.nodeValue);
      if (translated !== node.nodeValue) node.nodeValue = translated;
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    for (const attr of ['placeholder','title','aria-label']) {
      if (node.hasAttribute(attr)) node.setAttribute(attr, translateText(node.getAttribute(attr)));
    }
    for (const child of node.childNodes) translateNode(child);
  }

  function injectSettingsLanguage(root = document) {
    const form = root.querySelector?.('form[data-form="settings"]') || (root.matches?.('form[data-form="settings"]') ? root : null);
    if (!form || form.querySelector('[name="language"]')) return;
    const registration = form.querySelector('[name="registration_mode"]')?.closest('label');
    const label = document.createElement('label');
    label.dataset.systemLanguage = 'true';
    label.innerHTML = `Język systemu<select name="language"><option value="en">Angielski</option><option value="pl">Polski</option></select><small>Język obowiązuje wszystkich użytkowników i ekrany publiczne.</small>`;
    label.querySelector('select').value = locale;
    if (registration) registration.after(label); else form.prepend(label);
    translateNode(label);
  }

  function applyLanguage(next) {
    locale = normalize(next);
    document.documentElement.lang = locale;
    document.title = translateText(document.title);
    translateNode(document.body);
    injectSettingsLanguage(document);
  }

  async function loadSystemLanguage() {
    try {
      const response = await fetch('/api/public-config', {credentials:'same-origin', cache:'no-store'});
      if (!response.ok) throw new Error('public config unavailable');
      const config = await response.json();
      configLoaded = true;
      applyLanguage(config.language);
    } catch {
      configLoaded = true;
      applyLanguage('en');
    }
  }

  async function waitForSavedLanguage(expected) {
    for (let attempt = 0; attempt < 16; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 250));
      try {
        const response = await fetch('/api/public-config', {credentials:'same-origin', cache:'no-store'});
        if (!response.ok) continue;
        const config = await response.json();
        if (normalize(config.language) === expected) {
          if (locale !== expected) location.reload();
          return;
        }
      } catch {}
    }
  }

  window.DeskLocale = {
    get locale() { return locale; },
    get global() { return true; },
    t: translateText,
    refresh: loadSystemLanguage
  };

  document.documentElement.lang = 'en';

  addEventListener('DOMContentLoaded', () => {
    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          translateNode(node);
          if (node.nodeType === Node.ELEMENT_NODE) injectSettingsLanguage(node);
        }
      }
    });
    observer.observe(document.body, {childList:true, subtree:true});
    void loadSystemLanguage();
  });

  document.addEventListener('submit', event => {
    const form = event.target.closest?.('form[data-form="settings"]');
    if (!form) return;
    const expected = normalize(form.elements.language?.value || locale);
    if (expected !== locale) void waitForSavedLanguage(expected);
  }, true);
})();
