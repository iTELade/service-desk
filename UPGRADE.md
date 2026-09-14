# Aktualizacja istniejącej instalacji do 0.7.0

Pełna paczka aktualizuje 0.4.0 i 0.5.0, zachowując bazę, użytkowników, zgłoszenia, projekty, `.env`, nazwy kontenera i wolumenu. Migracje bazy są transakcyjne. Na istniejącej bazie instalator WWW nie otwiera się ponownie.

## Zalecana aktualizacja pełną paczką

Prześlij **Service_Desk_0.7.0.zip** do `/home/dehmead`. Polecenia zakładają dotychczasową instalację `/opt/itelade-desk` i nazwany wolumen `/app/data`.

```bash
cd /home/dehmead
unzip -t Service_Desk_0.7.0.zip
mkdir -p desk-update-0.7.0
unzip Service_Desk_0.7.0.zip -d desk-update-0.7.0
bash /home/dehmead/desk-update-0.7.0/itelade-desk/scripts/upgrade.sh /opt/itelade-desk
```

Uruchom jako root. Skrypt:

1. Sprawdza sumy plików i zakłada blokadę przeciw równoczesnej aktualizacji.
2. Zachowuje kod, `.env` i identyfikator rzeczywiście używanego obrazu.
3. Buduje nowy obraz przed zatrzymaniem aplikacji. Błąd budowania nie zatrzymuje starego kontenera.
4. Zatrzymuje aplikację, kopiuje cały wolumen danych i sprawdza SQLite oraz `master.key` bez migracji kopii.
5. Podmienia pliki aplikacji, uruchamia 0.7.0 i sprawdza `/healthz`: wersja 0.7.0, schemat 7.
6. W razie błędu po zatrzymaniu odtwarza dane i poprzedni obraz. Jeśli odtworzenie danych zawiedzie, pozostawia aplikację zatrzymaną i podaje lokalizację kopii.

Nie wymaga `docker compose down` i nie usuwa wolumenu. Zatrzymanie oraz migracja oznaczają przerwę w działaniu WWW. Kopie powstają w `backups/before-0.7.0-<czas>/`. Zapewnij miejsce na nowy obraz, kopię danych i kodu. Nie kasuj ich przed sprawdzeniem działania.

## Weryfikacja po aktualizacji

```bash
cd /opt/itelade-desk
docker compose ps
docker compose logs --tail=80 desk
docker compose exec desk node -e 'fetch("http://127.0.0.1:3000/healthz").then(r=>r.json()).then(console.log)'
```

Sprawdź stare zgłoszenie i portal klienta, dodanie komentarza, własne statusy, test SMTP w Ustawieniach oraz nową wiadomość z IMAP. Poczta i dostawcy logowania wymagają sprawdzenia na Twojej konfiguracji.

Jeżeli kopia pochodzi z 0.4.0, migracja obejmie również funkcje 0.5.0. Jeżeli konfiguracja Compose wskazywała 0.5.0, ale kontener faktycznie uruchamiał 0.4.0, skrypt zapisze rzeczywisty identyfikator obrazu do rollbacku.

## Delta dla 0.5.0

**Service_Desk_0.7.0.zip jest pełną paczką**, nie nakładką. Rozpakuj ją do osobnego katalogu i uruchom jej `scripts/upgrade.sh`. Skrypt obsługuje istniejące schematy 4, 5, 6 i 7. Zachowuje `.env`, nazwy kontenera i wolumenu oraz wykonuje kopię danych przed migracją.

## Awaryjne odtwarzanie ręczne

Nie kopiuj samej starszej bazy do działającej aplikacji. Zatrzymaj desk oraz updater; zachowaj nieudaną bazę. Odtwórz cały katalog `data/` z kopii na ten sam wolumen i z tymi samymi właścicielami, a kod z `code.tar.gz`. `image-id.txt` wskazuje poprzedni obraz. Gdy skrypt tworzy `rollback.yaml`, uruchamiaj starą wersję poleceniem:

```bash
docker compose -f compose.yaml -f backups/before-0.7.0-TUTAJ_CZAS/rollback.yaml up -d --no-build --no-deps desk
```

Przed zmianą ścieżki przeczytaj wynik skryptu. Przywracanie kopii po przyjęciu nowych zgłoszeń powoduje utratę późniejszych zmian — zachowaj obie bazy do ewentualnego ręcznego odzyskania. Automatyczny rollback podczas aktualizacji następuje przed ponownym udostępnieniem nowej wersji.

## Przed przejściem do 0.7.0

- Kanał pocztowy zespołu używa wyłącznie własnego SMTP. Starszy kanał z opcją „SMTP główne” zatrzyma wysyłkę do chwili uzupełnienia SMTP zespołu. Nieprzypisane do kanału projekty nadal używają globalnego SMTP.
- Niezależne mapy projektów stają się centralnymi szablonami; reguły zostają w projektach.
- Dawne konta serwisowe zachowują identyfikatory, hasła i historię, ale stają się zwykłymi kontami. Konta z nieaktywnym hasłem nadal nie zalogują się hasłem, dopóki administrator go nie nada.
- Widoczność każdego miernika SLA dla klienta trzeba świadomie włączyć w ustawieniach projektu.
- Nie uruchamiaj starszego obrazu na bazie po migracji do schematu 7. Powrót wymaga przywrócenia odpowiadającej mu kopii danych.
