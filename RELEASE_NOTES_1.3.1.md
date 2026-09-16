# Service Desk 1.3.1

Service Desk 1.3.1 is a UI regression hotfix for the 1.3.0 agent workspace rebuild.

The 1.3.0 release exposed an interaction between the older 1.1.3 DOM snapshot enhancer, asynchronous 1.1.2 queue tools and the new 1.3.0 queue wrapper. Under live/background refresh this could restore a stale copy of queue controls and then mount a second interactive copy, producing duplicated saved-view, sorting and column controls. The same stacked presentation also made the queue substantially taller and visually noisier than intended.

Database schema remains **8**. No migration is required.

## Queue

- Retire the active 1.1.3 visual runtime from the current application shell so its DOM snapshot mechanism can no longer compete with the canonical 1.3.x renderer.
- Keep only the newest asynchronous queue-tools instance, preserving the copy that still owns its event listeners and removing stale restored duplicates.
- Collapse saved views, quick filters, secondary sorting and column-layout controls into a single **Widok i sortowanie** disclosure instead of permanently occupying multiple rows.
- Remove the duplicate metric icons introduced by overlapping 1.1.3 and 1.3.0 decorators.
- Restore the queue heading and simplify the summary cards.
- Reduce queue vertical density while keeping filters and the issue list immediately accessible.
- Keep the ticket table inside its own horizontal scroll container instead of widening the whole application surface.

## Ticket

- Re-run ticket structural repair after asynchronous rendering instead of trusting stale route markers.
- Keep only the newest interactive attachment module when duplicate asynchronous sections exist.
- Re-home the active attachment module into the primary work column.
- Tighten the ticket header, work cards, conversation composer and contextual rail so the issue view is less box-heavy.

## Compatibility

- Application version: **1.3.1**.
- Database schema: **8**.
- No database migration.
- Existing tickets, comments, workflows, SLA data, saved queue preferences, links, assets and attachments are unchanged.
- Existing 1.2.1 updater progress/reconnect/one-time-refresh behavior is unchanged.
- Front-end cache keys advance to **1.3.1**.

## Validation

Regression coverage verifies that the active shell no longer loads the 1.1.3 runtime, duplicate queue tool nodes are collapsed to the newest interactive instance, queue preferences are moved into one disclosure, ticket attachments are deduplicated and product/cache version markers are aligned at 1.3.1.
