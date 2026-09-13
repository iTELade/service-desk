# Service Desk 0.6.0

Samodzielny system zgłoszeń: portal klienta, projekty wewnętrzne i zewnętrzne, katalog urządzeń, własne formularze, mapy statusów, automatyzacje, kalendarze SLA, LDAP, OpenID Connect, IMAP, SMTP, API i webhooki. Node.js 24, SQLite, Docker; jeden kontener aplikacji korzystający z trwałego wolumenu. Aktualizator jest opcjonalnym drugim kontenerem.

To rozwój istniejącej aplikacji, nie produkt Atlassian ani pełna implementacja Jira. SQLite oznacza pojedynczą instancję zapisującą do bazy; nie uruchamiaj wielu replik aplikacji na tym samym wolumenie.

## Nowa instalacja

Wymagania: Docker Engine, Docker Compose v2, istniejąca sieć reverse proxy, domena HTTPS.

```bash
unzip Service_Desk_Docker.zip
cd itelade-desk
bash configure.sh
docker compose up -d --build desk
docker compose logs --tail=30 desk
```

W Nginx Proxy Manager utwórz Proxy Host: scheme `http`, host `service-desk`, port `3000`, certyfikat TLS i Force SSL. Domena musi odpowiadać `APP_URL`. Nie publikujemy portu 3000 na hoście. Nazwę sieci możesz ustawić w `PROXY_NETWORK`.

Otwórz domenę, wpisz jednorazowy kod z logów oraz nazwę organizacji, nazwę systemu, logo i dane pierwszego administratora. Następnie zaloguj się, utwórz projekty i skonfiguruj pocztę w Ustawieniach. Pusta instalacja nie zawiera projektów firmowych, kont klientów ani demonstracyjnych zgłoszeń. Rejestracja jest początkowo zamknięta.

## Istniejąca instalacja

Użyj **UPGRADE.md**. Pełna paczka obsługuje aktualizację z 0.4.0 lub 0.5.0. Nie uruchamiaj ponownie `configure.sh`, nie nadpisuj `.env` i nie usuwaj wolumenu. Stare nazwy kontenera i wolumenu są zachowane dla zgodności migracji; nie są częścią publicznego brandingu.

## Konfiguracja i obsługa

- **CHANGELOG.md** — zmiany w 0.6.0.
- **MODULES.md** — projekty, poczta, SLA, LDAP/SSO, integracje i uprawnienia.
- **AUTOMATION.md** — wyzwalacze, warunki, akcje i harmonogram.
- **API.md** — tokeny i API przychodzące.
- **UPDATES.md** — publikowanie na GitHub i aktualizator Docker.
- **VALIDATION.md** — sprawdzone scenariusze i granice weryfikacji.

SMTP ustawiasz w WWW. Główne SMTP jest domyślnym transportem dla całego systemu; projekt może mieć odrębny adres zespołu i IMAP, korzystając nadal z głównego SMTP. Osobny transport SMTP projektu jest opcją dla skrzynek wymagających innych danych logowania.

## Kopie zapasowe

```bash
docker compose exec desk node scripts/backup.mjs /app/data/backups/manual.sqlite
```

Wynik to spójna baza i `manual.sqlite.master.key`. Skopiuj oba poza serwer wraz z `.env` i kodem/wersją obrazu. Klucz szyfrowania jest konieczny do odczytu zapisanych sekretów. Polecenie wymaga nowej nazwy pliku. Nigdy nie podmieniaj bazy pracującej aplikacji.

## Rozwój

```bash
npm ci
npm run check
npm test
```

Testy nie łączą się z firmowym LDAP, skrzynkami ani produkcyjnym Dockerem. Przed wdrożeniem skonfiguruj kopię testową i sprawdź integracje swojej instalacji.
