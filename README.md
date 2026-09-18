# iTELade Service Desk 1.4.0

Self-hosted Service Desk / ITSM platform for customer support and internal IT operations. It combines customer portals, internal and external projects, configurable workflows, SLA, automation, Assets / CMDB, LDAP / Active Directory, SSO/OIDC, inbound and outbound mail, API/webhooks, GitHub Issues intake, approvals, audit, saved queues and an extensible plugin foundation.

Service Desk is an independent iTELade project. It is not an Atlassian product and is not intended to be a source-compatible clone of Jira Service Management. The 1.4 agent workspace follows familiar enterprise service-management information hierarchy while retaining its own implementation, branding and authorization model.

## Current release

**Service Desk 1.4.0**

Release: https://github.com/iTELade/service-desk/releases/tag/v1.4.0

Detailed notes: [RELEASE_NOTES_1.4.0.md](RELEASE_NOTES_1.4.0.md)

UI contract: [UI_1.4.md](UI_1.4.md)

Database schema: **8**. Service Desk 1.4.0 does not require a database migration from supported 1.3.x installations.

## What is new in 1.4.0

1.4.0 is a major product-interface rebuild rather than another styling hotfix.

- one canonical active presentation layer instead of stacked release CSS overlays,
- enterprise light application shell with fixed navigation, sticky top bar and permission-aware global search,
- rebuilt queue workspace for operational triage,
- rebuilt ticket workspace with primary work column and sticky contextual/SLA rail,
- consistent design system for board, projects, users, Administration Center, customer portal and authentication screens,
- a single supported light presentation across the active product,
- safe queue refresh continuity without restoring stale interactive DOM,
- queue-tool and attachment deduplication guards,
- preserved saved views, column preferences, quick filters, SLA, workflows, automations and integrations,
- retained updater progress/reconnect/rollback behavior,
- no database schema change.

The browser no longer loads the historical release stylesheet stack. `public/app.css` is the canonical 1.4 presentation source. Historical assets remain in the repository/image for rollback and source history but do not compete with the live interface.

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

## Enterprise agent workspace

The 1.4 workspace is designed for daily corporate support operations rather than decorative dashboards.

The desktop shell uses a **248 px fixed navigation rail** and a sticky top bar. The navigation can be reduced to a **72 px compact mode** and exposes operational entry points such as Knowledge Base, Assets / CMDB and mail channels when the signed-in role is allowed to use them.

The top bar keeps project context, global search, notifications, refresh and the primary create-ticket action in a stable location. Controls, tables, forms, dialogs, focus states, spacing and typography use the same design system throughout the product.

The active product is intentionally **light-only** in the 1.4 line. Old dark/system presentation controls are normalized to the light presentation so stale browser/account preferences cannot switch the interface back to a competing theme.

## Queue workspace

`/#/queue` is the primary triage surface for Agents and Project Managers.

The workspace is ordered around the way tickets are actually processed:

1. page and project context,
2. operational counters,
3. queue tabs,
4. optional personal **Widok i sortowanie** controls,
5. primary filters,
6. issue table.

Queue capabilities include:

- project, status, priority, classification, category, assignee, archive and scope filters,
- personal saved queue preferences,
- saved views,
- primary and secondary sorting,
- quick operational filters such as assigned to me, unassigned and waiting for customer,
- configurable visible columns and saved column order,
- SLA indicators,
- server-side permission filtering on every result,
- background refresh without replacing the visible workspace with a blocking loading screen.

Ticket key/title, status, priority, assignee, SLA and update time are kept readable without oversized rows. Horizontal overflow is contained inside the ticket list instead of widening the entire application shell.

### Stable queue refresh

During a same-route/background refresh, Service Desk keeps the last stable queue visible as a passive visual layer while the real queue is rebuilt underneath.

The passive layer has IDs and `data-*` hooks removed, cannot receive focus or interaction and is removed as soon as the refreshed queue is ready. The application **does not restore stale HTML into the active `#main` tree**, preventing the duplicated toolbar/module regression seen in older frontend builds.

## Ticket workspace

The 1.4 ticket view is organized around case handling.

The ticket header keeps breadcrumb, ticket identity, title, current status, workflow transitions and issue actions together. On desktop the body uses:

- a primary work column for description, conversation, related work, attachments and history,
- a **360 px sticky context rail** for editable fields, requester context, elapsed time and SLA information.

Description and conversation typography are optimized for longer work sessions. Internal notes remain clearly distinct from customer-visible comments. The reply composer receives a larger work area, and protected attachments are rendered as compact file rows with metadata and actions.

Asynchronous attachment rendering is deduplicated so only the newest interactive attachment block remains. Change history is secondary and collapsible instead of dominating the ticket.

Existing workflow transitions, comments, internal notes, SLA behavior, links, assets and attachment authorization remain backend-controlled and unchanged by the presentation rebuild.

