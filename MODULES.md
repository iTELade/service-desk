# Konfiguracja modułów Service Desk 0.6.0

Ustawienia znajdują się w **Ustawieniach**. LDAP jest pod linkiem „Katalog LDAP”, poza głównym menu. Integracje pocztowe i SSO nie uruchamiają się z przykładowymi hasłami; trzeba je skonfigurować.

## Synchronizacja projektów

Przykład: **CW → ITA**. Nazwy i kierunki są dowolne.

1. Utwórz oba projekty i ich formularze. Nadaj zespołowi dostęp do obu.
2. W Użytkownikach utwórz zwykłe konto użytkownika, np. „Zespół wsparcia”. Przypisz je jako agenta do obu projektów. Domyślny Service Desk Bot ma takie przypisania do projektów utworzonych przez aplikację.
3. Ustawienia → Synchronizacja projektów → Dodaj. Wybierz projekt źródłowy, docelowy, autora wyświetlanego i nazwę przycisku, np. „Wyślij do ITA”.
4. Wybierz kierunek komentarzy: oba, do źródła, do celu lub brak. Notatki wewnętrzne są osobną opcją, domyślnie wyłączoną; po skopiowaniu pozostają wewnętrzne.
5. Dodaj tylko potrzebne mapowania statusów w każdym kierunku. Statusy nie muszą mieć tej samej nazwy. Puste mapowanie nie zmienia statusu. Przejście musi być dozwolone na mapie docelowej.
6. W sprawie CW kliknij przycisk przekazania. Powstaje kopia w ITA i powiązanie zespołowe. Ponowne kliknięcie otwiera już istniejącą kopię.

Kopiowane są temat, opis i zgodne pola. Wybierz formularz docelowy o zgodnych wymaganych polach; brak wartości obowiązkowych blokuje operację z komunikatem. Dotychczasowa rozmowa jest kopiowana jednorazowo. Po przekazaniu kierunek dalszych komentarzy kontroluje ustawienie. Późniejsze edycje tematu, opisu i pól nie są synchronizowane; plugin synchronizuje rozmowę i wskazane statusy.

Autor wyświetlany może być wybranym kontem z dostępem zespołowym. Audyt przechowuje oryginalnego autora i rzeczywistego wykonawcę; klient nie widzi audytu. Powiązanie jest widoczne tylko pracownikom z dostępem do obu spraw. Zamkniętego celu nie otwiera ani nie komentuje synchronizacja. Nazwa formularza/klucz nie omijają uprawnień.

Problemy mapowania sprawdzisz w Ustawienia → Błędy modułów. Po poprawce kliknij Ponów. Wysyłki e-mail wykonane wcześniej nie są powielane przy ponowieniu synchronizacji.

## Poczta zespołów

**webmail.example.com** to Roundcube w przeglądarce. Do integracji wpisz **mail.example.com**.

| Ustawienie | CW — przykład | HR — przykład |
|---|---|---|
| Skrzynka i adres zespołu | wsparcie@example.com | hr@example.com |
| Projekt | CW | HR |
| IMAP | mail.example.com:993, TLS włączone | mail.example.com:993, TLS włączone |
| SMTP | mail.example.com:587, TLS bezpośredni wyłączony — wymagany STARTTLS | tak samo |
| Folder | INBOX | INBOX |
| Login/hasło | Dane rzeczywistej skrzynki | Dane rzeczywistej skrzynki |

Skrzynki muszą wcześniej istnieć w Mailcow. Ustawienia → Poczta zespołów → Dodaj:

- Wybierz projekt i aktywny formularz. Najlepszy formularz pocztowy nie wymaga dodatkowych pól bez wartości domyślnych.
- Ustaw adres, połączenia i hasła. Certyfikaty TLS są weryfikowane.
- „Od nowych wiadomości” pomija dotychczasową zawartość przy **pierwszym udanym odczycie**. Wyłącz tę opcję przed pierwszym odczytem, jeśli chcesz importować również starsze wiadomości.
- „Nowi nadawcy” jest domyślnie wyłączone. Po włączeniu nieznany nadawca nowego wątku może otrzymać konto klienta i link aktywacyjny; domeny możesz ograniczyć. Nieznany nadawca nie uzyskuje dostępu do istniejącego wątku na podstawie numeru w temacie.
- Aktywuj kanał. Odczyt następuje co około 15 sekund, w porcjach do 100 numerów UID. Historia pokaże przetworzenie/pominięcie i przyczynę.

