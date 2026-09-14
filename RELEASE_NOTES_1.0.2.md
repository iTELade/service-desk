# Service Desk 1.0.2

Service Desk 1.0.2 is a UI routing hotfix for administrators already running 1.0.1.

## Settings
- **Settings stays inside the normal Service Desk application.**
- `/#/settings` renders the native Settings view with the standard sidebar, top bar, theme and navigation.
- The Settings entry point no longer redirects to `/v8.html`.
- Existing global configuration remains available through the native settings and existing module routes.

## Upgrade
- Application version: **1.0.2**.
- Database schema remains **8**; no schema migration is required.
- Front-end cache keys are bumped to 1.0.2.
- The new semantic version is intentional: installations already on 1.0.1 need a strictly newer version for the built-in updater to offer this hotfix.
