# Service Desk 1.6.2

Service Desk 1.6.2 is a hardening release following the full 1.6.1 QA retest. Database schema remains **8** and no migration is required.

## Fixed

- Create-ticket attachments are scoped to the submitted create form and are no longer carried from a cancelled dialog into an unrelated customer ticket.
- Queue live refresh no longer treats a browser's implicit first `<select>` option as an unsaved user change.
- `SLA zagrożone / SLA at risk` is now a server-side numeric filter and pagination is applied after the risk set is computed.
- The v8 dashboard computes `sla_at_risk` from live ticket SLA metrics instead of returning a hard-coded zero.
- Legacy Settings decorators now use the same application version as the rest of the UI, removing the 1.5/1.6 version-chip rewrite loop.
- English translations cover the Settings and ticket activity labels reproduced by QA.
- Release publishing verifies `MANIFEST.sha256` before release creation; the tagged source must already contain a valid manifest.

## Validation

- `npm run check`
- `npm run test:ci`
- `bash -n scripts/upgrade.sh`
- `sha256sum -c MANIFEST.sha256`

Environment-level checks are still required for live AD/LDAP, Keycloak/OIDC, Mailcow/inbound mail, GitHub Issues integration, Docker updater/rollback, Safari/Firefox and physical FIDO2/WebAuthn devices.
