# Service Desk 2.2.0 — physical passkey acceptance

Release gate: OPEN. Browser virtual authenticators do not prove actual iPhone or cross-device operation.

Test environment: HTTPS origin matching WebAuthn RP ID; test-only active local account; iPhone with current iOS and Safari; desktop Chromium/Firefox; record software/device versions and tested commit.

Required manual checks:
1. Register a discoverable passkey using iPhone Safari and local biometric confirmation.
2. Log out and sign in passwordlessly on the same iPhone.
3. On a desktop choose passkey from another device, complete the browser-managed QR/hybrid flow using iPhone, then sign in successfully.
4. Register two keys; revoke one; verify that revoked credential is rejected and the other works.
5. Disable the account and verify neither iPhone nor desktop can authenticate.
6. Verify local recovery, user-verification requirements, event audit, and no disclosure of secrets.
7. Retest existing password, TOTP, hardware FIDO2, LDAP and SSO logins.
8. Verify rejection of replayed/expired challenges, unexpected origins, declined device confirmation and user-verification failures.
9. Recheck after restart and backup restore.

For each step record PASS/FAIL, date, tester, browser, device, Desk commit, masked evidence and linked bug ID. No PASS claims without evidence. Stable v2.2.0 remains blocked until this gate and all remaining product acceptance gates close.
