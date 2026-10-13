# Service Desk 2.2.0 — release gates

## Observed evidence

- Actual 2.1.0 server code → current server migration passed locally: existing login, private comments, key numbering and encrypted SMTP settings survive. The real backup script restored current encrypted plugin settings; pre-upgrade backup boots with 2.1.0. CI now runs scripts/upgrade-regression-v22.mjs as a release gate.
- Local syntax checks pass for the implementation candidate.
- Local application suite: 296 tests passed, including deferred automation plugin actions, signed trigger deduplication, request-bound delayed jobs and global settings UI coverage. Final CI rerun remains required.
- New platform tests cover migration/idempotence, blueprint preview/activation, approvals, dependencies, participants, recycle/restore, query grammar, bulk rollback, connector revocation and passkeys.
- Real WebAuthn signature verification is exercised with synthetic credential data, including synced zero-counter passkeys, replay, origin and user-verification rejection.
- Synthetic 10,000-ticket scenario passed locally. This is not a concurrent-production benchmark.
- CI on f478090d1d291be0d99a9e587db21b71c54333f1 found a staff-only project check accidentally applied to the customer extension contract. Portal regression coverage and authorization fix are added locally for the next run.
- CI on 44d90c8b6317e04767cce86d9b071e99c748b0a1 passed the complete main test job, including workspace, visual regression and upgrade checks; Desk–KB passed all three engines. Platform WebKit passed, while Chromium/Firefox exposed a stale attachment-list test navigation; explicit reload is added for the next run.
- CI on acc690343619e2efcfe4f9d96ced8951a63b8546 passed existing workspace regression in Chromium, Firefox and WebKit, as well as all Desk–KB matrix jobs. It found a settings-section loading race and a platform test fixture using a missing ticket ID; fixes are pending the next CI run.
- Local browser installation failed because downloads returned invalid/truncated archives. Browser tests must run in GitHub Actions; no local browser result is claimed.

- CI on d2b03cbb676cf545ca145443ffb0eea8a7fc4cab passed the main job, the real upgrade job and all Desk–KB engines. Platform tests exposed a corrupt PNG fixture and a plugin-settings route guard; fixes and PDF canvas acceptance tests are prepared for the next run.

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
- [ ] Real upgrade and backup/restore smoke, including master.key.
- [ ] Final manifest checks and multi-architecture GHCR build/container smoke.

## Candidate limitations

The branch contains substantial implementation, not the complete accepted 2.2.0 scope. External connector jobs, event subscriptions and workflow condition proofs are implemented; typed settings, ticket panels/actions and safe declared result fields are implemented. Form-definition import and project dashboard widgets are implemented; automation actions and signed triggers are implemented; external migration coordination and enablement gates are implemented. Template export currently excludes external identity-bound automation and generalizes form-specific SLA rules; full mapping is pending. Recycle handles tickets, not every configuration resource. Notification preferences cover application events/quiet hours; full email scheduling/digests are pending. Project customer section order is applied when configured, while per-request-type field ordering remains pending. Local PDF.js canvas rendering and image preview and shared storage quotas are implemented; browser acceptance remains pending. Report quantiles/aging, team groups and reopen counts are implemented; comparable concurrent benchmarks are pending.

These are known uncompleted acceptance requirements. Do not publish this branch as a fully delivered stable 2.2.0 or mark the roadmap checklist complete.
