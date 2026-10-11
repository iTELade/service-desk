# Walidacja Service Desk 2.1.0

Wersja **2.1.0**, SQLite **10**. Migracja 9 → 10 zachowuje istniejące zgłoszenia i konfigurację, bez dodawania portalu wiedzy. Powrót do 2.0.x wymaga pełnej kopii danych sprzed migracji, wraz z master.key.

## Bramki

```bash
npm ci
npm run check
npm run test:ci
npx playwright install --with-deps chromium firefox webkit
npm run test:browser
npm run test:visual
npm run test:load
for engine in chromium firefox webkit; do
  DESK_BROWSER_ENGINE="$engine" npm run test:workspace
done
npm audit
bash -n scripts/upgrade.sh
sha256sum -c MANIFEST.sha256
```

Lokalna walidacja obejmuje 255 testów aplikacji, 362 kontrole dotychczasowych ekranów i 1431 kontroli wizualnych. Nowy zestaw workspace-regression sprawdza rzeczywiste działania w przeglądarce oraz wszystkie nowe ekrany przy szerokościach 390/768/1280/1440, w jasnym i ciemnym motywie, z kontrolą kontrastu i przepełnienia. Testy Chromium/Firefox/WebKit oraz uruchomienie publikowanego kontenera są bramkami CI wydania. Wynik konkretnego wydania należy sprawdzić w jego workflow — dokumentacja nie potwierdza wykonania jeszcze trwającego przebiegu.

Testy domenowe 2.1 obejmują migrację, ACL, idempotencję odpowiedzi/broadcastów/worklogów, atomową zmianę statusu, konflikty wersji, częściowe błędy bulk, CSAT, cykle zależności, manager approval, rollback/freeze, monitoring i szkic workflow. Zachowano wcześniejsze testy integracji, instalacji, katalogu, workflow, automatyzacji i bezpieczeństwa.

Na izolowanym zbiorze 10 000 zgłoszeń: pierwsza i ostatnia strona po 25 rekordów, brak nakładania wyników, pusta strona po końcu, raport z ograniczeniem 500 kandydatów SLA oraz operacja zbiorcza 50 spraw i jej bezpieczne ponowienie. Jeden lokalny pomiar: 67/75 ms dla stron, 311 ms dla raportu, 1391 ms dla bulk. To wynik syntetyczny, nie gwarancja dla instalacji produkcyjnej.

`npm audit`: 0 znanych podatności w lokalnym sprawdzeniu zależności wydania.

## Po wdrożeniu

Sprawdź healthz (ok / 2.1.0 / 10), logowanie każdej używanej roli, widoczność projektów, tworzenie przez portal, odpowiedź publiczną i notatkę, chronione pliki, konflikty równoczesnego zapisu, CSAT i ewidencję pracy. Zweryfikuj reguły, rzeczywiste połączenia SMTP/IMAP/LDAP/SSO/GitHub/webhook oraz konfigurację adaptera monitoringu. Środowisko syntetyczne nie potwierdza konfiguracji dostawców produkcyjnych.

Publikator buduje amd64/arm64, uruchamia obraz po digest bez roota, wykonuje świeżą instalację, tworzy zgłoszenie i kontroluje SQLite/master.key. Następnie publikuje stabilny tag i desk-release.json. Opublikowanie obrazu nie jest wdrożeniem na serwer użytkownika.
# Kontrola gałęzi przygotowawczej 2.1.1

2.1.1 pozostaje nieopublikowane. Lokalnie przeszło **260 testów aplikacji**, **523 kontroli workspace** w Chromium, **362 kontrole dotychczasowych funkcji** i **1431 kontroli wizualnych bez błędów**. Nowy zestaw domenowy obejmuje domyślne wyłączenie funkcji, uprawnienia, izolację klienta/projektu, archiwum/usuwanie, limit 2000 kandydatów, polskie znaki, konflikty wersji ustawień, zachowanie innych opcji projektu i brak notatek wewnętrznych w podsumowaniu. Zestaw przeglądarkowy weryfikuje włączenie opcji w UI, ręczne powiązanie, podgląd podsumowania, sygnały uwagi, podpowiedzi w formularzu, wybór bieżącego projektu i czyszczenie wyników przy zmianie projektu oraz otwieranie zgłoszenia w archiwalnym projekcie; obejmuje nową stronę ustawień w obu motywach i czterech szerokościach.

CI PR dodatkowo wykonuje pełną regresję workspace w Chromium, Firefox i WebKit, dotychczasową regresję, kontrolę wizualną oraz obciążenie 10 000 zgłoszeń. Wynik tych bramek należy sprawdzić przed późniejszym wydaniem. Ta gałąź nie uruchamia publikacji na main. Schema pozostaje 10; nie dodano migracji ani portalu wiedzy.

