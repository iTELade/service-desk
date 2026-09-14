# Walidacja 0.7.1

- Node.js 24: 132/132 testy automatyczne przeszły, brak pominiętych testów.
- HTTP/SQLite: edycja danych konta przez administratora, blokowanie sesji, zdjęcie, usunięcie konta, zakaz edycji szczegółów przez klienta.
- Reset: rzeczywisty serwer HTTP, sprawdzenie hasła, kod z szyfrowanej kolejki SMTP, restart procesu, pusta baza, nowy instalator i utworzenie nowego administratora. Brak odtworzenia kont BOOTSTRAP_ADMIN.
- Reset: wygasły kod, 5 niepoprawnych prób, zmienione konto, brak SMTP, ponowne użycie kodu.
- DOM: zapis edytora użytkownika, zdarzenia dragstart/drop, ustawienia katalogów urządzeń i powiadamiania zespołu, brak pól repozytorium/tokenu.
- Regresja: poczta, automatyzacja wysyłająca e-mail, synchronizacja, SLA, LDAP, 2FA, centralne mapy statusów, powiadomienia i uprawnienia.

Testy DOM nie zastępują pełnej kontroli wizualnej w prawdziwej przeglądarce. Nie wykonano lokalnie budowy Docker ani aktualizacji produkcyjnego serwera. GitHub Actions uruchamia ponownie testy i buduje obrazy amd64/arm64 przed publikacją wydania. Produkcyjna konfiguracja SMTP/IMAP wymaga testu wysyłki w ustawieniach.
