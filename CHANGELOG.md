## 1.0.1 - 2026-09-14

- Retired active custom global role/permission-set handling; the product now uses Global Administrator, Project Manager, Agent and Customer roles with project isolation and LDAP project mappings.
- Made the Administration Center the Settings entry point and separated Assets / CMDB as a first-class administration category.
- Completed GitHub Issues one-way intake administration with CRUD, enable/disable, connection testing, named request-type selection, readable status/history, mandatory auto-close, deduplication and failure-safe retry behavior.
- Centralized active 1.0.1 version reporting and cache busting.
- Added 1.0.1 regression coverage and aligned CI/release validation with npm run test:ci.

# Service Desk 0.8.0

Major functional release. Database schema: 8.

- LDAP global Administrator mappings and LDAP-group-backed custom RBAC.
- English-first localization foundation with Polish language switching.
- Business-hours SLA, inbound team e-mail, scoped API tokens and signed webhooks are retained and supported.
- Global audit browser/export, saved/shared queues and operational dashboard.
- Multi-stage approvals and expanded customer organization rules.
- Asset lifecycle, warranty/replacement metadata, relationship graph and asset history.
- GitHub Issues forwarding into Service Desk with persistent linking, confirmation comment and optional automatic close.
- TOTP setup with a locally generated QR code and recovery codes.
- FIDO2/WebAuthn hardware security keys as a second factor; multiple keys can be registered per account.
- Knowledge Base integration #14 is intentionally excluded from this release.

See `RELEASE_NOTES_0.8.0.md` for the full release scope.

# Service Desk 0.7.1

Poprawki istniejącej aplikacji, bez zmiany schematu bazy (nadal 7).

- Użytkownicy: bezpośrednie włączanie/wyłączanie dostępu, edycja imienia, nazwiska i e-maila kont lokalnych, zdjęcia do 2 MB. Zmiana dostępu unieważnia sesje. Lokalne konto można usunąć z listy i zanonimizować z zachowaniem powiązań historycznych; konta LDAP blokuje się lokalnie, a dane zarządza w katalogu.
- Portal: edycja opisu i pól dostępna wyłącznie w panelu zespołu; klient nie może zmieniać szczegółów przez API. Poprawiony kontrast elementów po najechaniu w ciemnym motywie.
- Statusy: widoczny uchwyt do przeciągania, nadal dostępne strzałki do obsługi klawiaturą. Edycja w centralnych szablonach.
- Urządzenia: czytelny wybór dozwolonych katalogów i przejście do ustawień projektu, gdy nie ma dostępnych urządzeń.
- Odświeżanie co 5 sekund: powiadomienia, kolejki, tablica i rozmowa; pisana odpowiedź nie jest usuwana podczas aktualizacji rozmowy.
- Poczta: wyraźne ustawienia powiadamiania zespołu/kierowników w projekcie i dostęp do edycji szablonów/wyzwalaczy. Testy potwierdzają wysyłkę według zdarzeń oraz akcję e-mail w automatyzacji.
- Aktualizacje: usunięte pola repozytorium i tokenu z ekranu; automatyczne sprawdzanie co 6 godzin pozostaje aktywne. Wersjonowane adresy JS/CSS.
- Reset do instalatora: lokalny administrator potwierdza hasło, jednorazowy kod e-mail (10 minut, 5 prób) i tekst „USUŃ WSZYSTKO”. Dane aplikacji usuwane przy restarcie. Kopie zapasowe oraz konfiguracja infrastruktury Docker/.env pozostają. Kod nowej instalacji jest w logach kontenera. Stare konto z BOOTSTRAP_ADMIN nie jest odtwarzane.

Nie uruchamiaj resetu w celu aktualizacji — służy wyłącznie do świadomego usunięcia danych.

Walidacja i ograniczenia: VALIDATION.md. Publikacja obrazu i manifestu następuje w GitHub Actions po pomyślnych testach.


# Service Desk 0.7.0

Aktualizacja istniejącego systemu. Schemat bazy: 7.

