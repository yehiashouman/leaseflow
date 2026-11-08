# Implementation Progress

Date: 8 November 2026.
This is a progress record, not a completion certificate.
Complete scope report: [PROGRESS.md](PROGRESS.md).
Verified checklist evidence: [EVIDENCE.md](EVIDENCE.md).

## Delivered in This Pass

| Area       | Implemented behavior                                                                                       | Verification                                              |
| ---------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Sessions   | Current-user endpoint, role-aware navigation, cache reset on logout, suspended-account rejection           | API and component tests                                   |
| Dashboards | Separate administrator, manager, and tenant endpoints/views                                                | Role and ownership tests                                  |
| Landlords  | List, create, and edit contact records                                                                     | Real API routes; mocked-database tests; form tests        |
| Units      | List, detail, create, and edit draft property records                                                      | Real API routes; ownership and form tests                 |
| Rooms      | Create Room/Master Room; enforce disabled types, capacity bounds, and private bathroom                     | Route and form tests                                      |
| Audit      | Transactional inventory audit events with old/new edit values                                              | Mocked transaction tests                                  |
| Preview    | Three synthetic accounts, local persistence, reset, role views, inventory forms                            | Adapter tests and preview build                           |
| Pages      | Dedicated build/deploy workflow and owner setup instructions                                               | Deployment succeeds; live HTML and assets return HTTP 200 |
| Cases      | Four operational request forms, private history, messages, versioned decisions, and tenant acknowledgement | MySQL and real-browser cases; details in CASES.md         |

## Incomplete Release Work

Maintenance responsibility, proposed tenant costs, and explicit acceptance/dispute now exist.
Hosted API, MySQL, desktop/mobile browser, and synthetic preview acceptance pass for this responsibility scope.
Exact scope, limits, and required migration: [MAINTENANCE.md](MAINTENANCE.md).

Private case-history report jobs, download controls, and source exports now exist.
Hosted API, MySQL, browser downloads, extracted content, and PDF page renders pass for this case-history scope.
Exact scope and both required migrations: [PDF-REPORTS.md](PDF-REPORTS.md).

Read-only contract detail and paged payment, deposit, and case records now exist.
Exact scope and limits: [CONTRACT-RECORDS.md](CONTRACT-RECORDS.md).
Hosted API, MySQL, desktop/mobile browser, and preview acceptance pass for this read-only scope.

- Email and WhatsApp verification and invitations remain incomplete.
- Document upload, scans, expiry, and unit activation remain incomplete.
- Contract creation and amendments remain incomplete.
- Financial ledgers, receipts, deposits, refunds, and disputes remain incomplete.
- Transfer, move-out, late-payment requests, and complete case workflows remain incomplete.
- Expenses, full financial relationship reports, multilingual PDFs, and durable notification jobs remain incomplete.
- Administrator moderation, governed audit exports, MFA, and support controls remain incomplete.
- Full database acceptance, the full release browser journey, backup, and production acceptance remain unverified.
- Unresolved decisions in requirements.md still require owner approval.

New units stay drafts until the document and activation workflows exist.
Direct contract requests also require an active unit and an enabled space outside maintenance/inactive status.
The checklist remains the complete release scope.
Do not mark a full checklist module complete from partial implementation evidence.

## Local Verification

- API suite: 84 tests pass; database-dependent unit tests use mocks.
- Web suite: 84 tests pass, including maintenance, PDF controls, contracts, forms, roles, sessions, cases, profiles, notices, and preview data.
- Operations suite: ten setup and governance tests pass.
- API and web production builds pass.
- The isolated GitHub Pages preview build passes.
- Production JavaScript excludes preview fixtures and preview credentials.
- Previous GitHub run passes four normal-interface and two synthetic-preview desktop/mobile browser tests.
- New room lifecycle browser assertions pass on GitHub desktop and mobile.
- Local Chromium startup is restricted; local browser execution is not verified.
- GitHub Pages is live; HTML and assets return HTTP 200.
- All five new MySQL integration cases pass on GitHub after migrations.
- CI follow-up fixes an ambiguous browser-test selector without removal of accessibility labels.
- Dependency patches and Vitest 4.1.12 remove the reported high/critical audit findings.
- Seven moderate development-tool advisories remain in the TypeScript ESLint/minimatch dependency chain.
- The high/critical audit gate stays enabled.

## Room Lifecycle Continuation

