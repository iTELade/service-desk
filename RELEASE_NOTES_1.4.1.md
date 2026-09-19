# Service Desk 1.4.1

Service Desk 1.4.1 is a visual hotfix for the 1.4 enterprise workspace. It deliberately keeps the 1.4 data model, permissions and operating behavior intact while making the product feel substantially more like a polished corporate ITSM application.

Database schema remains **8**. No migration is required.

## Why this hotfix exists

1.4.0 rebuilt the frontend boundary and removed the historical CSS stack, but the visual result remained too conservative. 1.4.1 keeps that cleaner architecture and pushes the actual presentation much further so the change is immediately visible after upgrade.

## Enterprise shell

- Dark navy corporate navigation rail with clearer active states, stronger hierarchy and improved branding treatment.
- Glass-style sticky top bar with a more prominent global search field and primary create action.
- Richer page background and depth without reducing readability.
- Larger visual separation between navigation, content and operational controls.

## Queue / triage workspace

- New gradient command-center hero for the queue.
- Summary metrics now overlap the hero and use distinct operational accent colors.
- Queue tabs are presented as compact segmented controls instead of plain underlined links.
- Filters, saved-view controls and sorting tools use a calmer operational surface.
- Sticky table headers, stronger issue-key badges, pill-shaped workflow states and clearer SLA chips.
- Row hover state now visibly anchors the ticket currently being scanned.

All existing saved views, personal column order, primary/secondary sorting, quick filters, project isolation and authorization remain unchanged.

## Ticket workspace

- Ticket header receives a dedicated enterprise gradient surface with the key, title, status, transitions and actions visually grouped together.
- Description, conversation and related work panels gain stronger hierarchy and spacing.
- Customer comments use contained message cards; internal notes remain clearly distinct.
- Context/SLA rail cards have stronger field hierarchy and more readable controls.
- Attachment rows, activity/history and reply composer receive the same 1.4.1 surface treatment.

No workflow, SLA, comment visibility, attachment authorization or ticket-access rules are changed.

## Board, projects and administration

- Kanban columns now use status accent lines and elevated cards with clearer drag targets.
- Project and service catalogue cards receive stronger hover depth and clearer service icons.
- Administration Center navigation becomes a dark secondary rail consistent with the main corporate navigation.
- Administration summary cards and configuration sections receive the same visual hierarchy as operational screens.

## Customer portal and authentication

- Customer portal uses the same premium enterprise visual language while remaining simpler than the agent workspace.
- Portal page headers gain stronger service identity.
- Login, registration, password reset and MFA screens use a high-contrast corporate gradient background with an elevated authentication card.

## Accessibility and motion

- Existing focus treatment and light-only product behavior are preserved.
- New entrance motion is intentionally subtle and automatically disabled when `prefers-reduced-motion: reduce` is active.

## Compatibility

- Application version: **1.4.1**.
- Database schema: **8**.
- No database migration.
- Existing tickets, comments, users, organizations, projects, workflows, SLA, automations, LDAP/AD, SSO/OIDC, MFA, mail, Assets/CMDB, integrations, saved queues and attachments are preserved.
- Browser asset cache keys are advanced to 1.4.1 so the visual hotfix is loaded immediately after upgrade.

## Validation focus

The 1.4.1 regression gate verifies:

- one active `app.css` presentation layer,
- no return of retired release stylesheet overlays,
- 1.4.1 cache/version alignment,
- preserved queue refresh safety,
- preserved ticket/attachment deduplication,
- preserved updater progress/reconnect behavior,
- presence of the new premium enterprise shell, queue, ticket, board, settings, portal and authentication styling,
- schema 8 compatibility.
