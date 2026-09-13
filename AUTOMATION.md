# Automatyzacja iTELade Desk 0.5.0

Reguły konfiguruje administrator lub kierownik projektu w **Projekt → Statusy i automatyzacja**. Gotowy kreator schematu został usunięty. Dotychczasowe zapisane reguły pozostają aktywne; aktualizacja nie kasuje ich.

## Przykład: pięć dni po rozwiązaniu

Utwórz status rozwiązania z kategorią Rozwiązane, końcowy status z kategorią Zamknięte oraz aktywny status Udzielono odpowiedzi. Dodaj dozwolone przejścia z rozwiązania do obu pozostałych.

| Reguła | Wyzwalacz i warunek | Akcje |
|---|---|---|
| Informacja o rozwiązaniu | Rozwiązanie zgłoszenia, wybrany status rozwiązania | Publiczny komentarz wybranego konta serwisowego |
| Klient odpowiedział | Dodanie komentarza; autor = klient, widoczność = publiczna, status = rozwiązany | Zmień status na Udzielono odpowiedzi |
| Zamknięcie | Upływ czasu w statusie rozwiązania: 5 dni | Przypisz wybranego bota, zmień status na zamknięty, dodaj końcowe potwierdzenie |

Tekst pierwszego komentarza może być taki:

> Dzień dobry, sprawa {{ticket.key}} została rozwiązana. Jeśli problem nadal występuje, prosimy o odpowiedź w ciągu 5 dni. Odpowiedź przywróci sprawę do obsługi. Bez odpowiedzi zgłoszenie zostanie ostatecznie zamknięte.

Pięć dni to **120 godzin kalendarzowych**, niezależnie od kalendarza SLA. Powrót do aktywnego statusu anuluje wcześniejsze zadanie zamknięcia. Ponowne rozwiązanie rozpoczyna nowy okres. Jeżeli rozwiązanie jest wymagane, agent wpisuje je podczas rozwiązywania; automat może je również ustawić akcją przed zmianą statusu.

Po końcowym zamknięciu klient nadal widzi sprawę, lecz ani on, ani agent/administrator nie mogą jej otworzyć ani dopisać ręcznego komentarza. Końcowy komentarz bota w tym samym łańcuchu automatyzacji jest dozwolony. Kolejny problem wymaga nowego zgłoszenia.

## Wyzwalacze

- Utworzenie sprawy, zmiana statusu, rozwiązanie, zamknięcie, ponowne otwarcie rozwiązanej sprawy.
- Publiczna odpowiedź klienta, publiczna odpowiedź zespołu, wewnętrzna notatka.
- **Dodanie komentarza** z osobnymi warunkami autora i widoczności.
- Zmiana priorytetu, opiekuna, zgłaszającego lub pól formularza.
- Upływ czasu w statusie oraz brak odpowiedzi klienta przez określony czas.
- Uwierzytelniony webhook przychodzący.

Role klient/agent są oceniane w danym projekcie. W regułach ogólnych dodania komentarza automatyczne i zsynchronizowane kopie nie uruchamiają kolejnego łańcucha komentarzy; zapobiega to pętlom botów. Nie jest to system dowolnych skryptów ani CRON.

## Warunki i akcje

Warunki można łączyć przez ORAZ albo LUB. Dostępne są status/kategoria, poprzedni status, priorytet, klasyfikacja, opiekun, formularz, blokada klienta, autor komentarza, widoczność, treść komentarza, tytuł, źródło, ID zgłaszającego i ID organizacji. Warunki tekstowe obsługują dopasowanie oraz zawieranie tekstu. Nie ma wykonywania kodu ani JQL.

Akcje: zmiana statusu, priorytetu, opiekuna, tekst rozwiązania, komentarz publiczny/notatka wskazanego bota, blokada/odblokowanie klienta w aktywnej sprawie i webhook. Opiekun może być wybraną osobą, wykonawcą zdarzenia, zgłaszającym z uprawnieniami zespołu, wskazanym botem lub może zostać wyczyszczony.

Przykład „zamykający przejmuje sprawę”: Zamknięcie zgłoszenia → Przypisz → Wykonawca zdarzenia. Dla czasowego zamknięcia użyj jawnie opcji Bot i wybierz jego konto, aby przypisanie było jednoznaczne.

Statusy muszą mieć dozwolone przejścia. Konto serwisowe/opiekun musi mieć aktywne uprawnienia do obsługi projektu. Akcja odblokowania nie otwiera końcowego statusu Zamknięte.

## Znaczniki komentarza

`{{ticket.key}}`, `{{ticket.title}}`, `{{ticket.status}}`, `{{project.name}}`, `{{reporter.name}}`, `{{assignee.name}}`.

Znaczniki są obliczane podczas wykonania. Aby opisać nowy status, ustaw zmianę statusu przed komentarzem. HTML jest traktowany jako tekst. Publiczny komentarz bota może wysłać e-mail, jeśli poczta jest skonfigurowana; notatka pozostaje wewnętrzna.

## Terminy i odporność na błędy

- Reguły są wykonywane od góry na aktualnym stanie zgłoszenia. W jednym łańcuchu dana reguła wykona się najwyżej raz.
- Do 100 reguł, 20 warunków i 10 akcji w regule, w granicach limitu żądania. Czas: całkowite minuty/godziny/dni, najwyżej 366 dni.
- Zadania są trwałe, odzyskiwane po restarcie. Harmonogram sprawdzany jest co około 15 sekund, po maksymalnie 100 zadań na przebieg.
- Przed komentarzem/edycją API sprawdza zaległe terminy; klient nie zyskuje dodatkowego czasu między przebiegami harmonogramu.
- Zmiana reguły czasowej rozpoczyna jej terminy od nowa; zapis niezmienionej reguły nie przesuwa terminu. Wyjście ze statusu, archiwizacja lub wyłączenie reguły unieważnia zadanie.
- Warunki sprawdzane są ponownie w chwili wykonania. Niespełnione warunki oznaczają pominięcie, nie nieskończone ponawianie.
- Błąd akcji cofa całą regułę, ale zachowuje wcześniejszą wiadomość człowieka. Historię i błędne zadania sprawdzisz pod edytorem.
- Błędy synchronizacji, poczty, webhooków i obsługi komentarzy są rozdzielone. Ustawienia → Błędy modułów pozwala ponowić nieudane części bez powielania już wykonanych.
