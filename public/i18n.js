(() => {
  const dict={
    'Klient':'Customer','Kolejki':'Queues','Tablica':'Board','Portal klienta':'Customer portal','Projekty':'Projects',
    'Użytkownicy':'Users','Ustawienia':'Settings','Wyloguj':'Sign out','Projekt':'Project','Wszystkie projekty':'All projects',
    'Utwórz zgłoszenie':'Create ticket','Wczytywanie…':'Loading…','Portale':'Portals','Moje zgłoszenia':'My tickets',
    'Panel zespołu':'Team panel','Nowy projekt':'New project','Administracja':'Administration','Moje konto':'My account',
    'Zaloguj się':'Sign in','Hasło':'Password','Nie pamiętasz hasła?':'Forgot password?','Utwórz konto klienta':'Create customer account',
    'Rejestracja wyłączona':'Registration disabled','Utwórz konto':'Create account','Imię':'First name','Nazwisko':'Last name',
    'E-mail':'Email','Powtórz hasło':'Repeat password','Zarejestruj konto':'Register account','Wróć do logowania':'Back to sign in',
    'Odzyskaj dostęp':'Recover access','Potwierdź adres e-mail':'Verify email address','Wyślij instrukcje':'Send instructions',
    'Aktywuj konto':'Activate account','Ustaw nowe hasło':'Set a new password','Zapisz hasło':'Save password','Zmień hasło':'Change password',
    'Anuluj':'Cancel','Szukaj':'Search','Status':'Status','Priorytet':'Priority','Klasyfikacja':'Classification',
    'Opiekun':'Assignee','Wszyscy':'All','Bieżące':'Current','Zarchiwizowane':'Archived','Bieżące i archiwum':'Current and archived',
    'Sortowanie':'Sort','Najnowsze':'Newest','Najstarsze':'Oldest','Najwyższy priorytet':'Highest priority','Zastosuj':'Apply','Wyczyść':'Clear',
    'Nowe':'New','W trakcie':'In progress','Oczekuje na klienta':'Waiting for customer','Rozwiązane':'Resolved','Zamknięte':'Closed',
    'Krytyczny':'Critical','Wysoki':'High','Normalny':'Normal','Niski':'Low','Incydent':'Incident','Wniosek o usługę':'Service request',
    'Zadanie':'Task','Błąd':'Bug','Historyjka':'Story','Nieprzypisane':'Unassigned','Brak zgłoszeń w tym widoku':'No tickets in this view',
    'Poprzednia':'Previous','Następna':'Next','W czym możemy pomóc?':'How can we help?','Twoje ostatnie zgłoszenia':'Your recent tickets',
    'Zobacz wszystkie':'View all','Ogólne':'General','Formularze zgłoszeń':'Request forms','Statusy i automatyzacja':'Statuses and automation',
    'Portal':'Portal','Zespół i dostęp':'Team and access','SLA':'SLA','Historia ustawień':'Settings history','Dodaj użytkownika':'Add user',
    'Użytkownik':'User','Rola / typ':'Role / type','Źródło':'Source','Dostęp':'Access','Zarządzanie':'Management',
    'Edytuj':'Edit','Konto aktywne lokalnie':'Locally active account','Zapisz zmiany':'Save changes','Katalog LDAP':'LDAP directory',
    'Włącz LDAP':'Enable LDAP','Adres serwera':'Server address','Domyślna rola globalna':'Default global role','Agent':'Agent',
    'Klient / zgłaszający':'Customer / requester','Zapisz konfigurację LDAP':'Save LDAP configuration','Sprawdź i pokaż zmiany':'Check and preview changes',
    'Historia synchronizacji':'Synchronization history','Ustawienia systemu':'System settings','Wersja i aktualizacje':'Version and updates',
    'Organizacja i rejestracja':'Organization and registration','Nazwa organizacji':'Organization name','Nazwa systemu':'System name',
    'Domyślna poczta SMTP':'Default SMTP','Kolejka poczty':'Mail queue','Reset systemu':'System reset','Powiadomienia':'Notifications',
    'Baza wiedzy — integracja':'Knowledge Base integration','API i tokeny':'API and tokens','Webhooki':'Webhooks','Środki trwałe':'Assets',
    'Firmy i grupy klientów':'Customer organizations','Synchronizacja projektów':'Project synchronization','Poczta zespołów · IMAP i SMTP':'Team mail · IMAP and SMTP',
    'Logowanie SSO':'SSO login','Szablony statusów':'Workflow templates','Błędy modułów':'Module errors'
  };
  const getLocale=()=>localStorage.getItem('desk.locale')||'en';
  const translateText=s=>{
    if(getLocale()==='pl')return s;
    let out=s;
    for(const [pl,en] of Object.entries(dict))out=out.replaceAll(pl,en);
    return out;
  };
  const translateNode=node=>{
    if(getLocale()==='pl')return;
    if(node.nodeType===Node.TEXT_NODE){
      const p=node.parentElement;if(!p||['SCRIPT','STYLE','TEXTAREA','OPTION'].includes(p.tagName)&&p.tagName!=='OPTION')return;
      const v=translateText(node.nodeValue);if(v!==node.nodeValue)node.nodeValue=v;
      return;
    }
    if(node.nodeType!==Node.ELEMENT_NODE)return;
    for(const attr of ['placeholder','title','aria-label'])if(node.hasAttribute(attr))node.setAttribute(attr,translateText(node.getAttribute(attr)));
    for(const child of node.childNodes)translateNode(child);
  };
  window.DeskLocale={
    get locale(){return getLocale();},
    set(locale){localStorage.setItem('desk.locale',locale==='pl'?'pl':'en');location.reload();},
    t:translateText
  };
  document.documentElement.lang=getLocale();
  addEventListener('DOMContentLoaded',()=>{
    translateNode(document.body);
    new MutationObserver(ms=>{if(getLocale()==='pl')return;for(const m of ms)for(const n of m.addedNodes)translateNode(n);}).observe(document.body,{childList:true,subtree:true});
    const box=document.createElement('div');box.className='desk-language-switch';box.innerHTML='<button type="button" data-lang="en">EN</button><button type="button" data-lang="pl">PL</button>';
    Object.assign(box.style,{position:'fixed',right:'12px',bottom:'12px',zIndex:'10000',display:'flex',gap:'4px'});
    box.addEventListener('click',e=>{const b=e.target.closest('[data-lang]');if(b)window.DeskLocale.set(b.dataset.lang);});document.body.append(box);
  });
})();
