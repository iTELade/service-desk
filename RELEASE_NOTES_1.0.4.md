# Service Desk 1.0.4

Service Desk 1.0.4 completes the Settings navigation fix started in 1.0.3. Administration remains inside the normal Service Desk shell, but previously hidden administration modules are now exposed directly in the Settings navigation instead of being buried behind generic summary pages.

## Settings and administration

- Adds direct Settings navigation entries for Users, LDAP / Active Directory and SSO / OIDC.
- Adds direct entries for Projects and workflow templates.
- Adds direct entries for team mailboxes and notification templates.
- Adds direct entries for Knowledge Base, API tokens and webhooks.
- Adds direct entries for the asset catalogue, updates and module errors.
- Keeps GitHub Issues, plugins, approvals, organizations, audit and the native configuration sections in the unified Administration Center.
- Makes the desktop Settings navigation independently scrollable so all sections remain reachable on shorter displays.
- Keeps the standalone `v8.html` UI retired; administration stays under `/#/settings` in the normal Service Desk interface.

## Upgrade

- Application version: **1.0.4**.
- Database schema remains **8**; no database migration is required.
- Front-end assets use the **1.0.4** cache-busting version.
- Existing 1.0.3 installations can upgrade normally through the built-in updater after the release manifest is published.
