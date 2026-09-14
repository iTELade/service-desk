# Przygotowanie integracji z bazą wiedzy

Wersja 0.7.0 przechowuje ustawienia w `knowledge_settings`. Administrator ustawia adres HTTPS osobnej aplikacji i znacznik aktywności w Ustawienia → Baza wiedzy. Zapis jest wersjonowany i audytowany. Adres nie może zawierać loginu, hasła, zapytania ani fragmentu.

Dostępne API administracyjne: `GET /api/desk/knowledge` oraz `POST /api/desk/knowledge` z `{version, enabled, base_url}`. POST wymaga sesji administratora i ochrony CSRF. Odpowiedź zawiera `contract_version: 1`.

Plan kontraktu zewnętrznego, jeszcze niewdrożony w Desk:

- wyszukiwanie artykułów z paginacją: identyfikator, tytuł, opis, URL i data aktualizacji;
- autoryzacja użytkownika/projektu po obu stronach, bez automatycznego ujawniania wewnętrznych artykułów klientom;
- powiązania zgłoszenie–artykuł bez kopiowania treści;
- osobny mechanizm uwierzytelniania połączenia i obsługa niedostępności bazy wiedzy.

Obecne ustawienie „aktywna” oznacza zapisaną konfigurację. Ta wersja nie łączy się z adresem, nie wyszukuje artykułów i nie uruchamia dodatkowego kontenera.
