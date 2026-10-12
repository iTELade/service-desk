# Service Desk 2.2.0 — szablony projektów, procesy i obsługa pluginów

Status: PLAN / UNRELEASED. Dokument określa przyszły zakres, nie potwierdza implementacji ani wyników testów.
Zależność: przygotowywane 2.1.1, PR #78.
Pozostawić PR jako draft. Nie scalać do main, nie tworzyć tagu/release'u bez osobnej decyzji; scalenie może uruchomić publikację.
Numer schematu i migracje zostaną określone podczas implementacji.

## Granica wydania

- Core dostarcza szablony projektów, ogólne procesy i możliwość dodawania pluginów z osobnych repozytoriów.
- Plugin LDAP/Active Directory będzie rozwijany w osobnym repozytorium i NIE jest częścią zakresu 2.2.0.
- Wykluczone z tego PR: implementacja lifecycle kont, wyłączanie/usuwanie użytkowników katalogowych, retencja kont, adaptery zapisu LDAP/AD, reguły objectGUID/OU, rejestr dostępów do zewnętrznych systemów i inne operacje biznesowe przyszłego pluginu.
- Nie dodawać gotowego pluginu ani jego kodu do repozytorium Desk. Dopuszczalny jest neutralny fixture testowy kontraktu platformy, bez integracji katalogowej.
- Dotychczasowe logowanie i synchronizacja LDAP pozostają objęte regresją istniejących funkcji.
- Eskalacje pomiędzy projektami korzystają z istniejącej synchronizacji.
- Własne konfiguracje, formularze, filtry i workflow są rozszerzane.
- Baza wiedzy pozostaje osobnym projektem. Nie zmieniać produkcji.

## 1. Szablony i drafty projektów

- Edytowalne szablony HR, IT/Helpdesk, Administracja kontami i Administracja/Facilities.
- Typy zgłoszeń, formularze, własne pola, statusy, przejścia, kolejki, SLA, automatyzacje i deklaracje opcjonalnych zależności od pluginów.
- Zapisywalny draft projektu z podglądem, bez publikacji w portalu i uruchamiania akcji/zadań.
- Mapowanie ról logicznych na zespoły, kierowników, projekty i istniejące integracje.
- Własne szablony, wersjonowanie, duplikowanie oraz eksport/import z walidacją.
- Zapis istniejącego projektu jako szablonu bez zgłoszeń, historii, danych osobowych i sekretów.
- Pakiety projektów, np. HR + IT, z mapowaniami synchronizacji.
- Walidacja formularzy, osiągalności statusów, mapowań i wymaganych zależności przed aktywacją.
- Zmiana szablonu nie nadpisuje automatycznie istniejących projektów.
- Podgląd procesu na przykładowej osobie: odbiorcy akceptacji, zespoły, powiązane sprawy i planowane ogólne kroki, bez wykonania operacji i bez ujawniania sekretów.

## 2. Dodawanie i obsługa pluginów z osobnych repozytoriów

Rozbudować obecny rejestr manifestów o ogólny mechanizm instalacji i wykonania:
- Panel instalacji/rejestracji, aktualizacji, włączania, wyłączania i odinstalowania pluginu; zakres globalny/projektowy.
- Zdefiniowany format paczki lub rejestracji zewnętrznego connectora, manifest, wersja, zgodność Desk/API i zależności. Sam adres repozytorium nie oznacza wykonania jego kodu.
- Wersjonowany kontrakt API/SDK i dokumentacja dla autora pluginu.
- Punkty rozszerzeń: ustawienia, formularze, panele/akcje zgłoszeń, warunki workflow, akcje/wyzwalacze automatyzacji, szablony, dashboardy i harmonogram.
- Egzekwowane uprawnienia, zakres projektów i autoryzacja użytkownika zlecającego akcję; brak dowolnego dostępu do bazy core.
- Izolacja wykonania, timeouty, limity i stan zdrowia. Szczegóły zewnętrznej integracji implementuje jej osobne repozytorium.
- Ogólny magazyn szyfrowanych sekretów; bez sekretów w logach, manifestach, frontendzie i eksporcie.
- Trwałe zadania platformy: idempotencja, retry/backoff, anulowanie, wstrzymanie i wznowienie po restarcie.
- Odebranie uprawnień/wyłączenie pluginu blokuje dalsze wykonanie; widoczne konsekwencje dla zadań i zachowany audyt.
- Kontrola zgodności i migracji rozszerzenia podczas aktualizacji.
- Ogólne środowisko testowe kontraktu: przykładowe zdarzenia, testowe konfiguracje, symulacja wyników, awarii i powtórzenia żądania.
- Brak gotowych connectorów AD, poczty, VPN czy innych nowych integracji w ramach tego zakresu.

