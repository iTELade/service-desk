# Weryfikacja Service Desk 0.7.0

Data: 14 września 2026. Node.js 24, SQLite. Pracowano na kopii istniejącego repozytorium; nie zmieniono serwera użytkownika ani GitHub.

## Wykonane sprawdzenia

- `npm run check`: poprawna składnia 60 plików JavaScript.
- `npm test`: **123 testy, 123 zaliczone, 0 błędów**.
- `bash -n scripts/upgrade.sh`: poprawna składnia skryptu aktualizacji.
- Pakiet: kontrola integralności ZIP, obecności kompletnego kodu i zgodności `MANIFEST.sha256` z plikami archiwum.

## Pokrycie

Dotychczasowe testy obejmują rzeczywisty serwer HTTP i SQLite: uwierzytelnianie, CSRF, uprawnienia, prywatność komentarzy, formularze, aktualizacje równoczesne, automatyzację, harmonogram po restarcie, LDAP, SSO, synchronizację projektów, IMAP/SMTP, klucze, archiwizację i zamknięcie SLA.

Nowe testy obejmują migrację 6→7 z zachowaniem tożsamości i reguł, TOTP zgodny ze wszystkimi wektorami SHA1 RFC 6238, szyfrowanie sekretu, ochronę przed ponownym użyciem kodu, kody odzyskiwania i wygaśnięcie wyzwań. Obejmują też wybór odbiorców, automatyczne i ręczne obserwowanie, powiadomienia kierowników, widoczność SLA i wybór formularza, własne SMTP bez przełączenia na główne, szablony e-mail i akcje automatyzacji, centralną kolejność statusów, tworzenie katalogu urządzeń oraz stałe repozytorium wydań.

Testy DOM sprawdzają formularze LDAP, SMTP bez IMAP, zmianę kolejności statusów i brak przycisków przejść dla klienta. Nie zastępują przeglądu wizualnego.

## Ograniczenia

- Pełny przegląd wizualny nie został ukończony: lokalny Chromium zakończył pracę sygnałem SIGSEGV przed otwarciem strony. Nie deklarujemy zakończonego testu end-to-end interfejsu ani logowania 2FA przez przeglądarkę.
- W środowisku nie ma Docker CLI/daemon. Nie wykonano lokalnej budowy obrazu ani aktualizacji prawdziwego kontenera. Workflow GitHub wykonuje testy i budowę obrazu po ręcznej publikacji wydania; przed aktualizacją serwera należy sprawdzić jego wynik.
- Nie łączono się z produkcyjnymi skrzynkami ani katalogiem użytkownika. Testy korzystają z danych testowych, kontrolowanych usług oraz atrap transportu.
- Integracja z bazą wiedzy jest przygotowaniem kontraktu i ustawień; nie pobiera artykułów.

Przejście testów nie stanowi gwarancji braku wszystkich błędów. Wdrożenie wykonuj przez dołączony skrypt z kopią zapasową zgodnie z `UPGRADE.md`.
