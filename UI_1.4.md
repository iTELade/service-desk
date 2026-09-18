# Service Desk 1.4 UI contract

This document is the visual/interaction contract for the 1.4 product line. It exists to prevent the interface from drifting back into layered hotfix styling.

## Product character

Service Desk is a self-hosted enterprise Service Desk / ITSM application. The agent experience should feel appropriate for a corporate support team working in the product all day: calm, dense, predictable, readable and operational rather than decorative.

The information hierarchy may be inspired by established enterprise service-management products such as Jira Service Management, but the implementation, branding, assets and exact interface remain independent.

## Non-negotiable rules

1. The active product uses one light design system. Do not add a second dark/system presentation path.
2. Do not re-introduce stacked release CSS overlays. `public/app.css` is the canonical active presentation layer for 1.4.
3. Do not restore stale queue HTML into the live `#main` element to hide refreshes.
4. Do not duplicate queue tools, attachment sections, Settings navigation or ticket headers.
5. Keep the fixed role model: Global Administrator, Project Manager, Agent and Customer. Project access remains isolated and backend-authorized.
6. Preserve internal/external projects, customer portal behavior, workflow/status transitions, SLA, automations, organizations, Assets/CMDB, mail, LDAP/AD, SSO/OIDC, MFA, API/webhooks, GitHub Issues integration, saved queues and Knowledge Base integration points.
7. Customers can see closed tickets they are allowed to access; customer permissions are not widened by presentation changes.
8. Internal notes and internal attachments must remain visibly distinct and authorization-protected.
9. Ticket keys are primary operational identifiers and stay visible in queue, search and ticket views.
10. Responsive behavior must contain overflow inside the relevant table/board instead of widening the entire application shell.

## Shell

- Desktop navigation width: 248 px.
- Collapsed navigation width: 72 px.
- Sticky top bar: project context, global search, notifications, refresh and create action.
- Main work surface uses a neutral light background and white operating surfaces.
- Typography prioritizes scanning: strong page/ticket titles, restrained metadata, explicit labels.

## Queue

Queue is the primary triage workspace. It must show, in this order:

1. title/context,
2. operational counters,
3. queue tabs,
4. optional personal view/sort configuration,
5. primary filters,
6. issue table.

The issue table must make key/title, status, priority, assignee, SLA and update time readable without oversized row heights.

## Ticket

Ticket work is split into:

- an enterprise header containing identity, title, status, transitions and actions,
- a primary work column containing description, conversation, related work, attachments and history,
- a sticky context rail containing editable fields, requester context, elapsed time and SLA.

The conversation and reply editor are first-class work areas. History is secondary and collapsible.

## Administration

Settings stays inside the normal application shell. Administration categories remain General, Identity & Access, Service Management, Communication, Integrations, Assets / CMDB and System. Dedicated native routes remain reachable from those groups.

## Customer-facing UI

Customer portal and authentication screens share the product design language without exposing agent-only operational density. The portal remains simpler than the agent workspace.

## Release discipline

Any 1.4.x UI change should add or update regression coverage. If a change needs another broad CSS/DOM overlay to work, it should be redesigned instead of layered on top.
