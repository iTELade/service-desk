# Service Desk 2.2.0

Version 2.2.0 is a major expansion of the self-hosted Service Desk platform. Release completion, downloadable artifact and published GHCR image are verified separately by GitHub Actions; this source document alone is not proof of a successful release.

## What's included

- Editable project blueprints and built-in HR, IT/Helpdesk, account administration and Facilities project configurations, drafts, portable packages with explicit role/team/form/integration mapping, dry-run validation, atomic activation and versioned edit/restore.
- External plugin runtime and SDK: permission-scoped connectors, encrypted configuration, declarative actions/panels, safe workflow integration, durable version-bound jobs with cancellation/retries, migration coordination and diagnostics. Business-specific plugins belong to their own repositories.
- Multi-step approval processes (sequential or all/any parallel), decisions, withdrawal, delegation, responsibility matrices and affected-person context. Workflow guardrails, subtasks, dependencies, tickets' process versioning and audited migration previews.
- Configurable customer portal sections and field order with privacy protections; public communication history, participants separate from watchers, explicit merge aliases and ticket recycle/restore.
- Configuration revisions, diagnostics, impact previews, consistency checks, advanced AND/OR/IN/date/currentUser filters, periodic reports and protected image/PDF attachment previews.
- Search suggestions from ticket titles/descriptions and from accessible linked services and assets, with explanatory ranking and project permission enforcement.
- Notification in-app summaries and opt-in daily/hourly e-mail digests by project using configured SMTP channels. Local timezone and quiet hours, crash-safe cursor tracking, encrypted queued messages and sender-time revalidation of access.
- Concurrency-safe SMTP outbox claiming with five-minute leases and retry recovery. Automatic time-based purging for deleted blueprint and unactivated draft snapshots, preserving tombstone IDs.
- Passwordless discoverable WebAuthn passkeys for active local accounts with user verification, registration/revocation and virtual authenticator regression tests. LDAP/SSO identities continue using their existing provider; USB/NFC security keys and TOTP remain separate supported methods.
- Service Desk 2.1.1 Knowledge Base integration and ticket assistance improvements incorporated into 2.2.0, without a separate 2.1.1 production tag.

## Upgrade and rollback

The schema is upgraded forward-only to **12** (from 2.1.0 first apply **10 → 11 → 12**). Before updating, take a verified backup of the full persistent data volume, database, stored attachments and matching `master.key`. Test restore of that backup. Rollback requires restoring the entire pre-upgrade backup and older application image; never start 2.1.x code directly against schema 12. See `UPGRADE.md` and `VALIDATION_2.2.0.md`.

## Known limitations / outstanding acceptance

- **Physical iPhone/Safari passkey registration and login and desktop-to-iPhone QR/hybrid authentication have not been physically validated.** Automated WebAuthn/virtual-authenticator results do not count as hardware acceptance. See `PASSKEY_ACCEPTANCE_2.2.0.md`. Do not depend on these flows as the sole recovery route until manually tested.
- Cross-project queue references and some external service/asset mapping paths require additional explicit portability work. Import rejects unknown mappings rather than guessing.
- Ticket deletion is soft-delete/recovery only: permanent destructive purge of tickets with linked records and attachments is deliberately blocked. Configuration blueprint/draft purge is available with audit and retention.
- Opt-in digest delivery uses existing per-project SMTP channels, not external notification transport plugins. External SMTP service availability and exact delivery once after a network crash are not guaranteed.
- Some advanced plugin extension variants, end-to-end operations under full production load and process edge cases require further acceptance coverage. See `VALIDATION_2.2.0.md`; do not interpret feature availability as complete closure of every roadmap checkbox.

## Product boundaries

No LDAP/AD account lifecycle implementation, ticket drafts, configurable agent layout builder or bundled third-party business connector. Knowledge Base remains a separate repository. Mobile apps remain a preliminary goal for 3.0.

## Testing and acceptance

See `VALIDATION_2.2.0.md`, GitHub Actions checks on the exact published commit, and `PASSKEY_ACCEPTANCE_2.2.0.md` for manual acceptance. Do not mark missing physical or operator tests as passed.