Odpowiedzi używają Message-ID/In-Reply-To/References, a numer w nawiasach w temacie jest mechanizmem pomocniczym. Po aktualizacji klienta wiadomość dostają obserwatorzy, opiekun i twórca sprawy, jeśli jest inną osobą. Po aktualizacji agenta: zgłaszający i obserwatorzy. Autor nie dostaje własnej aktualizacji; nowa sprawa otrzymuje potwierdzenie. Dostęp odbiorców jest sprawdzany ponownie przed wysyłką. Notatki wewnętrzne nie są wysyłane klientom.

Wiadomość zawiera linię **Odpowiedz powyżej tej linii**. Wpisz odpowiedź nad nią. Parser usuwa typowe cytaty; bardzo niestandardowe formatowanie klienta pocztowego może wymagać ręcznego usunięcia cytatu. Wiadomości automatyczne i listowe są pomijane, aby uniknąć pętli. Zamknięta sprawa odrzuca dalszą odpowiedź i wysyła instrukcję nowego zgłoszenia.

**Granice poczty:** importowany jest tekst wiadomości do 2 MB; załączniki pozostają w skrzynce i nie są dołączane do spraw. Żadna wiadomość nie jest automatycznie usuwana. Zmiana UIDVALIDITY nie powiela wiadomości o tym samym Message-ID. Bez Message-ID deduplikacja opiera się na UID/UIDVALIDITY.

Powiązanie nadawcy opiera się na adresie From po odebraniu przez Twój serwer. Mailcow musi odrzucać podszywanie i sprawdzać SPF/DKIM/DMARC; sam tekst From nie jest dowodem tożsamości. Dla korespondencji wymagającej pewnego uwierzytelnienia używaj zalogowanego portalu. Nie kieruj do kanału niezaufanej skrzynki z wyłączoną kontrolą nadawców.

SMTP globalny jest konfigurowany przez WWW w Ustawieniach. Obsługuje wiadomości dotyczące kont i zgłoszeń bez osobnego transportu. Kanał zespołu domyślnie korzysta z tego samego SMTP, ale ma własny adres nadawcy i IMAP. Tryb „Osobny SMTP” wymaga osobnych danych tylko wtedy, gdy potrzebuje tego dostawca poczty. Istniejące parametry z `.env` są importowane jednorazowo do szyfrowanej konfiguracji przy aktualizacji; późniejsze zmiany w WWW mają pierwszeństwo. Jeśli projekt ma kilka aktywnych kanałów, sprawa przyjęta przez pocztę zachowuje swój kanał; sprawa z portalu używa pierwszego aktywnego kanału projektu. Wysyłki mają maksymalnie pięć prób. Wyłączony kanał wstrzymuje swoje wysyłki.

## SSO / dostawcy tożsamości

Obsługiwany protokół: **OpenID Connect**. Możesz dodać kilka konfiguracji, np. Keycloak, Microsoft Entra ID i Google. Natywny SAML nie jest zaimplementowany; ewentualną federację SAML obsłuż w brokerze, np. Keycloak.

1. Utwórz klienta poufnego OIDC u dostawcy; włącz Authorization Code.
2. Redirect URI: `https://help.example.com/api/sso/callback` (dokładna domena APP_URL).
3. W Ustawienia → Logowanie SSO wpisz issuer, client ID i secret. Issuer ma być adresem realm/dostawcy z discovery, nie adresem ekranu logowania. Przykład struktury Keycloak: `https://sso.example.com/realms/Service Desk` — użyj faktycznego adresu swojego realm.
4. Używane scope: openid, email, profile. Dostawca musi zwrócić właściwy issuer, subject oraz wymagane dane konta.
5. Dla istniejącego konta kliknij „Powiąż konto” i podaj jego rzeczywisty subject `sub` od dostawcy. W Keycloak jest to ID użytkownika. Aplikacja celowo nie scala kont wyłącznie po e-mailu.
6. Opcjonalne automatyczne tworzenie kont wymaga zweryfikowanego e-maila od dostawcy i zgodnej domeny. Powstaje wyłącznie klient, nie administrator/agent.

Zachowaj aktywnego lokalnego administratora do awarii dostawcy. LDAP nadal może synchronizować konta i członkostwa, a jawne powiązanie SSO może wskazywać takie konto. Ustawienia wyłączenia kont pozostają obowiązujące.

