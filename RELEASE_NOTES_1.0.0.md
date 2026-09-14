# Service Desk 1.0.0

Service Desk 1.0 is the first major product-focused release of iTELade Service Desk. It consolidates administration, introduces a plugin lifecycle foundation, expands localization and keeps the self-hosted core fully functional without feature paywalls.

## Administration

- Rebuilt the 0.8 Control Center into the **Service Desk 1.0 Administration Center**.
- Settings are grouped into General, Identity & Access, Service Management, Communication, Integrations and System areas.
- Added an administration overview with health and configuration summaries.
- Added a dedicated Diagnostics screen.
- Added a dedicated Integration Hub.
- Removed the custom-RBAC editor from the primary 1.0 administration experience; the supported role model is Global Administrator, Project Manager, Agent and Customer.

## Languages

- English remains the default system language.
- Polish remains supported.
- **German (Deutsch) is now an officially supported system language.**
- Language remains a single global administrator setting for the whole Service Desk instance.
- Administration screens and core UI translation coverage were expanded for German.

## Plugins

- Added the initial 1.0 plugin registry and lifecycle API.
- Plugin manifests are validated for identifier, semantic version and Service Desk compatibility.
- Plugins can declare capabilities, permissions and locales.
- Plugins can be installed/updated, enabled, disabled and uninstalled from Administration.
- Plugin lifecycle events and health information are exposed to Administration and Diagnostics.
- The platform is prepared for future runtime extension points while keeping plugin failures isolated from the core Service Desk process.

## GitHub Issues intake

The supported product flow remains intentionally one-way:

1. a user creates a GitHub Issue,
2. Service Desk imports the issue as a ticket,
3. Service Desk records the GitHub source,
4. GitHub receives a comment containing the Service Desk ticket URL,
5. the GitHub Issue is closed,
6. all further handling continues only in Service Desk.

There is no Service Desk → GitHub ticket creation or bidirectional comment/status synchronization in the 1.0 product flow.

## Diagnostics

Administration now exposes application version, schema version, Node.js version, uptime, mail queue health, failed background events, SMTP state and plugin health in one place.

## Licensing direction

- The self-hosted Service Desk core remains free/open source under AGPL-3.0.
- Core ITSM and security features are not paywalled.
- Future commercial offerings can focus on managed hosting, support, migrations, monitoring, managed backups, HA and consulting.

## Upgrade

- Target version: **1.0.0**
- Database schema remains **8** for this release, so the upgrade does not require a new database migration.
- Existing 0.8.x installations can upgrade through the built-in updater after the 1.0.0 release manifest is published.
