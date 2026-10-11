# Service Desk 2.0.3 — Service Pack 1 dla 2.0.2

Service pack naprawia błędy odtworzone ze zgłoszonego zrzutu ekranu: powielanie panelu załączników, nieczytelne załączniki i SLA w ciemnym motywie oraz powiadomienia zasłaniające nawigację. Schemat SQLite pozostaje **9**.

## Poprawki

- Szybka zmiana trasy podczas startu czeka na metadane projektów; zapobiega wyjątkowi JavaScript w kolejce. Poprawiono też odczyt statusu początkowego w podglądzie mapy obiegu.

- Pobieranie załączników ma blokadę równoległych operacji dla konkretnego panelu. Opóźniona odpowiedź nie jest montowana po przejściu do innego zgłoszenia ani po odtworzeniu strony.
- Błąd pobierania pokazuje kontrolowany komunikat i przycisk ponowienia; obserwator zmian nie generuje pętli żądań.
- Nieudany lub przekraczający limit upload zachowuje plik i zaznaczenie widoczności; przycisk wraca do stanu aktywnego. Ponowienie nie wysyła ponownie plików, które już zapisano.
- Formularz uploadu używa uprawnień do konkretnego zgłoszenia. Zamknięte lub zarchiwizowane zgłoszenie oraz archiwalny projekt nie oferują wysyłania plików; pliki pozostają dostępne do pobrania zgodnie z uprawnieniami.
- Załączniki, SLA i powiadomienia korzystają ze wspólnych powierzchni i kolorów obu motywów. Usunięto wymuszone białe tło załączników, poprawiono odstępy, etykiety, checkbox i układ mobilny.
- Powiadomienia są wyświetlane na dole ekranu, poza nawigacją i przyciskami nagłówka.
- Zmieniono wersję aktywnych zasobów na 2.0.3, aby przeglądarka pobrała poprawione pliki.

## Regresja

Rozszerzono rzeczywiste testy Chromium o wolne żądania, przełączanie zgłoszeń w trakcie pobierania, awarię i ponowienie, upload, błąd uploadu, limit pliku, pobieranie i kontrast załączników/SLA/powiadomień na telefonie i desktopie w obu motywach. W przygotowaniu wydania przeszło 241 testów aplikacji i 362 kontrole Chromium; npm audit nie zgłasza podatności. Macierz motywów sprawdza faktycznie aktywny motyw po ponownym wczytaniu aplikacji. Publikację nadal blokują testy aplikacji, regresja przeglądarki, sumy plików oraz test świeżej instalacji gotowego kontenera.

## Aktualizacja

Aktualizuj do **v2.0.3** przez panel lub według [UPGRADE.md](UPGRADE.md). Przejście z 2.0.2 nie zmienia schematu bazy. Manifest `desk-release.json` zawiera rzeczywisty digest obrazu `ghcr.io/itelade/service-desk:v2.0.3`.

Testy używają danych syntetycznych. Rzeczywiste LDAP/SSO/SMTP i aktualizację konkretnej instalacji sprawdź według [VALIDATION.md](VALIDATION.md).
