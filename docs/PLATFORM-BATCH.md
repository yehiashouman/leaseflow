# Platform and Startup Batch

Date: 8 November 2026.
Status: thirty selected tasks verified.
Code commit: 8636bc783ed587cde6297210abaa82fe118bb792.
Environment: GitHub Actions, Node 22, Docker Compose, MySQL 8.4, Redis, source-built MinIO, Chromium, and Poppler.
Acceptance: [CI, containers, and fresh-stack verification](https://github.com/yehiashouman/leaseflow/actions/runs/42489354506).
Preview: [interface/preview browser verification and deployment](https://github.com/yehiashouman/leaseflow/actions/runs/42488032013).
Task selection: [batch-30.json](batch-30.json).

This batch combines new controls with verification of existing scope boundaries.
It does not deliver thirty business modules or approve production use.

## Task Evidence

All paths below start at the repository root.
The commit and workflow records above apply to every task below.

| Item     | Implementation                                                               | Verification and scope                                                                                                                                     |
| -------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BASE-002 | api/src/routes/inventory.ts; api/prisma/schema.prisma                        | Landlord records remain reusable; platform-contract.test.ts rejects landlord account endpoints; landlords.test.ts verifies record lifecycle.               |
| BASE-004 | web/src/pages/Managers.tsx                                                   | admin.test.tsx and admin.live.spec.ts verify the platform-activation disclaimer without legal certification.                                               |
| BASE-006 | api/src/routes/payments.ts; docs/TECHNICAL-SELECTIONS.md                     | Payment records describe external money; platform-contract.test.ts rejects collection and escrow endpoints.                                                |
| BASE-008 | api/src/routes/profile.ts; web/src/pages/Profile.tsx                         | cases.test.ts verifies empty optional preferences; profile component tests and admission code preserve their non-binding scope.                            |
| BASE-019 | docs/TECHNICAL-SELECTIONS.md                                                 | governance.test.mjs verifies the explicit separation between technical selections and owner approval.                                                      |
| PLAN-001 | docs/decisions.json                                                          | governance.test.mjs verifies all 26 source DEC identifiers, PROJECT_OWNER ownership, PENDING status, and no approved answers.                              |
| PLAN-005 | docs/decisions.json; api/src/routes/contracts.ts; api/src/routes/payments.ts | Production financial writes return 409; platform-contract.test.ts verifies the gate before provisional calculations reach the database.                    |
| PLAN-010 | SPECIFICATION.md; docs/decisions.json                                        | governance.test.mjs verifies the original source SHA-256 without changes.                                                                                  |
| API-001  | api/src/app.ts                                                               | platform-contract.test.ts verifies business groups under /api/v1 and rejects unversioned contract access.                                                  |
| API-007  | api/src/errors.ts; api/src/app.ts                                            | platform-contract.test.ts verifies stable codes, safe internal errors, validation messages, and response/request correlation identifiers.                  |
| API-008  | api/src/auth.ts                                                              | Platform, session, and ownership suites verify 401 for absent, invalid, stale, and revoked authentication.                                                 |
| API-009  | api/src/auth.ts                                                              | Platform and real role suites verify 403 for authenticated forbidden roles.                                                                                |
| API-010  | api/src/errors.ts; api/src/routes/inventory.ts                               | Platform, space, lifecycle, and case suites verify 409 for state, capacity, stale-version, and concurrency conflicts.                                      |
| API-011  | api/src/errors.ts                                                            | Platform, registration, inventory, and browser suites verify 422 with consistent safe validation details.                                                  |
| API-015  | api/src/routes/auth.ts                                                       | Platform and session suites verify custom CSRF headers and cross-site rejection; Compose verifies cookie refresh through Nginx.                            |
| API-016  | api/src/config.ts; api/src/app.ts; web/nginx.conf                            | Platform tests verify explicit proxy CIDRs; Compose verifies that forged client headers cannot bypass rate limits.                                         |
| API-017  | api/src/config.ts                                                            | cors-production.test.ts rejects development Codespaces and loopback allowances in production.                                                              |
| API-018  | web/src/App.tsx; web/src/api.ts                                              | Auth, administrator, and real-browser suites verify role fallback without repeated unauthorized redirects.                                                 |
| DEV-001  | scripts/local.mjs; Makefile; docs/STARTUP.md                                 | local.test.mjs verifies command order; compose-verify.mjs verifies fresh startup, repeated startup, and preserved credentials.                             |
| DEV-002  | scripts/local.mjs                                                            | Local and Compose suites verify private new environment files and byte-for-byte preservation of existing files.                                            |
| DEV-003  | api/src/config.ts; api/src/server.ts                                         | Platform tests verify demo, secret, origin, and proxy failures; configuration validation precedes listener startup.                                        |
| DEV-004  | api/src/readiness.ts; scripts/local.mjs; docker-compose.yml                  | Platform tests reject absent or incomplete migrations; Compose applies migrations before API readiness.                                                    |
| DEV-005  | api/prisma/seed.ts; scripts/local.mjs                                        | Compose verifies zero default users, explicit demo creation, unchanged administrator identity, and preserved changed passwords.                            |
| DEV-008  | docker-compose.yml; scripts/compose-verify.mjs                               | Compose verifies retained MySQL, Redis, and file-volume identities plus persisted account and file content after teardown without volume deletion.         |
| DEV-009  | scripts/local.mjs; Makefile                                                  | local.test.mjs verifies exact destructive confirmation and production refusal before any reset command.                                                    |
| DEV-010  | docker-compose.yml; .devcontainer/devcontainer.json                          | Compose and governance suites verify private database, cache, storage, and API ports.                                                                      |
| DEV-011  | web/nginx.conf; docker-compose.yml                                           | Compose verifies the web HTML, unauthenticated API response, administrator login, dashboard, password change, and refresh through one web port.            |
| DEV-012  | .devcontainer/devcontainer.json                                              | governance.test.mjs verifies HTTP backend protocol on port 8080; public browser URLs remain HTTPS.                                                         |
| DEV-015  | api/src/config.ts                                                            | cors-production.test.ts and platform-contract.test.ts verify exact HTTPS origins and rejection of wildcards, credentials, paths, and insecure origins.     |
| DEV-017  | docs/CONFIGURATION.md                                                        | The inventory documents all twelve required groups and distinguishes implemented settings from unresolved provider, scan, retention, and finance policies. |

## Test Paths

| Scope                                   | Repository paths                                                                                           |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Platform and preflight                  | api/test/platform-contract.test.ts; api/test/cors-production.test.ts; api/test/session-policy.test.ts      |
| Identity and landlord records           | api/test/inventory-role.test.ts; api/integration/sessions.test.ts; api/integration/landlords.test.ts       |
| Capacity and optional preferences       | api/integration/space.test.ts; api/integration/unit-lifecycle.test.ts; api/integration/cases.test.ts       |
| Interface and redirect controls         | web/src/admin.test.tsx; web/src/auth.test.tsx; web/src/api.test.ts; web/src/profile-notifications.test.tsx |
| Real browser roles and disclaimer       | web/e2e/admin.live.spec.ts; web/e2e/auth.live.spec.ts                                                      |
| Setup, governance, and Docker lifecycle | scripts/local.test.mjs; scripts/governance.test.mjs; scripts/compose-verify.mjs                            |

## Acceptance Result

The source passes 84 API tests, 84 web tests, 89 MySQL cases, and ten operations tests: 267 automated tests.
Browser suites pass four interface fixtures, fourteen synthetic previews, and twelve real API/MySQL journeys: thirty cases.
The isolated Compose acceptance journey also passes; it is separate from the automated-test total.
Both application container builds, lint, migrations, schema validation, production/preview builds, and the high/critical audit gate pass.
Seven moderate development-tool advisories remain.
We verified administrator screenshots on desktop and mobile without clipping or horizontal overflow.
The live preview HTML, JavaScript, and CSS each return HTTP 200.
The selected thirty closures raise strict completion from 72 to 102 of 764 tasks: 13.35%; 662 tasks remain incomplete.

## Runtime Contract

The local helper creates only absent environment files and generates independent credentials.
It refuses production mode and never sources environment text as shell code.
Startup applies migrations before API readiness and verifies the web-to-API path before success.
Ordinary startup never deletes volumes or resets passwords.
Demo accounts require an explicit non-production command.
Destructive reset requires the exact confirmation token in STARTUP.md.
Nginx replaces untrusted forwarding headers with its observed peer address.
Production API configuration requires exact HTTPS origins and explicit trusted proxies or false.

## Storage Dependency

The original MinIO community image pull failed during fresh-stack acceptance.
The development replacement compiles the same required service from official source commit 9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a.
Upstream release: [RELEASE.2025-10-15T17-29-55Z](https://github.com/minio/minio/releases/tag/RELEASE.2025-10-15T17-29-55Z).
The source-only distribution and archived upstream require separate security and AGPL license review before production use.
No third-party mirror or replacement storage architecture receives implicit approval.

## Explicit Limits

All twenty-six owner decisions remain PENDING.
Production contract activation and payment writes remain disabled until approved policy receives verified implementation.
Development financial scaffolds are not accepted ledger rules.
The public Pages preview uses synthetic browser-local data, not production services.
The exact public Codespaces login/upload/PDF journey remains unverified under DEV-013 and DEV-014.
Private uploads, scan controls, MFA, account bootstrap, providers, full ledgers, recovery, and production acceptance remain incomplete.
Existing infrastructure files do not prove a production deployment.
