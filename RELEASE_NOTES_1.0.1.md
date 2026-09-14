# Service Desk 1.0.1

Service Desk 1.0.1 finishes the administration and access-control cleanup started in 1.0.0 and hardens the GitHub Issues intake workflow.

## Access model
- The supported roles are Global Administrator, Project Manager, Agent and Customer.
- Project Manager and Agent access is constrained to assigned projects.
- Customers remain portal-only and are constrained by project/organization visibility.
- LDAP can map groups to project Manager/Agent/Customer membership and to Global Administrator.
- Legacy v8 role tables remain in schema 8 only for upgrade compatibility; the application no longer uses or exposes custom global roles or permission sets.

## Administration Center
- /#/settings routes directly to the unified Administration Center.
- Administration is grouped into General, Identity & Access, Service Management, Communication, Integrations, Assets / CMDB and System.
- Legacy permission-matrix and 0.8-era administration wording is removed from active UI.

## GitHub Issues
- Supported flow: GitHub Issue → Service Desk ticket → GitHub comment with the ticket URL → mandatory GitHub Issue close.
- Configuration includes named request type, reporter/service account, token, label-to-priority mapping, closing comment, polling interval and enabled state.
- Integrations can be added, edited, tested, enabled/disabled and deleted in Administration.
- Imports are deduplicated. Ticket creation failure leaves the GitHub Issue open. Comment failure prevents close. A close retry does not duplicate a successfully posted comment.
- Transfer history and last status/error are presented in human-readable form.
- 1.0.1 continues to use polling; it does not claim webhook or bidirectional synchronization.

## Version and upgrade
- Application version: **1.0.1**.
- Database schema remains **8**; no schema migration is required.
- Front-end assets use the 1.0.1 cache-busting version.
