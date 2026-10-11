# Service Desk 2.0.4 — Service Pack 2

Wydanie koryguje pozostałe błędy wyglądu 2.0.3 odtworzone podczas rozszerzonej kontroli całej aplikacji. Schemat SQLite pozostaje **9**. Dotychczasowe poprawki załączników i logiki zgłoszeń są zachowane.

## Poprawki

- Centrum administracji nie wymusza białego tła w ciemnym motywie. Nagłówki, opisy i wartości statystyk korzystają z kolorów aktywnego motywu.
- Przywrócono brakujące style statystyk, wierszy konfiguracji, statusów, skrótów, formularzy i danych diagnostycznych w aktywnym `design-system.css`. Nie włączono ponownie wycofanych arkuszy. Statystyki układają się w 4/2/1 kolumny; wiersze przechodzą do układu pionowego na małych ekranach.
- Mobilna nawigacja administracji ma ograniczoną wysokość i własne przewijanie, aby treść sekcji była bliżej początku ekranu.
- Poprawiono kontrast nagłówka portalu, ostatnich zgłoszeń, pustych kolumn tablicy, linków projektów, oznaczeń wersji, avatarów i kluczy projektów. Avatar projektu zachowuje własny odcień na ciemniejszym tle.
- Formularze LDAP mieszczą się na telefonie. Mapa workflow przewija się we własnym panelu; przywrócono czytelne etykiety, statusy, strzałki, zaznaczenie i fokus klawiatury.
- Wartości i podpowiedzi pól formularzy oraz wyszukiwarki korzystają z kolorów motywu. Usunięto przygaszenie selektora projektu w administracji.
- Zmieniono wersję aktywnych zasobów na 2.0.4.

## Weryfikacja

Nowa obowiązkowa regresja wizualna uruchamia świeżą instalację i sprawdza 43 trasy przy 390/768/1280/1440 px w obu aktywnych motywach. Wykonuje 1431 kontroli kontrastu, przepełnienia, renderowania, układu administracji i mapy workflow; obejmuje również logowanie, rejestrację i odzyskiwanie hasła bez sesji. Kontrast obejmuje teksty, wartości pól i placeholdery. Granice pomiaru oraz kontrolę wzrokową opisuje [VALIDATION.md](VALIDATION.md).

Przed wydaniem wymagane są również: 241 testów aplikacji, 362 kontrole funkcjonalne Chromium, kontrola składni, integralności plików i test świeżej instalacji faktycznie zbudowanego kontenera. Obie regresje przeglądarki blokują wszystkie ścieżki CI/publikacji.

## Aktualizacja

Aktualizuj do **v2.0.4** przez panel lub według [UPGRADE.md](UPGRADE.md). Przejście z 2.0.2/2.0.3 nie zmienia numeru schematu. Manifest `desk-release.json` wskazuje rzeczywisty digest obrazu GHCR.

Testy używają danych syntetycznych. Publikacja wydania nie oznacza wykonania aktualizacji konkretnej instalacji ani sprawdzenia jej rzeczywistych LDAP/SSO/SMTP.
