# Service Desk 2.1.1 — przygotowane do wydania

Ta wersja jest przygotowywana na osobnej gałęzi. Nie została opublikowana ani wdrożona na produkcji.

## Podpowiedzi i usprawnienia projektu

W ustawieniach projektu → **Podpowiedzi i usprawnienia** administrator lub manager projektu może osobno włączyć:

- **Podobne zgłoszenia**: podpowiedzi podczas wpisywania tematu nowego zgłoszenia i w szczegółach istniejącego. Do pięciu dopasowań, ocena 20–100 z ustawianym progiem, wspólne słowa i status sprawy. Agent może ręcznie utworzyć standardowe powiązanie. Nie ma automatycznego scalania, zamykania ani oznaczania spraw jako duplikatów.
- **Sygnały wymagające uwagi**: brak opiekuna, brak aktualizacji przez wskazaną liczbę dni, niewykonane kroki checklisty oraz praca przekraczająca estymację. Sygnały są pomocnicze, nie zmieniają priorytetu i nie zastępują SLA.
- **Podsumowanie do przekazania**: podgląd i kopiowanie klucza, tematu, opiekuna, opisu, czasu pracy, pozostałych kroków i ostatnich publicznych wiadomości. Bez notatek wewnętrznych i treści załączników. Operator przegląda treść przed udostępnieniem.

Wszystkie opcje są domyślnie wyłączone, również dla istniejących projektów. Zapis chroni przed nadpisaniem równoczesnej zmiany ustawień i zachowuje inne opcje projektu.

## Jak działa dopasowanie

Porównywane są słowa w tematach zgłoszeń, z normalizacją wielkości liter i polskich znaków oraz pomijaniem częstych słów. Rzadsze słowa mają większą wagę. Zwykle wymagane są co najmniej dwa wspólne słowa; identyczny znormalizowany temat może mieć jedno. Wynik jest oceną dopasowania tekstu, nie prawdopodobieństwem duplikatu. Nie jest to wyszukiwanie semantyczne AI.

Przeszukiwane jest do 2000 ostatnio aktualizowanych, dostępnych zgłoszeń tego samego projektu. Archiwalne i usunięte zgłoszenia są pomijane. Klient widzi wyłącznie sprawy, do których ma prawo dostępu; treści opisów i komentarzy nie są zwracane przez endpoint podobieństwa. Przetwarzanie odbywa się lokalnie, bez zewnętrznego dostawcy AI.

## Zgodność

Schema SQLite pozostaje **10**. Aktualizacja z 2.1.0 nie wymaga nowej migracji. Nie dodano portalu wiedzy — pozostaje osobnym projektem. Zmiany są przygotowane do późniejszego wydania 2.1.1; samo istnienie tych notatek nie oznacza opublikowanego release'u.
