# Implementation Progress

Date: 8 November 2026.
This is a progress record, not a completion certificate.
Complete scope report: [PROGRESS.md](PROGRESS.md).
Verified checklist evidence: [EVIDENCE.md](EVIDENCE.md).

## Delivered in This Pass

| Area       | Implemented behavior                                                                             | Verification                                              |
| ---------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| Sessions   | Current-user endpoint, role-aware navigation, cache reset on logout, suspended-account rejection | API and component tests                                   |
| Dashboards | Separate administrator, manager, and tenant endpoints/views                                      | Role and ownership tests                                  |
| Landlords  | List, create, and edit contact records                                                           | Real API routes; mocked-database tests; form tests        |
| Units      | List, detail, create, and edit draft property records                                            | Real API routes; ownership and form tests                 |
| Rooms      | Create Room/Master Room; enforce disabled types, capacity bounds, and private bathroom           | Route and form tests                                      |
| Audit      | Transactional inventory audit events with old/new edit values                                    | Mocked transaction tests                                  |
| Preview    | Three synthetic accounts, local persistence, reset, role views, inventory forms                  | Adapter tests and preview build                           |
| Pages      | Dedicated build/deploy workflow and owner setup instructions                                     | Deployment succeeds; live HTML and assets return HTTP 200 |

## Incomplete Release Work

- Email and WhatsApp verification and invitations remain incomplete.
- Document upload, scans, expiry, and unit activation remain incomplete.
- Contract creation and amendments remain incomplete.
- Financial ledgers, receipts, deposits, refunds, and disputes remain incomplete.
- Transfer, move-out, and request workflows remain incomplete.
- Expenses, full reports, PDF exports, and durable notification jobs remain incomplete.
- Administrator moderation screens and audit explorer remain incomplete.
- Full database acceptance, the full release browser journey, backup, and production acceptance remain unverified.
- Unresolved decisions in requirements.md still require owner approval.

New units stay drafts until the document and activation workflows exist.
Direct contract requests also require an active unit and an enabled space outside maintenance/inactive status.
The checklist remains the complete release scope.
Do not mark a full checklist module complete from partial implementation evidence.

## Local Verification

- API suite: 57 tests pass; database-dependent behavior uses mocks.
- Web suite: 44 tests pass, including forms, roles, session cleanup, and preview data.
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
Current totals: 87 API/web unit and component tests, 15 MySQL integration cases, and eight browser cases pass.
Password reset, MFA, registration verification, provider delivery, and full security acceptance remain incomplete.

## Landlord and Property Continuation

See [INVENTORY.md](INVENTORY.md) for landlord detail, archive/restore, contact preferences, and complete address/GPS/deposit capture.
Archive requires no linked units; current and legacy references remain intact.
New assignments and archive share a row lock to prevent unsafe concurrent links.
Eleven new MySQL cases and two new real-browser journeys await GitHub acceptance.
Real browser tests now share the application suite in web/playwright.live.config.ts.
