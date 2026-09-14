# iTELade Service Desk 1.0.0

Self-hosted service desk / ITSM platform for customer support and internal IT operations. Service Desk provides customer portals, internal and external projects, ticket workflows, SLA, automation, assets, LDAP/SSO, email integration, API, webhooks, GitHub Issues intake and an extensible plugin foundation.

Service Desk is not an Atlassian product and is not intended to be a clone of Jira Service Management. It is an independent self-hosted platform developed by iTELade.

## What is included in 1.0

- customer portal and internal agent workspace,
- internal and external projects,
- Global Administrator, Project Manager, Agent and Customer role model,
- configurable request forms and workflows,
- SLA calendars and automation,
- organizations and customer access rules,
- asset / equipment management,
- LDAP directory synchronization,
- OpenID Connect / SSO,
- TOTP and FIDO2 / WebAuthn security keys,
- inbound email via IMAP and outbound email via SMTP,
- API tokens and outbound/inbound webhooks,
- audit log and saved queues,
- approvals,
- GitHub Issues → Service Desk intake,
- Administration Center and diagnostics,
- plugin registry and lifecycle foundation,
- global language selection: English, Polish and German.

English is the default system language. The selected language is global for the whole instance and is configured by an administrator.

## GitHub Issues integration

The GitHub integration is intentionally one-way:

```text
GitHub Issue
    ↓
Service Desk ticket
    ↓
comment on GitHub with the Service Desk ticket link
    ↓
GitHub Issue closed
    ↓
further handling only in Service Desk
```

There is no Service Desk → GitHub ticket creation and no bidirectional comment or status synchronization in the supported 1.0 flow.

## Plugin foundation

Service Desk 1.0 introduces the plugin registry and lifecycle foundation. Plugin manifests can declare:

- plugin identifier and semantic version,
- Service Desk compatibility range,
- capabilities,
- requested permissions,
- supported locales.

Plugins can be registered, enabled, disabled and removed from Administration. Plugin health and lifecycle history are exposed to the administration and diagnostics views. Runtime extension points will continue to expand in later 1.x releases.

## Architecture

- Node.js 24,
- SQLite,
- Docker / Docker Compose,
- one application container with a persistent data volume,
- optional updater container.

SQLite means one application instance writes to the database. Do not run multiple Service Desk replicas against the same SQLite volume.

## New installation

Requirements:

- Docker Engine,
- Docker Compose v2,
- HTTPS reverse proxy,
- a domain matching `APP_URL`.

```bash
unzip Service_Desk_Docker.zip
cd itelade-desk
bash configure.sh
docker compose up -d --build desk
docker compose logs --tail=30 desk
```

For Nginx Proxy Manager create a Proxy Host pointing to the `service-desk` container on port `3000`, enable TLS and Force SSL. Port 3000 does not need to be published directly on the host. The reverse-proxy network can be configured with `PROXY_NETWORK`.

On first launch, open the Service Desk URL and enter the one-time installation code from the container logs. The web installer creates the organization, system name, branding and first Global Administrator account.

A fresh installation does not include demo tickets or customer accounts. Registration is disabled by default until an administrator configures it.

## Administration

Service Desk 1.0 includes the Administration Center with grouped configuration areas for:

- General,
- Identity & Access,
- Service Management,
- Communication,
- Integrations,
- System.

The diagnostics view exposes application version, database schema version, Node.js version, uptime, mail queue state, failed background events, SMTP state and plugin health.

## Languages

Supported system languages:

- **English (`en`)** — default,
- **Polski (`pl`)**,
- **Deutsch (`de`)**.

Language is an instance-wide administrator setting. Users do not select a separate personal language.

## Updates

Service Desk can use the built-in updater with releases published from this repository. Stable releases include a `desk-release.json` manifest that identifies the exact GHCR image digest and database schema compatibility.

Existing 0.8.x installations can upgrade to 1.0.0 through the built-in updater. Service Desk 1.0.0 keeps database schema version **8**, so this release does not require a new database migration.

See [UPDATES.md](UPDATES.md) and [UPGRADE.md](UPGRADE.md) for details.

## Backup

Create a consistent SQLite backup with:

```bash
docker compose exec desk node scripts/backup.mjs /app/data/backups/manual.sqlite
```

The backup produces the SQLite database and its matching `manual.sqlite.master.key`. Store both outside the server together with the deployment configuration. The master key is required to decrypt secrets stored by Service Desk.

Never replace the live database file while Service Desk is running.

## Development

```bash
npm ci
npm run check
npm test
```

CI validates dependency installation, syntax/static checks, the test suite and upgrade-script syntax before release changes are merged.

Tests do not connect to your production LDAP directory, mailbox or Docker environment. Validate external integrations on a separate test deployment before production use.

## Documentation

- [CHANGELOG.md](CHANGELOG.md) — release history,
- [MODULES.md](MODULES.md) — projects, mail, SLA, LDAP/SSO, integrations and permissions,
- [AUTOMATION.md](AUTOMATION.md) — triggers, conditions, actions and scheduling,
- [API.md](API.md) — API and token usage,
- [UPDATES.md](UPDATES.md) — GitHub release publishing and Docker updater,
- [UPGRADE.md](UPGRADE.md) — upgrade procedure,
- [VALIDATION.md](VALIDATION.md) — validated scenarios and known validation boundaries.

## License

Copyright (C) 2026 Adam Dehmel (iTELade).

Service Desk is licensed under the **GNU Affero General Public License v3.0** (`AGPL-3.0-only`). See [LICENSE](LICENSE) for the complete license text.

You may use, modify and redistribute the software, including commercially, under the terms of AGPL-3.0. If you provide a modified version to users over a network, you must offer the corresponding source code as required by section 13 of the AGPL.

The self-hosted Service Desk core is intended to remain free and open source. Core ITSM and security functionality is not feature-paywalled. Commercial offerings can instead focus on managed hosting, support, migrations, monitoring, backups, HA and consulting.

Source code: https://github.com/iTELade/service-desk

## Current release

**Service Desk 1.0.0**

Major 1.0 highlights are the reorganized Administration Center, diagnostics, German language support, plugin lifecycle foundation, simplified role model and the one-way GitHub Issues intake flow.

Release: https://github.com/iTELade/service-desk/releases/tag/v1.0.0
