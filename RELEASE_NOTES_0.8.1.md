# Service Desk 0.8.0 SP1 (0.8.1)

Service Pack 1 for the 0.8.0 line.

## Fixes

- System language is now a single global administrator setting instead of a per-browser preference.
- English is the default system language.
- Polish can be selected globally from System Settings.
- The selected language applies to authenticated users, customer portals and public screens.
- Removed the floating per-user EN/PL language switch.
- Added regression coverage for the global language setting.
- Release publishing now rebuilds 0.8.x images when application code changes, not only when `package.json` changes.

## Upgrade

This release keeps database schema version 8 and can be installed directly over 0.8.0.

The updater requires a stable numeric version, so this Service Pack is published technically as **0.8.1** while representing **0.8.0 SP1**.
