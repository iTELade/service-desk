# Aktualizacja do Service Desk 2.0.2

Wersja 2.0.2 używa schematu SQLite 9. Aktualizacja z 2.0.0/2.0.1 nie wymaga nowego numeru schematu. Przy uruchomieniu aplikacja uzupełnia brakującą konfigurację usług i katalogów nowych projektów.

## Panel administracyjny

1. Włącz kontener aktualizatora według [UPDATES.md](UPDATES.md).
2. W Administracja → Diagnostyka i utrzymanie → Aktualizacje sprawdź wydanie `2.0.2`.
3. Zleć aktualizację. Aktualizator pobiera obraz przypięty do SHA256, zatrzymuje aplikację i wykonuje spójną kopię danych z kluczem szyfrowania.
4. Nowy kontener musi zgłosić wersję `2.0.2` i schemat `9`. Niezgodność wywołuje przywrócenie poprzedniego obrazu i kopii danych.
5. Po zakończeniu odśwież stronę i wykonaj produkcyjne kontrole opisane w [VALIDATION.md](VALIDATION.md).

Aktualizator obsługuje minimalny schemat wskazany w `desk-release.json` (dla 2.0.2: 6). Starszą instalację aktualizuj ręcznie lub przez wydanie pośrednie.

## Aktualizacja ręczna

Pobierz pełne źródła taga `v2.0.2`, rozpakuj do osobnego katalogu i uruchom jako root:

```bash
bash /ścieżka/do/service-desk-2.0.2/scripts/upgrade.sh /opt/itelade-desk
```

Skrypt odczytuje wersję i schemat z `lib/version.mjs`, sprawdza `MANIFEST.sha256` i buduje obraz przed zatrzymaniem działającej aplikacji. Wymaga istniejącej instalacji Compose, pliku `.env` oraz nazwanego wolumenu `/app/data`. Obsługuje źródłowe schematy 4–9.

Kopia w `backups/before-2.0.2-<czas>` obejmuje kod, identyfikator obrazu i wolumenu oraz dane wraz z `master.key`. Kontrola SQLite poprzedza migrację. Skrypt zachowuje `.env` i nazwy rzeczywistych kontenerów oraz wolumenów. Błąd aktualizacji uruchamia rollback.

Dla bind mount wykonaj własną spójną kopię przy zatrzymanej aplikacji i zachowaj poprzedni obraz. Nie kopiuj samego pliku SQLite z działającego katalogu WAL.

## Po aktualizacji

```bash
docker compose ps
docker compose logs --tail=100 desk
```

Sprawdź `/healthz`: `status=ok`, `version=2.0.2`, `schema=9`. Zweryfikuj logowanie, uprawnienia, zgłoszenie klienta, notatki, załączniki, akceptacje i rzeczywiste integracje. Jeżeli przed aktualizacją ręczną działał aktualizator, uruchom go ponownie dopiero po kontroli aplikacji:

```bash
docker compose --profile updates up -d --build updater
```
