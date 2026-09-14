# Service Desk 0.7.0

Aktualizacja istniejącego systemu. Schemat bazy: 7.

- Centralna edycja statusów i przejść w szablonach; przeciąganie statusów i przyciski zmiany kolejności. Projekty zachowują własne reguły automatyzacji.
- Poprawka renderowania katalogu LDAP (`mappingRow is not defined`), ciemnego podświetlenia kolejki, odstępów przy powiązaniach i zdjęcia w panelu bocznym.
- Czytelny wybór projektu środków trwałych, z przejściem do katalogu po utworzeniu.
- SLA wybierane według formularza zgłoszenia, z osobnym ustawieniem widoczności dla klienta.
- Klient może odpowiadać w otwartej sprawie, ale nie może edytować pól ani ręcznie zmieniać statusu po utworzeniu.
- 2FA TOTP z jednorazowymi kodami odzyskiwania, także jako dodatkowy krok po logowaniu SSO. Wyłączenie konta blokuje logowanie i dostęp aktywnych sesji.
- Obserwowanie ręczne i automatyczne po działaniu agenta, konfigurowane per projekt. Liczba i lista obserwatorów są dostępne tylko zespołowi.
- Odbiorcy aktualizacji zależni od autora; opcjonalne powiadamianie kierowników lub zespołu o nowych sprawach.
- Edytowalne szablony e-mail, wyzwalacze zdarzeń i akcja wysyłki szablonu w automatyzacji. Cztery standardowe szablony są dostępne po migracji.
- Główny SMTP dla komunikacji systemowej i projektów bez kanału; przypisana skrzynka zespołu korzysta wyłącznie z własnego SMTP. Odbiór IMAP jest opcjonalny.
- Zwykłe konta użytkowników jako autorzy komentarzy automatycznych; zachowanie tożsamości dawnych kont serwisowych.
- Odświeżanie dzwonka co 5 sekund oraz po powrocie do aktywnej karty.
- Stałe repozytorium `iTELade/service-desk`, automatyczne sprawdzanie wydań i komunikat aktualizacji dla administratora.
- Wstępna konfiguracja i opis kontraktu dla osobnej aplikacji bazy wiedzy. Artykuły nie są jeszcze pobierane.

Przed aktualizacją sprawdź SMTP istniejących kanałów zespołów: konfiguracja korzystająca wcześniej z głównego SMTP wymaga uzupełnienia własnego SMTP. Wiadomości pozostają w kolejce i nie przełączają się na innego nadawcę.

Walidacja lokalna: 123/123 testów automatycznych; kontrola składni JavaScript. Pełny test wizualny w Chromium i budowa Docker nie zostały wykonane lokalnie — szczegóły w `VALIDATION.md`. Workflow wydania wykonuje ponownie testy i budowę Docker.