## Board

The board keeps existing workflow behavior while using the same enterprise visual language as the queue.

- neutral Kanban columns,
- clear status headings and counts,
- compact issue cards,
- drag/drop where supported,
- explicit transition controls,
- contained horizontal scrolling instead of page-wide overflow.

## Projects and service catalogue

Projects and service/request cards use one consistent card hierarchy. Internal and external project behavior remains unchanged, including:

- project membership and isolation,
- customer portal availability,
- request types and forms,
- configurable workflows and statuses,
- SLA policies,
- automations,
- project-specific mail/integration settings.

## Users and identity

User and identity administration uses the same enterprise forms and tables as the rest of the application.

Supported identity sources and security behavior remain unchanged:

- local accounts,
- LDAP / Active Directory accounts and synchronization,
- SSO/OIDC providers,
- GitHub OAuth mapping,
- TOTP,
- FIDO2 / WebAuthn security keys,
- account activation/blocking and project memberships.

## Administration Center

`/#/settings` is the native Administration Center and remains inside the normal application shell.

Administration is grouped into:

- General,
- Identity & Access,
- Service Management,
- Communication,
- Integrations,
- Assets / CMDB,
- System.

Dedicated native routes remain reachable for LDAP, SSO, user access, workflow templates, organizations, mailboxes, e-mail templates, project synchronization, GitHub Issues, webhooks, Knowledge Base, API tokens, plugins, Assets, audit, updates, module errors and advanced settings.

The standalone legacy `v8.html` administration interface remains retired and redirects into the native shell.

## Customer portal and authentication

Customer-facing pages share the 1.4 light product language without exposing the dense agent workspace.

The customer portal, public project portals, ticket pages, login, registration, invite, password reset and MFA screens use the same typography, controls and surface system while keeping a simpler information hierarchy.

Customer visibility and write permissions are always determined server-side. Presentation changes do not widen access to private projects, internal comments, internal attachments or internal directories.

## Attachments

Attachments are stored outside the public web root in the protected Service Desk data store. Each record contains a non-guessable identifier, safe original filename, MIME type, size, SHA-256 checksum, uploader, source and public/internal visibility.

Current policy:

- maximum 2 MB per attachment,
- executable/script/active HTML/SVG content is rejected,
- internal attachments are available only to users who can work the ticket,
- every list/download request re-checks ticket access,
- inbound IMAP attachments are imported for new tickets and replies,
- tiny inline tracking/signature image artifacts are ignored where practical,
- rejected e-mail attachments do not discard the whole message.

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

## Architecture

- Node.js 24,
- SQLite,
- Docker / Docker Compose,
- one application container with a persistent data volume,
- optional updater container.

SQLite is used by a single application writer. Do not run multiple Service Desk replicas against the same SQLite volume.

Service Desk 1.4.0 keeps database schema version **8**.

### Frontend boundary in 1.4

The active browser presentation is intentionally simplified:

```text
app.css                     canonical product presentation
app.js                      core application/router
settings-center.js          native Settings Center
release-1.1.2.js            functional search/queue/attachment module
release-1.2.0.js            1.4 enterprise UI controller + updater UX
security.js                 security-related browser features
```

Historical release styles/scripts may remain in the source tree or image for rollback/history but are not loaded into the active 1.4 interface.

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
ghcr.io/itelade/service-desk:v1.4.0
```

The updater shows live milestone progress, survives the temporary application restart, reconnects to an in-progress update job, reports rollback state and reloads the browser once after a successful update or completed rollback.

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

CI validates dependencies, syntax/static checks, the full test suite and upgrade-script syntax. The 1.4 regression gate also verifies the canonical presentation boundary, light-only theme, responsive shell, queue continuity, ticket composition, Administration Center coverage and updater behavior.

External production LDAP, mailbox, OAuth and reverse-proxy environments are not contacted by unit/integration CI and should still be validated on a test deployment before production rollout.

## UI development rules

See [UI_1.4.md](UI_1.4.md). The central rules for the 1.4 line are:

- `public/app.css` is the canonical active presentation layer,
- do not reintroduce broad stacked release CSS overlays,
- do not restore stale queue HTML into live `#main`,
- do not duplicate queue tools, ticket attachments, ticket headers or Settings navigation,
- preserve server-side authorization and project isolation,
- keep the active product light-only,
- add/update regression coverage with meaningful 1.4.x UI changes.

## Documentation

- [RELEASE_NOTES_1.4.0.md](RELEASE_NOTES_1.4.0.md) — current major release notes,
- [UI_1.4.md](UI_1.4.md) — 1.4 visual and interaction contract,
- [RELEASE_NOTES_1.3.2.md](RELEASE_NOTES_1.3.2.md) — previous 1.3.x polish release,
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
