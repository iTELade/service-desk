# Service Desk 1.1.0

## Automatic requester accounts

- Inbound email can automatically create a customer account for an unknown sender, add project membership, create the ticket under that requester and send a one-time account invitation. New mail channels enable this behavior by default; domain/project access restrictions remain enforced.
- GitHub Issues now use the actual GitHub author as the Service Desk reporter. The configured account remains the technical creator/fallback so audit history still records the integration actor.
- With a GitHub SSO provider configured using issuer `https://github.com`, a first Issue automatically provisions a passwordless customer account mapped to the immutable GitHub user ID. The customer signs in with GitHub from the normal Service Desk login page.
- If GitHub SSO is not configured, a public unique GitHub email plus working SMTP can be used to send a one-time local account invitation. If neither secure login path is available, the Issue is left open and the integration reports the configuration error instead of creating an unusable account.

## GitHub OAuth

The existing SSO provider screen now accepts `https://github.com` as a GitHub OAuth provider. Configure a GitHub OAuth App with callback URL `<APP_URL>/api/sso/callback`, Client ID and Client Secret. The login flow requests `read:user user:email` and links by immutable GitHub user ID, never by email alone.

Database schema remains **8**. No migration is required.
