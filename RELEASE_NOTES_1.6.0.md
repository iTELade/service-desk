# Service Desk 1.6.0 — Agent Experience

Service Desk 1.6.0 is a focused agent-experience release. It rebuilds the two surfaces agents and administrators spend the most time in: the work item view and the administration center.

Database schema remains **8**. No database migration is required.

## Agent work item view

The ticket screen is no longer presented as a stack of generic administration cards.

- New full-width work item header with request context, large title, current status and workflow transitions.
- Secondary ticket actions are visually separated from the primary workflow.
- Main work area uses a wide content column plus a dedicated sticky details inspector.
- Description receives a clear primary-content treatment instead of looking like another settings panel.
- Activity is organized into Jira-style tabs:
  - Comments,
  - Attachments,
  - Related items,
  - History.
- Existing comments, internal notes, reply form, mentions, attachments, links, assets and history remain functional.
- Comments use a clearer avatar/thread layout and internal notes remain visibly distinct.
- SLA and elapsed-time cards are rebuilt as compact operational widgets in the inspector.
- Ticket fields, reporter, dates, assignment and classification remain available in the right-hand inspector.
- Responsive behavior collapses the inspector below the ticket on narrow screens.

## Administration center

The Settings route now has its own complete administration design system instead of relying on generic panel styles.

- New administration workspace with a dedicated left settings navigation and content canvas.
- Search field filters settings categories and direct links immediately.
- Settings groups receive clearer hierarchy and visual landmarks.
- Active settings navigation is more obvious and compact.
- Overview metrics are presented as operational summary cards.
- Generated settings rows now have consistent title, description, status and action regions.
- Health/configuration state uses readable success/warning badges.
- Forms, branding preview, shortcuts, key/value sections, tables and fieldsets receive native administration styling.
- Administration content remains responsive down to mobile widths.

## Design direction

The release follows the modern Jira Service Management interaction model rather than the older dense card-based admin aesthetic:

- navigation-first workspace,
- strong work item hierarchy,
- dedicated details rail,
- activity filtering,
- compact system administration navigation,
- restrained surfaces and clearer spacing.

This is an original implementation for iTELade Service Desk and does not copy Atlassian assets or proprietary source code.

## Compatibility

- Application version: **1.6.0**.
- Database schema: **8**.
- No migration.
- Existing tickets, workflows, comments, internal notes, SLA, automation, Assets/CMDB links, LDAP/AD, SSO/OIDC, mail, portal behavior and permissions are unchanged.
- Existing queue live-refresh protection from 1.5.1 remains active.

## Validation

1.6.0 adds regression coverage for:

- release asset/version wiring,
- work item header/context decoration,
- activity tabs and panel switching,
- ticket details inspector,
- administration navigation search,
- version display,
- settings rows/cards/status primitives,
- responsive ticket/settings design tokens.
