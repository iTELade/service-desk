# Service Desk 2.2.0 — plan następnej wersji

Status: PLAN / UNRELEASED. Ten dokument określa zakres przyszłej implementacji, nie potwierdza dostarczenia funkcji ani wykonania testów.
Zależność: przygotowane 2.1.1 z PR #78 (podpowiedzi zgłoszeń i integracja z zewnętrzną bazą wiedzy).
Nie scalać tego PR do main ani nie tworzyć tagu/release'u bez osobnej decyzji: scalenie może uruchomić publikację.
Numer 2.2.0 oznacza planowane wydanie funkcjonalne po 2.1.1; numer schematu zostanie określony przy implementacji.

## Ustalenia produktu

- Wykorzystać istniejącą synchronizację do przekazywania/eskalowania spraw pomiędzy projektami. Nie budować drugiego konkurencyjnego mechanizmu.
- Zachować własne konfiguracje użytkowników, formularze i workflow. Nowe możliwości mają je rozszerzać.
- Baza wiedzy pozostaje osobnym projektem; bez natywnego portalu ani edytora wiedzy w Desk.
- Plugin LDAP/AD Lifecycle ma być osobnym rozszerzeniem. Core zapewnia kontrakt i runtime, nie zaszywa operacji AD w logice zgłoszeń.
- Nie zmieniać produkcji podczas planowania.

## 1. Szablony i drafty projektów

- Biblioteka edytowalnych szablonów HR, IT/Helpdesk, Administracja kontami, Administracja/Facilities.
- Szablon zawiera typy zgłoszeń, formularze, własne pola, statusy, przejścia, kolejki, SLA, automatyzacje i wymagania pluginów.
- Zapisywalny draft projektu: konfiguracja i podgląd przed aktywacją, bez dostępu klienta i uruchamiania integracji/zadań.
- Kreator mapuje role logiczne na istniejące zespoły, kierowników, projekty i integracje.
- Kopiowanie istniejącego projektu do szablonu bez zgłoszeń, historii, danych osobowych i sekretów.
- Własne szablony, wersjonowanie, duplikowanie, eksport/import z walidacją i kontrolą uprawnień.
- Pakiety powiązanych projektów, np. HR + IT, wraz z mapowaniami synchronizacji.
- Podgląd skutków aktywacji; walidacja formularzy, osiągalności statusów, mapowań i brakujących zależności.
- Zmiana szablonu nie nadpisuje samoczynnie już utworzonych projektów.

## 2. Runtime pluginów i SDK

Obecny registry manifestów nie jest pełnym mechanizmem wykonawczym. Rozbudować go o:

- Wersjonowane API/SDK i testy zgodności kontraktu.
- Manifest z wersją API, zgodnością Desk, zależnościami, punktami rozszerzeń i egzekwowanymi uprawnieniami.
- Punkty rozszerzeń: ustawienia globalne/projektowe, formularze, panele i akcje zgłoszeń, warunki/przejścia workflow, akcje/wyzwalacze automatyzacji, szablony projektów, dashboardy i zadania harmonogramu.
- Autoryzowany dostęp do zgłoszeń i wyników operacji; brak nieograniczonego dostępu do bazy core.
- Osobny proces/kontener dla connectorów zewnętrznych; timeouty, kontrola zdrowia i izolacja awarii.
- Sekrety szyfrowane, bez ujawniania w manifestach, logach, eksporcie czy frontendzie.
- Trwała kolejka zadań: idempotencja, retry/backoff, anulowanie, wstrzymywanie, obsługa restartu i zadań przeterminowanych.
- Wyłączenie/usunięcie pluginu zatrzymuje wykonanie i pokazuje konsekwencje dla oczekujących zadań; nie usuwa audytu.
- Aktualizacje pluginu, migracje danych rozszerzenia i walidacja zgodności przed aktywacją.
- Przykładowy plugin, dokumentacja autora, test harness i scenariusze błędów.
- Rozdzielić możliwość techniczną pluginu od prawa konkretnego użytkownika do zlecenia akcji.

## 3. Pierwszy plugin: LDAP/AD Lifecycle

Scenariusz referencyjny: zwolnienie pracownika.

