# Service Desk 2.2.0 — release gates

## Observed evidence

- Actual 2.1.0 server code → current server migration passed locally: existing login, private comments, key numbering and encrypted SMTP settings survive. The real backup script restored current encrypted plugin settings; pre-upgrade backup boots with 2.1.0. CI now runs scripts/upgrade-regression-v22.mjs as a release gate.
- Local syntax checks pass for the implementation candidate.
- Local application suite: 309 tests passed, including deferred automation plugin actions, signed trigger deduplication, request-bound delayed jobs and global settings UI coverage. Final CI rerun remains required.
- New platform tests cover migration/idempotence, blueprint preview/activation, approvals, dependencies, participants, recycle/restore, query grammar, bulk rollback, connector revocation and passkeys.
- Real WebAuthn signature verification is exercised with synthetic credential data, including synced zero-counter passkeys, replay, origin and user-verification rejection.
- Synthetic 10,000-ticket scenario passed locally. This is not a concurrent-production benchmark.
- CI on f478090d1d291be0d99a9e587db21b71c54333f1 found a staff-only project check accidentally applied to the customer extension contract. Portal regression coverage and authorization fix are added locally for the next run.
- CI on 44d90c8b6317e04767cce86d9b071e99c748b0a1 passed the complete main test job, including workspace, visual regression and upgrade checks; Desk–KB passed all three engines. Platform WebKit passed, while Chromium/Firefox exposed a stale attachment-list test navigation; explicit reload is added for the next run.
- CI on acc690343619e2efcfe4f9d96ced8951a63b8546 passed existing workspace regression in Chromium, Firefox and WebKit, as well as all Desk–KB matrix jobs. It found a settings-section loading race and a platform test fixture using a missing ticket ID; fixes are pending the next CI run.
- Local browser installation failed because downloads returned invalid/truncated archives. Browser tests must run in GitHub Actions; no local browser result is claimed.

- CI on d2b03cbb676cf545ca145443ffb0eea8a7fc4cab passed the main job, the real upgrade job and all Desk–KB engines. Platform tests exposed a corrupt PNG fixture and a plugin-settings route guard; fixes and PDF canvas acceptance tests are prepared for the next run.

- Versioned process snapshots now retain core and plugin transition conditions. Explicit migration previews differences, verifies a fresh preview token and invalidates queued jobs/approvals. New work follows current project settings.

- CI on 2a8b8429723ab54f21b9fdff60eb2473ab2dccca passed all three platform engines, including PDF/image preview, typed settings/actions, migration queue/cancellation and Chromium virtual passkey registration/passwordless login. Desk–KB and real upgrade/backup/restore jobs also passed. The main regression job was still running when recorded.
- New CI builds isolated production images for AMD64 and ARM64 without publishing, then checks startup/login, assets, restart persistence and backup. The smoke script passed locally against an isolated server; this does not establish container results until those jobs pass.

- CI on 9ba5117434b73a72773bd031417ef0241cecb2c9 passed every job: application/browser/workspace/visual, all platform and Desk–KB engines, real upgrade/restore, and AMD64/ARM64 production container startup/restart/backup. New template mapping and dependency changes still require their own CI run.

- Retried CI on 3677e3b5dbabf430a73ee9011fad6321d5e04b6a completed successfully. The earlier main browser ECONNRESET did not reproduce. All application/browser/workspace/visual, platform/KB, upgrade and container jobs passed. New automation mapping changes require their own CI run.

- CI on abf1f5369d083202d60bcaa5e872e1281d360d14 passed every job, including the browser scenario that maps a role/integration, activates a package and executes its copied automation against the copied form. Process/responsibility additions still need their final CI run.

- CI on 3aa44e2ebdade745d7fffab0a90402e5e0cf581c passed all jobs, including selected-person responsibility preview, process/attachment configuration mapping and activation followed by real copied-rule execution. Declared plugin templates, operational health and late-acknowledgement protections require the next CI run.

## Required before stable publication

- [ ] CI application, migration and upgrade checks on the final commit.
- [ ] Existing browser/workspace/visual/KB regression in Chromium, Firefox and WebKit.
- [ ] New scripts/platform-regression.mjs on all three engines; Chromium virtual passkey scenario.
- [ ] Physical iPhone registration and login, plus desktop-to-iPhone hybrid flow. A virtual authenticator is not this evidence.
- [ ] Full roadmap coverage review: do not infer completion from registry/API/table presence.
- [ ] Complete plugin extension hooks beyond external connector/jobs or obtain a revised scope; no silent scope reduction.
- [ ] Complete project-package portability of automation/SLA identity mappings and required plugin dependencies.
- [ ] Verify customer layout configuration, attachment previews, configuration recycle/expiry/purge and all notification channels/digests end-to-end.
- [ ] Complete period-report team/reopen metrics and comparable concurrent load tests.
- [x] Real upgrade and backup/restore smoke, including master.key.
- [ ] Final manifest checks and multi-architecture GHCR build/container smoke.

## Candidate limitations

The branch contains substantial implementation, not the complete accepted 2.2.0 scope. External connector jobs, event subscriptions and workflow condition proofs are implemented; typed settings, ticket panels/actions and safe declared result fields are implemented. Form-definition import and project dashboard widgets are implemented; automation actions and signed triggers are implemented; external migration coordination and enablement gates are implemented. Template export now preserves form-specific SLA using logical form aliases, team-protected fields with explicit member mappings, complete form settings and required/optional plugin dependencies. Logical account roles, actor/form references and mail/webhook/organization mappings are implemented, with explicit plugin scope consent and rollback-only preview through real validators. Portable process settings, responsibility rules and selected-person previews are implemented. Remaining package work includes queue-expression portability and complete blueprint revision/editing UX. Recycle handles tickets, not every configuration resource. Notification preferences cover application events/quiet hours; full email scheduling/digests are pending. Project customer section order is applied when configured, while per-request-type field ordering remains pending. Local PDF.js canvas rendering, image preview and shared storage quotas passed browser acceptance in all three engines. Report quantiles/aging, team groups and reopen counts are implemented; comparable concurrent benchmarks are pending.

These are known uncompleted acceptance requirements. Do not publish this branch as a fully delivered stable 2.2.0 or mark the roadmap checklist complete.
