# iTELade Service Desk 2.0.0

Self-hosted Service Desk / ITSM platform for customer support and internal IT operations.

Service Desk combines customer portals, internal and external projects, configurable workflows, SLA, automation, Assets / CMDB, LDAP / Active Directory, SSO/OIDC, inbound and outbound mail, API/webhooks, GitHub Issues intake, approvals, audit, saved queues, protected attachments and an extensible plugin foundation.

Service Desk is an independent iTELade project. It is not an Atlassian product and is not a source-compatible clone of Jira Service Management. The product follows familiar enterprise service-management patterns while retaining its own implementation, branding, data model and authorization model.

## Current release

**Service Desk 2.0.0**

- GitHub release: https://github.com/iTELade/service-desk/releases/tag/v2.0.0
- Container image: `ghcr.io/itelade/service-desk:v2.0.0`
- OCI digest: `sha256:061d8f3e9424e61d998ef829f944e15a8efd76bc8a0ea82e28d9b14ef97e2ead`
- Release notes: [RELEASE_NOTES_2.0.0.md](RELEASE_NOTES_2.0.0.md)
- UI architecture: [UI_2.0.md](UI_2.0.md)
- Upgrade notes: [MIGRATION_2.0.md](MIGRATION_2.0.md)
- Validation checklist: [VALIDATION.md](VALIDATION.md)

Database schema: **9**.

Service Desk 2.0.0 performs a **forward-only schema 8 → 9 migration**. Back up the data directory before production deployment. Downgrading to a schema-8 release requires restoring a schema-8 backup.

## What changed in 2.0.0

2.0.0 is the first release of the unified Service Desk 2.0 product boundary.

- new product shell and unified design system,
- redesigned Administration Center with searchable settings navigation,
- refreshed queue, ticket workspace, details inspector and customer portal foundations,
- retired active 1.2.x / 1.6.x visual decorators from the normal application entry point,
- database schema 9,
- project service settings and service catalog metadata,
- persisted workspace preferences,
- integration-health metadata,
- saved queue views extended with columns, sort order and density,
- unified 2.0 version/cache boundary,
- preserved 1.x functional compatibility paths where still required by the application,
- dedicated schema-8 → schema-9 migration coverage,
- multi-architecture release image for `linux/amd64` and `linux/arm64`.

The 2.0 line changes the presentation architecture without removing the core Service Desk workflows and integrations built in the 1.x line.

## Product areas

### Agent workspace

The agent experience is centered around triage and ticket handling rather than generic administration screens.

Key capabilities include:

- queue-based triage,
- ticket header with request context and workflow actions,
- wide work area with description and activity,
- details inspector for assignment, classification, reporter, SLA and dates,
- comments and internal notes,
- attachments,
- related tickets and linked Assets / CMDB records,
- history and audit context,
- responsive layouts,
- keyboard-accessible activity navigation.

### Administration Center

`/#/settings` is the native Service Desk Administration Center.

Administration is grouped into major areas such as:

- General,
- Identity & Access,
- Service Management,
- Communication,
- Integrations,
- Assets / CMDB,
- System.

The Administration Center provides searchable navigation and dedicated management surfaces for LDAP, SSO, users, workflows, organizations, mailboxes, mail templates, project synchronization, GitHub Issues, webhooks, Knowledge Base configuration, API tokens, plugins, Assets, audit, updates and advanced settings.

### Customer portal

Customer-facing projects can expose a portal for:

- creating requests,
- selecting request forms,
- viewing accessible requests,
- replying to open requests,
- viewing public comments and attachments,
- tracking request status,
- using project-specific customer access rules.

Internal projects can remain agent-only without a customer portal.

## Core capabilities

- customer portal and internal agent workspace,
- internal and external projects,
- Global Administrator, Project Manager, Agent and Customer access model,
- configurable request forms, workflows, statuses and transitions,
- SLA calendars with pause, stop and reset behavior,
- automation rules and scheduled actions,
- organizations and customer access rules,
- Assets / CMDB and ticket-to-asset linking,
- LDAP / Active Directory synchronization,
- LDAP group-based role and project mapping,
- OpenID Connect SSO,
- GitHub OAuth,
- TOTP,
- FIDO2 / WebAuthn security keys,
- inbound email via IMAP,
- outbound SMTP,
- automatic requester provisioning from email and GitHub Issues,
- API tokens and webhooks,
- approvals,
- notifications and watchers,
- saved queue views and column preferences,
- permission-aware global search,
- one-way GitHub Issues → Service Desk intake,
- public GitHub project mode with anonymous read and GitHub-authenticated write,
- protected ticket attachments,
- inbound IMAP attachment import,
- plugin registry and lifecycle foundation,
- English, Polish and German UI support.