- Centralna edycja statusów i przejść w szablonach; przeciąganie statusów i przyciski zmiany kolejności. Projekty zachowują własne reguły automatyzacji.
- Poprawka renderowania katalogu LDAP (`mappingRow is not defined`), ciemnego podświetlenia kolejki, odstępów przy powiązaniach i zdjęcia w panelu bocznym.
- Czytelny wybór projektu środków trwałych, z przejściem do katalogu po utworzeniu.
- SLA wybierane według formularza zgłoszenia, z osobnym ustawieniem widoczności dla klienta.
- Klient może odpowiadać w otwartej sprawie, ale nie może edytować pól ani ręcznie zmieniać statusu po utworzeniu.
- 2FA TOTP z jednorazowymi kodami odzyskiwania, także jako dodatkowy krok po logowaniu SSO. Wyłączenie konta blokuje logowanie i dostęp aktywnych sesji.
- Obserwowanie ręczne i automatyczne po działaniu agenta, konfigurowane per projekt. Liczba i lista obserwatorów są dostępne tylko zespołowi.
- Odbiorcy aktualizacji zależni od autora; opcjonalne powiadamianie kierowników lub zespołu o nowych sprawach.
- Edytowalne szablony e-mail, wyzwalacze zdarzeń i akcja wysyłki szablonu w automatyzacji. Cztery standardowe szablony są dostępne po migracji.
- Główny SMTP dla komunikacji systemowej i projektów bez kanału; przypisana skrzynka zespołu korzysta wyłącznie z własnego SMTP. Odbiór IMAP jest opcjonalny.
- Zwykłe konta użytkowników jako autorzy komentarzy automatycznych; zachowanie tożsamości dawnych kont serwisowych.
- Odświeżanie dzwonka co 5 sekund oraz po powrocie do aktywnej karty.
- Stałe repozytorium `iTELade/service-desk`, automatyczne sprawdzanie wydań i komunikat aktualizacji dla administratora.
- Wstępna konfiguracja i opis kontraktu dla osobnej aplikacji bazy wiedzy. Artykuły nie są jeszcze pobierane.

Przed aktualizacją sprawdź SMTP istniejących kanałów zespołów: konfiguracja korzystająca wcześniej z głównego SMTP wymaga uzupełnienia własnego SMTP. Wiadomości pozostają w kolejce i nie przełączają się na innego nadawcę.

Walidacja lokalna: 123/123 testów automatycznych; kontrola składni JavaScript. Pełny test wizualny w Chromium i budowa Docker nie zostały wykonane lokalnie — szczegóły w `VALIDATION.md`. Workflow wydania wykonuje ponownie testy i budowę Docker.

---

# Service Desk 0.6.0 — zmiany v2

Aktualizacja istniejącej aplikacji, schemat bazy 6. Poniższe funkcje są zaimplementowane; zakres weryfikacji znajduje się w VALIDATION.md.

## Interfejs i branding

- Nowy zestaw kolorów ciemnego motywu: tło, karty, pola, tabele, statusy, dialogi, panel boczny i kontrast tekstu. Nadal dostępne: jasny / ciemny / urządzenie.
- Faktyczny status zgłoszenia widoczny nad przyciskami przejść.
- Własne statusy widoczne na tablicy wybranego projektu; dodawanie statusu z tablicy i przeciąganie zgłoszeń przez dozwolone przejścia. Wymagane rozwiązanie nadal otwiera dialog.
- Podgląd numeru zgłoszenia przy tworzeniu projektu, uwzględniający klucz, licznik i liczbę zer.
- Neutralne logo, nazwy i przykłady. Instalator WWW: nazwa firmy, marka, logo i pierwszy administrator. Jednorazowy kod chroni pustą instalację przed przejęciem. Dotychczasowe dane użytkowników i projekty nie są kasowane.
- Wersja 0.6.0 w informacjach o systemie i `/healthz`.
- Zdjęcia profilowe i logo: PNG/JPEG/WebP do 2 MB.
- Katalog urządzeń otwierany z projektu środków trwałych; usunięto powieloną pozycję menu głównego.

## Zgłoszenia i workflow

