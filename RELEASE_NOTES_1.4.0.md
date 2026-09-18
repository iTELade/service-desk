# Service Desk 1.4.0

Service Desk 1.4.0 is a major product-interface release. The complete active presentation layer has been rebuilt around one canonical enterprise design system instead of continuing the 1.2.x / 1.3.x chain of visual patches.

The objective is a mature corporate Service Desk / ITSM workspace: dense enough for daily operations, calm enough for long working sessions, consistent across every module, and close to the information hierarchy users expect from established enterprise service-management products without copying Atlassian assets or implementation.

Database schema remains **8**. No migration is required.

## Why 1.4.0 is different

Previous releases progressively repaired the queue and ticket experience, but the browser still loaded several generations of CSS and JavaScript overlays. That made the final presentation difficult to reason about and created regressions such as duplicated controls, layout collisions and inconsistent typography.

1.4.0 changes the frontend boundary:

- `app.css` is now the single active presentation source for the product,
- the old release CSS overlays are no longer loaded,
- the old Settings navigation repair runtime is no longer loaded,
- the 1.4 controller in `release-1.2.0.js` is rewritten from scratch and owns route classes, enterprise navigation, queue/ticket composition, Settings completion, light-theme enforcement and updater progress,
- the 1.1.2 JavaScript module remains active only because it provides real product features: global search, personal queue preferences and protected attachments,
- legacy CSS/JS files remain in the repository for rollback/history but cannot compete in the active 1.4 browser stack.

## Enterprise application shell

- Fixed left navigation with clear operational grouping and a predictable 248 px working width.
- Optional compact 72 px navigation mode stored per browser.
- Sticky white top bar with project context, global permission-aware search, notifications, refresh and primary create action.
- One consistent spacing, typography, border, surface, focus and control system across all routes.
- One supported light presentation across agent workspace, customer portal and authentication surfaces.
- Old `dark` / `system` UI controls are normalized to the single light option.
- Responsive behavior is defined for desktop, smaller laptop, tablet and mobile breakpoints.

## Queue workspace

`/#/queue` is rebuilt as the primary triage workspace rather than a dashboard followed by unrelated controls.

- Clear page hierarchy with title and operational description.
- Four restrained summary cards for New, In progress, Waiting and Resolved/closed counts.
- Queue tabs remain immediately visible.
- Personal view/column/sorting controls live in one collapsed **Widok i sortowanie** section.
- Primary filters use a single aligned grid with readable labels and predictable control sizing.
- The issue table uses stronger ticket titles, smaller but clear metadata, consistent status/priority chips and contained horizontal overflow.
- SLA states use explicit green/red treatment without turning every row into a wall of color.
- Personal saved views, quick filters, column order, primary/secondary sorting and server-side authorization behavior are preserved.

### Queue refresh stability

The 1.4 controller keeps the last stable queue visible during a same-route/background refresh using a passive visual snapshot outside the active `#main` tree.

The snapshot:

- has no active event handlers,
- has IDs and `data-*` hooks removed,
- cannot be focused or interacted with,
- is removed as soon as the refreshed queue is ready,
- never restores stale application HTML into the live work surface.

This keeps refreshes visually stable without recreating the duplicate-control regression from older releases.

## Ticket workspace

The ticket view is rebuilt around how an agent actually works a case.

- Breadcrumb, ticket identity, title, current status, transitions and issue actions stay together in one enterprise header.
- The main workspace uses a primary work column plus a 360 px contextual rail on desktop.
- The right rail is sticky and contains editable fields, requester context, elapsed time and SLA information.
- Description and conversation typography are larger and easier to scan.
- Internal notes remain visually distinct without overpowering normal comments.
- Reply composer is larger and clearer.
- Protected attachments are presented as compact file rows with explicit metadata and actions.
- Duplicate asynchronous attachment blocks are collapsed to the newest interactive instance.
- Change history is available in a compact collapsible section instead of dominating the page.
- Existing workflow, automation, SLA, internal-note, linking, asset and attachment authorization behavior is unchanged.

## Board

- Kanban columns use neutral enterprise surfaces with clear status headers and counts.
- Cards are compact, readable and consistent with the queue ticket hierarchy.
- Drag/drop, transitions and existing project workflow behavior are preserved.

## Projects and service catalogue

- Project and service cards use one common card language with clear project identity, description and action hierarchy.
- Large decorative tiles are avoided in favor of operational density.
- Internal/external project behavior, portals, membership, request types, forms, workflow, SLA and automations remain unchanged.

## Users and identity

- User tables and account forms use the same enterprise control system.
- Local, LDAP and SSO account behavior is preserved.
- Existing fixed Global Administrator / Project Manager / Agent / Customer model is preserved.
- Theme presentation is light-only in the active client.

## Administration Center

- `/#/settings` keeps the native grouped Administration Center.
- Navigation is presented as a stable 280 px settings rail on desktop.
- All existing management areas remain reachable: General, Identity & Access, Service Management, Communication, Integrations, Assets / CMDB and System.
- Direct links to LDAP, SSO, mailboxes, templates, organizations, webhooks, API tokens, Knowledge Base, Assets, updates, events and advanced settings are completed by the 1.4 controller.
- The standalone legacy `v8.html` interface remains retired.

## Customer portal and authentication

- Customer-facing pages use the same light design language without exposing the dense agent shell.
- Portal navigation, service cards, public project pages and ticket pages use consistent surfaces and typography.
- Login, registration, password reset, invite and MFA views use a focused enterprise authentication card.
- Existing GitHub SSO / OIDC and local authentication behavior remains unchanged.

## Accessibility and interaction

- Explicit keyboard focus rings across buttons, links and form controls.
- Larger minimum control sizes while retaining enterprise density.
- Consistent hover and disabled states.
- Reduced reliance on color alone for primary workflow meaning.
- Responsive layouts avoid widening the whole application when a table overflows.

## Updater

The updater UX introduced in 1.2.1 is preserved inside the new controller:

- live milestone progress,
- restart/offline continuity,
- reconnect to an in-progress job,
- rollback status,
- one automatic browser reload after successful update or completed rollback.

## Compatibility

- Application version: **1.4.0**.
- Database schema: **8**.
- No database migration.
- Existing tickets, comments, users, LDAP/SSO configuration, projects, workflows, SLA, saved queue preferences, organizations, Assets/CMDB, mail channels, integrations and attachments are preserved.
- Legacy visual assets remain available in the image for rollback/history but are not loaded by the 1.4 active client.

## Validation focus

The 1.4 regression gate covers:

- one canonical CSS presentation layer,
- removal of old active release CSS overlays,
- stable fixed-sidebar shell,
- responsive queue/board/project/user/settings/ticket layouts,
- safe queue refresh continuity,
- queue-tool deduplication,
- ticket attachment deduplication,
- light-only theme enforcement,
- complete Administration Center navigation,
- updater reconnect/reload behavior,
- 1.4.0 application/cache version alignment.
