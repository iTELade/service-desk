# Service Desk 2.1.0

Duża aktualizacja stanowiska agenta i obsługi operacyjnej ITSM. Schemat SQLite: **10**. Portal wiedzy jest osobnym projektem — nie dodano natywnej bazy artykułów, edytora ani jej wersjonowania. Dotychczasowa konfiguracja zewnętrznego adresu pozostaje dostępna.

## Stanowisko agenta

Kolejki mają boczne widoki z licznikami i ulubionymi, rozwijane filtry, podgląd sprawy, edycję priorytetu/opiekuna/statusu i wybór do 50 spraw. Operacje zbiorcze zwracają wynik dla każdej sprawy, respektują wersję i uprawnienia oraz nie dublują zapisów po ponowieniu. Nadal działają istniejące prywatne i wspólne widoki. Zapytania obsługują project/status/priority/assignee/type połączone AND; nie jest to pełny język JQL.

Ctrl+K otwiera nawigację i wyszukiwanie dostępnych zgłoszeń. Nowe ekrany mają właściciela w routerze oraz jawne montowanie komponentów. Dotychczasowe dekoratory pozostają wyłącznie dla ekranów kompatybilności; obsługa załączników i zapisanych widoków jest montowana jawnie.

Zgłoszenie otrzymuje osobne lokalne szkice odpowiedzi publicznych i notatek, podgląd bezpiecznego Markdown, gotowe odpowiedzi projektu, wklejanie obrazów i upuszczanie plików. Wysłanie ze zmianą statusu jest atomowe i chronione kluczem ponowienia. Konflikt wersji zachowuje szkic. Działają dotychczasowe wzmianki, obserwatorzy, powiązania, urządzenia i zatwierdzenia.

Dodano ewidencję pracy, estymacje, lokalny licznik pracy, checklisty i ręczne runbooki VPN/LDAP/poczta/SOC. Obecność współpracowników jest sygnalizowana z wygasaniem po 45 sekundach. Licznik zapisuje czas dopiero po potwierdzeniu wpisu; nie jest pomiarem czasu kalendarzowego zgłoszenia.

## Portal zgłoszeń

Odświeżone karty i nagłówki portalu, warunkowe pola formularzy oraz wypełnianie nazwą/e-mailem zgłaszającego. Walidacja po stronie serwera usuwa nieaktywne pola zależne i wymaga widocznych danych. CSAT 1–5 wystawia wyłącznie zgłaszający, po rozwiązaniu, raz dla sprawy. Dane wewnętrzne zespołu pozostają niedostępne klientom.

## Operacje i usługi

Nowe przestrzenie incydentów, problemów i zmian: koordynator, priorytet, usługa, zadania, oś czasu, przyczyna, obejście, znany błąd i post-mortem. Publiczne aktualizacje są wysyłane do powiązanych zgłoszeń przez jawne działanie człowieka; niepowodzenia są pokazywane osobno.

Katalog usług zawiera właściciela, stan, urządzenia, powiązania ze zgłoszeniami i mapę zależności z wpływem przechodnim. Cykl zależności jest odrzucany. Zmiany wymagają decyzji kierownika przed wdrożeniem oraz terminów i planu rollbacku. Kalendarz wykrywa kolizje tej samej usługi i respektuje okna blokady zmian.

Adapter monitoringu przyjmuje standardowe zdarzenia down/up przez webhook z tokenem Bearer wyświetlanym raz. Identyfikator zdarzenia zabezpiecza ponowienia. Awaria otwiera incydent, przywrócenie przełącza go w obserwację. Zgłoszenia klientów nie są automatycznie zamykane. Adapter wymaga mapowania źródła monitoringu do opisanego kontraktu; wydanie nie deklaruje przetestowanego połączenia z produkcyjnym Kenerem.

## Konfiguracja i raporty

Projektant workflow: przeciąganie węzłów, obsługa strzałek klawiatury, zoom, dopasowanie, miniatura, inspektor, tabela przejść, szkic, walidacja i publikacja z kontrolą wersji. Używane statusy i ich kategorie są chronione. Zmiana mapy projektu może odłączyć go od wspólnego szablonu.

Test opublikowanej automatyzacji pokazuje dopasowanie zdarzenia/statusu/warunków i plan akcji bez wykonywania zmian, poczty i webhooków. Symulacja SLA używa bieżącego formularza kalendarza, uwzględniając dni wolne i strefę czasową. Nowe raporty pokazują utworzone/rozwiązane sprawy, obciążenie, czasy kalendarzowe, CSAT, pracę i radar SLA. Radar bada do 500 aktywnych spraw, według priorytetu i najstarszej aktualizacji — interfejs podaje rozmiar próby. Czasy średnie raportów są kalendarzowe, a radar używa godzin pracy SLA.

## Aktualizacja i kontrola

Wykonaj spójną kopię całego katalogu danych wraz z master.key. Schemat 10 wymaga odtworzenia kopii sprzed migracji przy powrocie do 2.0.x. Instrukcje: [UPGRADE.md](UPGRADE.md). Bramki wydania obejmują istniejącą regresję, testy 2.1, trzy silniki przeglądarek, kontrast, cztery szerokości i dwa motywy, syntetyczne 10 000 zgłoszeń oraz uruchomienie publikowanego kontenera bez roota. Wyniki: [VALIDATION.md](VALIDATION.md).