- Archiwizacja i przywracanie do listy bieżącej. Archiwum nie przyjmuje zmian.
- Usuwanie zgłoszenia przez administratora po wpisaniu jego pełnego klucza. Treść jest usuwana z głównego rekordu i rozmowy; pozostaje techniczny rekord, identyfikatory audytu i rezerwacja numeru. Nie jest to funkcja usuwania całej historii z kopii zapasowych.
- Klucze usuniętych zgłoszeń i stare aliasy pozostają zarezerwowane. Licznik nie cofa się. Klucz i format numeracji projektu są stałe po utworzeniu.
- Odłączanie powiązanych zgłoszeń, wraz z wyłączeniem synchronizacji tej pary. Nie usuwa to drugiej sprawy.
- Podpowiedzi dostępnych kluczy po wpisaniu prefiksu i co najmniej 3 cyfr, z opóźnieniem 250 ms.
- Edycja szablonów statusów i przejść bez projektu wzorcowego; mapa strzałek, klonowanie, domyślny szablon, lista powiązanych projektów.
- Usuwanie tylko nieużywanego szablonu. Zmiana wspólnego szablonu waliduje wszystkie przypisane projekty przed zapisem. Lokalna zmiana mapy odłącza projekt od szablonu.
- Po ostatecznym zamknięciu wszystkie mierniki SLA przestają rosnąć, również przy braku pierwszej odpowiedzi. Zamknięta sprawa pozostaje dostępna klientowi do odczytu.

## Poczta, obserwowanie i powiadomienia

- Domyślne SMTP konfigurowane przez WWW, zaszyfrowane hasło, test połączenia i wysyłki, zmiany bez restartu.
- Projekt może korzystać z domyślnego SMTP oraz własnego adresu zespołu/IMAP albo opcjonalnego osobnego SMTP. Stare dane połączeń pozostają zachowane.
- Aktualizacje zgłoszeń trafiają do kolejki także przed skonfigurowaniem SMTP. Panel pokazuje stan i pozwala ponawiać nieudane wiadomości.
- Reporter, opiekun i obserwujący otrzymują odpowiednie aktualizacje; notatki wewnętrzne trafiają wyłącznie do uprawnionego zespołu. Dostęp sprawdzany jest ponownie przed wysyłką.
- Obserwowanie i rezygnacja z obserwowania dla agentów i administratorów.
- Dzwonek zespołu: zmiany zgłoszeń i wnioski do zatwierdzenia, licznik ukryty przy zerze, oznaczanie jako przeczytane. Klient nie dostaje panelu historii wewnętrznej.

## Integracje i wdrożenie

- API v1: tokeny kont serwisowych, projekt i zakresy dostępu, wygaśnięcie/odwołanie, odczyt, tworzenie, komentarze i przejścia. Zapisy mają klucz idempotencji.
- Zachowane webhooki przychodzące uruchamiające automatyzacje; panel wskazuje endpoint i format żądania. Webhooki wychodzące są opcjonalnym osobnym kierunkiem.
- Sprawdzanie stabilnych wydań GitHub, manifest z digestem GHCR, wersja dostępna w panelu i opcjonalne sprawdzanie co 6 godzin.
- Osobny kontener aktualizatora: pobranie obrazu przed zatrzymaniem aplikacji, kopia danych, konserwacja, migracja, healthcheck i rollback wraz z bazą. Aplikacja nie ma dostępu do Docker socket.
- Workflow GitHub Actions do testów, budowania obrazów amd64/arm64 i publikowania manifestu.
- Skrypt aktualizacji istniejącej instalacji z pełnej paczki, zachowanie rzeczywistego starego obrazu i końcowej kopii danych. Bez usuwania wolumenu.

---

## Historia poprzednich wydań

# Changelog iTELade Desk 0.5.0

Aktualizacja z 0.4.0, schemat bazy 4 → 5. Dotychczasowe projekty, formularze, konta, klucze, reguły i dane są zachowane.

## Zgłoszenia i portal

