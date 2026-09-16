# Service Desk 1.2.3

Service Desk 1.2.3 rebuilds the agent workspace shell after the 1.2.2 visual hotfix proved insufficient in production.

The production screenshots exposed the real root cause: the sidebar was `position: fixed`, but the parent `.workspace` still used a two-column CSS grid. Because a fixed element is removed from normal grid flow, `.workspace-content` could be placed in the sidebar-width track while the second grid track remained empty. Increasing `#main` to `width:100%` therefore only made the content 100% of an already-collapsed parent.

## Workspace shell rebuilt

- Replaces the conflicting grid/fixed-sidebar shell with a block-based application frame.
- Gives `.workspace-content` an explicit width of the viewport minus the active sidebar width.
- Preserves the fixed/collapsible sidebar without allowing it to affect grid item placement.
- Preserves the sticky top application bar.
- Makes the main canvas full-width inside a bounded, centered service-desk workspace.
- Keeps the collapsed 68 px sidebar state and responsive narrow-screen state consistent.

## Jira Service Management-style agent workspace

- Reworked page headings, spacing and content hierarchy.
- Queue summary cards now use predictable full-width operational cards.
- Queue filters use a compact service-desk filter bar and the issue panel owns the available width.
- Board columns have stable widths and horizontal overflow instead of min-content collapse.
- Project cards use a responsive service-project grid.
- User management tables keep a normal identity column and full-width panel.
- Settings / Administration uses a stable 280 px navigation rail with a flexible content canvas.
- Ticket details retain a two-column work area with a sticky information sidebar on desktop.
- Shared panels, tables and surfaces are normalized to a consistent Jira-like visual language.

## Regression protection

Tests now assert the shell-level invariants that were missing in 1.2.2:

- `.workspace` must not remain a grid while the sidebar is fixed,
- `.workspace-content` must explicitly occupy `100% - sidebar width`,
- queue, board, projects, users, settings and ticket layouts must each have dedicated full-width protections,
- responsive breakpoints and the collapsed sidebar path must remain present,
- browser cache markers and runtime version markers must stay aligned with 1.2.3.

## Compatibility

- Database schema remains **8**.
- No database migration is required.
- The 1.2.1 updater progress/reconnect/one-time-refresh behavior is retained.
- Existing data, integrations and updater state remain compatible.
