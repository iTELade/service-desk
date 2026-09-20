# Service Desk 1.5.0

Service Desk 1.5.0 is a **full product UI rebuild**. It replaces the layered 1.4 presentation with one coherent service-management workspace inspired by mature Jira Service Management patterns while preserving the existing Service Desk backend and data model.

Database schema remains **8**. No database migration is required.

## New operating model

- The entire staff application now uses one global Service Management shell instead of route-specific visual patches.
- A dark global product header, project context picker and dense left navigation establish a consistent workspace hierarchy.
- Operational navigation is separated from administration and resource-management navigation.
- Breadcrumbs and route context are added consistently across queues, tickets, projects, users and administration.
- Responsive behavior is rebuilt for desktop, tablet and narrow screens.

## Queues

- Queues are rebuilt around a Jira-style work surface with a compact summary strip, saved-view tabs, collapsible view settings, filters and the ticket table in one coherent container.
- Existing saved views, quick filters, sorting, column preferences, SLA data and global search remain active.
- The 1.4.2 live-refresh guard remains active so SLA countdown churn does not replace the operator's working UI.
- Queue ghost continuity is preserved while background data refreshes.

## Ticket workspace

- Ticket identity, breadcrumbs, current status, workflow actions and ticket tools are consolidated into a dedicated issue header.
- The primary work area and the contextual details rail are visually separated like a mature ITSM issue view.
- Comments, internal notes, attachments, SLA information and change history remain available.
- Change history remains collapsible to reduce noise without removing information.
- Customer ticket pages keep their own simplified case layout and response-first activity flow.

## Board, projects and users

- Kanban receives dense neutral columns, compact work cards and clearer workflow scanning.
- Project and service catalogue cards are rebuilt as restrained enterprise surfaces rather than dashboard tiles.
- User, directory, project and administration tables use consistent sticky headers, density and hover states.
- Assets / CMDB, Knowledge Base and mail administration remain first-class navigation areas.

## Administration Center

- Settings becomes a true two-pane administration workspace with a persistent configuration rail and focused content area.
- Existing Settings recovery logic is preserved so legacy settings rendering cannot replace the native Administration Center.
- All existing administration destinations remain linked: identity, LDAP/AD, SSO/OIDC, project templates, organizations, mail, GitHub, webhooks, API tokens, knowledge, assets, audit, updater and diagnostics.

## Customer help center

- The customer portal is retained but aligned with the same design system.
- Help search, service discovery, project request catalogues, My Requests and customer ticket activity remain separated from the agent workspace.
- Request creation keeps the configured project forms, custom fields, validation and permissions.

## Authentication and system surfaces

- Login and account flows are rebuilt into a dedicated Service Management authentication surface.
- Dialogs, notifications, forms, tables, release notes and updater progress use one consistent component language.
- Release notes continue to be rendered safely from Markdown-derived DOM rather than injecting raw release HTML.

## Safety and compatibility

- Application version: **1.5.0**.
- Database schema: **8**.
- No database migration.
- Ticket workflow, SLA, automation, LDAP/AD, SSO/OIDC, MFA, mail, Assets/CMDB, GitHub integration, permissions and API behavior are unchanged by this release.
- `release-1.1.2.js` remains active for global search, queue preferences and attachments.
- The previous 1.4 inline customer/UI overlay is removed from the active document instead of being stacked under the new design.
