# Service Desk 1.4.3

Service Desk 1.4.3 rebuilds the **customer-facing portal experience** and fixes release-note rendering in the updater.

Database schema remains **8**. No migration is required.

## Customer portal redesign

- Separates the customer experience visually from the agent workspace.
- Rebuilds the portal landing page around a neutral support hero, help search, portal/service discovery and recent requests.
- Rebuilds project portals as a centered support surface with a searchable request catalog.
- Request types are presented as concise service rows rather than large agent-style cards.
- Customer request search is kept separate from service discovery.
- `My requests` is simplified for customer use instead of exposing the agent queue visual hierarchy.
- Responsive behavior is retained for narrow screens.

## Customer ticket experience

- Customer ticket detail is presented as a centered support case rather than an agent workspace.
- The ticket identity, current state and customer actions stay at the top of the case.
- The comment composer is promoted above the activity stream.
- Activity becomes the primary reading flow.
- The contextual rail is reduced and visually subordinated to the conversation.
- Attachments and history remain available without dominating the case.

## Request creation

- Customer ticket creation uses a dedicated portal dialog with an explanatory header and calmer form hierarchy.
- Existing request forms, custom fields, permissions and validation remain unchanged.

## Updater changelog

- GitHub release notes are no longer displayed as raw Markdown inside a `<pre>` block.
- Headings, lists, emphasis, inline code, safe HTTPS links and fenced code blocks are rendered as readable release notes.
- Rendering is DOM-based and does not inject raw release-note HTML.
- Long changelog content wraps correctly and no longer forces horizontal page scrolling.

## Compatibility

- Application version: **1.4.3**.
- Database schema: **8**.
- No database migration.
- The 1.4.2 queue live-refresh guard remains active.
- Agent queues, workflow, SLA, automation, LDAP/AD, SSO/OIDC, mail, Assets/CMDB, GitHub integration and permissions are unchanged.