## 3. Akceptacje, osoby i odpowiedzialność

- Wieloetapowe akceptacje kolejno/równolegle, terminy decyzji, zastępstwa i odrzucenie z powodem.
- Rozdzielone pola: zgłaszający, osoba której dotyczy sprawa, akceptujący i wykonawca.
- Konfigurowalna macierz wyboru zespołu/akceptujących według działu, lokalizacji lub organizacji, na podstawie danych dostępnych w Desk.
- Brak dopasowania trafia do jawnej kolejki do przypisania; nie zgadywać akceptującego.
- Reguły ponownej akceptacji po zmianie istotnych danych wniosku.
- Kalendarz nieobecności i zastępstwa, zakres oraz czas obowiązywania delegacji.
- Zmiana lub cofnięcie decyzji rewaliduje zależne ogólne kroki i zadania procesu.
- Nie dodawać w core polityk zatrudnienia, retencji kont ani konkretnych operacji katalogowych.

## 4. Poufność i wersjonowanie procesów

- Uprawnienia do pól/sekcji według projektu, roli i zespołu.
- Reguły poufności stosowane w UI, API, wyszukiwaniu, raportach, eksporcie, powiadomieniach i synchronizacji.
- Wersja procesu zachowana dla trwającej sprawy; nowe sprawy korzystają z aktualnej wersji.
- Migracja trwających spraw na nowy proces wymaga walidacji i podglądu skutków.
- Jedna historia uruchomienia: decyzje ludzi, przekazania, automatyzacje i ogólne wyniki pluginów, wraz z powodem wykonania/blokady i aktorem.
- Historia nie ujawnia chronionych pól ani sekretów.

## 5. Synchronizacja, zespoły i przekazanie pracy

- Zweryfikować transfery, mapowania statusów, komentarze, kierunki, uprawnienia, deduplikację i awarie.
- Odpowiedzialny zespół i agent, kolejki zespołowe oraz audyt eskalacji.
- Przekazanie zapisuje powód, wykonane czynności, następny krok, blokadę i termin.
- Potwierdzenie przejęcia i widoczny stan przekazania.
- Zachować autorstwo; rozdzielić aktora technicznego od biznesowego.
- Synchronizacja respektuje poufność pól/notatek i nie zastępuje akceptacji procesu.
- Reguły ponowień i konflikty statusów widoczne dla operatora.

## 6. Workflow, podzadania i centrum zadań

- Warunki przejścia według roli, formularza, wartości pól, akceptacji i obowiązkowych kroków.
- Czytelny komunikat, czego brakuje; egzekwowanie także po stronie API.
- Ogólne warunki/akcje rozszerzeń przez kontrakt pluginów.
- Podzadania z właścicielem, terminem, postępem, zależnościami i blokadami.
- Określić obowiązkowe podzadania blokujące zakończenie sprawy nadrzędnej.
- Centrum zaplanowanych zadań platformy: termin, źródłowa sprawa, status, wynik, retry i uprawnione anulowanie/wstrzymanie.
- Jawna polityka zadań przy archiwizacji/usunięciu sprawy i wyłączeniu pluginu.
- Ekran jest neutralny wobec domeny pluginu; nie dostarcza funkcji zarządzania kontami.

## 7. Kolejki, podobieństwo i duplikaty

- Rozszerzyć własne filtry o OR, IN, zakresy dat, puste pola, własne pola i currentUser().
- Wspólny kontrakt kreatora graficznego i wyrażeń tekstowych.
- Kolejki współdzielone/publikowane zespołom z kontrolą dostępu.
- Rozwinięcie 2.1.1: podobieństwo opisu, usług i assetów, indeks pełnotekstowy i wyjaśnienie dopasowania.
- Rozróżnić duplikat, powiązane i ten sam incydent.
- Podgląd skutków operacji; pochodzenie komentarzy i plików zachowane.
- Ranking i indeks respektują uprawnienia oraz poufność.

