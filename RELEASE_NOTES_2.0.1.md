# Service Desk 2.0.1

## Corrective UI and stability release
- Fixed unauthenticated #/queue session-expired notification storms and duplicate queue-tool races.
- Rebuilt the queue workspace into a compact triage layout with saved views, quick filters, sorting and collapsible column controls.
- Rebuilt the board with compact filters, readable status counts and modern kanban columns/cards.
- Fixed oversized user avatars and stabilized the users table.
- Reworked Administration Center spacing, hierarchy, navigation and cards.
- Added project-scoped workspace context: project identity in sidebar/topbar plus project-aware Queue, Board and Project settings navigation.
- Reworked Projects into service-workspace entry cards.
- Schema remains 9; upgrading from 2.0.0 requires no additional database migration.

## Validation
Full syntax/static checks, CI tests and upgrade-script syntax are release gates. Production rollout should additionally smoke-test login/logout, project switching, queue tools, board transitions, user administration, Settings, LDAP/SSO, mail and updater/rollback.
