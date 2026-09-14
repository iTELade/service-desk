# Service Desk 1.0.3

Service Desk 1.0.3 completes the Settings / Administration redesign started in 1.0.1 and fixes the incomplete 1.0.2 hotfix.

## Administration and Settings

- `/#/settings` is now a complete Administration Center inside the normal Service Desk shell.
- The standalone `v8.html` administration interface is retired; direct visits to it redirect to `/#/settings`.
- Settings use a grouped left navigation and one focused configuration area at a time instead of a wall of unrelated tiles.
- Administration is grouped into: General, Identity & Access, Service Management, Communication, Integrations, Assets / CMDB and System.
- Existing configuration remains reachable: users, LDAP, SSO, projects, workflows, approvals, customer organizations, SMTP, team mailboxes, notification templates, GitHub Issues, Knowledge Base, API tokens, webhooks, plugins, assets, diagnostics, audit, updates, module errors and factory reset.
- General organization / registration settings, branding, SMTP and GitHub Issues are directly editable from the new Settings Center.

## GitHub Issues

- GitHub Issues configuration remains one-way: GitHub Issue → Service Desk ticket → GitHub comment with the Service Desk link → GitHub Issue close.
- The Settings UI keeps named request-type selection, service-account selection, credential management, label-to-priority mapping, connection testing, enable/disable, deletion, last status and readable transfer history.
- Label-to-priority mapping is presented as simple `label=P1` rows instead of raw JSON.

## Compatibility

- Application version: **1.0.3**.
- Database schema remains **8**; no schema migration is required.
- Front-end cache keys are bumped to 1.0.3.
- Existing 1.0.2 installations can upgrade through the built-in updater.
