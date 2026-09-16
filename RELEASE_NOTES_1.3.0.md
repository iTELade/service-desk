# Service Desk 1.3.0

Service Desk 1.3.0 is a full visual rebuild of the agent workspace, focused first on the two surfaces used most during daily support work: the queue and the ticket view.

This release deliberately replaces the accumulated 1.2.x presentation overrides with one canonical UI layer. The goal is a calmer, denser and more deliberate service-management workspace inspired by Jira Service Management without copying its branding.

Database schema remains **8**. No database migration is required.

## Agent workspace

- Rebuild the fixed-sidebar application frame, sticky top bar, project picker, global search and primary actions as one consistent shell.
- Normalize spacing, typography, borders, surfaces, controls and responsive behavior across the agent application.
- Keep the collapsible sidebar while correctly resizing the content canvas.
- Add a coherent dark-theme treatment for the rebuilt surfaces.
- Retire the active 1.2.4 injected layout so old emergency CSS cannot compete with the new canonical layer.

## Queue

- Rebuild `/#/queue` as a single work surface instead of a stack of unrelated legacy panels.
- Introduce four readable operational summary cards with stronger count hierarchy.
- Integrate queue tabs, saved views, quick filters, sorting and column preferences into the same surface.
- Rebuild the main filter bar with predictable sizing and responsive wrapping.
- Rebuild the issue table with clearer ticket key/title hierarchy, compact metadata, consistent status/priority treatment and readable SLA indicators.
- Preserve existing queue filters, saved preferences, permissions, pagination and live refresh behavior.

## Ticket view

- Rebuild ticket detail around a unified issue header containing breadcrumb, title, current status, workflow transitions and issue actions.
- Use a dedicated primary work column plus a sticky contextual details rail on desktop.
- Rebuild description, conversation, related work, activity and attachment areas as consistent work cards.
- Improve comment readability and the reply composer without changing comment permissions or workflow behavior.
- Keep details, requester metadata, elapsed time and SLA together in the right rail.
- Move the asynchronous attachment module into the primary ticket column and defensively remove duplicate attachment surfaces.
- Make history less visually dominant by presenting it as a collapsible activity section.

## Compatibility

- Database schema remains **8**.
- Existing tickets, comments, workflow maps, SLA configuration, queue preferences, links, assets and attachments remain unchanged.
- Existing 1.2.1 updater progress, restart/reconnect handling and one-time automatic refresh are retained.
- Browser cache markers advance to **1.3.0** so the rebuilt assets replace older presentation layers immediately after upgrade.

## Validation

CI covers syntax/static checks, the complete automated test suite and updater script syntax. New regression coverage verifies the canonical queue structure, rebuilt ticket structure, attachment deduplication, responsive shell and 1.3.0 runtime/cache alignment.
