# Service Desk 2.0.2

Wydanie naprawia problemy wykryte podczas audytu 2.0.1 i rozszerza wspólny interfejs systemu. Schemat bazy pozostaje **9**.

## Bezpieczeństwo i obsługa zgłoszeń

- Edycja i wyłączenie schematu akceptacji sprawdzają uprawnienia do jego istniejącego projektu. Schematów nie można przenosić pomiędzy projektami.
- Decyzja akceptacji, przejście etapu i audyt są jedną transakcją. Poprawiono zapytania SQLite, walidację aktywnych akceptujących i przynależności formularza do projektu.
- Akceptacje usuniętych, zarchiwizowanych i ostatecznie zamkniętych zgłoszeń są blokowane; oczekujące instancje są anulowane. Wyłączenie schematu anuluje oczekujące instancje. Etapów nie można zmieniać w trakcie akceptacji.
- Tryb `all` wymaga decyzji dla każdej wskazanej osoby lub selektora grupy. Dla selektora roli wystarcza przedstawiciel tej roli; nie oznacza to głosu każdego użytkownika w grupie.
- Metadane wspólnych widoków kolejki są dostępne wyłącznie uprawnionemu zespołowi. Nieistniejący projekt zwraca kontrolowany błąd 404.
- API, WWW i poczta traktują publiczną odpowiedź zgłaszającego jednakowo. Własna odpowiedź zgłaszającego nie realizuje SLA pierwszej odpowiedzi zespołu.
- Nowe projekty z domyślną mapą otrzymują regułę ponownego otwarcia po odpowiedzi klienta w statusie oczekiwania. Własne obiegi istniejących projektów pozostają pod kontrolą administratorów.
- Zaktualizowano Nodemailer, Mailparser, ip-address i source-map-js; audyt zależności przy przygotowaniu wydania: 0 podatności.

## Interfejs całego systemu

- Wspólne powierzchnie, odstępy, kontrolki, fokus klawiatury, stany formularzy, komunikaty i obsługa ograniczonych animacji.
- Poprawiona geometria nagłówka i nawigacji; marka instancji nie jest nadpisywana. Kontekst projektu jest bezpiecznie escapowany i respektuje rzeczywiste uprawnienia kierownika.
- Menu mobilne i zapamiętywane zwijanie nawigacji desktopowej, przewijanie tabel i tablic bez przepełnienia całej strony oraz zwijane szczegóły zgłoszenia.
- Działający ciemny motyw kolejki, ustawień, zgłoszeń, portalu i ekranów logowania; poprawione kontrasty statusów, SLA i kontrolek.
- Natywne zakładki odpowiedzi, notatek wewnętrznych, historii i załączników. Strzałki, Home i End obsługują zakładki; szkic odpowiedzi i wybrana zakładka przetrwają odświeżenie rozmowy.
- Stały rozmiar awatarów, wyszukiwanie użytkowników oraz wyszukiwanie rzeczywistych kategorii administracji.
- Decyzje akceptacji dostępne z poziomu zgłoszenia i administracji, z etapem, stanem oraz historią decyzji.
- Zapisane widoki zachowują kolumny, sortowanie i gęstość. Preferencje gęstości użytkownika są trwałe.
- Rozszerzone tłumaczenia PL/EN/DE oraz poprawione komunikaty wysyłania plików i błędów formularzy.
- Ochrona przed przypadkowym opuszczeniem formularzy administracyjnych z niezapisanymi zmianami; przyciski anulowania zmian.

## Schemat 9 i aktualizacje

- Konfiguracja usług i kategorie katalogu są tworzone także dla nowych projektów oraz uzupełniane dla istniejących instalacji schematu 9. Zmiany ustawień projektu synchronizują metadane w tej samej transakcji.
- Stan integracji ma wynik, czas pomiaru i komunikat. LDAP, SMTP, SSO, GitHub i sprawdzanie wydań aktualizują stan po rzeczywistej operacji; brak testu jest oznaczany jako „Nie sprawdzono”.
- `/healthz` zwraca rzeczywisty schemat SQLite. Kontener i aktualizator wymagają oczekiwanej wersji oraz schematu; rollback sprawdza również poprzednią wersję.
- Ręczny skrypt aktualizacji odczytuje wersję i schemat z paczki, obsługuje schematy 4–9, zachowuje kopię danych i wycofuje nieudaną aktualizację.
- CI oraz publikacja wymagają regresji Chromium: aktywne trasy, 390/768/1280/1440 px, oba motywy, zakładki, szkice, wyszukiwanie i menu mobilne.

## Wyniki regresji przed publikacją

- 240 testów aplikacji: PASS, 0 pominiętych.
- 263 kontroli w rzeczywistym Chromium: PASS.
- 77 dodatkowych kontroli HTTP/SQLite od instalacji do uprawnień, MFA i kopii: PASS.
- Audyt npm: 0 podatności; składnia, YAML i sumy plików: PASS.
- Budowa wieloplatformowego obrazu i test jego świeżej instalacji są ostatnimi bramkami publikacji w GitHub Actions.

## Aktualizacja

Aktualizuj do `v2.0.2` przez panel albo według [UPGRADE.md](UPGRADE.md). Manifest `desk-release.json` w GitHub Release zawiera faktyczny digest obrazu `ghcr.io/itelade/service-desk:v2.0.2`, schemat 9 i minimalny schemat 6 dla aktualizatora. Zawsze zachowaj spójną kopię SQLite oraz `master.key`.

Automatyczna regresja korzysta z danych syntetycznych i podstawionych transportów. Rzeczywiste LDAP/SSO/SMTP oraz aktualizację konkretnej instalacji sprawdź według [VALIDATION.md](VALIDATION.md).
