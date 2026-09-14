# Ręczne wgranie 0.7.0 na GitHub

1. Rozpakuj `Service_Desk_0.7.0.zip`. Otwórz katalog `itelade-desk` znajdujący się w paczce.
2. Skopiuj **całą jego zawartość**, wraz z `.github`, `.gitignore`, `.dockerignore` i `.env.example`, do lokalnego katalogu repozytorium `service-desk` sklonowanego przez GitHub Desktop. Zastąp pliki. Nie dodawaj dodatkowego poziomu `itelade-desk` w repozytorium.
3. W GitHub Desktop sprawdź zakładkę Changes. Pliki środowiska produkcyjnego `.env`, baza danych, kopie zapasowe i `node_modules` nie należą do repozytorium ani do tej paczki.
4. W Summary wpisz `Service Desk 0.7.0`. Kliknij **Commit to main**, następnie **Push origin**.
5. Na GitHub otwórz Releases → Draft a new release. Utwórz **nowy tag `v0.7.0` z aktualnego `main`**; nie używaj tagu 0.6.0.
6. Tytuł: `Service Desk 0.7.0`. Wklej treść z `RELEASE_NOTES_0.7.0.md`. Możesz załączyć tę paczkę ZIP jako plik wydania. Opublikuj stabilne wydanie.
7. Workflow **Publish Service Desk** ponownie uruchomi testy, zbuduje obrazy AMD64/ARM64 w GHCR i dołączy `desk-release.json`. Zaczekaj na zielony wynik Actions. Gdy workflow nie wystartuje, uruchom go ręcznie z tagiem `v0.7.0`.
8. Sprawdź, czy pakiet `ghcr.io/itelade/service-desk` jest publiczny, jeśli instalacje mają pobierać obraz bez logowania do rejestru.

Skopiowanie kodu na GitHub nie aktualizuje automatycznie Twojego serwera. Aktualizację istniejącej instalacji opisuje `UPGRADE.md`.
