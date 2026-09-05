# Security operations

- Never commit `.env`, credentials, ID documents or production exports.
- Rotate JWT, Twilio, database and storage credentials after suspected exposure.
- Require MFA for administrator accounts and GitHub production approvers.
- Retain immutable audit events for authentication, exports, document access, payment corrections, contract changes, moderation and impersonation.
- Virus-scan uploads before making them available. Allowlist MIME types and verify file signatures.
- Mask Emirates ID numbers in logs, notifications and ordinary reports.
- Keep Twilio and email messages free of identity-document content; link to authenticated pages.
- Use AWS WAF rules at the ALB for managed threats, rate-based rules and IP reputation.
- Run dependency, container and infrastructure scans in CI before production approval.

Report vulnerabilities privately to the repository owner. Do not create public issues containing exploit details or personal data.

## CORS

- `CORS_ORIGINS` is an exact, comma-separated allow-list; entries are trimmed and trailing slashes are ignored.
- Requests without an `Origin` header (curl, health checks, service-to-service calls, same-origin requests proxied through Nginx) are always allowed.
- In `development`/`test` only, `http://localhost:8080`, `http://127.0.0.1:8080`, and validated `https://*.app.github.dev` / `https://*.github.dev` Codespaces origins are additionally allowed. The Codespaces check validates the parsed request hostname against an exact suffix — never a substring match on the full origin string — so origins cannot be spoofed (e.g. `https://evil.com/.app.github.dev` is rejected).
- In `production`, only exact `CORS_ORIGINS` entries are allowed. `origin: true` is never used, and `Access-Control-Allow-Origin: *` is never combined with credentials.
- Rejected origins receive `HTTP 403` (never `500`). The rejected origin and request ID are logged; credentials and secrets are never logged.

## Demo mode

`DEMO_MODE=true` seeds a fixed demo administrator (`admin@leaseflow.local`) with an Argon2id-hashed password for Codespaces/local development only. The API refuses to start if `DEMO_MODE=true` and `NODE_ENV=production`. Demo credentials and any verification bypass must never be enabled in production.