## Queue workspace

`/#/queue` is the primary triage surface for Agents and Project Managers.

Queue capabilities include:

- project, status, priority, classification, category, assignee, archive and scope filters,
- personal queue preferences,
- saved views,
- sorting,
- quick operational filters,
- configurable visible columns,
- saved column order,
- saved density,
- SLA indicators and SLA-at-risk filtering,
- server-side permission filtering,
- background refresh designed not to replace an actively edited workspace.

## Attachments

Attachments are stored outside the public web root in the protected Service Desk data store. Each record includes a safe filename, MIME type, size, SHA-256 checksum, uploader, source and public/internal visibility.

Current policy:

- maximum 2 MB per attachment,
- executable, script and active HTML/SVG content is rejected,
- internal attachments are available only to users who can work the ticket,
- every list/download request re-checks ticket access,
- archived tickets/projects reject attachment mutation,
- ticket deletion purges stored attachment data,
- inbound IMAP attachments are supported for new tickets and replies.

## Global search

The application header includes permission-aware global search.

Search covers accessible ticket keys, titles and descriptions and, for authorized staff, users, organizations and Assets / CMDB records.

Ticket relationship lookup accepts padded and unpadded ticket numbers where appropriate, for example `QA-1`, `QA-10` and `QA-00001` depending on project numbering.

## GitHub Issues integration

Supported flow:

```text
GitHub Issue
    ↓
Service Desk ticket
    ↓
comment on GitHub with the Service Desk ticket link
    ↓
GitHub Issue closed
    ↓
further handling in Service Desk
```

The GitHub issue author becomes the Service Desk reporter. The configured integration account remains the technical creator / audit actor. When GitHub SSO is enabled, users can be mapped by immutable numeric GitHub user ID.

The GitHub Personal Access Token used for issue ingestion is separate from the OAuth App Client ID / Client Secret used for GitHub login.

## Identity and security

Supported authentication and identity features include:

- local accounts,
- LDAP / Active Directory,
- LDAP group-based role and project mapping,
- OIDC / SSO providers,
- GitHub OAuth,
- TOTP,
- FIDO2 / WebAuthn,
- account activation and blocking,
- project membership enforcement,
- CSRF protection,
- strict Content Security Policy,
- encrypted application secrets.

The active frontend remains compatible with the strict `script-src 'self'` / `style-src 'self'` security model.

## Architecture

- Node.js 24,
- SQLite,
- Docker / Docker Compose,
- one application container with a persistent data volume,
- optional updater container,
- schema-managed forward migrations.

SQLite is used by a single application writer. Do not run multiple Service Desk replicas against the same SQLite volume.

Current database schema version: **9**.

### Active frontend boundary

Service Desk 2.0 uses one primary application entry point and a consolidated 2.0 presentation boundary.

```text
public/index.html          application entry point
public/app.css             canonical application styling
public/design-system.css   Service Desk 2.0 design system
public/i18n.js             UI translations
public/security.js         browser security and safe refresh guards
public/app.js              application/router and functional UI
public/settings-center.js  Administration Center
public/release-1.1.2.js    retained functional compatibility features
public/product-shell.js    Service Desk 2.0 product shell
```

Historical 1.x assets may remain in the source tree for compatibility, rollback history and regression coverage, but are not intended to compete with the active 2.0 presentation layer.

## New installation

Requirements:

- Docker Engine,
- Docker Compose v2,
- HTTPS reverse proxy,
- `APP_URL` matching the deployed public URL.

Typical deployment:

```bash
unzip Service_Desk_Docker.zip
cd itelade-desk
bash configure.sh
docker compose up -d --build desk
docker compose logs --tail=30 desk
```

For Nginx Proxy Manager, point the Proxy Host at the Service Desk container on port `3000`, enable TLS and Force SSL.

On a fresh installation, open the Service Desk URL and use the one-time installation code from the container logs to create the organization and first Global Administrator.

## Upgrade to 2.0.0

**Back up before upgrading.**

2.0.0 upgrades database schema 8 to schema 9. The migration is forward-only.

