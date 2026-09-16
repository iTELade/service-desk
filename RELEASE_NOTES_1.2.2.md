# Service Desk 1.2.2

Service Desk 1.2.2 is a production UI hotfix for the 1.2 line. It repairs the broken narrow-content rendering visible on queue, board, projects, users and administration/update pages and tightens the agent workspace so it reads much closer to a Jira Service Management-style service desk.

Database schema remains **8** and no migration is required.

## Agent workspace repair

- Force the main agent content area back to a predictable full-width block layout so route content cannot collapse into narrow columns.
- Restore normal heading wrapping and prevent headings such as `Kolejki zgłoszeń`, `Tablica`, `Projekty` and `Użytkownicy` from breaking character-by-character.
- Keep all direct page sections constrained to the available workspace width without overflowing or shrinking to min-content width.
- Preserve the fixed/collapsible left navigation and top application bar.

## Jira Service Management-style presentation

- Wider, cleaner page canvas and stronger page-heading hierarchy.
- Queue summary cards use a four-column operational overview on desktop with responsive fallbacks.
- Queue filters are presented as a compact work bar instead of a fragmented form.
- Queue tables/panels use consistent Jira-like surfaces and spacing.
- Board columns receive stable minimum widths, clearer cards and predictable horizontal behavior.
- Project cards use a responsive service-project grid.
- User management keeps a full-width data table rather than collapsing the identity column.
- Administration/Settings uses a stable two-column navigation/content shell on desktop and one-column layout on smaller screens.

## Update page

The 1.2.1 updater progress/reconnect/auto-refresh hotfix remains intact. 1.2.2 additionally prevents the update/administration route from rendering as a thin strip beside an otherwise empty page.

## Compatibility

- Schema version remains **8**.
- No database migration.
- Existing 1.2.0/1.2.1 data, updater state and integrations remain compatible.
- Browser cache keys are advanced to 1.2.2 so the repaired CSS/JS is loaded immediately after update.

## Validation

Regression coverage verifies:

- the agent `#main` workspace is forced to full-width block flow,
- heading wrapping remains normal,
- queue, board, projects, users and settings routes all receive dedicated layout protection,
- responsive breakpoints remain present,
- release/runtime/cache markers are aligned to 1.2.2,
- the 1.2.1 updater behavior remains covered.