## SLA i czas

Projekt → SLA:

- Strefa IANA, np. Europe/Warsaw; przedziały godzin per dzień i daty wolne. Pusty dzień jest wolny, 00:00–24:00 oznacza całą dobę.
- Osobne mierniki: do pierwszej odpowiedzi lub do osiągnięcia wskazanego statusu.
- Cele w minutach per priorytet; opcjonalne ograniczenie miernika do formularzy.
- Start w wybranych statusach lub od utworzenia; pauza np. „Oczekuje na klienta”; stop np. „Rozwiązane”.
- Opcjonalny reset po ponownym wejściu w status początkowy. Dla resetu wybierz rzeczywisty status startowy.

Zmiana polityki przelicza mierniki istniejących spraw. Zamknięcie zatrzymuje dalsze naliczanie. Święta, weekendy i zmiana czasu są uwzględniane w kalendarzu. Pierwsza odpowiedź to zapisany moment odpowiedzi zespołu; nie jest wyznaczana na nowo dla każdej późniejszej rozmowy.

Moduł czasu pokazuje **czas kalendarzowy** w kolejnych statusach, sumuje powroty do tego samego statusu i liczy od utworzenia do zamknięcia. To nie czas faktycznej pracy agenta. Historia sprzed 0.5.0 jest oznaczona jako niepełna. Dane dawnych zamkniętych spraw mogą mieć przybliżoną datę zamknięcia równą wcześniejszej ostatniej aktualizacji.

## Statusy, szablony i rozwiązanie

Szablon obejmuje statusy, przejścia i stan początkowy. Edytujesz go bezpośrednio w Ustawieniach → Szablony obiegów, wraz z mapą strzałek. Zmiany obejmują przypisane projekty; serwer najpierw waliduje wszystkie mapy, istniejące zgłoszenia i reguły. Szablon można usunąć wyłącznie, gdy nie używa go żaden projekt, również zarchiwizowany. Nowe projekty korzystają z szablonu domyślnego. Statusy i przejścia można edytować wyłącznie w centralnym szablonie; projekt nie może odłączyć mapy. Reguły pozostają niezależne w każdym projekcie.

Projekt → Opcje: wskaż statusy otwierające okno rozwiązania oraz wymagalność tekstu. Kategoria „Zamknięte” jest zawsze ostateczna, niezależnie od nazwy statusu. Nie można odblokować jej automatyzacją. Do okresu oczekiwania na klienta używaj kategorii „Rozwiązane”, nie „Zamknięte”.

## Środki trwałe

Utwórz projekt typu Środki trwałe. W katalogu dodawaj urządzenia, nazwę, typ, numer seryjny, właściciela, stan i własne właściwości. W projekcie zgłoszeń → Opcje dopuść wybrane katalogi. Agent musi mieć dostęp do projektu sprawy i katalogu urządzenia.

Urządzenie można podpiąć do istniejącej sprawy albo utworzyć z niego nową. W tym drugim przypadku zapis sprawy i powiązania jest jedną transakcją. Powiązania pozostają zespołowe. Katalog nie wykonuje skanowania sieci, inwentaryzacji z agentów ani księgowej amortyzacji.

## Profile, organizacje i konta użytkowników

Nazwy lokalne: pięć pierwszych liter nazwiska i dwie imienia; krótkie nazwisko jest uzupełniane literami imienia do siedmiu znaków. Jeśli oba człony są krótkie, pozostałe znaki uzupełnia numer. Kolizje dodają kolejne litery imienia, następnie numer. Znaki są normalizowane. Przykład Adam Dehmel → dehmead. Administrator może wybrać nazwę podczas tworzenia; klient nie może jej ustawić ani zmienić. Zmiana nazwiska nie zmienia nazwy konta. LDAP używa sAMAccountName.

Konto utworzone z hasłem administratora nie wymaga zmiany przy pierwszym logowaniu; puste hasło wymaga działającego SMTP i powoduje wysłanie jednorazowego zaproszenia ważnego 48 godzin. Autor automatyzacji jest zwykłym kontem użytkownika; nadaj mu tylko potrzebne członkostwa projektów. Dawne konta serwisowe zachowują identyfikatory i historię.

