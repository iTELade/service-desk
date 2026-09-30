# Walidacja 1.6.2

Przed publikacją `v1.6.2` wykonaj:

```bash
npm ci
npm run check
npm run test:ci
bash -n scripts/upgrade.sh
```

Przed utworzeniem finalnego artefaktu wydania odśwież `MANIFEST.sha256`, a następnie sprawdź:

```bash
sha256sum -c MANIFEST.sha256
```

## Smoke test 1.6.2

Sprawdź co najmniej:
- `/healthz` zwraca wersję `1.6.2` i schemat `8`,
- brak błędów CSP dla własnych assetów aplikacji; `document.documentElement.dataset.queueRefreshGuard === '1.6.2'`,
- awatary komentarzy pozostają 32×32 px na desktopie i mobile,
- zapisany układ kolejki odtwarza wybrane kolumny po reloadzie i po live refresh,
- kontrolki kolejki odtwarzają się po ponownym renderze tej samej trasy,
- klient nie może dodać ani usunąć załącznika w zarchiwizowanej sprawie lub zarchiwizowanym projekcie,
- usunięcie zgłoszenia usuwa rekordy i bajty z `r112_attachments`,
- lookup powiązań zwraca krótkie klucze, np. `QA-1`, `QA-10`, `QA-99`,
- `/api/desk/mentions` dla nieistniejącego ticket ID zwraca kontrolowane 404 zamiast 500,
- ekran Settings pozostaje bezczynny bez ciągłej pętli identycznych mutacji `.version-chip`,
- zakładki aktywności działają klawiaturą: ArrowLeft/Right/Up/Down oraz Home/End, z poprawnym `role=tab`, `tabpanel`, `aria-controls` i `aria-labelledby`,
- formularz `data-form=create-ticket` zawiera input załączników i pliki są przesyłane po utworzeniu sprawy,
- nagłówek produktu i Settings pokazują `1.6.2`,
- świeża instancja z językiem `en` pokazuje angielskie etykiety kolejki, ticketu, aktywności, załączników i ustawień.

## Integracje i testy środowiskowe

Po testach automatycznych wykonaj smoke test na docelowym środowisku dla:
- logowania lokalnego, LDAP/AD i SSO/OIDC,
- TOTP i WebAuthn/FIDO2, jeżeli są używane,
- inbound e-mail i odpowiedzi SMTP,
- GitHub Issues → Service Desk,
- backupu przed aktualizacją, aktualizacji 1.6.0 → 1.6.2 oraz rollbacku,
- Chromium oraz co najmniej jednego dodatkowego silnika przeglądarki używanego produkcyjnie.

Testy jednostkowe/DOM nie zastępują testu prawdziwej przeglądarki ani testu aktualizacji z Dockerem.


## Service Desk 2.0

- schema 8 -> 9 migration must pass tests/v9.test.mjs;
- index.html must load design-system.css and product-shell.js with the current version;
- active 1.2.x / 1.6.x visual decorator assets must not be loaded;
- queue, ticket, Settings and portal shell primitives are covered by tests/ui-2.0.test.mjs;
- production promotion additionally requires manual integration smoke tests listed in RELEASE_NOTES_2.0.0.md.
