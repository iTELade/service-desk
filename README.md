# iTELade Service Desk 1.6.1

Self-hosted Service Desk / ITSM platform for customer support and internal IT operations.

Service Desk combines customer portals, internal and external projects, configurable workflows, SLA, automation, Assets / CMDB, LDAP / Active Directory, SSO/OIDC, inbound and outbound mail, API/webhooks, GitHub Issues intake, approvals, audit, saved queues, protected attachments and an extensible plugin foundation.

Service Desk is an independent iTELade project. It is not an Atlassian product and is not intended to be a source-compatible clone of Jira Service Management. The interface follows familiar enterprise service-management interaction patterns while retaining its own implementation, branding, data model and authorization model.

## Current release

**Service Desk 1.6.1**

Release: https://github.com/iTELade/service-desk/releases/tag/v1.6.1

Detailed notes: [RELEASE_NOTES_1.6.1.md](RELEASE_NOTES_1.6.1.md)

Previous major Agent Experience release: [RELEASE_NOTES_1.6.0.md](RELEASE_NOTES_1.6.0.md)

Validation checklist: [VALIDATION.md](VALIDATION.md)

Database schema: **8**. Service Desk 1.6.1 does **not** require a database migration from 1.6.0.

## What changed in 1.6.1

1.6.1 is a focused QA and production-readiness hotfix for the 1.6 Agent Experience release.

- removed dependency on CSP-blocked inline hotfix scripts and styles,
- preserved non-destructive five-second queue refresh through same-origin external code,
- fixed queue column preference remounting after DOM rerenders,
- made queue column mapping work with both English and Polish labels,
- blocked attachment creation and deletion on archived tickets/projects,
- purged stored attachment data when a ticket is deleted,
- fixed relationship lookup for unpadded ticket keys such as `QA-1`,
- changed stale mention lookups from unhandled 500 errors to controlled 404 responses,
- removed Settings version-chip mutation churn,
- added proper keyboard and ARIA behavior to ticket activity tabs,
- fixed attachment input handling in the create-ticket dialog,
- aligned visible product/version markers to 1.6.1,
- completed English labels in the 1.6 Agent Experience surfaces,
- replaced the obsolete validation document with a 1.6.1 smoke-test checklist.

Schema remains **8** and no migration is required.

## Agent Experience

The 1.6 line focuses on the two surfaces used most by support teams: the ticket workspace and the Administration Center.

### Ticket workspace

The ticket screen uses a work-item layout instead of a stack of generic administration cards.

- full-width ticket header with request context, title, current status and workflow transitions,
- wide primary work column,
- dedicated sticky details inspector,
- clear description section,
- activity tabs for Comments, Attachments, Related items and History,
- internal notes visually separated from public replies,
- compact SLA and elapsed-time information,
- reporter, assignment, classification and dates in the right-hand inspector,
- responsive layout for narrower screens,
- keyboard-accessible activity tabs with Arrow keys, Home and End.

Existing workflows, comments, internal notes, links, assets, attachments, automation and authorization remain backend-controlled.

### Administration Center

`/#/settings` is the native Administration Center inside the normal Service Desk shell.

Administration is grouped into:

- General,
- Identity & Access,
- Service Management,
- Communication,
- Integrations,
- Assets / CMDB,
- System.

The 1.6 administration workspace adds searchable settings navigation, clearer hierarchy, status cards, configuration summaries and consistent form/table styling.

Dedicated routes remain available for LDAP, SSO, users, workflow templates, organizations, mailboxes, e-mail templates, project synchronization, GitHub Issues, webhooks, Knowledge Base, API tokens, plugins, Assets, audit, updates, module errors and advanced settings.

## Core capabilities

- customer portal and internal agent workspace,
- internal and external projects,
- Global Administrator, Project Manager, Agent and Customer access model,
- configurable request forms, workflows, statuses and transitions,
- SLA calendars, pause/stop/reset behavior and automation,
- organizations and customer access rules,
- Assets / CMDB and ticket-to-asset linking,
- LDAP / Active Directory synchronization,
- OpenID Connect SSO including GitHub OAuth,
- TOTP and FIDO2 / WebAuthn security keys,
- inbound email via IMAP and outbound SMTP,
- automatic requester provisioning from email and GitHub Issues,
- API tokens and webhooks,
- approvals, notifications and watchers,
- saved queue views and column preferences,
- one-way GitHub Issues → Service Desk intake,
- public GitHub project mode with anonymous read and GitHub-authenticated write,
- protected ticket attachments and inbound IMAP attachment import,
- permission-aware global search,
- native Administration Center,
- plugin registry and lifecycle foundation,
- English, Polish and German UI support.

## Queue workspace

`/#/queue` is the primary triage surface for Agents and Project Managers.

Queue capabilities include:

- project, status, priority, classification, category, assignee, archive and scope filters,
- personal saved queue preferences,
- saved views,
- sorting and quick operational filters,
- configurable visible columns and saved column order,
- SLA indicators,
- server-side permission filtering,
- background refresh without replacing the workspace with a blocking loading screen.

In 1.6.1 saved column preferences are restored after queue rerenders and column mapping tolerates localized English/Polish header labels.

## Attachments

Attachments are stored outside the public web root in the protected Service Desk data store. Each record includes a safe filename, MIME type, size, SHA-256 checksum, uploader, source and public/internal visibility.

