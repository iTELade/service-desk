# Service Desk 2.2.0 — release gates

## Observed evidence

- Actual 2.1.0 server code → current server migration passed locally: existing login, private comments, key numbering and encrypted SMTP settings survive. The real backup script restored current encrypted plugin settings; pre-upgrade backup boots with 2.1.0. CI now runs scripts/upgrade-regression-v22.mjs as a release gate.
- Local syntax checks pass for the implementation candidate.
- Local application suite: 318 tests passed, including deferred automation plugin actions, signed trigger deduplication, request-bound delayed jobs and global settings UI coverage. Final CI rerun remains required.
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

- Complete form revisions now retain defaults, grouping, icons, order and base fields. Settings restore uses current validators within a rolled-back validation transaction; derived service settings/catalogue are synchronized after restore and package activation.
- CI on 3ff1839988489841e41b9a4937bf1b41aa2af54d passed the main, Chromium/Firefox platform, KB, upgrade and container jobs. WebKit timed out cancelling an immediately due migration; the fixture now schedules that migration for a maintenance time, with actual dispatch/cancellation still covered in runtime tests. Failure diagnostics include the visible notice for the next run.

- CI on f1d83917618b36b2f8049d94d9cd07a11cf01b7d passed all jobs except platform WebKit. All WebKit functional flows passed, but the final exception check caught a network/access-control error fetching /api/me. The next run uses IPv4 for Firefox/WebKit and records request failures, stacks and page URLs; the exception gate remains enabled.
- Installation generations now survive unregister/reinstall; old jobs cannot resume under a new installation with the same plugin ID. Comments, results (including duplicate results) and follow-up scheduling reject stale source snapshots. Progress comments explicitly require request-bound jobs so the comment's ticket-version increment does not invalidate the job's result.

- Per-request-type customer section/tab layouts and public field ordering are implemented with project-manager configuration, logical form aliases in packages, historic snapshot privacy filtering and keyboard-accessible tabs. Unit privacy/portability tests pass; the new browser scenario still needs its own CI result.

- CI on b920ba2479e0862a5120cfdde4d4da7fcfdff6c7 passed every job, including platform WebKit with the exception gate still enabled, main browser/workspace/visual, KB, upgrade and both production container architectures.
- CI on c87669c3b64cdca9bc1a782887c1d6a5303b2b58 timed out waiting for the new customer-layout form, without a browser exception. A render/listener readiness race and stale route metadata are the suspected causes. The next run waits for the explicit mount marker and reloads current metadata; the administration route now fetches authoritative project settings/version rather than relying on stale session metadata.
- The isolated 10,000-ticket benchmark now runs eight distinct authenticated agents in parallel: 80 real creates with core automation, queue/detail reads, atomic comments and idempotent repeats, then a same-version write race. Locally 408 requests completed in 15.3 s (~27 requests/s), p50 94 ms, p95 717 ms, p99 6677 ms. All keys and automation/comments remained unique; one racing write succeeded and seven returned 409. This establishes concurrent correctness, not production capacity or IMAP/SMTP throughput. Per-operation timings are included for subsequent diagnosis/comparison.

- All platform engines passed the customer-layout configuration, privacy, field ordering and keyboard tab scenario on c00546b9a4c40d2181683d81eb5d3c1a30902feb; final main/container completion was still pending when recorded.
- Event dispatch now yields after at most 100 events or roughly 25 ms, completing each individual event/module transaction before yielding. A durable backlog continues through setImmediate while the worker is running; stop cancels that continuation. Reentrant calls remain blocked, and event/module delivery receipts retain deduplication. A 250-event test verifies ordered, exactly-once delivery across batches. In the same synthetic concurrent workload, p99 dropped from 6594 ms to 542 ms and create maximum from 9271 ms to 1350 ms; p50 increased from 75 ms to 235 ms as background work was shared more evenly. Overall throughput remained ~30 requests/s. These are local comparative observations, not a production SLA.

- CI on 9ed7115fa94bc16d77ba59bf77ed0b6dd11aba1b passed all jobs, including the concurrent agent workload and bounded durable event dispatch, existing main regressions, all platform/KB browsers and both container architectures.
- Plugin RPC comments now retain technical author/business initiator separately, bind receipts to job ID and notify the initiator using the technical author for recipient exclusion. Local tests verify provenance, repeated comments and absence of automatic technical-account watchers.
- Template/draft advanced editing, duplication and restorable configuration revisions are implemented. Restore creates a new version, checks resource ownership/current version and prevents activated draft edits. Stale activation previews are rejected. New unit tests pass; the browser edit/history/restore scenario awaits final CI.

- CI on d3073d4d8a60964b3cb43f8c860e31ce135535dd found the history scenario attempted to click a restore button inside a collapsed details element. The test now expands the revision summary before clicking; no browser exception was reported.
- Approval withdrawal is available to the current reporter or project manager with a reason and current run revision. It preserves vote history, cancels the latest approval and pauses queued plugin work. Plugin snapshots now bind approval revision as well as run ID; late results cannot reuse withdrawn approval. New review uses a separate approval run. Decisions past the configured deadline fail without recording a vote; new deadlines must be future dates. Unit tests pass; customer withdrawal browser acceptance awaits CI.

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

The branch contains substantial implementation, not the complete accepted 2.2.0 scope. External connector jobs, event subscriptions and workflow condition proofs are implemented; typed settings, ticket panels/actions and safe declared result fields are implemented. Form-definition import and project dashboard widgets are implemented; automation actions and signed triggers are implemented; external migration coordination and enablement gates are implemented. Template export now preserves form-specific SLA using logical form aliases, team-protected fields with explicit member mappings, complete form settings and required/optional plugin dependencies. Logical account roles, actor/form references and mail/webhook/organization mappings are implemented, with explicit plugin scope consent and rollback-only preview through real validators. Portable process settings, responsibility rules and selected-person previews are implemented. Remaining package work includes queue-expression portability and additional service/asset configuration mappings; revision/editing/duplication operations are implemented using an advanced JSON editor. Recycle handles tickets, not every configuration resource. Notification preferences cover application events/quiet hours; full email scheduling/digests are pending. Project customer section order is applied when configured, with per-request-type sections/tabs and public field ordering now implemented; new browser acceptance is pending. Local PDF.js canvas rendering, image preview and shared storage quotas passed browser acceptance in all three engines. Report quantiles/aging, team groups and reopen counts are implemented; eight-agent concurrent correctness coverage is implemented; production capacity, high-percentile latency and mail-worker concurrency remain unverified.

These are known uncompleted acceptance requirements. Do not publish this branch as a fully delivered stable 2.2.0 or mark the roadmap checklist complete.
