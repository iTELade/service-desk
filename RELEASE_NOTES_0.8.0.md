# iTELade Service Desk 0.8.0

## Scope

This package targets the 0.8.0 tracking scope and implements the requested tickets #1–#13, excluding #14 Knowledge Base integration as requested.


### Account security — QR setup and hardware security keys
- TOTP setup now displays a locally generated QR code; the MFA secret is not sent to an external QR service
- manual TOTP secret remains available as a fallback
- multiple FIDO2 / WebAuthn hardware security keys can be registered per account
- hardware keys can be used as the second factor after password or SSO login
- keys can be named and removed from the account security dialog
- registration, removal and successful hardware-key use are recorded in the audit log
- WebAuthn is bound to the configured `APP_URL` origin/RP ID and therefore requires HTTPS in production
- ES256 / P-256 FIDO2 credentials are supported in 0.8.0

### #1 LDAP global Administrator mapping
- explicit Administrator mapping by LDAP group DN
- explicit Administrator mapping by LDAP login or e-mail
- automatic grant/revoke during directory synchronization
- LDAP group membership persisted for RBAC group assignments

### #3 English-first i18n
- English becomes the default/fallback UI language
- Polish remains selectable
- runtime DOM translation layer covers the existing Polish-first interface without requiring a rewrite of every legacy screen
- language switcher is available globally
- 0.8 Control Center is English-first

### #4 Custom global RBAC
- custom global roles
- fine-grained permission list
- assignments to users and LDAP groups
- effective-permissions endpoint
- protected built-in role templates
- role changes recorded in audit

### #5 SLA business hours / holidays / escalations
The current 0.7.1 code already contains business calendars, time zones, holidays, pause states, separate SLA metrics and workflow automation hooks. 0.8.0 keeps those features and exposes them as part of the supported release scope.

### #6 Incoming e-mail tickets
The current code already includes per-project IMAP/SMTP channels, creation/reply threading, sender/domain controls, duplicate protection and receipt history. 0.8.0 treats this channel as part of the supported release.

### #7 API tokens and outbound webhooks
The current code already contains scoped API tokens, expiration/revocation, idempotent POST handling, webhook signing, retries and delivery history. 0.8.0 keeps this integration layer.

### #8 Advanced audit
- global audit browser
- actor/project/action/date/text filters via API
- JSON details
- CSV export
- RBAC-protected access

### #9 Saved queues / shared views / dashboard
- personal saved filters
- shared views
- default view flag
- project association
- operational dashboard counters
- direct links back to normal queue URLs

### #10 Request approvals
- reusable approval schemes per project / request type
- multi-stage approvals
- any/all approval modes
- approvers by user, global role or project role
- approval decisions and comments
- complete decision history
- automatic creation of approval instances for matching tickets

### #11 Customer organizations
- verified-domain rules
- automatic organization membership by e-mail domain
- organization contacts / notification recipients metadata
- existing shared-ticket visibility remains supported

### #12 Asset lifecycle
- ordered / in stock / assigned / repair / retired / disposed lifecycle
- purchase, warranty and planned replacement dates
- vendor, purchase reference and location
- relationship graph between assets
- activity/history records
- existing ticket ↔ asset links remain supported

### #13 GitHub Issues integration
- repository integration configured from the 0.8 Control Center
- periodic GitHub issue polling
- creates a Service Desk ticket
- stores a permanent GitHub ↔ Service Desk relation
- posts a comment containing the Service Desk URL
- closes the GitHub issue after successful forwarding when enabled
- retries incomplete transfers
- label → priority mapping
- encrypted GitHub token storage

## Deliberately excluded
- #14 Knowledge Base integration is not changed by this 0.8.0 package.

## Upgrade
1. Back up the Service Desk data directory.
2. Apply all patches and copy all files from `NEW_FILES/`.
3. Run `npm install`.
4. Run `npm test`.
5. Restart the container/application.
6. Open `/v8.html` as an administrator and configure the new 0.8 modules.
