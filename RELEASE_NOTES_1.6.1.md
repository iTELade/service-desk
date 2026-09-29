# Service Desk 1.6.1

Service Desk 1.6.1 is a focused hotfix for the QA findings reported against 1.6.0 (`f5961bb`). Database schema remains **8** and no migration is required.

## Fixed

- moved the 1.5.1/1.6 bootstrap hotfix code and avatar constraints out of inline HTML so the application no longer depends on CSP-blocked inline scripts/styles,
- preserved non-destructive five-second queue refresh through an external same-origin guard,
- made queue view controls remount after DOM rerenders and made saved column mapping tolerant of English/Polish headers,
- blocked attachment create/delete operations when the ticket or project is archived,
- removed stored attachment bytes when an administrator deletes a ticket,
- allowed relationship lookup for unpadded ticket keys such as `QA-1`, `QA-10` and `QA-99`,
- changed stale/nonexistent mention ticket IDs from an unhandled 500 to a controlled 404,
- stopped Settings from repeatedly rewriting an unchanged version chip,
- added keyboard operation for activity tabs with Arrow keys and Home/End plus tab/tabpanel ARIA relationships,
- attached the create-ticket file picker to the actual `data-form="create-ticket"` dialog while retaining compatibility with the legacy selector,
- aligned visible product/version markers with 1.6.1,
- added an English completion layer for the 1.6 queue/ticket/activity/attachment/settings strings observed during QA,
- replaced the obsolete 0.8.0 `VALIDATION.md` with a 1.6.1 validation and smoke-test checklist.

## Validation focus

Run `npm run test:ci` and the smoke checklist in `VALIDATION.md`. Before publishing the final release artifact, regenerate `MANIFEST.sha256` and verify it with `sha256sum -c MANIFEST.sha256`.

The following still require environment-level verification because CI cannot prove them by itself: live AD/LDAP, Keycloak/OIDC, Mailcow/inbound mail, GitHub Issues integration, Docker updater/rollback, Safari/Firefox and physical FIDO2/WebAuthn devices.
