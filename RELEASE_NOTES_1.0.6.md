# Service Desk 1.0.6

## Complete Settings restoration

This release restores the administration entry points that were visible in the 0.8.x Settings screen while keeping them organized inside the native Service Desk shell.

### Fixed

- `/#/settings` is now owned exclusively by the native Settings Center and no longer calls `legacySettingsView()`;
- the old Organization/SMTP-only screen remains available only as Advanced system settings;
- restores direct access to Users, LDAP / Active Directory, SSO / OIDC, profile-change approvals, Projects, workflow/status templates, customer organizations, team IMAP/SMTP mailboxes, notification e-mail templates, project synchronization, GitHub Issues, webhooks, Knowledge Base, API tokens, plugins, Assets / CMDB, audit, updates and module errors;
- groups administration into General, Identity & Access, Service Management, Communication, Integrations, Assets / CMDB and System instead of the old wall of cards;
- keeps the Settings navigation scrollable and responsive;
- aligns all active Settings assets and cache keys with 1.0.6.

### Regression protection

- adds a test that fails if the normal `settings` route ever points back to `legacySettingsView()`;
- verifies every critical 0.8.x administration destination is present in the grouped Settings navigation;
- full repository validation must pass before publishing.

Database schema remains **8**. No migration is required.
