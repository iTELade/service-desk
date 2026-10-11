# Walidacja Service Desk 2.0.3

Wersja aplikacji: **2.0.3**. Schemat SQLite: **9**. Aktywne zasoby: app.css, design-system.css, i18n.js, security.js, app.js, settings-center.js, release-1.1.2.js i product-shell.js, wszystkie z parametrem `v=2.0.3`.

Migrację ze schematu 8 do 9 sprawdzają testy zachowania zgłoszeń, komentarzy, sesji i konfiguracji. Po migracji użycie starszego kodu wymaga odtworzenia kopii schematu 8. Z 2.0.0/2.0.1 do 2.0.3 numer schematu nie zmienia się.

## Automatyczne bramki wydania

```bash
npm ci
npm run check
npm run test:ci
npx playwright install --with-deps chromium
npm run test:browser
npm audit
bash -n scripts/upgrade.sh
sha256sum -c MANIFEST.sha256
```

`test:browser` uruchamia świeżą instalację w tymczasowym katalogu, używa danych syntetycznych i zamyka serwer po teście. Opcjonalny `DESK_SCREENSHOTS=/ścieżka` zapisuje zrzuty kontrolne. `DESK_BROWSER_EXECUTABLE` pozwala użyć lokalnego Chromium.

Testy obejmują: izolację projektów i klientów, transakcyjne wieloetapowe akceptacje, blokady decyzji po usunięciu/archiwizacji, prywatność widoków i załączników, konfigurację schematu 9, SLA, MFA, API i idempotencję, automatyzacje, integralność SQLite oraz rollback aktualizatora przy błędnym schemacie.

Chromium otwiera wszystkie aktywne trasy administracyjne, zgłoszenie, projekty, kolejkę, tablicę, portal i profil. Macierz 390/768/1280/1440 px × jasny/ciemny motyw obejmuje sześć głównych powierzchni. Weryfikuje brak przepełnienia strony, rozmiar awatarów, kontrast przycisków (minimum 4,5:1), klawiaturę zakładek, zachowanie szkicu przy odświeżeniu, markę, wyszukiwanie oraz działające menu mobilne. Ekrany publiczne są sprawdzane w osobnym kontekście bez sesji.

## Produkcyjna kontrola po wdrożeniu

| Obszar | Warunek odbioru |
|---|---|
| Kontener | Uruchomiony jako nieuprzywilejowany użytkownik; healthz: ok / 2.0.3 / 9 |
| Instalacja | Pierwszy administrator powstaje raz; kod instalacji nie daje ponownej konfiguracji |
| Tożsamość | Logowanie lokalne, LDAP i SSO zgodnie z rzeczywistą konfiguracją; MFA i wylogowanie |
| Uprawnienia | Klient nie widzi obcych spraw/notatek; kierownik zarządza wyłącznie swoim projektem |
| Zgłoszenia | Tworzenie, przypisanie, odpowiedź, notatka, przejście, rozwiązanie i ostateczne zamknięcie |
| Akceptacje | Decyzja tylko właściwego akceptującego; wszystkie etapy; brak decyzji w archiwum/usuniętej sprawie |
| Kolejka i tablica | Łączone filtry, zapis/odtworzenie widoku, sortowanie i kolumny; dozwolone przejścia |
| UI | Wszystkie główne ekrany, oba motywy, telefon i desktop; fokus klawiatury, marka i język |
| Integracje | Faktyczny test LDAP/SMTP/SSO/GitHub; poprawny stan i czas wyniku; ponowienie po błędzie |
| Powiadomienia | Odpowiednia osoba dostaje publiczne powiadomienie; klient nie dostaje notatki wewnętrznej |
| Załączniki | Upload/download, limit 2 MB, widoczność publiczna/wewnętrzna, blokada aktywnej zawartości |
| Dane i aktualizacje | Spójna kopia SQLite i master.key, kontrola integralności, ćwiczenie rollback na kopii instalacji |

Automatyczne testy transportów używają podstawionych usług. Nie zastępują kontroli rzeczywistych serwerów klienta. GitHub Actions po zbudowaniu obrazu OCI uruchamia go, kontroluje healthcheck, tworzy administratora, projekt, zgłoszenie i notatkę oraz sprawdza SQLite, master.key i użytkownika bez uprawnień root; lokalne środowisko audytu nie ma demona Docker.

## Service Pack 1 — regresja zgłoszonego ekranu

Powolne pobieranie załączników i zmiany DOM muszą pozostawić jeden panel. Opóźniona odpowiedź po zmianie zgłoszenia nie może trafić do nowej sprawy. Błąd pobierania nie może generować pętli żądań; ponowienie jest jawne. Test wysyła plik wewnętrzny, sprawdza awarię uploadu i zachowanie wyboru, limit 2 MB, zawartość pobrania i nazwę pliku w przeglądarce. Załączniki, SLA i powiadomienia są sprawdzane przy 390/1440 px w obu motywach: kontrast tekstu co najmniej 4,5:1, brak białych powierzchni w ciemnym motywie, brak przepełnienia i zasłaniania nawigacji przez powiadomienie.
