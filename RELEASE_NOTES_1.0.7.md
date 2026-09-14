# Service Desk 1.0.7

## Settings Center static asset hotfix

1.0.6 referenced the native Settings Center assets in index.html, but the Node HTTP server did not expose them in its explicit static asset map. Browsers therefore received HTTP 404 for settings.css, settings-center.js and settings-nav-complete.js and remained on the loading placeholder.

### Fixed

- serve /settings.css, /settings-center.js and /settings-nav-complete.js;
- keep /#/settings on the native organized Settings Center;
- add regression coverage for every Settings Center asset referenced by index.html;
- bump public cache keys and application version to 1.0.7.

Database schema remains 8. No migration is required.
