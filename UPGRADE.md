# Aktualizacja istniejącej instalacji do 0.8.0

Wydanie 0.8.0 jest pełną paczką aplikacji. Obsługuje aktualizację istniejącej instalacji ze schematów 4, 5, 6 i 7 do schematu 8.

## Aktualizacja ręczna

1. Pobierz pełne źródła wydania `0.8.0` i rozpakuj je do osobnego katalogu.
2. Nie nadpisuj ręcznie działającego katalogu przed wykonaniem kopii.
3. Uruchom jako `root`:

```bash
bash /ścieżka/do/service-desk-0.8.0/scripts/upgrade.sh /opt/itelade-desk
```

Skrypt:
- sprawdza `MANIFEST.sha256`,
- buduje obraz `service-desk:0.8.0` przed zatrzymaniem aplikacji,
- zachowuje kod i dane bieżącej instalacji,
- wykonuje kontrolę integralności SQLite i `master.key`,
- nakłada pełne pliki 0.8.0,
- uruchamia migracje do schematu 8,
- sprawdza `/healthz` dla wersji `0.8.0` i schematu `8`,
- w razie błędu przywraca poprzedni obraz, kod i dane.

Kopie są tworzone w `backups/before-0.8.0-<czas>/`. Nie usuwaj ich przed potwierdzeniem poprawnego działania systemu.

## Aktualizacja z poziomu Service Desk

Po opublikowaniu stabilnego wydania GitHub `v0.8.0` workflow dołącza `desk-release.json`. Wbudowany aktualizator może następnie pobrać obraz z GHCR i przeprowadzić aktualizację zgodnie z manifestem wydania.

## Ważne przy 0.8.0

- Baza po migracji ma `PRAGMA user_version = 8`. Starszego obrazu nie uruchamiaj na zmigrowanej bazie; rollback wymaga przywrócenia kopii danych.
- WebAuthn/FIDO2 wymaga poprawnego publicznego `APP_URL`; w produkcji używaj HTTPS.
- Przed wdrożeniem sprawdź `npm run check` oraz `npm test`.
