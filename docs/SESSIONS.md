# Session Security

Date: 8 November 2026, Asia/Dubai.
This feature does not complete registration, MFA, password reset, or production security acceptance.

## Behavior

- Login creates one database session and one opaque refresh token.
- Access JWTs contain the database session identifier.
- Every protected request verifies account status, role, session ownership, revocation, and expiry.
- The database stores refresh-token hashes, never plaintext refresh tokens.
- Refresh consumes one token and creates its successor within the same session.
- Session expiry is absolute; rotation does not extend it.
- A consumed token triggers revocation of its entire session family.
- Replay leaves independent sessions active.
- Login, refresh, password change, and revocation serialize through the account row lock.
- Logout revokes the current family and invalidates its existing access JWTs.
- Password change requires the current password and revokes every existing session.
- Security events preserve actor, action, session reference, and request metadata without password or token values.
- Security responses carry Cache-Control: no-store.

## Cookie and Browser Controls

Production uses the host-only `__Host-leaseflow_refresh` cookie with Secure, HttpOnly, SameSite=Strict, and Path=/.
Development uses `leaseflow_refresh` without Secure for local HTTP.
The API never returns a refresh token in JSON.
Refresh tokens never enter browser localStorage or sessionStorage.
Access JWTs remain in sessionStorage; XSS prevention remains a separate security requirement.

Login, refresh, and logout require this header:

```text
X-Leaseflow-Session: 1
```

The API also rejects cross-site Fetch Metadata and disallowed Origin values for these operations.
Other account mutations require a bearer access token; cookies alone cannot authorize them.
The browser uses one renewal promise per tab and Web Locks across supported same-origin tabs.
Clients without Web Locks must serialize refresh requests themselves.
Concurrent use of the same refresh token fails closed and revokes the session.
This strict replay policy has no grace window.

SameSite=Strict requires the web application and API to share a site for browser cookie renewal.
Cross-origin same-site deployments require explicit CORS origins and credentials.
Cross-site web/API authentication remains unsupported under this cookie policy.
Production deployment must use HTTPS before cookie authentication can work.

The browser retries each failed protected request at most once after renewal.
It rejects a renewal cookie for another account before retry of private data requests.
A late renewal cannot restore a locally cleared session.
Temporary renewal network errors do not claim successful server logout.
The sign-out interface retains the session and exposes a retry error when server logout fails.
After browser storage disappears, the user must sign in again; automatic cookie-only restoration is not implemented.

## Interface

Every authenticated role can open Security.
The page lists current and other active sessions with device, IP, expiry, and last token-renewal time.
Destructive commands require an accessible confirmation sheet.
Users can revoke one session or sign out all sessions.
Password changes require matching confirmation and preserve values after recoverable failures.
Successful password changes return the user to the login screen.

The public preview demonstrates synthetic session metadata and revocation only.
It does not change real passwords or real server sessions.

## API

| Method | Route                     | Authorization                                  | Result                                             |
| ------ | ------------------------- | ---------------------------------------------- | -------------------------------------------------- |
| POST   | /api/v1/auth/login        | Credentials and session header                 | Access JWT plus HttpOnly refresh cookie            |
| POST   | /api/v1/auth/refresh      | Refresh cookie and session header              | Rotated refresh cookie and access JWT              |
| POST   | /api/v1/auth/logout       | Refresh cookie or valid bearer; session header | Current-family revocation; 204                     |
| GET    | /api/v1/auth/sessions     | Active bearer session                          | Scoped metadata without credentials                |
| DELETE | /api/v1/auth/sessions/:id | Active bearer session; same account            | Session-family revocation; 204                     |
| POST   | /api/v1/auth/logout-all   | Active bearer session                          | Account-wide revocation; 204                       |
| POST   | /api/v1/auth/password     | Active bearer session and current password     | Password replacement; account-wide revocation; 204 |

Unknown or foreign session identifiers return 404.
Invalid, expired, or revoked credentials return 401.
Rejected session headers, origins, or Fetch Metadata return 403.
Password validation failures return 422.
Logout remains idempotent after expiry.

## Configuration and Migration

ACCESS_TOKEN_TTL defaults to 15m and accepts positive s/m/h/d durations up to 1h.
REFRESH_TOKEN_TTL defaults to 30d and accepts positive s/m/h/d durations up to 90d.
These are technical defaults and bounds, not answers to unresolved business or production-policy decisions.

Apply migrations before deployment of the new API:

```bash
npm run prisma:migrate -w api
```

The migration creates AuthSession and links refresh tokens to it.
It revokes all legacy refresh tokens.
Legacy JWTs without a session identifier cannot access protected routes after deployment.
Existing users must sign in again.
Session and token-history cleanup remains subject to the unresolved retention policy.

## Verification

- API unit tests verify cookie transport, replay revocation, ownership, legacy-token rejection, and request controls.
- Production-policy tests verify Secure/HttpOnly/Strict/host-only cookie attributes and TTL validation.
- Web tests verify one-flight renewal, late-response rejection, account isolation, forms, confirmation, and network errors.
- Ten MySQL integration cases verify persistence, rotation, replay, concurrent requests, revocation, and password change.
- Real desktop/mobile browser cases verify login, cookies, renewal, revocation, password change, and logout against MySQL.
- Synthetic desktop/mobile browser cases verify security-page layout and persisted preview revocation.

Real MySQL and browser execution use GitHub Actions; this local host lacks those execution prerequisites.
Verify the latest CI results before acceptance of this feature.
Provider delivery, administrator MFA, password reset, recovery, and full release acceptance remain separate gates.