Profil → zmiana imienia/nazwiska: wniosek do administratorów. Zmiana e-maila: kod na stary adres, potem osobny kod na nowy; każdy etap ma 10 minut i do pięciu prób. Brak dostępu do starego adresu wymaga uzasadnienia i decyzji administratora. Zmiana adresu kończy bieżące sesje. LDAP zarządza swoimi danymi tożsamości.

Organizacje: administrator wskazuje członków i projekty z portalem oraz włącza opcję wspólnych zgłoszeń. Przy tworzeniu sprawy wybierz firmę; pozostawienie „Tylko zgłaszający” nie udostępnia jej firmie. Odebranie członkostwa lub dostępu do projektu odbiera także widoczność. Klient nie otrzymuje całej listy użytkowników organizacji.

## Webhooki

Wychodzące: wybierz projekt, HTTPS i zdarzenia. Akcja automatyzacji również może wskazać taki endpoint. Sieć prywatna jest osobną, jawną opcją; adresy lokalne/metadanych są blokowane. Brak przekierowań. Sekret jest pokazywany raz przy tworzeniu/rotacji.

Podpis: HMAC-SHA256 nad `timestamp + "." + dokładne bajty JSON`. Nagłówki: X-ServiceDesk-Timestamp, X-ServiceDesk-Signature i X-ServiceDesk-Delivery. Odbiorca powinien sprawdzić podpis, dopuszczalny wiek i unikalność dostarczenia. Do pięciu prób wysyłki.

Przychodzące: POST `/api/hooks/ID`, `Authorization: Bearer SEKRET` i JSON:

```json
{"event_id":"unikalna-operacja-123","ticket_key":"CW-42"}
```

Konfiguracja wiąże endpoint z projektem i wybranym kontem użytkownika. Reguła projektu z wyzwalaczem „Odebranie webhooka” wykonuje właściwe akcje. Ten sam event_id nie uruchamia ponownie operacji. Sekret przechowuj poza frontendem i kodem strony publicznej.

## Ustawienia dodane w 0.7.0

- **Ustawienia → Szablony e-mail**: cztery edytowalne szablony domyślne oraz własne. Wyzwalacze: utworzenie sprawy, komentarz, zmiana statusu, aktualizacja pól lub wyłącznie akcja automatyzacji. Szablon uczestników przypisany do projektu zastępuje globalny szablon uczestników tego zdarzenia.
- **Projekt → Obsługa i wygląd**: automatyczne obserwowanie działań agenta oraz informacja o nowych sprawach dla kierowników lub zespołu. Obserwatorzy i ich liczba są ukryci przed klientem.
- **Projekt → SLA**: w mierniku wybierz konkretne formularze i zaznacz widoczność dla klienta, jeśli jest potrzebna. Pusta lista formularzy obejmuje wszystkie.
- **Moje konto → Weryfikacja dwuetapowa**: skonfiguruj TOTP w aplikacji uwierzytelniającej, potwierdź kodem i zachowaj jednorazowe kody odzyskiwania. Każde logowanie, również przez SSO, wymaga wtedy dodatkowego kroku. Wyłączenie 2FA wymaga kodu.
- **Użytkownicy → Edytuj**: opcja aktywności konta pozwala zablokować logowanie i sesje. Synchronizacja LDAP nie zastępuje lokalnej blokady konta.
- **Poczta zespołów**: własne SMTP jest obowiązkowe dla przypisanego kanału; IMAP można wyłączyć. Wyłączenie kanału zatrzymuje jego wysyłkę, bez powrotu do głównego SMTP. Projekt bez przypisanego kanału korzysta z głównego SMTP. Stare kanały używające głównego SMTP trzeba uzupełnić przed wznowieniem ich wysyłki.
- **Statusy i automatyzacja**: akcja „Wyślij e-mail z szablonu” wskazuje zapisany aktywny szablon. Autor komentarza może być dowolnym aktywnym użytkownikiem z dostępem do sprawy; autor notatki wewnętrznej musi należeć do zespołu.


## GitHub OAuth for imported requesters (1.1)

To let people whose account was created from a GitHub Issue sign in directly, create an SSO provider with issuer `https://github.com`, the OAuth App Client ID/Secret, and callback `<APP_URL>/api/sso/callback`. Service Desk maps the GitHub numeric user ID into `sso_subjects`; email is only refreshed after GitHub returns a verified address during OAuth login.
