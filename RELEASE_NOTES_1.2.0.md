# Service Desk 1.2.0

Service Desk 1.2.0 is a major interface and usability release. The application keeps the existing iTELade data model, permissions, integrations and schema, while rebuilding the agent, administration, authentication and customer-facing experience around a denser Jira Service Management-inspired interaction model.

Service Desk remains an independent iTELade project. It is not an Atlassian product and is not intended to be a source-compatible clone of Jira Service Management.

## Agent workspace

- Rebuilt agent shell with a compact blue navigation area and a light operational work surface.
- Consistent typography, spacing, buttons, tables, forms, panels, status badges and empty states across the application.
- Collapsible left navigation with direct access, where permitted, to queues, board, customer portal, projects, users, Knowledge Base, Assets / CMDB, mail channels and administration.
- Global search remains available from the main header.
- Denser layouts reduce unnecessary card chrome and keep more operational information visible at once.

## Queues

- Jira-style issue table focused on triage rather than dashboard cards.
- Existing personal queue preferences, saved views, quick filters, configurable columns and sorting remain available.
- Priority, status, assignee and SLA information use compact presentation designed for scanning large queues.
- Queue refresh behavior continues to preserve the current workspace instead of replacing the whole page with a blocking loading screen during background refreshes.

## Ticket view

- Ticket detail is reorganized around the issue itself.
- Primary content, description, activity and conversation are kept in the main column.
- Metadata, SLA and editable details are moved into a compact sticky side panel on wider screens.
- Workflow transitions and ticket actions are grouped closer to the issue heading.
- Customer-visible replies and internal notes remain distinct.
- Existing watchers, links, attachments, automation state, resolution data and project permissions remain enforced by the same backend authorization rules.

## Board, projects and users

- Board columns and ticket cards use the same lighter visual system as queues.
- Project lists and project configuration pages are aligned with the new workspace.
- User management uses denser identity rows and consistent controls.
- Existing project types, memberships and fixed global roles are unchanged.

## Administration Center

- Administration is presented as one coherent system instead of a collection of visually unrelated pages.
- Navigation is grouped around identity and access, service management, communication, integrations, assets and system configuration.
- Duplicate navigation entries are reduced where a native settings section already exists.
- LDAP / Active Directory, SSO / OIDC, SMTP, inbound mail, GitHub Issues, Assets / CMDB, workflows, forms, approvals and system settings retain their existing backend behavior.

## Customer and public portals

- Customer portal, public project portal and request catalogue are restyled into the same product family as the agent workspace.
- Service/request cards and personal ticket lists use clearer hierarchy and spacing.
- Login, registration, account activation and MFA screens use the new visual language.
- Public GitHub projects keep anonymous read-only access and GitHub-authenticated write access.
- Private/internal project visibility rules are unchanged.

## Compatibility and security

- Database schema remains **8**.
- No database migration is required specifically for the 1.2.0 interface release.
- Fixed global roles remain: Global Administrator, Project Manager, Agent and Customer.
- Project membership and ticket-level authorization remain enforced server-side.
- Existing LDAP, OIDC/GitHub OAuth, IMAP/SMTP, API/webhooks, GitHub Issues intake, SLA, automation, attachments, Assets / CMDB and plugin foundation remain compatible.
- Existing 1.1.x installations can upgrade through the normal supported update path.

## Deployment

Published container image:

```text
ghcr.io/itelade/service-desk:v1.2.0
```

The release manifest `desk-release.json` contains the immutable image digest used by the built-in updater.

After upgrading, a hard browser refresh is recommended because 1.2.0 replaces a large part of the frontend styling and cache-busted assets.

## Validation

The release pipeline validates the application version, installs dependencies, runs static JavaScript checks and the automated test suite, builds the Docker image and publishes the release manifest. External production services such as LDAP, mailboxes, OAuth providers and reverse proxies are not contacted by CI and should still be validated in the deployed environment.
