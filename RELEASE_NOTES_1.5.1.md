# Service Desk 1.5.1

Service Desk 1.5.1 is a focused stability and readability hotfix for the 1.5 workspace rebuild.

Database schema remains **8**. No database migration is required.

## Queue live refresh

- The queue still checks for fresh ticket data every five seconds.
- Queue refresh no longer calls the application router and no longer rebuilds the global shell.
- Existing rows are patched in place when the visible ticket set is unchanged.
- Only the table body is replaced when tickets are added, removed or reordered.
- Summary metrics, ticket status, priority, assignee, SLA countdown and update time refresh without replacing the search bar or filters.
- Dirty queue filters pause the background patch until the operator finishes editing.
- Global search is outside the queue patch path, so background refresh cannot clear a query or destroy its results.
- Focus-triggered refresh uses the same non-destructive queue path.

## User administration

- User avatars are constrained to a consistent 32 × 32 px circular presentation.
- Large fallback images can no longer expand a user row or cover the administration table.
- User identity metadata remains compact and readable in the Users table.

## Compatibility

- Application version: **1.5.1**.
- Database schema: **8**.
- No migration.
- Existing tickets, workflows, SLA, automation, LDAP/AD, SSO/OIDC, mail, Assets/CMDB, customer portals and permissions are unchanged.
