# Configuration Inventory

This inventory documents every configuration group; it does not certify unimplemented providers or production deployment.
Store production secrets outside version control and never reuse development credentials or data.

| Group               | Current configuration                                                                                                                                  | Validation and remaining boundary                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Environment         | NODE_ENV, PORT, WEB_PORT, DEMO_MODE, COMPOSE_PROJECT_NAME, Asia/Dubai display                                                                          | API validates modes and ports; local helper refuses production; app hostnames await DEC-19                                    |
| Database            | DATABASE_URL, MYSQL_CONNECTION_URL, MYSQL_DATABASE, MYSQL_USER, MYSQL_PASSWORD, MYSQL_ROOT_PASSWORD                                                    | Runtime uses MySQL URL; migrations precede readiness; production migration identity remains an infrastructure gate            |
| Redis               | REDIS_URL, REDIS_PASSWORD, local AOF volume                                                                                                            | URL scheme validation; local authentication enabled; complete durable Redis jobs remain incomplete                            |
| Authentication      | JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL                                                                             | Distinct secrets, bounded lifetimes, secure production refresh cookies; reset flows verified; MFA remains incomplete          |
| Origins and proxies | CORS_ORIGINS, TRUST_PROXY, FRONTEND_SUBNET                                                                                                             | Production requires explicit HTTPS origins and proxy policy; false disables proxy trust; global CIDR trust is rejected        |
| Twilio              | TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID                                                                                       | Verify adapter and bounded attempts exist; sender, templates, real delivery, and callbacks remain unverified                  |
| Email               | ACCOUNT_EMAIL_ENABLED, APP_URL, MAIL_FROM, SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASSWORD                                                 | SMTP adapter, encrypted outbox, and bounded retries verified; sender and inbox delivery remain unverified                     |
| Storage             | FILES_ENABLED, S3_PROVIDER, S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY, S3_FORCE_PATH_STYLE, MINIO_ROOT_USER, MINIO_ROOT_PASSWORD | Private MinIO, short session-bound grants, anonymous denial, and restart persistence verified; production policy remains open |
| Upload safety       | FILE_MAX_BYTES, FILE_GRANT_SECONDS, CLAMAV_HOST, CLAMAV_PORT                                                                                           | JPEG/PNG/PDF, bounded bytes, quarantine, ClamAV, and sanitization verified; DEC-18 production approval remains pending        |
| Financial defaults  | AED/USD records, due day, notice, EXCHANGE_RATE_PROVIDER_URL                                                                                           | No provider conversion or approved rounding policy; DEC-01 through DEC-13 remain applicable gates                             |
| Observability       | LOG_LEVEL, safe request IDs, container health probes                                                                                                   | Errors expose stable codes and safe correlation IDs; metrics access and external reporting remain incomplete                  |
| Retention           | Database/files, reports, protected records, backups, purge rules                                                                                       | DEC-17 and DEC-26 remain unresolved; no automatic retention purge is enabled                                                  |

## Local Credentials

Initialization creates independent random MySQL, Redis, MinIO, and JWT credentials with private file modes.
Existing environment files remain byte-for-byte unchanged.
The helper uses Node's environment parser; environment text is never sourced as shell code.
MYSQL_CONNECTION_URL escapes local database credentials for Compose services.
Demo mode defaults to false and requires the explicit --demo flag.
Demo seed preserves an existing active administrator and never resets credentials or upgrades another role.
No production administrator bootstrap is certified; MFA and governance remain pending.

## Proxy Policy

Standalone API development trusts loopback proxy addresses only.
Compose explicitly trusts its frontend subnet, which defaults to 172.29.80.0/24.
Set FRONTEND_SUBNET and TRUST_PROXY together when another local subnet is required.
The web service replaces client-supplied forwarding headers with its observed peer address.
Production operators must configure their actual trusted ingress CIDRs or false.
The default Nginx policy does not recover end-user addresses from an external load balancer.
Any production real-IP policy requires explicit ingress trust and separate deployment verification.
Codespaces wildcard allowances exist only in development and test modes.

## Production Preflight

API startup validates configuration before the listener starts.
Production rejects demo mode, equal JWT secrets, known placeholder JWT secrets, missing explicit origin/proxy policy, and non-HTTPS CORS origins.
Readiness rejects missing, failed, or unapplied migration records.
These checks do not approve production hostnames, provider credentials, recovery policy, or owner decisions.

## Account and Private File Defaults

Account email and private files default to disabled.
The private-files Compose profile starts ClamAV for local verification.
S3_PROVIDER selects s3 or minio; MinIO omits the unsupported bucket ACL query.
Before the listener opens, storage verification rejects public bucket policies and unsupported owner access.
File uploads default to 5 MiB; configuration permits 1 KiB through 10 MiB.
Download grants default to 60 seconds; configuration permits 15 through 300 seconds.
JPEG and PNG processing removes metadata and limits images to 40 million pixels and 4096 pixels per side.
PDF processing rejects active content and limits documents to 50 pages.
ClamAV failures preserve quarantine and prevent downloads.
Email and reset links expire after 30 minutes; resend cooldown is 60 seconds.
Invitations expire after seven days and permit five resends.
Phone challenges expire after ten minutes and permit five attempts and three sends.
These defaults do not resolve owner decisions or certify production deployment.
Production rejects enabled account email and private files until policy and deployment acceptance receive implementation.
