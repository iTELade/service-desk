# iTELade Service Desk 1.3.2

Self-hosted Service Desk / ITSM platform for customer support and internal IT operations. It combines customer portals, internal and external projects, configurable workflows, SLA, automation, Assets/CMDB, LDAP / Active Directory, SSO/OIDC, inbound and outbound mail, API/webhooks, GitHub Issues intake, approvals, audit, saved queues and an extensible plugin foundation.

Service Desk is an independent iTELade project. It is not an Atlassian product and is not intended to be a source-compatible clone of Jira Service Management. The agent workspace is intentionally inspired by familiar service-management patterns while keeping its own implementation and branding.

## Current release

**Service Desk 1.3.2**

Release: https://github.com/iTELade/service-desk/releases/tag/v1.3.2

Detailed notes: [RELEASE_NOTES_1.3.2.md](RELEASE_NOTES_1.3.2.md)

Database schema: **8**. No migration is required from supported 1.3.x installations.

## What is new in 1.3.2

- single supported **light interface** across the agent workspace, customer portal and authentication screens,
- Jira-inspired light navigation, top bar, cards, controls and tables with stronger text contrast,
- stale dark/system browser preferences are normalized to the light presentation,
- remaining queue refresh flicker is masked with a passive non-interactive snapshot instead of restoring stale application DOM,
- safer queue refresh behavior that cannot recreate the duplicate toolbar regression seen in earlier 1.3.x builds,
- clearer queue summary cards, tabs, filters, ticket rows, metadata and SLA presentation,
- continued use of a single collapsed **Widok i sortowanie** area for personal queue controls,
- improved readability in ticket headers, descriptions, comments, reply composer, attachments and the right-side context rail,
- no database schema change.

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
- API tokens, webhooks and integration audit,
- approvals, notifications, watchers and saved queues,
- one-way GitHub Issues → Service Desk intake,
- public GitHub project mode with anonymous read and GitHub-authenticated write,
- protected ticket attachments and inbound IMAP attachment import,
- permission-aware global search,
- native Administration Center under `/#/settings`,
- plugin registry and lifecycle foundation,
- English, Polish and German UI support.

## Agent workspace

The 1.3.x workspace is organized around daily support work rather than large dashboard surfaces. The current interface uses one light visual system with a compact left navigation, sticky top bar, global search, operational queue and a ticket layout split into a primary work column and contextual details rail.

The sidebar can be collapsed and exposes operational modules such as Knowledge Base, Assets / CMDB and mail channels where the signed-in role is allowed to use them.

## Queue workspace

`/#/queue` is the main triage surface for agents and project managers.

The queue supports:

- project, status, priority, classification, category, assignee, archive and scope filters,
- personal saved queue preferences,
- saved views,
- primary and secondary sorting,
- quick filters such as assigned to me, unassigned and waiting for customer,
- configurable visible columns and saved column order,
- SLA indicators,
- background refresh without replacing the visible queue with a blocking loading screen.

The current refresh implementation keeps the last stable queue visible only as a passive visual layer while the real `#main` content reloads. The passive copy has no active event hooks and is removed as soon as the refreshed queue is ready.

Queue preferences are personal. Shared saved views remain separate objects, and server-side ticket authorization is always enforced regardless of UI configuration.

## Ticket workspace

The ticket view keeps the issue title, current status, workflow transitions and issue actions together at the top. The primary column contains the description, conversation, related work, activity and attachments, while the contextual rail contains ticket fields, requester metadata, elapsed time and SLA information.

Existing workflow transitions, comments, internal notes, SLA behavior, links, assets and attachments remain backend-authorized and are not changed by the 1.3.2 visual polish.

## Attachments

Attachments are stored outside the public web root in the protected Service Desk data store. Each record contains a non-guessable identifier, safe original filename, MIME type, size, SHA-256 checksum, uploader, source and public/internal visibility.

Current policy:

- maximum 2 MB per attachment,
- executable/script/active HTML/SVG content is rejected,
- internal attachments are available only to users who can work the ticket,
- every list/download request re-checks ticket access,
- inbound IMAP attachments are imported for new tickets and replies,
- tiny inline tracking/signature image artifacts are ignored where practical,
- rejected email attachments do not discard the whole message.

