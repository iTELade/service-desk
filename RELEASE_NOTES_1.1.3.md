# Service Desk 1.1.3

Service Desk 1.1.3 is a user-interface and stability release focused on making day-to-day work feel closer to Jira Service Management without changing the fixed-role security model or schema.

## Agent workspace and queues

- Denser, clearer queue presentation with a Jira-inspired information hierarchy.
- Compact status, priority, assignee and SLA presentation.
- Sticky queue table header and pagination for long lists.
- Core filters stay visible; less common filters move behind **More filters**.
- Existing saved views, configurable columns and queue preferences from 1.1.2 remain available.
- Same-route background refresh keeps the currently rendered queue visible instead of replacing the whole workspace with a full-screen loading state.

## Translation stability

The global browser translation layer now translates complete labels instead of replacing arbitrary substrings. This fixes repeated text corruption such as `Normalnynyny` and `Sortowanieowanie` while keeping Polish, English and German system languages.

## Administration Center

- Clearer visual grouping and denser cards.
- Search field for locating administration sections such as SMTP, GitHub and LDAP.
- Improved navigation state, status badges and overview presentation.

## Customer portal

- Reworked support landing page with a clearer hero, direct access to personal tickets and stronger service cards.
- Public project portals receive the same visual hierarchy while preserving anonymous read-only and authenticated-write access rules.

## Compatibility

- Schema version remains **8**; no database migration is required.
- Existing 1.1.2 queue preferences, attachments, IMAP attachment import and global search remain compatible.
- Fixed global roles and project-scoped authorization are unchanged.

## Validation

The release is validated by automated syntax and regression tests, including dedicated 1.1.3 checks for translation idempotence, static asset wiring and queue refresh behavior. Production browser smoke testing on a specific deployment is not part of the repository CI pipeline.