Room edits now enforce ownership, Master Room facilities, capacity, and operational availability.
Open contracts block room type changes and maintenance/inactive transitions.
Capacity includes secondary occupants and cannot fall below committed occupancy.
Contract admission and room edits share a database row lock.
Contract, first obligation, occupancy status, and audit writes use one transaction.
Real MySQL concurrency verification passes; CI retains this release gate.
The public preview uses equivalent synthetic room controls with local persistence.

## Session Security Continuation

See [SESSIONS.md](SESSIONS.md) for API contracts, cookie policy, migration, tests, and explicit limitations.
The Security interface now connects session review, revocation, and password change to real API operations.
Refresh cookies replace JSON refresh-token transport.
Every protected request requires an active database session.
All ten new MySQL cases and both real-browser cases pass on GitHub.
Session acceptance baseline: 87 API/web tests, 15 MySQL cases, and eight browser cases pass at the session evidence commit.
Password reset, MFA, registration verification, provider delivery, and full security acceptance remain incomplete.

## Landlord and Property Continuation

See [INVENTORY.md](INVENTORY.md) for landlord detail, archive/restore, contact preferences, and complete address/GPS/deposit capture.
Archive requires no linked units; current and legacy references remain intact.
New assignments and archive share a row lock to prevent unsafe concurrent links.
All eleven new MySQL cases and both new real-browser journeys pass on GitHub.
Current totals: 101 API/web tests, 26 MySQL cases, and ten browser cases pass.
Real browser tests now share the application suite in web/playwright.live.config.ts.

## Operational Case Continuation

See [CASES.md](CASES.md) for private operational cases and their required migration.
Both roles use real message and status APIs; tenant acceptance never follows automatically from silence.
History preserves author snapshots, sequence, timestamps, and previous resolution events.
Replay-safe keys and locked, version-checked decisions prevent duplicate or concurrent effects.
Related contract and dashboard responses exclude internal case keys and tenant account secrets.
Current totals: 118 API/web tests, 39 MySQL cases, and fourteen browser cases pass.
Late-payment, transfer, move-out, attachments, financial cost posting, provider delivery, and full support access remain incomplete.
The final concurrency regression maps rolled-back contract deadlocks to 409 without automatic financial retries.

## Larger Operational Batch

See [OPERATIONS-BATCH.md](OPERATIONS-BATCH.md) for unit lifecycle, owner schedules, amenities, administrator review, and private drafts.
Unit archive blocks open contracts and preserves records; restore never reactivates a unit automatically.
Owner schedules remain literal metadata, not posted financial instructions.
Administrator queues and audit summaries exclude account secrets and arbitrary legacy payloads.
Account moderation remains blocked until approved MFA and document/identity policy exist.
Private drafts stay hidden from managers until a tenant explicitly submits them.
We verified twenty additional checklist tasks, including existing role and space restrictions.
Current acceptance totals: 127 API/web tests, 53 MySQL cases, and twenty browser cases.
Full production approval, documents, invitations, MFA, financial workflows, providers, and recovery remain incomplete.

## Tenant Profiles and Case Notices

We added tenant self-service profiles, unverified phone candidates, language/timezone storage, and optional compatibility fields.
Managers have a scoped tenant directory with safe contacts and contract references.
Shared case events create in-app notices in the same transaction; private drafts remain private.
The notification center supports history, unread/read filters, and isolated read controls.
Profile changes preserve verified account contacts, manager ownership, and historical case authors.
We verified six additional checklist tasks.
Current acceptance totals: 131 API/web tests, 59 MySQL cases, and twenty-two browser cases.
Email/WhatsApp delivery, phone verification, invitations, complete onboarding, and full release acceptance remain incomplete.

## Platform and Startup Controls

See [PLATFORM-BATCH.md](PLATFORM-BATCH.md) for the selected thirty tasks and evidence paths.
We added stable API error codes, safe request IDs, migration-aware readiness, and explicit production proxy configuration.
The local helper creates missing private environment files without overwrite, applies migrations, preserves passwords, and verifies the web proxy.
Normal startup creates no demo accounts; explicit demo mode and destructive confirmation remain separate commands.
Production contract activation and payment writes remain disabled until approved policy receives verified implementation.
The source-built MinIO development image preserves the required service without an untrusted mirror.
All twenty-six owner decisions remain unresolved; this batch does not approve production deployment.
Fresh Compose acceptance passes, including default zero-user startup, explicit demo, proxy login, password-preserving restart, and database/file volume persistence.
This batch closes thirty scoped tasks; strict completion is 102 of 764 tasks, or 13.35%.
The remaining 662 tasks and all production release gates stay incomplete.