Current policy:

- maximum 2 MB per attachment,
- executable/script/active HTML/SVG content is rejected,
- internal attachments are available only to users who can work the ticket,
- every list/download request re-checks ticket access,
- archived tickets/projects reject attachment mutation,
- ticket deletion purges stored attachment data,
- inbound IMAP attachments are supported for new tickets and replies.

## Global search

The application header includes permission-aware global search. Search covers accessible ticket keys, titles and descriptions and, for staff, authorized users, organizations and Assets / CMDB records.

Ticket relationship lookup accepts both padded and unpadded keys where appropriate, for example `QA-1`, `QA-10` and `QA-00001` depending on project numbering.

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

The GitHub issue author becomes the Service Desk reporter. The configured integration account remains the technical creator/audit actor. When GitHub SSO is enabled, users are mapped by immutable numeric GitHub user ID.

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

1.6.1 keeps the strict `script-src 'self'` / `style-src 'self'` model and no longer relies on inline bootstrap hotfix code.

## Architecture

- Node.js 24,
- SQLite,
- Docker / Docker Compose,
- one application container with a persistent data volume,
- optional updater container.

SQLite is used by a single application writer. Do not run multiple Service Desk replicas against the same SQLite volume.

Current database schema version: **8**.

### Active frontend boundary

```text
app.css                     canonical product presentation
agent-experience-1.6.css    1.6 ticket/settings Agent Experience layer
app.js                      core application/router
settings-center.js          native Settings Center
release-1.1.2.js            search/queue/attachment features
release-1.2.0.js            shared enterprise UI + updater UX
agent-experience-1.6.js     1.6 ticket/settings controller
security.js                 security features + safe queue refresh guard
```

Historical release assets may remain in the source tree for rollback/history but are not intended to compete with the active presentation layer.

## New installation

Requirements: Docker Engine, Docker Compose v2, HTTPS reverse proxy and an `APP_URL` matching the deployed public URL.

```bash
unzip Service_Desk_Docker.zip
cd itelade-desk
bash configure.sh
docker compose up -d --build desk
docker compose logs --tail=30 desk
```

For Nginx Proxy Manager, point the Proxy Host at the Service Desk container on port `3000`, enable TLS and Force SSL.

On a fresh installation, open the Service Desk URL and use the one-time installation code from the container logs to create the organization and first Global Administrator.

## Updates

Stable releases contain `desk-release.json` with the exact GHCR image digest and database compatibility information. Supported installations can use the built-in updater.

Current release image:

```text
ghcr.io/itelade/service-desk:v1.6.1
```

The updater shows live milestone progress, survives the temporary application restart, reconnects to an in-progress update job, reports rollback state and reloads the browser once after success or completed rollback.

See [UPDATES.md](UPDATES.md) and [UPGRADE.md](UPGRADE.md).

## Backup

Create a consistent backup with:

```bash
docker compose exec desk node scripts/backup.mjs /app/data/backups/manual.sqlite
```

Keep the generated database and matching `manual.sqlite.master.key` outside the server. The master key is required for encrypted Service Desk secrets. Never replace the live SQLite file while the application is running.

## Development and validation

```bash
npm ci
npm run check
npm run test:ci
bash -n scripts/upgrade.sh
```

CI validates dependencies, syntax/static checks, the full test suite and upgrade-script syntax.

1.6.1 adds regression coverage for the QA hotfixes around CSP, queue refresh/preferences, archive/delete attachment lifecycle, relationship lookup, stale mentions, Settings mutation stability, activity-tab accessibility, create-ticket attachments and release versioning.

Environment-level checks that CI cannot fully prove are documented in [VALIDATION.md](VALIDATION.md), including live LDAP/AD, OIDC/Keycloak, mail, GitHub integration, Docker updater/rollback, multiple browsers and physical WebAuthn devices.

## Release verification

Before production rollout:

```bash
npm run test:ci
sha256sum -c MANIFEST.sha256
```

Then complete the smoke checklist in [VALIDATION.md](VALIDATION.md).

## Documentation

- [RELEASE_NOTES_1.6.1.md](RELEASE_NOTES_1.6.1.md) — current hotfix release notes,
- [RELEASE_NOTES_1.6.0.md](RELEASE_NOTES_1.6.0.md) — Agent Experience release,
- [VALIDATION.md](VALIDATION.md) — current validation and smoke-test checklist,
- [UI_1.4.md](UI_1.4.md) — base visual/interaction contract,
- [CHANGELOG.md](CHANGELOG.md) — release history,
- [MODULES.md](MODULES.md) — projects, mail, SLA, LDAP/SSO, integrations and permissions,
- [AUTOMATION.md](AUTOMATION.md) — triggers, conditions, actions and scheduling,
- [API.md](API.md) — API and token usage,
- [KNOWLEDGE_INTEGRATION.md](KNOWLEDGE_INTEGRATION.md) — Knowledge Base integration direction,
- [UPDATES.md](UPDATES.md) — release publishing and updater,
- [UPGRADE.md](UPGRADE.md) — upgrade procedure.

## License

Copyright (C) 2026 Adam Dehmel (iTELade).

Service Desk is licensed under **GNU Affero General Public License v3.0** (`AGPL-3.0-only`). See [LICENSE](LICENSE).

Source: https://github.com/iTELade/service-desk
