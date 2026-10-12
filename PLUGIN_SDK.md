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

## Current capability boundary

This candidate implements the external connector/job/ticket contract. The registry can describe other capabilities, but declarative ticket panels, custom UI, executable workflow conditions, migration runners and arbitrary event listeners are **not yet implemented runtime hooks**. Do not advertise them as available merely because their manifest capability is accepted. This limitation is a release blocker if the full roadmap requires those hooks.

## Lifecycle

Disable pauses queued jobs. Uninstall requires disabling the plugin and removes connection secrets; job/audit history remains. Resume rechecks permissions and current ticket state. No LDAP/AD or other business implementation is included in Desk.
