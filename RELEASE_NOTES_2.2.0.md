# Service Desk 2.2.0 — implementation candidate

Status: **work in progress, not a published stable release**. PR #79 contains the implementation candidate. Do not merge until the remaining acceptance gates in VALIDATION_2.2.0.md are met.

## Implemented foundation

- Editable project blueprint API, built-in HR/IT/accounts/Facilities packages, saved project drafts, preview and atomic activation, portable import/export and configuration capture.
- Separately deployed plugin connectors with manifest registration, scoped permissions, encrypted connection secrets, durable idempotent jobs, pause/cancel/retry and explicit delivery/business-result separation. No business plugin is bundled.
- Responsible teams, affected person, handover acknowledgement, responsibility rules and local department/location metadata.
- Sequential approval stages with parallel all/any decisions, delegation, rejection reasons and invalidation after material ticket changes.
- Required subtask/dependency blockers, cycle detection, optional versioned processes and explicit migration preview.
- Participants distinct from watchers, same-project duplicate merge, aliases, recycle/restore without automatic job resumption.
- Extended parameterized filters with AND/OR/IN/date comparisons/currentUser, bulk preview and per-item outcomes.
- Configuration revisions, restore validation, configuration consistency checks, read-only transition/SLA/automation diagnostics.
- Next step and permission-aware public customer history, personal reminders, notification event preferences and quiet hours.
- Period reports, quantiles, aging, protected attachment policy per project and FTS search candidates.
- Passwordless discoverable passkeys for local accounts, mandatory user verification and fresh reauthentication for key changes; existing hardware FIDO2 remains supported.
- Integration and assistance prepared in PR #78 are included in this branch; no separate 2.1.1 release is published.

## Authentication boundary

Passkeys are supported for active local accounts. LDAP and SSO-only accounts continue to use their identity provider, so local credentials cannot bypass directory/provider policy. The new tests verify WebAuthn cryptography and a virtual browser authenticator; physical iPhone and hybrid interoperability require a separate manual acceptance test.

## Database and rollback

Schema **11 → 12**, forward-only. Upgrading from stable 2.1.0 also applies schema 10 → 11. New tables preserve existing tickets, keys and identities. Back up the complete data volume and matching master.key before deployment. Rollback requires restoring the complete pre-upgrade backup; do not start older code on schema 12.

## Explicit exclusions

- No LDAP/AD account lifecycle plugin, account deletion retention, or new business connector; those belong to separate repositories.
- No configurable agent layout builder and no ticket-creation drafts. Project configuration drafts are included.
- The knowledge application stays separate.
- Mobile application is a preliminary direction for 3.0, outside this release.

## Validation

See VALIDATION_2.2.0.md for actual evidence and uncompleted gates. The candidate version number is not evidence of a release or production deployment.