## 8. Poczta, portal i raporty

- Odbiorcy/CC, stan wysyłki, błędy, retry i poprawne przypisanie wątków w istniejącej obsłudze poczty.
- Okresy raportów, mediany/percentyle, ponowne otwarcia, starzenie kolejki, zespoły i formularze.
- Wynik raportu otwiera zgłoszenia o identycznym zakresie.
- Pełne wykrywanie zagrożeń SLA lub jawne ograniczenia radaru.
- Portal: opisowe statusy, „czekamy na Ciebie”, podgląd przed wysłaniem i formularze usługowe.

## 9. Administracja i utrzymanie

- Panel operacyjny: istniejąca poczta/LDAP, stan pluginów/integracji, kolejki i zweryfikowane kopie zapasowe.
- Modularizacja app.js i stopniowe wycofanie aktywnych historycznych dekoratorów bez utraty funkcji.
- Testy równoczesnej pracy agentów, importu poczty i automatyzacji z pomiarem opóźnień/konfliktów.
- Ujednolicenie README, schematu, dokumentacji KB i opisów wydania.
- Plan migracji, kopii i odtworzenia przed zmianami schematu.

## Kolejność realizacji

1. Kontrakty, regresja synchronizacji i poufność.
2. Szablony/drafty, pakiety i podgląd procesu.
3. Dodawanie pluginów, API/SDK, uprawnienia i trwałe zadania.
4. Akceptacje, osoby, macierz odpowiedzialności, zastępstwa i wersjonowanie procesów.
5. Workflow, podzadania, kolejki i historia wykonania.
6. Raporty, portal, poczta, utrzymanie i pełna regresja.

Implementacja pluginów w osobnych repozytoriach jest poza tą kolejnością i poza wydaniem core 2.2.0.

## Kryteria odbioru — do wykonania

- [ ] Projekt lub pakiet HR + IT powstaje z szablonu z formularzami i przejściami.
- [ ] Draft zapisuje się, wznawia i aktywuje po walidacji; podgląd nie wykonuje akcji.
- [ ] Eksport nie zawiera danych zgłoszeń, danych osobowych ani sekretów.
- [ ] Dotychczasowe konfiguracje, logowanie LDAP i synchronizacje działają po aktualizacji.
- [ ] Poufne pola/sekcje są chronione we wszystkich kanałach, w tym synchronizacji.
- [ ] Akceptacje równoległe/sekwencyjne, odmowa, termin, zastępstwo i ponowna akceptacja mają testy.
- [ ] Osoba objęta sprawą pozostaje odrębna od zgłaszającego i akceptującego.
- [ ] Macierz odpowiedzialności wskazuje właściwy zespół lub jawny brak dopasowania.
- [ ] Trwająca sprawa zachowuje wersję procesu; migracja ma podgląd skutków.
- [ ] Neutralny zewnętrzny fixture instaluje się/rejestruje przez udokumentowany kontrakt.
- [ ] Niezgodny plugin lub niedozwolona capability są blokowane.
- [ ] Odebranie uprawnień/wyłączenie blokuje wykonanie i zachowuje audyt.
- [ ] Aktualizacja/odinstalowanie respektują dane rozszerzenia i oczekujące zadania.
- [ ] Restart, retry i powtórzone zdarzenie nie powodują podwójnego skutku.
- [ ] Centrum zadań i historia pokazują wyniki, blokady i źródłową sprawę.
- [ ] Testowy tryb pluginów nie wykonuje operacji na produkcyjnych połączeniach.
- [ ] Repozytorium nie zawiera nowego pluginu LDAP/AD ani jego funkcji biznesowych.
- [ ] Warunki workflow są egzekwowane w UI, API i kontrakcie rozszerzeń.
- [ ] Raporty/wyszukiwanie respektują zakres oraz poufność.
- [ ] Migracje/odtworzenie, równoczesna praca i regresja API/portalu/admina są sprawdzone.
- [ ] Chromium, Firefox i WebKit oraz dokumentacja odpowiadają wdrożonemu stanowi.

PR dodaje wyłącznie plan. Implementacja, migracje, testy funkcjonalne i publikacja pozostają przyszłymi pracami.
