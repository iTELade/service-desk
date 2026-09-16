# Service Desk 1.2.1

Service Desk 1.2.1 is a focused updater UX and reliability hotfix for the 1.2 interface release. Database schema remains **8** and no migration is required.

## Update experience

- The **Wersja i aktualizacje** page now polls update status continuously while it is open.
- A visible progress bar presents the updater phases: release verification, image pull, data backup, new-version startup, health verification and final commit.
- The current progress remains visible when the application container temporarily stops during the update. The page reports that it is waiting for the service instead of appearing frozen.
- Opening or reloading the update page while an update is already running reconnects to the existing updater job and restores the progress display.
- After a successful update the browser automatically reloads once, so the newly installed frontend is loaded without requiring a manual refresh.
- A completed rollback also triggers one refresh so the browser is synchronized with the restored application.
- Automatic reload is guarded by the updater job ID in session storage to prevent reload loops.

## Compatibility and safety

- The updater backend, backup/rollback process, fixed role model and project authorization rules are unchanged.
- Schema version remains **8**.
- The progress percentage represents updater milestones, not byte-level image download progress.
- Existing 1.2.0 installations can update directly to 1.2.1.

## Validation

CI validates syntax, the complete automated test suite and the upgrade shell script. The hotfix adds regression coverage for progress rendering, restart/offline state, cache busting and one-time automatic reload.
