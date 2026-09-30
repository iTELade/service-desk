# Database migration for Service Desk 2.0

Service Desk 2.0 upgrades SQLite schema 8 to schema 9 automatically during application startup.

## Before upgrading
1. Stop write traffic to the Service Desk.
2. Create and verify a backup of DATA_DIR, especially desk.sqlite and related WAL/SHM files.
3. Record the currently deployed image/tag and keep it available for rollback.
4. Upgrade the application only after the backup is complete.

## Schema 9 changes
- ui_preferences: per-user shell density, locale and home route;
- project_service_settings: project-local portal/workspace configuration;
- integration_health: normalized connection/test state for LDAP, SSO, SMTP, GitHub and updater;
- service_catalog_categories and service_catalog_category_types: portal catalog grouping;
- v8_saved_views gains columns, sorting and density metadata for the new queue workspace.

Existing tickets, comments, users, workflows, SLAs, assets and integrations are not deleted or renumbered. External projects receive a default catalog category populated with their currently portal-visible request types.

## Rollback
Schema 9 is forward-only. Do not start a 1.6.x binary against a migrated schema 9 database. To roll back the application, restore the verified schema 8 backup together with the previous application image.
