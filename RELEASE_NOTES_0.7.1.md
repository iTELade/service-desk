# Service Desk 0.7.1

Poprawki istniejącej aplikacji, bez zmiany schematu bazy (nadal 7).

- Użytkownicy: bezpośrednie włączanie/wyłączanie dostępu, edycja imienia, nazwiska i e-maila kont lokalnych, zdjęcia do 2 MB. Zmiana dostępu unieważnia sesje. Lokalne konto można usunąć z listy i zanonimizować z zachowaniem powiązań historycznych; konta LDAP blokuje się lokalnie, a dane zarządza w katalogu.
- Portal: edycja opisu i pól dostępna wyłącznie w panelu zespołu; klient nie może zmieniać szczegółów przez API. Poprawiony kontrast elementów po najechaniu w ciemnym motywie.
- Statusy: widoczny uchwyt do przeciągania, nadal dostępne strzałki do obsługi klawiaturą. Edycja w centralnych szablonach.
- Urządzenia: czytelny wybór dozwolonych katalogów i przejście do ustawień projektu, gdy nie ma dostępnych urządzeń.
- Odświeżanie co 5 sekund: powiadomienia, kolejki, tablica i rozmowa; pisana odpowiedź nie jest usuwana podczas aktualizacji rozmowy.
- Poczta: wyraźne ustawienia powiadamiania zespołu/kierowników w projekcie i dostęp do edycji szablonów/wyzwalaczy. Testy potwierdzają wysyłkę według zdarzeń oraz akcję e-mail w automatyzacji.
- Aktualizacje: usunięte pola repozytorium i tokenu z ekranu; automatyczne sprawdzanie co 6 godzin pozostaje aktywne. Wersjonowane adresy JS/CSS.
- Reset do instalatora: lokalny administrator potwierdza hasło, jednorazowy kod e-mail (10 minut, 5 prób) i tekst „USUŃ WSZYSTKO”. Dane aplikacji usuwane przy restarcie. Kopie zapasowe oraz konfiguracja infrastruktury Docker/.env pozostają. Kod nowej instalacji jest w logach kontenera. Stare konto z BOOTSTRAP_ADMIN nie jest odtwarzane.

Nie uruchamiaj resetu w celu aktualizacji — służy wyłącznie do świadomego usunięcia danych.

Walidacja i ograniczenia: VALIDATION.md. Publikacja obrazu i manifestu następuje w GitHub Actions po pomyślnych testach.
