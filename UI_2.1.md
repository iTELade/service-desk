# Architektura interfejsu 2.1

Router w app.js rezerwuje właściciela nowych ekranów przez data-native21 przed rozpoczęciem żądań asynchronicznych. workspace.js renderuje nowe trasy i jawnie montuje kolejkę, zgłoszenie, operacje, workflow, odpowiedzi projektu i stan integracji. Znacznik workspaceReady jest ustawiany po zakończeniu montowania; spóźnione odpowiedzi poprzedniej trasy nie zastępują ekranu.

workspace.css rozszerza wspólne tokeny i ustala nowe układy. design-system.css zachowuje ekranom kompatybilności dotychczasową prezentację. product-shell.js i release-1.1.2.js nie dekorują nowych ekranów na podstawie mutacji DOM; jawne mosty zachowują nawigację, dostępność, zapisane widoki i chronione pliki. Stary edytor reguł, ustawienia i administracja nadal używają istniejących kontrolek.

Szkice i licznik pracy są lokalne, rozdzielone według użytkownika, zgłoszenia i widoczności wiadomości. Nie są synchronizowane pomiędzy urządzeniami. Obecność jest krótkotrwała i nie zastępuje kontroli wersji. Każda operacja zapisu jest sprawdzana po stronie serwera.

Nowe ścieżki:

| Trasa | Funkcja |
|---|---|
| queue | Widoki, podgląd, edycja wierszy, operacje zbiorcze |
| ticket/:key | Rozmowa, praca, zadania, CSAT i usługi |
| reports | Radar SLA, obciążenie i wyniki |
| cases?kind=incident/problem/change | Rejestry operacyjne |
| case/:id | Koordynacja i komunikacja |
| services, service/:id | Katalog i mapa wpływu |
| calendar | Zmiany, kolizje, okna i blokady |
| workflow/:project | Szkic i publikacja obiegu |
| replies/:project | Gotowe odpowiedzi |
| integrations | Ostatni stan kontroli połączeń |

Portal wiedzy nie jest częścią tej architektury. Istniejący ekran administracyjny konfiguracji zewnętrznego adresu pozostaje zachowany.
# Przygotowane usprawnienia 2.1.1

`#/assist/:project_id` jest natywną stroną ustawień **Podpowiedzi i usprawnienia**, dostępną z ustawień projektu dla managera/admina. Oddzielne flagi sterują podobieństwem, sygnałami uwagi i podsumowaniem. Domyślnie wszystkie są wyłączone.

Formularz tworzenia uruchamia lokalne podpowiedzi po 350 ms bez wpisywania; zmiana projektu czyści poprzedni wynik. Numer generacji chroni przed wyświetleniem opóźnionej odpowiedzi dla innego tematu/projektu. Odnośniki otwierają sprawę w osobnej karcie, zachowując formularz. Awaria podpowiedzi nie blokuje utworzenia zgłoszenia.

Szczegóły zgłoszenia pokazują ocenę dopasowania i wspólne słowa. Powiązanie wymaga kliknięcia agenta i używa istniejących kontroli uprawnień. Sygnały uwagi i podsumowanie są dostępne wyłącznie zespołowi. Podsumowanie otwiera podgląd przed kopiowaniem; przy braku Clipboard API tekst jest zaznaczany do ręcznego kopiowania.

# Integracja KB dla agenta — 2.1.1, nieopublikowane

Istniejący widok `#/admin/knowledge` ma rzeczywisty token API, adres API i adres w odnośnikach, zakres projektów/przestrzeni, przełącznik automatycznych podpowiedzi i test połączenia. Konfiguracja jest wyłącznie dla administratora; token nie wraca w odpowiedziach. Zapis odświeża metadane projektów bez konieczności ponownego logowania.

W szczegółach zgłoszenia uprawniony agent otrzymuje panel **Artykuły pomocne w tej sprawie**. Pobieranie odbywa się niezależnie od renderowania zgłoszenia; błąd KB daje komunikat i nie usuwa edytora. Domyślne podpowiedzi pochodzą z tematu i opisu; ręczne wyszukiwanie czyści poprzednie wyniki i chroni przed opóźnionymi odpowiedziami.

Podgląd artykułu pokazuje tekst bez osadzania zdalnego HTML. Można przypiąć stabilny ID lub wstawić odnośnik do szkicu. Publiczna odpowiedź wymaga ponownego anonimowego odczytu KB; prywatny artykuł można wstawić do osobnego szkicu notatki wewnętrznej. Żaden przycisk integracji nie wysyła komentarza automatycznie. Klienci nie widzą panelu ani metadanych powiązanych artykułów.