Recommended sequence:

```bash
# 1. Create a database backup
docker compose exec desk node scripts/backup.mjs /app/data/backups/pre-2.0.0.sqlite

# 2. Verify that the backup and matching master key exist
# 3. Update using the built-in updater or the documented Docker procedure
# 4. Verify health and run the production smoke checklist
```

If rollback to a 1.x schema-8 release is required, restore the pre-upgrade schema-8 backup rather than attempting to run old application code against a schema-9 database.

See [MIGRATION_2.0.md](MIGRATION_2.0.md), [UPDATES.md](UPDATES.md) and [UPGRADE.md](UPGRADE.md).

## Updates

Stable releases contain `desk-release.json` with the exact GHCR image digest and database compatibility information. Supported installations can use the built-in updater.

Current release image:

```text
ghcr.io/itelade/service-desk:v2.0.0
```

Current release digest:

```text
sha256:061d8f3e9424e61d998ef829f944e15a8efd76bc8a0ea82e28d9b14ef97e2ead
```

The updater shows live milestone progress, survives the temporary application restart, reconnects to an in-progress update job, reports rollback state and reloads the browser once after success or completed rollback.

## Backup

Create a consistent backup with:

```bash
docker compose exec desk node scripts/backup.mjs /app/data/backups/manual.sqlite
```

Keep the generated database and matching `manual.sqlite.master.key` outside the server. The master key is required for encrypted Service Desk secrets.

Never replace the live SQLite file while the application is running.

## Development and validation

```bash
npm ci
npm run check
npm run test:ci
bash -n scripts/upgrade.sh
sha256sum -c MANIFEST.sha256
```

The 2.0.0 release gate completed with:

- JavaScript syntax/static check across 110 files,
- **229/229 automated tests passing**,
- upgrade-script syntax validation,
- committed checksum-manifest validation,
- multi-architecture Docker build and GHCR push,
- GitHub Release publication.

Environment-level checks that CI cannot fully prove remain important for production deployments, especially:

- live LDAP / Active Directory,
- OIDC / Keycloak,
- SMTP and inbound IMAP,
- GitHub integration,
- updater and rollback against the real deployment,
- browser-specific behavior,
- physical WebAuthn/FIDO2 devices.

See [VALIDATION.md](VALIDATION.md) for the production smoke-test checklist.

## Release verification

Before production rollout:

```bash
npm run test:ci
sha256sum -c MANIFEST.sha256
```

Then complete the smoke checklist in [VALIDATION.md](VALIDATION.md).

## Documentation

- [RELEASE_NOTES_2.0.0.md](RELEASE_NOTES_2.0.0.md) — Service Desk 2.0 release notes,
- [UI_2.0.md](UI_2.0.md) — Service Desk 2.0 UI architecture and presentation boundary,
- [MIGRATION_2.0.md](MIGRATION_2.0.md) — schema-8 → schema-9 migration and rollback requirements,
- [VALIDATION.md](VALIDATION.md) — current validation and smoke-test checklist,
- [CHANGELOG.md](CHANGELOG.md) — release history,
- [MODULES.md](MODULES.md) — projects, mail, SLA, LDAP/SSO, integrations and permissions,
- [AUTOMATION.md](AUTOMATION.md) — triggers, conditions, actions and scheduling,
- [API.md](API.md) — API and token usage,
- [KNOWLEDGE_INTEGRATION.md](KNOWLEDGE_INTEGRATION.md) — Knowledge Base integration direction,
- [UPDATES.md](UPDATES.md) — release publishing and updater,
- [UPGRADE.md](UPGRADE.md) — upgrade procedure,
- [UI_1.4.md](UI_1.4.md) — historical/base interaction contract for the 1.x line.

## Release notes and operational cautions

The 2.0.0 application and release pipeline are published and validated, but production operators should still treat the schema migration as a controlled change.

Before deployment:

1. create and export a verified backup,
2. verify access to the corresponding master key,
3. run the updater or documented Docker upgrade procedure,
4. confirm application health,
5. smoke-test login, queue, ticket handling, Administration Center, customer portal and configured integrations.

## License

Copyright (C) 2026 Adam Dehmel (iTELade).

Service Desk is licensed under **GNU Affero General Public License v3.0** (`AGPL-3.0-only`). See [LICENSE](LICENSE).

Source: https://github.com/iTELade/service-desk
