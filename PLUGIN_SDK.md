# External plugin connector protocol — API 1

Plugins are separate repositories and separately deployed processes/services. Desk does not execute uploaded JavaScript. Installation registers a manifest; an administrator explicitly configures the connector endpoint, projects and permissions before enabling execution.

## Manifest

```json
{
  "id": "example.connector",
  "name": "Example connector",
  "version": "1.0.0",
  "serviceDesk": ">=2.2.0",
  "capabilities": ["integration.connector", "scheduled.job"],
  "permissions": ["ticket.read", "scheduled.job", "ticket.comment"],
  "description": "Neutral external connector"
}
```

Register with POST /api/desk/plugins. Configure using POST /api/desk/v22/plugins/example.connector/connector:

```json
{"version":0,"url":"https://connector.example/execute","project_ids":[1],"permissions":["ticket.read","scheduled.job"],"allow_private":false}
```

The generated secret is shown once to the administrator, encrypted at rest and omitted from subsequent status responses. Private HTTP must be enabled explicitly; DNS pinning, blocked local/metadata destinations, TLS validation and redirect rejection apply. Global loopback addresses are never allowed.

## Jobs

POST /api/desk/v22/plugins/example.connector/jobs with ticket_id, action, run_at and request_key. The caller must have access, the plugin must be enabled and ticket.read + scheduled.job must be explicitly granted. A changed ticket version pauses execution for review. Duplicate request keys cannot change payloads.

Desk POSTs JSON to the connector with api_version, job_id, idempotency_key, action, public ticket context and actor_id. X-Desk-Plugin-Signature is HMAC SHA-256 over the exact UTF-8 request body using the connection secret. Idempotency-Key identifies the operation. The external connector must keep durable receipts: process restarts can retry a delivery whose acknowledgement was lost.

HTTP success means **delivered**, not that an external account or service was changed. After acknowledged delivery the connector may report a result using POST /api/plugins/example.connector/jobs/JOB_ID/result with Bearer authentication:

```json
{"status":"completed","message":"Operation completed and verified by connector"}
```

Only completed/failed are accepted. Duplicate identical results are harmless; conflicting results are rejected. Revoked/disabled connectors and actors without current access cannot write results.

## Scoped ticket API

- GET /api/plugins/PLUGIN_ID/tickets/TICKET_ID requires ticket.read and returns public core fields only.
- POST /api/plugins/PLUGIN_ID/tickets/TICKET_ID/comments requires ticket.comment, an authorized job_id, current ticket version and Idempotency-Key. Public replies only; no direct DB access or impersonation of arbitrary users.
- Connector permissions are rechecked against both manifest and administrative grants, as well as current project/account state.

## Event subscriptions and workflow conditions

API 1 manifests may declare `subscriptions` containing ticket_created, ticket_updated, status_changed and comment_added. Subscriptions require event.listener and scheduled.job capabilities, plus explicit event.listener, scheduled.job and ticket.read grants. Private comments are excluded. Connector configuration selects an execution_user_id (default: the configuring administrator); the account must have current work access to every scoped project. Each delivery retains both the technical actor and business_actor_id/event_id. Event receipts and job request keys prevent duplicate enqueue on retries; the connector must still deduplicate external execution.

A manifest may declare workflow.condition and request its permission. Project process settings bind a target status to `{plugin_id,action}`. A scheduled check for the current ticket version must return `{"status":"completed","condition":true,"message":"Verified"}` through the authenticated result endpoint. A false/missing/failed/stale proof blocks the transition. Ticket changes, connector changes, manifest updates or permission revocation invalidate proof use. Core performs no synchronous network call inside a ticket transaction.

Manifests may declare dependencies as `[{"id":"base.plugin","minimum":"1.0.0"}]` and apiVersion:1. Enable and execution validate dependency availability/version. Updating a manifest disables it and pauses pending jobs for explicit review; changed permissions never grant themselves automatically.

## Declarative UI and settings

With `ui.extension` declared and granted, a manifest can define bounded `hooks`. Ticket panels and actions are rendered by core with escaped text; no uploaded JavaScript, HTML, styles or external iframes execute. A ticket.action declares an action identifier and typed fields (text/number/date/checkbox/select); POST jobs with hook_id validates input against that exact declaration and the current role/project grants. Use the authenticated result endpoint with a bounded `data` object whose keys match declared panel/widget fields. Unknown fields and secret input fields are rejected.

admin.settings/project.settings hooks may also declare password fields. GET/POST `/api/desk/v22/plugin-settings/PLUGIN_ID/PROJECT_ID` uses project ID 0 for global administrator settings. POST requires hook_id, version and input. Secret values are encrypted with master.key, omitted from reads, and retained when submitted empty. Configuration is delivered only to the owning connector when `settings.read` is explicitly granted; it never enters the job history payload. Configuration changes invalidate queued jobs and workflow proofs. The connector receives `settings.global` and `settings.project`, keyed by hook ID, over its configured transport.

Example hook:

```json
{"id":"verify","kind":"ticket.action","label":"Verify service","action":"verify","fields":[{"key":"mode","label":"Mode","type":"select","options":["check","review"],"required":true}]}
```

Declare the matching capability and scheduled.job; administrative grants remain separate from the manifest. Hook role lists contain admin/manager/agent. Public portal panels currently render declarative metadata only; dynamic job results remain limited to their authorized job reader.

## Remaining capability boundary

This candidate implements external connector jobs, event subscriptions, scoped ticket access, asynchronous workflow conditions, typed settings, ticket panels and action forms. Migration runners, automation action/trigger integration, dashboard mounting and request-form field import remain pending. Arbitrary uploaded UI/code is outside the isolated connector model. Their presence in the registry capability list does not establish runtime support. See VALIDATION_2.2.0.md for remaining release requirements.

## Lifecycle

Disable pauses queued jobs. Uninstall requires disabling the plugin and removes connection secrets; job/audit history remains. Resume rechecks permissions and current ticket state. No LDAP/AD or other business implementation is included in Desk.
