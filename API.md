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

## Workspace and ITSM API (2.1)

Authenticated namespace: `/api/desk/v21/`. The existing session/CSRF policy applies. Staff-only resources also require access to the underlying project; project-management operations require its manager role. Customers can read ticket CSAT metadata and rate their own resolved ticket; internal worklogs/checklists/presence/services/cases are excluded.

- `GET queue`: existing paginated filters, plus `expression=project=IT AND priority=P1` (supported equality fields: project, status, priority, assignee, type).
- `PATCH tickets/:key`: versioned title/description/priority/assignee/workflow transition; transition includes workflow_version.
- `POST tickets/:key/comments`: body, internal, version, request_key; optional workflow_status and resolution_text commit together with the comment. Identical retries return the existing receipt; reusing the key with different data returns 409.
- `POST bulk`: request_key, up to 50 unique `{key,version}` items, action assign/priority/transition/note, value and optional resolution_text. Each outcome is reported; failed items roll back separately.
- `GET tickets/:key`: workspace extras; `POST .../worklogs`, `.../estimate`, `.../checklist`, `.../presence`, `.../services`, `.../csat`.
- `GET/POST preferences`; `GET/POST reply-templates`, `PATCH reply-templates/:id`.
- `GET reports`, optionally scoped by project. Daily dates are UTC; average response/resolution are calendar minutes. SLA radar uses project working calendars and explicitly reports its 500-ticket examination limit.
- `GET/POST services`, `GET/PATCH services/:id`, `GET .../graph`, `POST .../dependencies`, `POST .../assets`.
- `GET/POST cases`, `GET/PATCH cases/:id`, `POST .../tickets`, `.../messages`, `.../tasks`.
- `GET calendar`; `POST windows` with maintenance/freeze and ISO start/end. Change states follow planned → approved → implementing → resolved → closed, with manager rejection/replanning and freeze checks.
- `GET workflow/:project` and `POST` to save the draft (version/base_version/config/positions); `POST .../publish` with draft version. Published statuses already used by tickets cannot be removed or reclassified.
- `POST workflow/:project/preview`: ticket_key, event, optional context. Evaluates published rules without effects and reports actual condition matches and timer eligibility.
- `POST sla-preview`: project_id, config, starts_at and minutes. Pure validation and working-calendar deadline calculation.
- `GET/POST monitoring`: managers create or disable project-scoped connectors. A secret is returned once and stored as a hash.

Monitoring ingress: `POST /api/monitoring/:connector`, authenticated by `Authorization: Bearer <secret>` independently of browser CSRF. Body: `{ "event_id": "unique-id", "state": "down", "summary": "Service unavailable" }`. `state=up` moves the incident into monitoring and does not close customer tickets. Same event_id and same payload is replayed; a different payload under the same ID returns 409. Disabled, archived or access-revoked connectors are rejected. Secrets must not appear in URLs.

There is no native knowledge-portal API in 2.1.
# Podpowiedzi zgłoszeń — przygotowane dla 2.1.1

- `GET /api/desk/v21/assistance/:project_id` — konfiguracja i wersja projektu, tylko manager/admin.
- `POST /api/desk/v21/assistance/:project_id` — `{version, config:{similar, attention, handover, threshold, stale_days}}`. Wszystkie flagi logiczne, próg 20–100, dni 1–30. Konflikt wersji: 409. Zachowuje pozostałe ustawienia projektu.
- `POST /api/desk/v21/similar` — `{project_id, title, exclude_key?}`. Zwraca `{enabled, matches, examined, limit, definition}`; gdy wyłączone: `{enabled:false,matches:[]}`. Temat 3–200 znaków. Do 5 wyników z pola `title`, `key`, `status`, `workflow_status`, `updated_at`, `score`, `shared`, `exact`. Maksymalnie 2000 dostępnych kandydatów, po odfiltrowaniu archiwum/usuniętych. Brak opisów i komentarzy. ACL oceniane przed punktacją.
- `GET /api/desk/v21/tickets/:key/insights` — tylko zespół mający dostęp do projektu; `{config, attention, handover, definition}`. Brak notatek wewnętrznych w podsumowaniu. Sygnały i podsumowanie nie zmieniają zgłoszenia.

Wszystkie endpointy wymagają sesji; POST wymaga Origin i CSRF. Podobieństwo nie wykonuje żadnej mutacji; jego ręczne powiązanie używa dotychczasowego chronionego endpointu linkowania.

# Zewnętrzna baza wiedzy — przygotowane dla 2.1.1

`/api/desk/knowledge` zastępuje dawny zapis samego kontraktu rzeczywistą integracją z `iTELade/service-desk-knowledge-base` 0.5.1. Sesja i CSRF/Origin są wymagane zgodnie z pozostałymi endpointami Desk.

- `GET /api/desk/knowledge`: administrator; konfiguracja bez sekretu/ciphertext, `has_token`, `last_health`, `version`.
- `POST /api/desk/knowledge`: administrator; `{version, enabled, base_url, public_url, token?, clear_token?, allow_private, auto_suggest, project_ids:[], space_ids:[]}`. Pusty token zachowuje dotychczasowy; zmiana adresu API bez nowego tokenu usuwa stary. Puste zakresy oznaczają wszystkie projekty/przestrzenie dopuszczone pozostałymi kontrolami. Publiczny adres w odnośnikach wymaga HTTPS. Zapis chroniony wersją; token szyfrowany przy użyciu `master.key`.
- `POST /api/desk/knowledge/test`: administrator; sprawdza `health/search/read`, zwraca bezpieczny `{ok,message,checked_at,remote_version?}` i zapisuje ostatni wynik.
- `POST /api/desk/knowledge/search`: zespół projektu; `{ticket_key, suggest:true}` wyprowadza słowa z tematu i opisu albo `{ticket_key,q}` / `{project_id,q}` wykonuje ręczne wyszukiwanie. Do 5 wyników z maksymalnie 50 zwróconych przez API KB, po ograniczeniu przestrzeni. Brak treści artykułu w wynikach.
- `POST /api/desk/knowledge/pages/:page_id`: zespół projektu; `{project_id,public_only?:false}`. Treść Markdown z API KB, bez zdalnego HTML. `public_only:true` używa osobnego anonimowego odczytu strony; uwzględnia również dostęp do jej przestrzeni. Dla prywatnego API HTTP wymaga publicznego adresu HTTPS w odnośnikach.
- `GET /api/desk/knowledge/tickets/:key/links`: zespół; metadane powiązań weryfikowane aktualnie w KB. Niedostępne artykuły mają tylko `{id,unavailable:true}`, bez starego tytułu.
- `POST /api/desk/knowledge/tickets/:key/links`: `{page_id,version}`; zespół z prawem zmian, aktualna wersja zgłoszenia, do 10 powiązań. Przechowywany jest stabilny ID i tożsamość źródła, bez treści artykułu.
- `DELETE /api/desk/knowledge/tickets/:key/links`: `{link_id,version}`; odłącza referencję należącą do tego zgłoszenia.

Klienci nie otrzymują dostępu do uprzywilejowanego tokenu ani endpointów artykułów. Administrator udostępnia treści tokenu zespołom wybranych projektów; integracja nie mapuje indywidualnych kont i ról KB. Włączenie integracji nie tworzy natywnego portalu ani synchronizacji artykułów do SQLite. Sieci prywatne wymagają jawnego opt-in; loopback i adresy metadanych są blokowane, DNS sprawdzany i przypinany, przekierowania niedozwolone. Limit odpowiedzi: 2 MiB; timeout DNS/połączenia po 8 s. Awaria integracji nie blokuje zgłoszenia.