1. Kierownik tworzy wniosek, wybiera pracownika i datę/godzinę zakończenia dostępu.
2. HR potwierdza dane, termin i politykę retencji.
3. IT Admini lub skonfigurowany dział weryfikują konto i zatwierdzają wykonanie.
4. Plugin wyłącza konto w zatwierdzonym terminie, odczytuje stan z katalogu i zapisuje rezultat.
5. Powstaje trwałe zadanie usunięcia po konfigurowalnym okresie, np. 90 dni.
6. Przed usunięciem następuje ponowna walidacja tożsamości, stanu konta i aktualności decyzji.
7. Wynik i błędy trafiają do audytu oraz powiązanego zgłoszenia.

Wymagania:
- Identyfikacja konta AD po objectGUID, nie wyłącznie po loginie/e-mailu/DN.
- Jawna podstawa liczenia retencji, domyślnie faktyczne skuteczne wyłączenie; zapis konkretnego terminu.
- Ponowne zatrudnienie, reaktywacja, cofnięcie akceptacji lub wstrzymanie blokuje/anuluje usunięcie.
- Zdefiniować zatwierdzanie zmian terminu i celu operacji; istotna zmiana unieważnia wcześniejsze akceptacje.
- Status skopiowany przez synchronizację sam nie uprawnia do wyłączenia/usunięcia konta.
- Osobne konto integracyjne z delegowanym zakresem zapisu, ograniczenie OU i ochrona kont uprzywilejowanych/systemowych.
- Adapter AD oraz jawne wsparcie innych katalogów LDAP; bez zakładania, że wszystkie używają userAccountControl.
- Dry-run/podgląd, kontrola rezultatu, ręczne ponowienie bez podwójnej operacji.
- Błąd katalogu oznacza „Wymaga interwencji”, nie sukces procesu.
- Zamknięcie sprawy nie gubi zaplanowanego zadania; usunięcie/archiwizacja sprawy ma jawnie określoną politykę dla zadania.
- Wyłączenie AD nie oznacza automatycznego cofnięcia wszystkich sesji w innych usługach. Dodatkowe czynności connectorów muszą mieć osobne, widoczne wyniki.
- Utrzymać dotychczasowe logowanie i synchronizację LDAP; operacje zapisu należą do pluginu.
- Plugin może później dostarczać onboarding, zmianę uprawnień i przenoszenie kont — poza obowiązkowym pierwszym scenariuszem.

## 4. Synchronizacja, zespoły i przekazanie pracy

- Zweryfikować istniejące transfery, statusy, komentarze, kierunki, uprawnienia, deduplikację i awarie.
- Rozszerzyć proces o odpowiedzialny zespół i agenta, kolejki zespołowe oraz audyt eskalacji.
- Przekazanie zapisuje powód, wykonane czynności, następny krok, blokadę i termin.
- Potwierdzenie przejęcia oraz widoczny stan przekazania.
- Zachować oryginalne autorstwo i rozdzielić aktora technicznego od biznesowego.
- Chronić notatki HR i pola poufne przed kopiowaniem do nieuprawnionych projektów.
- Reguły ponowienia i konflikty statusów muszą być widoczne dla operatora.

## 5. Workflow i podzadania

- Warunki przejścia według roli, formularza, wartości pól, akceptacji i obowiązkowych kroków.
- Czytelny komunikat, czego brakuje do przejścia.
- Warunki oraz akcje pluginowe sprawdzane po stronie serwera.
- Podzadania z właścicielem, terminem i postępem; zależności i blokady.
- Szablony procesów wielodziałowych, np. onboarding i offboarding.
- Zdefiniować, które obowiązkowe podzadania blokują zakończenie sprawy nadrzędnej.

## 6. Kolejki, podobieństwo i duplikaty

- Rozszerzyć istniejące własne filtry o OR, IN, zakresy dat, puste pola, własne pola i currentUser().
- Jeden kontrakt dla kreatora graficznego i wyrażenia tekstowego.
- Współdzielenie/publikowanie kolejek zespołowi z kontrolą uprawnień.
- Rozwinąć przygotowane 2.1.1: podobieństwo opisu, usług i assetów, indeks pełnotekstowy i wyjaśnienie dopasowania.
- Rozróżnić „duplikat”, „powiązane” i „ten sam incydent”.
- Podgląd skutków łączenia/oznaczania duplikatów oraz zachowanie pochodzenia komentarzy i plików.
- Indeks i ranking zawsze respektują dostęp; żadnego ujawniania poufnych spraw.

