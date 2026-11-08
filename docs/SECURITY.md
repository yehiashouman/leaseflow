# Security operations

This document lists required controls, not a certificate that every control exists.
Full production security and owner policy approval remain incomplete.

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
- Rejected origins receive HTTP 403 with code ORIGIN_DENIED and a request ID; the response excludes credential values.

## Demo mode

Demo mode creates an absent administrator with an Argon2id password only after explicit non-production startup.
The seed preserves an existing active administrator and refuses account-role promotion or password reset.
Production API and seed execution reject demo mode.
Secure production administrator bootstrap and MFA remain incomplete.

## Proxy Trust

Production requires an explicit IP/CIDR allowlist or false.
Global proxy trust is forbidden.
Nginx replaces untrusted client forwarding headers with its observed peer address.
An external load balancer requires a separate verified real-IP policy before end-user addresses can support production abuse controls.

## Provisional Finance

Production contract activation and payment writes return 409 until financial and acknowledgement policies receive approval and verified implementation.
Development scaffolds do not approve money calculations, ledgers, or acknowledgement rules.
