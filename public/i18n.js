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
    ['Domyślna poczta SMTP','Default SMTP'],['Kolejka poczty','Mail queue'],['Reset systemu','System reset'],['Powiadomienia','Notifications'],
    ['Baza wiedzy — integracja','Knowledge Base integration'],['API i tokeny','API and tokens'],['Webhooki','Webhooks'],['Środki trwałe','Assets'],
    ['Firmy i grupy klientów','Customer organizations'],['Synchronizacja projektów','Project synchronization'],['Poczta zespołów · IMAP i SMTP','Team mail · IMAP and SMTP'],
    ['Logowanie SSO','SSO login'],['Szablony statusów','Workflow templates'],['Błędy modułów','Module errors'],
    ['Administration Control Center','Centrum administracyjne'],['Back to Service Desk','Wróć do Service Desk'],['Dashboard','Panel'],
    ['Approvals','Zatwierdzenia'],['Organizations','Organizacje'],['Assets','Środki trwałe'],['Audit','Audyt'],
    ['Loading Service Desk…','Wczytywanie Service Desk…'],['Skip to content','Przejdź do treści'],['Enable JavaScript to use the Service Desk portal.','Włącz JavaScript, aby korzystać z portalu Service Desk.']
  ];

  const getLocale = () => localStorage.getItem('desk.locale') || 'en';

  function translateText(value) {
    let out = String(value ?? '');
    const locale = getLocale();
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

  function setLocale(locale) {
    const normalized = locale === 'pl' ? 'pl' : 'en';
    localStorage.setItem('desk.locale', normalized);
    location.reload();
  }

  window.DeskLocale = {
    get locale() { return getLocale(); },
    set: setLocale,
    t: translateText
  };

  document.documentElement.lang = getLocale();

  addEventListener('DOMContentLoaded', () => {
    document.title = translateText(document.title);
    translateNode(document.body);

    new MutationObserver(mutations => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) translateNode(node);
      }
    }).observe(document.body, {childList:true, subtree:true});

    const box = document.createElement('div');
    box.className = 'desk-language-switch';
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', getLocale() === 'pl' ? 'Język interfejsu' : 'Interface language');
    box.innerHTML = '<button type="button" data-lang="en">EN</button><button type="button" data-lang="pl">PL</button>';
    Object.assign(box.style, {
      position:'fixed', right:'12px', bottom:'12px', zIndex:'10000', display:'flex', gap:'4px',
      padding:'4px', borderRadius:'10px', background:'rgba(10,18,32,.92)', boxShadow:'0 6px 24px rgba(0,0,0,.25)'
    });
    for (const button of box.querySelectorAll('button')) {
      const active = button.dataset.lang === getLocale();
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
      Object.assign(button.style, {
        minWidth:'38px', padding:'7px 9px', borderRadius:'7px', cursor:'pointer',
        border: active ? '1px solid #fff' : '1px solid rgba(255,255,255,.25)',
        background: active ? '#fff' : 'transparent', color: active ? '#111827' : '#fff', fontWeight:'700'
      });
    }
    box.addEventListener('click', event => {
      const button = event.target.closest('[data-lang]');
      if (button) setLocale(button.dataset.lang);
    });
    document.body.append(box);
  });
})();
