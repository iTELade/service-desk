# Walidacja 0.8.0

Przed publikacją `v0.8.0` wykonaj:

```bash
sha256sum -c MANIFEST.sha256
npm ci
npm run check
npm test
bash -n scripts/upgrade.sh
```

Następnie sprawdź co najmniej:
- logowanie lokalne, LDAP i SSO,
- TOTP: konfigurację przez QR, kod ręczny i recovery codes,
- FIDO2/WebAuthn: dodanie, logowanie i usunięcie klucza,
- synchronizację LDAP i nadawanie Administratora,
- kolejki, dashboard i zapisane widoki,
- approvals, organizacje i środki trwałe,
- inbound e-mail, API tokens i webhooki,
- GitHub Issues → Service Desk,
- `/healthz` zwracający wersję `0.8.0` i schemat `8`,
- aktualizację z poprzedniej kopii danych oraz rollback.

Integracja Knowledge Base nie należy do zakresu 0.8.0.
