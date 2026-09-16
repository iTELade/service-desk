# Service Desk 1.3.2

Service Desk 1.3.2 is a visual and stability polish release for the 1.3.x agent workspace.

The release focuses on three issues visible in production after 1.3.1: the queue could still flash during same-route/background refresh, the dark theme reduced readability for the intended Jira-like workspace, and several queue/ticket elements remained too dense or too small.

Database schema remains **8**. No migration is required.

## Light-only interface

- Service Desk now renders the active application in one supported **light theme** across the agent workspace, customer portal and authentication screens.
- Existing `dark` or `system` user preferences are normalized by the browser UI to `light` so a stale account preference cannot switch the product back to dark mode.
- Theme selectors that still originate from older profile markup are reduced to the single supported `Jasny` option.
- The navigation shell, top bar, cards, inputs, tables and dialogs use a consistent Jira-inspired light palette with stronger text contrast.

## Queue stability

- Same-route queue refresh no longer exposes the blocking loading state as a visible flash.
- 1.3.2 keeps a passive visual snapshot of the last stable queue only for the duration of the refresh.
- The snapshot is mounted outside `#main`, strips IDs and `data-*` hooks, is non-interactive and cannot be mistaken for an active queue module by asynchronous JavaScript.
- The real queue renderer continues loading underneath; the passive snapshot is removed immediately when the new stable queue is available.
- This replaces the unsafe historical approach that restored stale HTML directly into `#main` and caused duplicate controls in earlier releases.

## Queue readability

- Larger and clearer page title, filter labels, field text and issue rows.
- Simplified white summary cards with the count separated from the label.
- Cleaner tabs and a single collapsed **Widok i sortowanie** area.
- Higher-contrast table headers, ticket titles, metadata and hover state.
- More predictable filter spacing while keeping the table dense enough for operational triage.
- Horizontal overflow remains contained inside the ticket list rather than widening the whole application shell.

## Ticket readability

- Ticket header, work cards and right-side context rail remain compact but use the same light surface system as the queue.
- Description, comments, reply editor and attachment rows receive stronger contrast and slightly larger text.
- Existing workflow transitions, comments, SLA, links, assets and attachment behavior are unchanged.

## Compatibility

- Application version: **1.3.2**.
- Database schema: **8**.
- No database migration.
- Existing tickets, comments, workflows, SLA data, saved queue preferences, links, assets and attachments are unchanged.
- Existing updater progress/reconnect/one-time-refresh behavior from 1.2.1 remains unchanged.
- Front-end cache keys advance to **1.3.2**.

## Validation

Regression coverage verifies the light-only theme enforcement, safe queue refresh snapshot, queue-module deduplication, current ticket repair path and 1.3.2 product/cache markers.
