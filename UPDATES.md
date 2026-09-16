# Aktualizacje przez panel

Mechanizm działa od zainstalowanej wersji **0.6.0**. Przejście z 0.4/0.5 wykonaj przez `scripts/upgrade.sh` według UPGRADE.md. Aktualizacje przeprowadzaj w oknie serwisowym; serwer będzie przez chwilę niedostępny.

## Włączenie aktualizatora

```bash
cd /opt/itelade-desk
docker compose --profile updates up -d --build updater
docker compose logs --tail=40 updater
```

Jeden kontener aplikacji i dokładnie jeden kontener aktualizatora. Aktualizator potrzebuje dostępu do Docker Engine przez `/var/run/docker.sock`, wolumenu danych, osobnego wolumenu sterowania i kopii. Ten dostęp pozwala zarządzać kontenerami hosta; przekaż go wyłącznie zaufanemu obrazowi aktualizatora. Aplikacja WWW nie montuje gniazda Dockera. Aktualizator działa jako root, aby zachować właścicieli plików kopii.

Obraz aplikacji w Compose ma alias `service-desk:current`. Udana aktualizacja zmienia ten alias. Zwykłe `docker compose up -d desk --no-build` nie przywraca starszego wydania. `docker compose build` lub `up --build` świadomie przebudowuje obraz z lokalnego kodu: **po aktualizacji z panelu najpierw zaktualizuj lokalny checkout do tego samego wydania**, zanim użyjesz `--build`.

Aktualizator aktualizuje aplikację, nie samego siebie ani konfiguracji Compose. Wydania zmieniające wymagania infrastruktury wymagają ręcznej aktualizacji paczką i instrukcji migracyjnej.

## Publikowanie z GitHub

Repozytorium musi zawierać zawartość katalogu aplikacji jako swój katalog główny, w tym `.github/workflows/release.yml`. Ustaw zgodną wersję w `package.json`, `package-lock.json` i `lib/version.mjs`. Gdy zmieniasz schemat, dodaj migrację i określ minimalny obsługiwany schemat w workflow. Następnie wypchnij tag, np. `v0.7.0`.

Workflow wykonuje testy, buduje obrazy linux/amd64 i linux/arm64, publikuje je do `ghcr.io/OWNER/REPO` i tworzy stabilne wydanie z plikiem `desk-release.json`:

```json
{"format":1,"project":"service-desk","version":"0.7.0","image":"ghcr.io/owner/repo@sha256:64_ZNAKI_HEX","schema":7,"minimum_schema":6}
```

To przykład formatu, nie gotowy digest do wklejenia. Workflow wpisuje rzeczywisty SHA256 obrazu. Ustaw widoczność pakietu GHCR na publiczną albo skonfiguruj token z dostępem do prywatnego repozytorium i odczytu pakietów. Token przechowywany jest zaszyfrowany. Nie umieszczaj go w repozytorium.

W panelu: **Ustawienia → Wersja i aktualizacje**. Podaj `OWNER/REPO`, opcjonalnie token, zapisz i kliknij **Sprawdź teraz**. Włączone sprawdzanie automatyczne działa co 6 godzin. Przycisk instalacji pojawia się dla nowszego stabilnego wydania i wymaga działającego agenta.

Od wersji **1.2.1** ekran aktualizacji pokazuje pasek postępu i na bieżąco odczytuje fazę zadania. Podczas restartu kontenera pozostawia ostatni postęp na ekranie i czeka na powrót API. Po pomyślnym zakończeniu aktualizacji albo rollbacku przeglądarka odświeża stronę automatycznie jeden raz.

## Przebieg instalacji i powrót

Aktualizator niezależnie pobiera manifest z GitHub, kontroluje repozytorium, digest, wersję i zakres migracji. Nie przyjmuje dowolnego polecenia ani ścieżki kontenera z panelu. Pobiera obraz przed zatrzymaniem aplikacji. Następnie włącza tryb konserwacji, zatrzymuje aplikację, kopiuje wolumen i sprawdza bazę. Startuje nowy kontener z istniejącymi ustawieniami i siecią. Dopiero poprawny healthcheck i zgodna wersja pozwalają udostępnić aplikację oraz zatwierdzić alias obrazu.

Podczas konserwacji aplikacja blokuje zapisy oraz pracę automatyzacji, poczty i synchronizacji LDAP. Błąd startu powoduje przywrócenie poprzedniego kontenera i kopii danych. Dziennik na trwałym wolumenie umożliwia odzyskanie po restarcie aktualizatora. Stan `rollback_failed` pozostawia tryb konserwacji, żeby nie udostępnić częściowo przywróconych danych.

Kopie w kontenerze updater: `/app/backups/<identyfikator-zadania>`. Wolumen domyślny starej instalacji: `itelade-desk-backups`; dla nowej: `service-desk-backups`. Skopiuj kopie również poza hosta. Poprzednie kontenery są zatrzymane i mają nazwę `.rollback-…`; usuń je dopiero po potwierdzeniu poprawności aktualizacji. Obrazy i kopie nie są automatycznie czyszczone.

W razie `rollback_failed`: zatrzymaj oba kontenery, zachowaj dane nieudanego startu, odtwórz wskazaną kopię i poprzedni obraz jak w UPGRADE.md. Plik `/app/control/maintenance.json` usuń dopiero po sprawdzeniu spójnego odtworzenia. Nie usuwaj dziennika ani kopii, aby wymusić kolejną aktualizację.

## Ograniczenia weryfikacji

Przepływ aktualizatora przetestowano z symulowanym Docker API i rzeczywistymi kopiami SQLite, w tym błąd pobrania obrazu, tworzenia kontenera, startu po zmianie bazy i wznowienie po zatwierdzeniu. W środowisku przygotowania nie było Docker Engine ani Twojego repozytorium GitHub; wymagany jest próbny pełny upgrade na kopii instalacji przed użyciem tego mechanizmu produkcyjnie. Sam skrypt powłoki sprawdzono składniowo, nie uruchamiano go na serwerze użytkownika.

Dokumentacja bazowa: [Docker Engine API](https://docs.docker.com/reference/api/engine/), [GitHub Releases](https://docs.github.com/en/rest/releases/releases), [pobieranie zasobów wydania](https://docs.github.com/en/rest/releases/assets).

## Od wersji 0.7.0

Repozytorium jest stałe: `iTELade/service-desk`; sprawdzanie nowych stabilnych wydań działa automatycznie co 6 godzin. Administrator otrzymuje komunikat u dołu strony. Opublikowane wydanie musi mieć poprawny `desk-release.json` utworzony przez workflow po budowie obrazu — sam tag nie wystarczy. Instalacja nadal wymaga uruchomionego kontenera aktualizatora i ręcznego zlecenia w panelu.

## Publikacja od 0.7.1
Zmiana wersji w package.json na main uruchamia publish-version.yml. Workflow sprawdza manifest, testy i składnię, buduje Docker i dopiero wtedy tworzy tag oraz Release z desk-release.json. Istniejącego tagu nie nadpisuje. Ekran aktualizacji nie wymaga wpisywania repozytorium ani tokenu; pakiet GHCR musi być publiczny.
