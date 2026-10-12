# Service Desk 2.2.0 — release gates

## Observed evidence

- Local syntax checks pass for the implementation candidate.
- Local application suite: 279 tests passed before the final metadata/documentation changes; rerun required after the final edits.
- New platform tests cover migration/idempotence, blueprint preview/activation, approvals, dependencies, participants, recycle/restore, query grammar, bulk rollback, connector revocation and passkeys.
- Real WebAuthn signature verification is exercised with synthetic credential data, including synced zero-counter passkeys, replay, origin and user-verification rejection.
- Synthetic 10,000-ticket scenario passed locally. This is not a concurrent-production benchmark.
- Local browser installation failed because downloads returned invalid/truncated archives. Browser tests must run in GitHub Actions; no local browser result is claimed.

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

The branch contains substantial implementation, not the complete accepted 2.2.0 scope. External connector jobs are implemented, but full executable UI/workflow/event hooks are still pending. Template export currently excludes external identity-bound automation and generalizes form-specific SLA rules; full mapping is pending. Recycle handles tickets, not every configuration resource. Notification preferences cover application events/quiet hours; full email scheduling/digests are pending. Customer layout configuration is stored but its complete rendering contract and PDF/image previews are pending. Report quantiles/aging are present; team/reopen metrics and concurrent benchmarks are pending.

These are known uncompleted acceptance requirements. Do not publish this branch as a fully delivered stable 2.2.0 or mark the roadmap checklist complete.
