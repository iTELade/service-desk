# Weryfikacja 0.6.0

Data: 13 września 2026. Node.js 24, SQLite, testy lokalne. Nie wykonywano zmian na serwerze użytkownika.

## Wyniki

- `npm run check`: składnia wszystkich 55 plików JavaScript, w tym aktualizatora.
- `npm test`: **106 testów, 106 zaliczonych, 0 błędów**.
- `npm audit --omit=dev`: **0 zgłoszonych podatności** w zależnościach produkcyjnych w dniu badania.
- `bash -n`: skrypty konfiguracji i aktualizacji.
- Archiwa: kontrola ZIP, uprawnienia skryptów, sumy SHA256 oraz porównanie nałożonej delty 0.5.0→0.6.0 z pełną paczką.

## Pokryte scenariusze

Testy HTTP obejmują logowanie, CSRF, role, rejestrację i uprawnienia portalu, wielu zgłaszających, wiele projektów, formularze, własne workflow, rozwiązania, ostateczne zamknięcie, równoczesne tworzenie i edycję zgłoszeń, trwałość po restarcie oraz kopię SQLite przy aktywnym WAL.

Testy modułów obejmują migracje, LDAP z atrapą katalogu, bezpieczne SSO/mapowanie kont, profile, automatyzacje czasowe, SLA/kalendarz/DST, synchronizację zgłoszeń, IMAP z atrapą serwera, wątki i deduplikację poczty, SMTP z atrapą transportu, webhooki, klonowanie/powiązania, urządzenia, szablony, nowe API i uprawnienia.

Dodatkowe przypadki 0.6: trwała rezerwacja klucza po usunięciu, niezmienny klucz projektu, archiwum, podpowiedzi numerów, usuwanie powiązań, propagacja szablonu i ochrona używanych statusów, obserwowanie i dzwonek, odrzucanie dostępu klienta do powiadomień zespołu, prywatne komentarze, ponowna kontrola dostępu do wiadomości przed wysłaniem, zmiana SMTP bez restartu, tokeny API i idempotencja, zamrożenie SLA bez odpowiedzi, limit obrazów 2 MB, ochrona instalatora na istniejącej bazie, manifest wydania i szyfrowanie zlecenia aktualizacji.

Aktualizator: symulowane Docker API oraz rzeczywiste pliki SQLite. Przetestowano błąd pobierania przed zatrzymaniem aplikacji, udany przepływ, błąd tworzenia kontenera, błąd startu po zmianie danych i przywrócenie bazy, wznowienie po zatwierdzeniu. Testy na lokalnym systemie plików nie sprawdzają zmiany właściciela UID/GID; tę operację wykonuje aktualizator działający jako root w Dockerze.

## Przeglądarka

Chromium 153 sterowany przez Playwright, lokalna świeża baza. Przeprowadzono instalację WWW z tokenem, utworzenie administratora i logowanie. Sprawdzono listę projektów, kreator, ustawienia SMTP, szablony, API i aktualizacje. Utworzono i zapisano szablon, projekt oraz zgłoszenie. Sprawdzono obserwowanie, przeciągnięcie zgłoszenia do dozwolonego statusu, dodanie własnego statusu na tablicy i zapis repozytorium aktualizacji.

Oceniono zrzuty jasnego i ciemnego interfejsu. Widok zgłoszenia przy szerokości 390 px nie rozszerzał całej strony poza ekran. Brak nieobsłużonych błędów JavaScript w sprawdzonym przepływie. To kontrola wybranych przebiegów, nie każdej kombinacji ustawień ani audyt WCAG.

## Granice weryfikacji

W środowisku nie było Docker Engine, serwera użytkownika ani docelowego repozytorium GitHub. Nie wykonano rzeczywistego budowania obrazu, operacji Docker Compose, publikacji GHCR ani pełnej aktualizacji z panelu na Dockerze. Skrypt upgrade sprawdzono składniowo. Próba na kopii instalacji jest konieczna przed produkcyjnym użyciem aktualizatora.

Nie wysyłano prawdziwych wiadomości e-mail, nie synchronizowano firmowego LDAP ani nie logowano do rzeczywistego dostawcy SSO. Ich konfiguracja, certyfikaty i uprawnienia wymagają testu w docelowym środowisku. Poprawne przyjęcie wiadomości przez SMTP nie gwarantuje dostarczenia do skrzynki odbiorczej.

Wyniki nie stanowią gwarancji braku błędów ani pełnej zgodności funkcjonalnej z Jira. Przywracanie kopii po przyjęciu nowych danych może je utracić; kopie nie zastępują próbnego odtwarzania.
