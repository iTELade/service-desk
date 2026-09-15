# Service Desk 1.1.2

Service Desk 1.1.2 improves the day-to-day agent workspace with configurable queues, protected attachments and permission-aware global search.

## Agent queues

- Per-user, per-project queue preferences.
- Configurable visible columns and drag-and-drop column order.
- Primary and secondary sorting.
- Quick filters for open, assigned to me, unassigned, waiting for customer, oldest and SLA-risk views.
- Existing saved views remain available and can be opened from the queue workspace.
- Queue configuration is restricted to staff and never bypasses server-side project/ticket authorization.

## Attachments

- Attach files to accessible tickets from the web UI.
- Public and internal attachment visibility.
- Internal attachments require staff access to the ticket.
- Inbound IMAP attachments are imported for new email tickets and email replies.
- Maximum attachment size is 2 MB per file in this release.
- Executable/script/active HTML/SVG attachment types are rejected.
- Files use random non-guessable IDs and store SHA-256 checksums.
- Attachment metadata/bytes are stored in protected persistent application data and included in the normal SQLite backup.
- Every list/download operation revalidates ticket access; customer users cannot retrieve internal attachments.
- Rejected IMAP attachments are reported without discarding an otherwise valid email message.

## Global search

- New global search in the application header.
- Search accessible tickets by key, title and description.
- Exact ticket keys such as `ITA-123` rank first.
- Staff search can also return authorized users, organizations and Assets/CMDB records.
- Customer users do not receive the global internal user directory.
- Search results are filtered server-side by current project/ticket permissions.
- Search contract includes a Knowledge Base result collection for the later separate KB integration.

## Compatibility

- Version: **1.1.2**
- Database schema: **8**
- No schema-version migration is required. 1.1.2 feature tables are created idempotently.
- Existing fixed roles remain unchanged: Global Administrator, Project Manager, Agent and Customer.
- Existing GitHub OAuth/public-project behavior from 1.1.1 remains supported.

## Validation

Release CI runs dependency installation, static/syntax checks, the complete automated test suite and upgrade-script shell validation before publication. External production mailbox, LDAP/OIDC and reverse-proxy environments are outside CI and should be smoke-tested after deployment.
