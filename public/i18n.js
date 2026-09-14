(() => {
  const terms = [
    ['Klient','Customer','Kunde'],['Kolejki','Queues','Warteschlangen'],['Tablica','Board','Board'],['Portal klienta','Customer portal','Kundenportal'],['Projekty','Projects','Projekte'],
    ['Użytkownicy','Users','Benutzer'],['Ustawienia','Settings','Einstellungen'],['Wyloguj','Sign out','Abmelden'],['Projekt','Project','Projekt'],['Wszystkie projekty','All projects','Alle Projekte'],
    ['Utwórz zgłoszenie','Create ticket','Ticket erstellen'],['Wczytywanie…','Loading…','Wird geladen…'],['Wczytywanie...','Loading...','Wird geladen...'],['Portale','Portals','Portale'],['Moje zgłoszenia','My tickets','Meine Tickets'],
    ['Panel zespołu','Team panel','Team-Bereich'],['Nowy projekt','New project','Neues Projekt'],['Administracja','Administration','Administration'],['Moje konto','My account','Mein Konto'],
    ['Zaloguj się','Sign in','Anmelden'],['Hasło','Password','Passwort'],['Nie pamiętasz hasła?','Forgot password?','Passwort vergessen?'],['Utwórz konto klienta','Create customer account','Kundenkonto erstellen'],
    ['Rejestracja wyłączona','Registration disabled','Registrierung deaktiviert'],['Utwórz konto','Create account','Konto erstellen'],['Imię','First name','Vorname'],['Nazwisko','Last name','Nachname'],
    ['E-mail','Email','E-Mail'],['Powtórz hasło','Repeat password','Passwort wiederholen'],['Zarejestruj konto','Register account','Konto registrieren'],['Wróć do logowania','Back to sign in','Zur Anmeldung'],
    ['Odzyskaj dostęp','Recover access','Zugang wiederherstellen'],['Potwierdź adres e-mail','Verify email address','E-Mail-Adresse bestätigen'],['Wyślij instrukcje','Send instructions','Anweisungen senden'],
    ['Aktywuj konto','Activate account','Konto aktivieren'],['Ustaw nowe hasło','Set a new password','Neues Passwort setzen'],['Zapisz hasło','Save password','Passwort speichern'],['Zmień hasło','Change password','Passwort ändern'],
    ['Anuluj','Cancel','Abbrechen'],['Szukaj','Search','Suchen'],['Status','Status','Status'],['Priorytet','Priority','Priorität'],['Klasyfikacja','Classification','Klassifizierung'],
    ['Opiekun','Assignee','Bearbeiter'],['Wszyscy','All','Alle'],['Bieżące','Current','Aktuell'],['Zarchiwizowane','Archived','Archiviert'],['Bieżące i archiwum','Current and archived','Aktuell und archiviert'],
    ['Sortowanie','Sort','Sortierung'],['Najnowsze','Newest','Neueste'],['Najstarsze','Oldest','Älteste'],['Najwyższy priorytet','Highest priority','Höchste Priorität'],['Zastosuj','Apply','Anwenden'],['Wyczyść','Clear','Zurücksetzen'],
    ['Nowe','New','Neu'],['W trakcie','In progress','In Bearbeitung'],['Oczekuje na klienta','Waiting for customer','Wartet auf Kunden'],['Rozwiązane','Resolved','Gelöst'],['Zamknięte','Closed','Geschlossen'],
    ['Krytyczny','Critical','Kritisch'],['Wysoki','High','Hoch'],['Normalny','Normal','Normal'],['Niski','Low','Niedrig'],['Incydent','Incident','Störung'],['Wniosek o usługę','Service request','Serviceanfrage'],
    ['Zadanie','Task','Aufgabe'],['Błąd','Bug','Fehler'],['Historyjka','Story','Story'],['Nieprzypisane','Unassigned','Nicht zugewiesen'],['Brak zgłoszeń w tym widoku','No tickets in this view','Keine Tickets in dieser Ansicht'],
    ['Poprzednia','Previous','Zurück'],['Następna','Next','Weiter'],['W czym możemy pomóc?','How can we help?','Wie können wir helfen?'],['Twoje ostatnie zgłoszenia','Your recent tickets','Ihre letzten Tickets'],
    ['Zobacz wszystkie','View all','Alle anzeigen'],['Ogólne','General','Allgemein'],['Formularze zgłoszeń','Request forms','Anfrageformulare'],['Statusy i automatyzacja','Statuses and automation','Status und Automatisierung'],
    ['Portal','Portal','Portal'],['Zespół i dostęp','Team and access','Team und Zugriff'],['SLA','SLA','SLA'],['Historia ustawień','Settings history','Einstellungsverlauf'],['Dodaj użytkownika','Add user','Benutzer hinzufügen'],
    ['Użytkownik','User','Benutzer'],['Rola / typ','Role / type','Rolle / Typ'],['Źródło','Source','Quelle'],['Dostęp','Access','Zugriff'],['Zarządzanie','Management','Verwaltung'],
    ['Edytuj','Edit','Bearbeiten'],['Konto aktywne lokalnie','Locally active account','Lokal aktives Konto'],['Zapisz zmiany','Save changes','Änderungen speichern'],['Katalog LDAP','LDAP directory','LDAP-Verzeichnis'],
    ['Włącz LDAP','Enable LDAP','LDAP aktivieren'],['Adres serwera','Server address','Serveradresse'],['Domyślna rola globalna','Default global role','Standardrolle'],['Agent','Agent','Agent'],
    ['Klient / zgłaszający','Customer / requester','Kunde / Anfragender'],['Zapisz konfigurację LDAP','Save LDAP configuration','LDAP-Konfiguration speichern'],['Sprawdź i pokaż zmiany','Check and preview changes','Änderungen prüfen'],
    ['Historia synchronizacji','Synchronization history','Synchronisierungsverlauf'],['Ustawienia systemu','System settings','Systemeinstellungen'],['Wersja i aktualizacje','Version and updates','Version und Updates'],
    ['Organizacja i rejestracja','Organization and registration','Organisation und Registrierung'],['Nazwa organizacji','Organization name','Organisationsname'],['Nazwa systemu','System name','Systemname'],
    ['Język systemu','System language','Systemsprache'],['Angielski','English','Englisch'],['Polski','Polish','Polnisch'],['Niemiecki','German','Deutsch'],['Język obowiązuje wszystkich użytkowników i ekrany publiczne.','The language applies to all users and public screens.','Die Sprache gilt für alle Benutzer und öffentlichen Seiten.'],
    ['Domyślna poczta SMTP','Default SMTP','Standard-SMTP'],['Kolejka poczty','Mail queue','E-Mail-Warteschlange'],['Reset systemu','System reset','System zurücksetzen'],['Powiadomienia','Notifications','Benachrichtigungen'],
    ['Baza wiedzy — integracja','Knowledge Base integration','Wissensdatenbank-Integration'],['API i tokeny','API and tokens','API und Token'],['Webhooki','Webhooks','Webhooks'],['Środki trwałe','Assets','Assets'],
    ['Firmy i grupy klientów','Customer organizations','Kundenorganisationen'],['Synchronizacja projektów','Project synchronization','Projektsynchronisierung'],['Poczta zespołów · IMAP i SMTP','Team mail · IMAP and SMTP','Team-E-Mail · IMAP und SMTP'],
    ['Logowanie SSO','SSO login','SSO-Anmeldung'],['Szablony statusów','Workflow templates','Workflow-Vorlagen'],['Błędy modułów','Module errors','Modulfehler'],
    ['Centrum administracyjne','Administration Center','Administrationszentrum'],['Wróć do Service Desk','Back to Service Desk','Zurück zum Service Desk'],['Panel','Dashboard','Dashboard'],
    ['Zatwierdzenia','Approvals','Genehmigungen'],['Organizacje','Organizations','Organisationen'],['Audyt','Audit','Audit'],['Wtyczki','Plugins','Plugins'],['Diagnostyka','Diagnostics','Diagnose'],['Integracje','Integrations','Integrationen'],
    ['Komunikacja','Communication','Kommunikation'],['Tożsamość i dostęp','Identity and access','Identität und Zugriff'],['System','System','System'],['Bezpieczeństwo','Security','Sicherheit'],
    ['Loading Service Desk…','Loading Service Desk…','Service Desk wird geladen…'],['Skip to content','Skip to content','Zum Inhalt springen'],['Enable JavaScript to use the Service Desk portal.','Enable JavaScript to use the Service Desk portal.','Aktivieren Sie JavaScript, um das Service-Desk-Portal zu verwenden.']
  ];

  let locale = 'en';
  function normalize(value) { return ['en','pl','de'].includes(value) ? value : 'en'; }
  const index={pl:0,en:1,de:2};
  function translateText(value) {
    let out = String(value ?? '');
    const target=index[locale];
    for (const row of terms) {
      const replacement=row[target];
      for(let source=0;source<row.length;source++)if(source!==target&&row[source])out=out.replaceAll(row[source],replacement);
    }
    return out;
  }
  function translateNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const p = node.parentElement;if (!p || ['SCRIPT','STYLE','TEXTAREA'].includes(p.tagName)) return;
      const translated = translateText(node.nodeValue);if (translated !== node.nodeValue) node.nodeValue = translated;return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    for (const attr of ['placeholder','title','aria-label']) if (node.hasAttribute(attr)) node.setAttribute(attr, translateText(node.getAttribute(attr)));
    for (const child of node.childNodes) translateNode(child);
  }
  function injectSettingsLanguage(root = document) {
    const form = root.querySelector?.('form[data-form="settings"]') || (root.matches?.('form[data-form="settings"]') ? root : null);
    if (!form || form.querySelector('[name="language"]')) return;
    const registration = form.querySelector('[name="registration_mode"]')?.closest('label'),label = document.createElement('label');
    label.dataset.systemLanguage = 'true';
    label.innerHTML = `Język systemu<select name="language"><option value="en">Angielski</option><option value="pl">Polski</option><option value="de">Niemiecki</option></select><small>Język obowiązuje wszystkich użytkowników i ekrany publiczne.</small>`;
    label.querySelector('select').value = locale;if (registration) registration.after(label); else form.prepend(label);translateNode(label);
  }
  function applyLanguage(next) {locale = normalize(next);document.documentElement.lang = locale;document.title = translateText(document.title);translateNode(document.body);injectSettingsLanguage(document);}
  async function loadSystemLanguage() {
    try {const response = await fetch('/api/public-config', {credentials:'same-origin', cache:'no-store'});if (!response.ok) throw new Error('public config unavailable');const config = await response.json();applyLanguage(config.language);} catch {applyLanguage('en');}
  }
  async function waitForSavedLanguage(expected) {
    for (let attempt = 0; attempt < 16; attempt++) {await new Promise(resolve => setTimeout(resolve, 250));try {const response = await fetch('/api/public-config', {credentials:'same-origin', cache:'no-store'});if (!response.ok) continue;const config = await response.json();if (normalize(config.language) === expected) {if (locale !== expected) location.reload();return;}} catch {}}
  }
  window.DeskLocale = {get locale() { return locale; },get global() { return true; },t: translateText,refresh: loadSystemLanguage,supported:['en','pl','de']};
  document.documentElement.lang = 'en';
  addEventListener('DOMContentLoaded', () => {const observer = new MutationObserver(mutations => {for (const mutation of mutations) for (const node of mutation.addedNodes) {translateNode(node);if (node.nodeType === Node.ELEMENT_NODE) injectSettingsLanguage(node);}});observer.observe(document.body, {childList:true, subtree:true});void loadSystemLanguage();});
  document.addEventListener('submit', event => {const form = event.target.closest?.('form[data-form="settings"]');if (!form) return;const expected = normalize(form.elements.language?.value || locale);if (expected !== locale) void waitForSavedLanguage(expected);}, true);
})();
