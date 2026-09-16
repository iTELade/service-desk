# iTELade Service Desk 1.2.0

Self-hosted Service Desk / ITSM platform for customer support and internal IT operations. It provides customer portals, internal and external projects, configurable workflows, SLA, automation, Assets/CMDB, LDAP/Active Directory, SSO/OIDC, email intake, API/webhooks, GitHub Issues intake, approvals, audit, saved queues and an extensible plugin foundation.

Service Desk is an independent iTELade project. It is not an Atlassian product and is not intended to be a source-compatible clone of Jira Service Management.

## Current release

**Service Desk 1.2.0**

1.2.0 is a major interface and usability release. It rebuilds the agent workspace, administration, authentication screens and customer/public portals around a denser Jira Service Management-inspired interaction model while retaining the existing iTELade backend, permissions and data model.

Release: https://github.com/iTELade/service-desk/releases/tag/v1.2.0

Detailed notes: [RELEASE_NOTES_1.2.0.md](RELEASE_NOTES_1.2.0.md)

## What is new in 1.2.0

- complete agent workspace redesign with compact navigation and a light operational canvas,
- Jira-style queue presentation focused on scanning and triage,
- ticket view reorganized around the issue with main activity/content and a sticky details/SLA sidebar,
- consistent styling for board, projects, users, forms, workflows, Assets/CMDB, mail, SSO and administration,
- reorganized Administration Center with clearer grouping and reduced duplicate navigation,
- collapsible agent navigation with direct links to Knowledge Base, Assets/CMDB and mail channels where permitted,
- customer portal, public project portal, login, registration and MFA restyled into the same product family,
- existing fixed roles, project memberships, public GitHub access model and backend authorization rules preserved,
- database schema remains **8**; no 1.2.0-specific database migration is required.

## Core capabilities

- customer portal and internal agent workspace,
- internal and external projects,
- fixed Global Administrator, Project Manager, Agent and Customer role model,
- configurable request forms, workflows and transitions,
- SLA calendars, pause/stop/reset behavior and automation,
- organizations and customer access rules,
- Assets/CMDB and ticket-to-asset linking,
- LDAP / Active Directory synchronization,
- OpenID Connect SSO including GitHub OAuth,
- TOTP and FIDO2 / WebAuthn security keys,
- inbound email via IMAP and outbound SMTP,
- automatic requester provisioning from email and GitHub Issues,
- API tokens, webhooks and integration audit,
- approvals, notifications, watchers and saved queues,
- one-way GitHub Issues → Service Desk intake,
- public GitHub project mode: anonymous read, GitHub-authenticated write,
- protected ticket attachments and inbound IMAP attachment import,
- permission-aware global search,
- native Administration Center under `/#/settings`,
- plugin registry/lifecycle foundation,
- English, Polish and German UI support.

## Agent workspace

The 1.2.0 agent interface is designed around operational density rather than large dashboard cards. Navigation stays compact, queues use a Jira-style issue table, ticket details keep the conversation and activity in the main content column, and metadata/SLA information is kept in a side panel on wider screens.

The left navigation can be collapsed and exposes direct routes to operational modules such as Knowledge Base, Assets/CMDB and mail channels when the signed-in role is allowed to use them.

## Queue workspace

Agents and Project Managers can keep per-project queue preferences. Queue configuration includes visible columns, drag-and-drop column order, primary and secondary sorting and quick operational filters such as assigned to me, unassigned, waiting for customer and oldest first. Existing saved views remain supported and can be opened from the queue workspace.

Queue preferences are personal. Shared saved views remain separate objects and server-side ticket authorization is always applied regardless of UI configuration.

Background refreshes are intended to keep the active workspace visible rather than replacing the whole screen with a blocking loading state.

## Attachments

Attachments can be added to accessible tickets and are stored outside the public web root in the protected Service Desk data store. The attachment record contains a non-guessable identifier, original safe filename, MIME type, size, SHA-256 checksum, uploader, source and public/internal visibility.

Current policy:

- maximum 2 MB per attachment,
- executable/script/active HTML/SVG content is rejected,
- internal attachments are available only to users who can work the ticket,
- every list/download request re-checks ticket access,
- inbound IMAP attachments are imported for new tickets and replies,
- tiny inline image artifacts such as tracking/signature pixels are ignored where practical,
- rejected email attachments do not discard the whole email message.

Because attachment bytes are stored with the application data, the normal consistent database backup includes them.

## Global search

The application header includes a global search that is filtered server-side by the current user. Search covers accessible ticket keys/titles/descriptions and, for staff, authorized users, organizations and Assets/CMDB records. Exact ticket keys such as `ITA-123` are ranked first.

Customer searches never become a global internal directory. Public GitHub portal access does not expand visibility into private projects. A Knowledge Base result collection is reserved so the separate knowledge service can be added without redesigning the search contract.

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

The actual GitHub issue author becomes the Service Desk reporter. The configured integration account remains the technical creator/audit actor. With an enabled SSO provider whose issuer is `https://github.com`, GitHub users are mapped by immutable numeric GitHub user ID and can sign in with GitHub even when their public email is hidden.

The GitHub Personal Access Token used for issue ingestion is separate from the OAuth App Client ID/Client Secret used for GitHub login.

## Administration

`/#/settings` is the main Administration Center. Administration is grouped into General, Identity & Access, Service Management, Communication, Integrations, Assets / CMDB and System sections.

The standalone legacy `v8.html` page is retired and redirects into the normal application shell.

## Architecture

- Node.js 24,
- SQLite,
- Docker / Docker Compose,
- one application container with a persistent data volume,
- optional updater container.

SQLite is used by a single application writer. Do not run multiple Service Desk replicas against the same SQLite volume.

Service Desk 1.2.0 keeps database schema version **8**. Existing 1.1.x data and integrations remain compatible with the 1.2.0 interface release.

## New installation

Requirements: Docker Engine, Docker Compose v2, HTTPS reverse proxy and a public `APP_URL` matching the deployed domain.

```bash
unzip Service_Desk_Docker.zip
cd itelade-desk
bash configure.sh
docker compose up -d --build desk
docker compose logs --tail=30 desk
```

For Nginx Proxy Manager point the Proxy Host at the `service-desk` container on port `3000`, enable TLS and Force SSL. Port 3000 does not need to be published directly on the host when the proxy shares the Docker network.

On a fresh installation, open the Service Desk URL and use the one-time installation code from the container logs to create the organization and first Global Administrator.

## Updates

Stable releases contain `desk-release.json` with the exact GHCR image digest and database compatibility information. Existing supported installations can use the built-in updater.

Published image:

```text
ghcr.io/itelade/service-desk:v1.2.0
```

After upgrading to 1.2.0, perform a hard browser refresh because the release replaces a large part of the frontend styling and cache-busted assets.

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

- [RELEASE_NOTES_1.2.0.md](RELEASE_NOTES_1.2.0.md) — detailed 1.2.0 release notes,
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