Because attachment bytes are stored with application data, the normal consistent database backup includes them.

## Global search

The application header includes permission-aware global search. Search covers accessible ticket keys, titles and descriptions and, for staff, authorized users, organizations and Assets / CMDB records. Exact ticket keys such as `ITA-123` are prioritized.

Customer searches do not become an internal directory. Public GitHub portal access does not expand visibility into private projects. A Knowledge Base result provider can be connected without redesigning the search contract.

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

The GitHub issue author becomes the Service Desk reporter. The configured integration account remains the technical creator/audit actor. When GitHub SSO is enabled, users are mapped by immutable numeric GitHub user ID and can sign in even when their public email is hidden.

The GitHub Personal Access Token used for issue ingestion is separate from the OAuth App Client ID / Client Secret used for GitHub login.

## Administration

`/#/settings` is the main Administration Center. Configuration is grouped into General, Identity & Access, Service Management, Communication, Integrations, Assets / CMDB and System.

The standalone legacy `v8.html` administration page is retired and redirects into the normal application shell.

## Architecture

- Node.js 24,
- SQLite,
- Docker / Docker Compose,
- one application container with a persistent data volume,
- optional updater container.

SQLite is used by a single application writer. Do not run multiple Service Desk replicas against the same SQLite volume.

Service Desk 1.3.2 keeps database schema version **8**.

## New installation

Requirements: Docker Engine, Docker Compose v2, HTTPS reverse proxy and a public `APP_URL` matching the deployed domain.

```bash
unzip Service_Desk_Docker.zip
cd itelade-desk
bash configure.sh
docker compose up -d --build desk
docker compose logs --tail=30 desk
```

For Nginx Proxy Manager, point the Proxy Host at the `service-desk` container on port `3000`, enable TLS and Force SSL. Port 3000 does not need to be published directly on the host when the proxy shares the Docker network.

On a fresh installation, open the Service Desk URL and use the one-time installation code from the container logs to create the organization and first Global Administrator.

## Updates

Stable releases contain `desk-release.json` with the exact GHCR image digest and database compatibility information. Supported installations can use the built-in updater.

Published image:

```text
ghcr.io/itelade/service-desk:v1.3.2
```

The updater shows live progress, survives the temporary application restart, reconnects to an in-progress update job and reloads the browser once after a successful update or completed rollback.

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

CI validates dependencies, syntax/static checks, the test suite and upgrade-script syntax. External production LDAP, mailbox, OAuth and reverse-proxy environments are not contacted by unit/integration CI and should still be validated on a test deployment before production rollout.

## Documentation

- [RELEASE_NOTES_1.3.2.md](RELEASE_NOTES_1.3.2.md) — current release notes,
- [RELEASE_NOTES_1.3.1.md](RELEASE_NOTES_1.3.1.md) — 1.3.1 queue/ticket regression repair,
- [RELEASE_NOTES_1.3.0.md](RELEASE_NOTES_1.3.0.md) — 1.3.0 workspace rebuild,
- [CHANGELOG.md](CHANGELOG.md) — release history,
- [MODULES.md](MODULES.md) — projects, mail, SLA, LDAP/SSO, integrations and permissions,
- [AUTOMATION.md](AUTOMATION.md) — triggers, conditions, actions and scheduling,
- [API.md](API.md) — API and token usage,
- [KNOWLEDGE_INTEGRATION.md](KNOWLEDGE_INTEGRATION.md) — Knowledge Base integration direction,
- [UPDATES.md](UPDATES.md) — release publishing and updater,
- [UPGRADE.md](UPGRADE.md) — upgrade procedure,
- [VALIDATION.md](VALIDATION.md) — validated scenarios and known validation boundaries.

## License

Copyright (C) 2026 Adam Dehmel (iTELade).

Service Desk is licensed under **GNU Affero General Public License v3.0** (`AGPL-3.0-only`). See [LICENSE](LICENSE).

Source: https://github.com/iTELade/service-desk
