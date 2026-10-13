# Project packages — 2.2 candidate

A package contains configuration, never tickets, history, directory credentials or connector secrets. Drafts are project configuration drafts. They do not store partially completed ticket forms.

Forms and teams use logical aliases. SLA rules refer to request_type_aliases; field privacy refers to allowed_team_aliases. Activation maps teams to explicit active agent accounts and creates new form/team IDs. Form defaults, conditional fields and hidden base fields retain their configuration.

Automation rules retain logical actor_role, `{role:"role_1"}` account references, `{form:"form_1"}` form conditions and `{integration:"integration_1"}` references. Each role declares a project_role: requester, agent or manager. Exports replace account identifiers with generic role labels; activation requires selection of current accounts. Internal projects reject requester roles. Selected actors must have current work access.

Example activation mapping:

```json
{
  "project": {
    "key": "NEW",
    "name": "New project",
    "teams": {"team_1": [12, 13]},
    "roles": {"role_1": 12},
    "integrations": {"integration_1": 7},
    "plugin_scopes": {"example.connector": true}
  }
}
```

Integration declarations identify email templates, outbound webhooks or organizations. Choose an existing authorized resource in the destination instance. Mail templates and outbound webhooks are copied to the new project; webhook credentials are retained encrypted within that instance and never included in the package. Organizations are linked to the project. The original resources are not changed.

Plugin automation requires explicit consent to add the new project to the selected connector's scope. Current manifest and connector grants are rechecked; no missing grants are silently added. Its existing queued jobs are paused because the connector revision changes. The execution account must remain active and receive work access to the new project. No external service is called during preview or activation.

POST `/api/desk/v22/drafts/ID/preview` runs the same project/form/workflow/integration validators as activation inside a rolled-back SQL savepoint. The preview creates no persistent project, key, credential, job or audit entry. POST `/api/desk/v22/drafts/ID/activate` accepts the reviewed mapping, draft version and preview_fingerprint. The fingerprint binds integration/connector revisions; changed configuration requires a new preview. Activation is atomic, and stale or revoked mappings fail before persistent effects.

Required plugin version dependencies block activation; missing optional dependencies produce warnings. Existing projects are never overwritten by updating a template.

Remaining project-package requirements are tracked in VALIDATION_2.2.0.md; the existence of the package API does not mark the full roadmap complete.

## Process and responsibility configuration

Packages retain validated transition requirements, declared plugin conditions, optional portal section order, attachment limits and process-versioning settings. Arbitrary project settings are excluded. Unknown fields/statuses or unavailable condition plugins fail the same validators during preview and activation. Plugin workflow conditions require the same explicit new-project scope consent as plugin automation.

Responsibility rules retain department/location criteria, logical team aliases, approver roles and optional organization integration aliases. Activation creates the mapped team/rule and validates active approvers with project access. It does not initiate an approval run.

Optional sample_person_id in preview uses the selected active human account's current Desk attributes and organization membership to show the responsible team and approver accounts. Missing or ambiguous matches require manual assignment. The person is not exported into the package. Changes to those attributes after preview invalidate the preview fingerprint; no directory operation or external task is executed.
