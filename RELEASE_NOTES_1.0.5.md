# Service Desk 1.0.5

## Settings Center reliability hotfix

This release fixes the Settings Center race that could leave administrators on the old legacy settings form even though the native Administration Center assets were loaded.

### Fixed

- detects when `app.js` overwrites the native Settings Center with the legacy `legacySettingsView()` after the Settings Center rendered first;
- clears the stale Settings Center render marker and forces one real re-render instead of leaving the legacy screen mounted;
- prevents the Settings navigation MutationObserver from creating a feedback loop by rewriting the version label on every DOM mutation;
- exposes the complete administration navigation in the Settings Center, including Users, LDAP / Active Directory, SSO / OIDC, Projects, workflow templates, approvals, customer organizations, SMTP, team mailboxes, notification templates, project synchronization, GitHub Issues, Knowledge Base, API tokens, webhooks, plugins, Assets / CMDB, audit, updates, module errors and advanced system settings;
- keeps the normal Service Desk shell and dark/light theme instead of returning to a standalone administration page;
- refreshes active public asset cache keys to `1.0.5`.

### Validation

- adds an automated regression test for the stale-render race and the complete Settings navigation;
- the release must pass local Settings recovery tests plus the full repository CI before publication.

Database schema remains **8**. No migration is required.
