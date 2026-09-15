# Service Desk 1.1.1

## Public GitHub projects

- External projects can use **Public GitHub** portal access: anonymous visitors may browse tickets and public comments.
- Creating tickets and adding comments still uses the authenticated Service Desk API and requires GitHub SSO for GitHub-only users.
- GitHub-only SSO accounts no longer inherit access to every project configured as "all authenticated users". They are limited to Public GitHub projects plus projects where they have explicit membership.
- Public responses intentionally omit internal notes, private custom fields, SLA internals, e-mail addresses, assignees, organizations and audit/activity history.

Database schema remains **8**. No migration is required.
