# Service Desk 2.1.1 — przygotowane do wydania

Ta wersja jest przygotowywana na osobnej gałęzi. Nie została opublikowana ani wdrożona na produkcji.

## Podpowiedzi i usprawnienia projektu

W ustawieniach projektu → **Podpowiedzi i usprawnienia** administrator lub manager projektu może osobno włączyć:

- **Podobne zgłoszenia**: podpowiedzi podczas wpisywania tematu nowego zgłoszenia i w szczegółach istniejącego. Do pięciu dopasowań, ocena 20–100 z ustawianym progiem, wspólne słowa i status sprawy. Agent może ręcznie utworzyć standardowe powiązanie. Nie ma automatycznego scalania, zamykania ani oznaczania spraw jako duplikatów.
- **Sygnały wymagające uwagi**: brak opiekuna, brak aktualizacji przez wskazaną liczbę dni, niewykonane kroki checklisty oraz praca przekraczająca estymację. Sygnały są pomocnicze, nie zmieniają priorytetu i nie zastępują SLA.
- **Podsumowanie do przekazania**: podgląd i kopiowanie klucza, tematu, opiekuna, opisu, czasu pracy, pozostałych kroków i ostatnich publicznych wiadomości. Bez notatek wewnętrznych i treści załączników. Operator przegląda treść przed udostępnieniem.

Wszystkie opcje są domyślnie wyłączone, również dla istniejących projektów. Zapis chroni przed nadpisaniem równoczesnej zmiany ustawień i zachowuje inne opcje projektu.

Formularz tworzenia wybiera bieżący projekt. Zmiana projektu czyści poprzednie podpowiedzi. Historyczne zgłoszenia w archiwalnym projekcie pozostają dostępne. Poprawiono także kontrast przycisku „Utwórz zgłoszenie” po najechaniu w obu motywach.

## Jak działa dopasowanie

Porównywane są słowa w tematach zgłoszeń, z normalizacją wielkości liter i polskich znaków oraz pomijaniem częstych słów. Rzadsze słowa mają większą wagę. Zwykle wymagane są co najmniej dwa wspólne słowa; identyczny znormalizowany temat może mieć jedno. Wynik jest oceną dopasowania tekstu, nie prawdopodobieństwem duplikatu. Nie jest to wyszukiwanie semantyczne AI.

Przeszukiwane jest do 2000 ostatnio aktualizowanych, dostępnych zgłoszeń tego samego projektu. Archiwalne i usunięte zgłoszenia są pomijane. Klient widzi wyłącznie sprawy, do których ma prawo dostępu; treści opisów i komentarzy nie są zwracane przez endpoint podobieństwa. Przetwarzanie odbywa się lokalnie, bez zewnętrznego dostawcy AI.

## Zgodność

SQLite przechodzi ze schematu **10 do 11** w migracji transakcyjnej. Nowa tabela przechowuje wyłącznie identyfikatory powiązań zgłoszenie–artykuł, bez treści artykułów. Nie dodano natywnego portalu wiedzy — pozostaje osobnym projektem. Zmiany są przygotowane do późniejszego wydania 2.1.1; samo istnienie tych notatek nie oznacza opublikowanego release'u.

## Integracja z service-desk-knowledge-base

Istniejąca pozycja **Ustawienia → Integracje → Baza wiedzy** obsługuje teraz rzeczywiste API osobnej aplikacji: adres API, oddzielny adres HTTPS w odnośnikach, szyfrowany token z uprawnieniami `health/search/read`, zakres projektów i przestrzeni oraz test połączenia. Sieć prywatna Docker/VPN wymaga jawnego włączenia. Zmiana adresu API usuwa stary token, jeżeli nie podano nowego.

Agent przy otwarciu zgłoszenia otrzymuje do pięciu propozycji z tematu i opisu. Do KB trafiają wybrane słowa kluczowe, bez notatek wewnętrznych, załączników, adresów e-mail i URL. Można wyszukiwać ręcznie, podglądać artykuł, przypinać stabilny identyfikator do zgłoszenia i wstawić odnośnik do szkicu odpowiedzi. Nic nie wysyła się automatycznie. Treść jest pobierana na żądanie z KB i wyświetlana bez osadzania zdalnego HTML.

Integracja jest dostępna zespołom obsługującym wybrane projekty. Administrator udostępnia im treści dopuszczone przez dedykowany token KB i opcjonalną listę przestrzeni; nie jest to automatyczne przeniesienie indywidualnych uprawnień kont z KB. Klienci nie korzystają z tego tokenu. Publiczny odnośnik jest sprawdzany dodatkowo przez anonimowy endpoint KB, obejmujący także dostęp do przestrzeni. Niedostępne lub wycofane artykuły nie udostępniają starych tytułów z pamięci podręcznej. Awaria KB nie blokuje edytora zgłoszenia.

Zgodność jest sprawdzana na osobnej aplikacji KB 0.5.1, commit `afefd4b98a0ed42ef704ad1452aa523923c28b62`, oraz na Chromium, Firefox i WebKit. Nie zmieniono ani nie wydano repozytorium KB.