## 7. Poczta, portal i raporty

- Rozmowa mailowa: odbiorcy/CC, stan wysyłki, błędy, ponowienia i poprawne przypisanie wątków.
- Raporty: wybór okresu, mediany/percentyle, ponowne otwarcia, starzenie kolejki, zespoły i formularze.
- Przejście z wyniku raportu do zgłoszeń z identycznym zakresem danych.
- Pełne wykrywanie spraw zagrożonych SLA lub jawne oznaczanie ograniczeń podglądu; nie przedstawiać ograniczonego radaru jako pełnego zbioru.
- Portal: opisowe statusy klienta, „czekamy na Ciebie”, podgląd przed wysłaniem i formularze usługowe.

## 8. Administracja i utrzymanie

- Panel operacyjny: import poczty, LDAP, stan pluginów/integracji, kolejki zadań i zweryfikowane kopie zapasowe.
- Stopniowa modularizacja frontendowego app.js i wycofanie aktywnych historycznych dekoratorów przy zachowaniu funkcji.
- Testy równoczesnej pracy agentów, importu poczty i automatyzacji, z pomiarem opóźnień i konfliktów.
- Ujednolicenie README, numerów schematu, dokumentacji KB i opisów wydania.
- Plan migracji, kopii zapasowej i odtworzenia ustalić przed implementacją zmian schematu.

## Kolejność realizacji

1. Kontrakty i testy istniejącej synchronizacji.
2. Szablony/drafty i pakiety projektów.
3. Runtime pluginów, SDK, uprawnienia i trwałe zadania.
4. Osobny plugin LDAP/AD Lifecycle i referencyjny proces HR → IT.
5. Workflow, podzadania, kolejki i dopracowanie pracy agentów.
6. Raporty, portal, poczta, utrzymanie i pełna regresja.

## Kryteria odbioru — do wykonania, nie wyniki testów

- [ ] Utworzenie HR + IT z pakietu bez ręcznej budowy formularzy i przejść.
- [ ] Własny szablon i draft dają się zapisać, wznowić oraz aktywować po walidacji.
- [ ] Eksport szablonu nie zawiera sekretów ani danych zgłoszeń.
- [ ] Istniejące konfiguracje i synchronizacje działają po aktualizacji.
- [ ] Przekazanie HR → IT nie ujawnia nieuprawnionym danych HR.
- [ ] Przykładowy plugin instaluje się i działa przez publiczny kontrakt SDK.
- [ ] Odebranie uprawnień i wyłączenie pluginu zatrzymuje operacje zewnętrzne.
- [ ] Restart nie gubi zadań i nie powoduje ponownego wykonania skutecznej akcji.
- [ ] Pełny offboarding: kierownik → HR → IT → sprawdzone wyłączenie → usunięcie po retencji.
- [ ] Zmiana loginu/DN nie zmienia celu; ponowne użycie loginu nie usuwa innego konta.
- [ ] Reaktywacja, rehire, cofnięcie decyzji i wstrzymanie zatrzymują usunięcie.
- [ ] Brak AD i odebranie uprawnień dają widoczny błąd, bez fałszywego sukcesu.
- [ ] Błędna tożsamość, niedozwolone OU i konto chronione blokują zapis.
- [ ] Warunki przejść są egzekwowane także przez API i pluginy.
- [ ] Raporty i indeks wyszukiwania respektują uprawnienia oraz zakres.
- [ ] Migracje i odtworzenie sprawdzone na kopii danych.
- [ ] Regresja API, portal/agent/admin i przeglądarki Chromium/Firefox/WebKit.
- [ ] Równoczesna praca i zewnętrzna integracja katalogowa mają scenariusze odbioru.
- [ ] Dokumentacja opisuje rzeczywiście wdrożony stan i ograniczenia.

Ten PR dodaje wyłącznie plan. Implementacja, migracje, testy funkcjonalne i publikacja pozostają przyszłymi pracami.
