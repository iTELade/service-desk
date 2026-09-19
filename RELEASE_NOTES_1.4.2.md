# Service Desk 1.4.2

Service Desk 1.4.2 is an emergency queue-stability hotfix for the 1.4.1 enterprise UI.

Database schema remains **8**. No migration is required.

## Fixed: queue refresh loop

1.4.1 exposed a flaw in the existing five-second live-view refresh logic. The background poll compared the complete `/tickets` response. SLA countdown values change as time passes even when no ticket has actually changed, so the queue could be treated as modified on every poll and re-rendered repeatedly.

1.4.2 adds a pre-runtime live-refresh guard that:

- compares only stable ticket state such as ticket/version/workflow/status/assignee/update data,
- deliberately excludes the continuously changing SLA `remaining_ms` countdown from change detection,
- still notices SLA state/breach/deadline changes,
- refreshes the queue only when stable ticket data really changes,
- preserves the existing manual refresh action.

## Fixed: search and filter interaction

Background refresh is now suppressed while the operator is actively using inputs, text areas, selects or editable content in the workspace.

The protection explicitly includes the global top-bar search and its result dropdown. A background poll therefore cannot tear down the search field while a query is being typed or inspected.

The same protection is applied to the window-focus refresh hook so returning to the browser cannot immediately destroy an in-progress search or unsaved queue filter input.

## Compatibility

- Application version: **1.4.2**.
- Database schema: **8**.
- No database migration.
- The 1.4.1 premium visual design remains unchanged.
- Existing tickets, projects, users, LDAP/AD, SSO/OIDC, mail, workflows, SLA, automations, Assets/CMDB, saved views, attachments and permissions are unchanged.
- Browser asset cache keys advance to **1.4.2**.

## Regression coverage

The release gate verifies that:

- the refresh guard executes before `app.js` registers the legacy five-second live-refresh callback,
- ticking SLA countdown values cannot trigger a queue refresh,
- ticket version/workflow/status changes can still trigger live refresh,
- active queue/global-search interaction blocks automatic refresh,
- the focus refresh path is guarded,
- the application remains on schema 8,
- the existing 1.4 enterprise UI and updater behavior remain active.
