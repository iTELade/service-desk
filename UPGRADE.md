# Aktualizacja do Service Desk 2.1.0

Wersja 2.1.0 migruje SQLite ze schematu 9 do 10. Migracja zachowuje zgłoszenia, komentarze, sesje, konfigurację i zewnętrzny adres bazy wiedzy. Dodaje dane stanowiska agenta i ITSM. Nie dodaje portalu wiedzy.

## Panel administracyjny

1. Włącz kontener aktualizatora według [UPDATES.md](UPDATES.md).
2. W Administracja → Diagnostyka i utrzymanie → Aktualizacje sprawdź wydanie `2.1.0`.
3. Zleć aktualizację. Aktualizator pobiera obraz przypięty do SHA256, zatrzymuje aplikację i wykonuje spójną kopię danych z kluczem szyfrowania.
4. Nowy kontener musi zgłosić wersję `2.1.0` i schemat `10`. Niezgodność wywołuje przywrócenie poprzedniego obrazu i kopii danych.
5. Po zakończeniu odśwież stronę i wykonaj produkcyjne kontrole opisane w [VALIDATION.md](VALIDATION.md).

Aktualizator obsługuje minimalny schemat wskazany w `desk-release.json` (dla 2.1.0: 6). Starszą instalację aktualizuj ręcznie lub przez wydanie pośrednie.

## Aktualizacja ręczna

Pobierz pełne źródła taga `v2.1.0`, rozpakuj do osobnego katalogu i uruchom jako root:

```bash
bash /ścieżka/do/service-desk-2.1.0/scripts/upgrade.sh /opt/itelade-desk
```

Skrypt odczytuje wersję i schemat z `lib/version.mjs`, sprawdza `MANIFEST.sha256` i buduje obraz przed zatrzymaniem działającej aplikacji. Wymaga istniejącej instalacji Compose, pliku `.env` oraz nazwanego wolumenu `/app/data`. Obsługuje źródłowe schematy 4–10.

Kopia w `backups/before-2.1.0-<czas>` obejmuje kod, identyfikator obrazu i wolumenu oraz dane wraz z `master.key`. Kontrola SQLite poprzedza migrację. Skrypt zachowuje `.env` i nazwy rzeczywistych kontenerów oraz wolumenów. Błąd aktualizacji uruchamia rollback.

Dla bind mount wykonaj własną spójną kopię przy zatrzymanej aplikacji i zachowaj poprzedni obraz. Nie kopiuj samego pliku SQLite z działającego katalogu WAL.

## Po aktualizacji

```bash
docker compose ps
docker compose logs --tail=100 desk
```

Sprawdź `/healthz`: `status=ok`, `version=2.1.0`, `schema=10`. Zweryfikuj logowanie, uprawnienia, zgłoszenie klienta, notatki, załączniki, akceptacje i rzeczywiste integracje. Jeżeli przed aktualizacją ręczną działał aktualizator, uruchom go ponownie dopiero po kontroli aplikacji:

```bash
docker compose --profile updates up -d --build updater
```

## Powrót do 2.0.x

Migracja 10 jest jednokierunkowa. Zatrzymaj nowy kontener, przywróć pełną kopię danych wykonaną przed aktualizacją wraz z master.key i uruchom poprzedni obraz. Nie uruchamiaj kodu 2.0.x na bazie w schemacie 10. Po odtworzeniu sprawdź integrity_check, foreign_key_check i healthz.

## Przygotowywana aktualizacja 2.1.0 → 2.1.1

2.1.1 nie jest jeszcze wydane. Schemat pozostaje 10, bez dodatkowej migracji. Nowe opcje **Podpowiedzi i usprawnienia** w ustawieniach projektu są domyślnie wyłączone; włącza je manager lub administrator. Nie uruchamiaj publikacji ani nie aktualizuj produkcji na podstawie gałęzi przygotowawczej.
