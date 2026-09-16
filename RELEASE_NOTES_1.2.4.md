# Service Desk 1.2.4

Service Desk 1.2.4 rebuilds the two agent views that still looked inconsistent after the 1.2.3 workspace repair: the queue and the ticket detail view.

Database schema remains **8**. No migration is required.

## Queue

- Rebuild the queue as one coherent work surface instead of several unrelated legacy layers.
- Use four stable summary cards for operational status counts.
- Normalize queue tabs, saved views, quick filters, sorting and column controls.
- Present the main filters as a compact responsive work bar.
- Restore a full-width Jira Service Management-style issue list with predictable row density and typography.
- Keep existing saved queue preferences, filtering, sorting and permission behavior.

## Ticket view

- Rebuild the agent ticket canvas as a primary work column plus a 340 px details rail on desktop.
- Normalize workflow status/actions, breadcrumb, title and ticket action toolbar.
- Turn description, conversation, history and related work into consistent bordered work cards.
- Keep details, requester metadata, elapsed time and SLA in a sticky right rail.
- Rework the reply composer and attachment uploader so they no longer stretch across the page.
- Move the attachment module into the main ticket column.
- Defensively remove duplicate attachment modules caused by overlapping asynchronous legacy decorators; only one attachment surface remains visible.

## Compatibility

- Existing 1.2.x data and schema are unchanged.
- Existing queue preferences, ticket workflows, SLA, comments, links, assets and attachments remain compatible.
- The 1.2.1 updater progress/reconnect/automatic refresh behavior remains intact.
- Browser cache markers advance to 1.2.4.

## Validation

Regression tests cover the rebuilt queue surfaces, desktop ticket split, single attachment surface, runtime version and cache markers.