- Wybór zgłaszającego przy tworzeniu przez zespół i jego zmiana w istniejącej sprawie. Historia zachowuje twórcę i wykonawcę zmiany.
- Zamknięte zgłoszenie pozostaje widoczne w portalu. Klient, agent i administrator nie mogą go ponownie otworzyć ani dopisać ręcznej odpowiedzi. Rozwiązane zgłoszenie może wrócić do obsługi przed zamknięciem.
- Okno rozwiązania dla wskazanych statusów; wymagalność konfigurowana per projekt, kontrolowana również w API i automatyzacji.
- Nazwane przyciski przejść nad numerem zgłoszenia: do trzech oraz rozwijane pozostałe.
- Klonowanie i powiązania spraw widoczne wyłącznie zespołowi z dostępem do obu projektów.
- Ukrywanie tematu/opisu w formularzu z użyciem stałych wartości administratora, także przy próbie podmiany wartości przez API.
- Zdjęcia w komentarzach, wzmianki, linkowanie dostępnych kluczy, prywatna historia.
- Filtr własnych spraw lub spraw firmy, obok istniejących filtrów projektu, statusu, priorytetu, opiekuna i dat.
- Motywy jasny, ciemny i zgodny z urządzeniem; ustawienia układu, koloru, powitania, stopki i sekcji portalu.

## Moduły

- Łączne czasy kolejnych pobytów w statusach, wiek sprawy i stały czas do zamknięcia.
- Synchronizacja dowolnych par projektów: przycisk przekazania, jedna kopia, prywatne powiązanie, kierunki komentarzy, opcjonalne mapowania statusów, wskazany autor i rzeczywisty autor w audycie.
- OIDC: wielu dostawców, PKCE, state/nonce, mapowanie istniejących tożsamości, opcjonalne zakładanie klientów z dozwolonych domen.
- Katalog LDAP przeniesiony z menu głównego do Ustawień.
- Katalogi środków trwałych, własne właściwości, właściciel, numer seryjny, status, powiązania z dopuszczonymi projektami i tworzenie spraw z urządzenia.
- Organizacje klientów z opcjonalnym współdzieleniem spraw.
- Wspólne szablony statusów/przejść, klonowanie, szablon domyślny i zastosowanie do projektu z zachowaniem jego reguł.

## Automatyzacja i SLA

- Wyzwalacze dodania komentarza, webhooka i zmiany zgłaszającego.
- Warunki autora (klient/agent/konto serwisowe), widoczności i treści komentarza, tytułu, źródła, zgłaszającego i organizacji.
- Akcje wyboru konta serwisowego jako autora, przypisania wykonawcy zdarzenia lub bota, ustawienia rozwiązania i wysłania webhooka.
- Usunięcie gotowego schematu z interfejsu. Istniejące reguły nie są kasowane.
- Konfigurowalne mierniki SLA: cele per priorytet, ograniczenie do formularzy, start/pauza/stop/reset, dni robocze, święta i strefa czasowa.
- Oddzielne, transakcyjne wykonanie modułów. Błędna synchronizacja nie blokuje poczty; ponowienie nie powiela zakończonych modułów.

## Konta i poczta

- Konta serwisowe bez logowania interaktywnego; autorzy botów i synchronizacji.
- Automatyczne nazwy kont z imienia/nazwiska i rozwiązywanie kolizji, sAMAccountName dla LDAP, możliwość wyboru nazwy przez administratora.
- Hasło nadane przez administratora nie wymaga pierwszej zmiany. Puste hasło wysyła jednorazowe zaproszenie, jeśli SMTP jest skonfigurowane.
- Zdjęcia i profil; zatwierdzanie zmiany imienia/nazwiska; kod na stary, następnie nowy e-mail lub wniosek do administratora przy braku dostępu.
- HTML e-mail i osobne skrzynki zespołów IMAP/SMTP. Nowe zgłoszenia, odpowiedzi, separator cytatu, identyfikatory wątków, powiadomienia o sprawach.
- Trwały kursor IMAP, deduplikacja, blokada automatycznych odpowiedzi i obsługa błędów. Wiadomości nie są usuwane ze skrzynki.
- Webhooki wychodzące z HMAC i ponowieniami; przychodzące z tokenem i unikalnym identyfikatorem zdarzenia.

## Migracja i ograniczenia

Nowe pomiary statusów zaczynają się od migracji; brakująca historia nie jest wymyślana. Dla dawnych zamkniętych spraw moment zamknięcia przybliża wcześniejsze updated_at. Pełny zapis historii statusów dotyczy nowych spraw i kolejnych zmian.

Integracje wymagają własnych danych dostępowych. Obsługa załączników, natywny SAML i pełny klaster Jira Data Center nie należą do tej paczki. Szczegóły testów: VALIDATION.md.
