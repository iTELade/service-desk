# Integracje przychodzące

## Webhook

Ustawienia → Webhooki → kierunek **przychodzący**, projekt i konto użytkownika. Sekret jest pokazany raz. Żądanie:

```http
POST /api/hooks/ID
Authorization: Bearer SEKRET
Content-Type: application/json

{"event_id":"unikalny-identyfikator-zdarzenia","ticket_key":"CW-00001"}
```

W automatyzacji projektu skonfiguruj zdarzenie webhook oraz jego warunki i akcje. Ponowienie tego samego `event_id` nie wykonuje zdarzenia drugi raz. Webhook służy uruchomieniu reguły na istniejącej sprawie; tworzenie zgłoszeń obsługuje API.

## API v1

Ustawienia → API i tokeny → Utwórz token. Wybierz aktywne konto użytkownika z dostępem do projektu, zakresy i ważność (1–365 dni). Token działa tylko w wybranym projekcie; nie loguje do WWW. Można go odwołać w panelu.

Nagłówek `Authorization: Bearer desk_…`. Wszystkie operacje POST wymagają `Idempotency-Key` długości 8–200 znaków. Użyj innego klucza dla innej operacji. Ponowienie identycznego żądania zwraca zachowaną odpowiedź; ponowne użycie klucza dla zmienionej treści daje 409.

| Metoda i ścieżka | Zakres | Cel |
|---|---|---|
| GET `/api/v1/forms` | tickets:read | Aktywne formularze, identyfikatory, wersje i pola |
| GET `/api/v1/tickets?after=0&limit=50` | tickets:read | Lista; `next_after` to kursor kolejnej strony, limit do 100 |
| GET `/api/v1/tickets/CW-00001` | tickets:read | Szczegóły, komentarze, faktyczny status i przejścia |
| POST `/api/v1/tickets` | tickets:create | Utworzenie zgłoszenia |
| POST `/api/v1/tickets/CW-00001/comments` | tickets:comment | Odpowiedź |
| POST `/api/v1/tickets/CW-00001/transitions` | tickets:transition | Zmiana statusu |

`tickets:internal` dodatkowo pozwala odczytywać/dodawać notatki wewnętrzne. Samo uprawnienie comment/read ich nie udostępnia. Pola formularzy API przeznaczone są dla integracji zespołu, nie dla anonimowego portalu.

Przykład tworzenia:

```json
{"reporter_id":12,"request_type_id":3,"request_type_version":1,"title":"Problem z kontem","description":"Opis problemu","priority":"P3","custom_values":{}}
```

Formularz ustala klasyfikację i może zastąpić ukryty tytuł/opis wartością administratora. Zgłaszający musi mieć aktywne konto i dostęp do portalu projektu. Autor operacji jest wybranym kontem użytkownika i pozostaje w historii.

Komentarz: `{"body":"Treść odpowiedzi","internal":false}`.

Przejście: `{"workflow_status":"in_progress","workflow_version":2,"version":5,"resolution_text":""}`. Pobierz aktualne wersje i dozwolone przejścia z GET. Zmiana używa walidacji workflow, wymagania rozwiązania i blokady ostatecznie zamkniętej sprawy. Usunięte sprawy są niedostępne, a archiwum nie przyjmuje zmian.
