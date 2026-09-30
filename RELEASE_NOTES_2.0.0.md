# Service Desk 2.0.0 — release candidate

## Major changes
- New product shell and unified design system.
- Administration Center visual rebuild with searchable settings navigation.
- Queue, ticket inspector and customer portal visual foundations.
- Active 1.2.x / 1.6.x visual decorators removed from index.html.
- Database schema 9 with project service settings, service catalog categories, integration health and persisted workspace preferences.
- Saved views extended with queue columns, sort order and density.

## Upgrade requirement
2.0.0 performs a forward-only schema 8 -> 9 migration. Back up DATA_DIR before deployment. A downgrade requires restoring the schema 8 backup.

## Release gate
Do not promote this candidate until CI is green and manual smoke tests cover login, queue, ticket editing/replies, project configuration, Administration Center, customer portal, LDAP/SSO, SMTP/mail ingestion, GitHub integration, updater and rollback.
