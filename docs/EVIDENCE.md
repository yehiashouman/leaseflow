# Verified Checklist Evidence

Verified: 7 November 2026.
These records prove only the listed requirements.
Framework acceptance does not imply business-workflow acceptance.
Paths are relative to the repository root.

## Foundation

Commit: `8c48ac8b899d9857ff5308a27b7e6911aadbec1b`.
Environment: GitHub Actions, Node 22.
Evidence: [CI validation](https://github.com/yehiashouman/leaseflow/actions/runs/42403917105).
Tests, lint, builds, Prisma schema validation, and dependency audit pass.

| Item     | Code                                                                                 | Test or verification                                               |
| -------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| BASE-009 | api/package.json; api/src/app.ts; api/tsconfig.json                                  | api/test/inventory-role.test.ts; API build                         |
| BASE-010 | api/prisma/schema.prisma; api/prisma/migrations/20260905000000_initial/migration.sql | Prisma schema validation; MySQL datasource inspection              |
| BASE-011 | web/package.json; web/src/main.tsx; web/src/App.tsx                                  | web/src/ui.test.tsx; production build                              |
| BASE-012 | web/src/components/ui; web/src/App.tsx; web/src/api.ts                               | web/src/ui.test.tsx; web/src/inventory.test.tsx                    |
| BASE-013 | web/vite.config.ts; web/src/styles.css; web/package.json; package-lock.json          | Clean npm ci and production build; dependency inspection           |
| BASE-014 | api/src/server.ts; api/Dockerfile; web/Dockerfile; web/src/api.ts                    | Separate API/web builds; web/e2e/ui.spec.ts uses HTTP API fixtures |

BASE-010 verifies retention of the database stack, not complete migrations for every required entity.

## UI Framework

Commits: `a24337a` and `8c48ac8b899d9857ff5308a27b7e6911aadbec1b`.
Environment: GitHub Actions Chromium, desktop and mobile.
Evidence: [browser verification run](https://github.com/yehiashouman/leaseflow/actions/runs/42403916947).
The build job passes four normal-interface and two synthetic-preview browser tests.
Its browser-verification artifact contains screenshots and test reports.

| Item       | Code                                                                        | Test or verification                                                      |
| ---------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| SHADCN-001 | web/vite.config.ts; web/src/styles.css                                      | Production build; computed-background browser assertion                   |
| SHADCN-002 | web/components.json; web/tsconfig.app.json; web/vite.config.ts              | TypeScript and Vite builds resolve aliases                                |
| SHADCN-003 | web/src/components/ui; web/src/components/ui/LICENSE                        | Source and license inspection; component suite                            |
| SHADCN-004 | web/src/components/ui; web/src/App.tsx; web/package.json                    | Component suite; dependency inspection                                    |
| SHADCN-005 | web/src/pages/Login.tsx; web/src/App.tsx                                    | web/src/ui.test.tsx; web/e2e/ui.spec.ts verifies Escape/focus restoration |
| SHADCN-006 | web/src/components/query-feedback.tsx; web/src/components/record-editor.tsx | web/src/ui.test.tsx; web/src/inventory.test.tsx; browser retry test       |
| SHADCN-007 | web/vitest.config.ts; web/src/ui.test.tsx                                   | GitHub component suite                                                    |
| SHADCN-008 | web/playwright.config.ts; web/playwright.preview.config.ts                  | Four normal-interface and two synthetic-preview browser tests             |
| SHADCN-009 | web/package.json; package-lock.json                                         | Clean npm ci; production and preview builds                               |
| SHADCN-010 | docs/IMPLEMENTATION.md; docs/PREVIEW.md                                     | Explicit incomplete-work record and synthetic-data notice                 |

These UI checks cover migrated screens, not absent initial-release screens.

## Production Demo Guard

Item: DEV-006.
Commit: `8c48ac8b899d9857ff5308a27b7e6911aadbec1b`.
Code: api/src/config.ts.
Test: api/test/cors-production.test.ts.
Environment: GitHub Actions, Node 22.
Evidence: [successful CI validation](https://github.com/yehiashouman/leaseflow/actions/runs/42403917105).
The test verifies startup rejection when NODE_ENV=production and DEMO_MODE=true.

## Room Controls

Commit: `f68ab7c2d60cc5570cff2f0832d44359b0b9a71c`.
Environment: GitHub Actions, MySQL 8.4, Node 22; Chromium desktop and mobile.
Evidence: [MySQL and API verification](https://github.com/yehiashouman/leaseflow/actions/runs/42409457688).
Browser evidence: [room lifecycle verification](https://github.com/yehiashouman/leaseflow/actions/runs/42409457651).
All five MySQL cases and both updated preview browser cases pass.

| Item      | Code                                                                                    | Test or verification                                                                                                                          |
| --------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| SPACE-003 | api/src/routes/inventory.ts; web/src/pages/UnitDetail.tsx                               | api/test/inventory-role.test.ts rejects missing Master Room bathrooms on create/edit; web/src/inventory.test.tsx preserves the bathroom field |
| SPACE-010 | api/src/routes/inventory.ts; web/src/pages/UnitDetail.tsx                               | api/integration/space.test.ts persists maintenance/inactive/restore; web/e2e/preview.spec.ts verifies all states on desktop/mobile            |
| SPACE-012 | api/src/space-availability.ts; api/src/routes/contracts.ts; api/src/routes/inventory.ts | api/integration/space.test.ts verifies secondary-occupant capacity and concurrent admission/edit; API tests verify conflicts                  |

SPACE-012 does not certify date-specific reservations or transfers under SPACE-013 through SPACE-017.
The complete rental-space module remains incomplete.

## Unverified Release Gates

This host lacks MySQL and Docker; GitHub executes the MySQL integration suite instead.
CI passes migrations and all five cases in api/integration/space.test.ts.
Real provider delivery, full release journeys, recovery, and production approval remain unverified.

## Session Security

Verified: 8 November 2026, Asia/Dubai.
Commit: `697cbf81516bd51c95f2ca7fb69d46acbcd76d35`.
Environment: GitHub Actions, MySQL 8.4, Node 22, Chromium desktop and mobile.
Evidence: [API, MySQL, and real-browser verification](https://github.com/yehiashouman/leaseflow/actions/runs/42432955154).
Preview evidence: [synthetic desktop/mobile verification and deployment](https://github.com/yehiashouman/leaseflow/actions/runs/42432955148).

The run passes 51 API tests, 36 web tests, and 15 MySQL integration cases.
Two additional real-browser cases pass login, cookie renewal, revocation, password change, and logout against MySQL.
The preview run passes four normal-interface and two synthetic-preview browser cases.
Builds, lint, migrations, schema validation, and the high/critical dependency-audit gate pass.
Seven moderate development-tool advisories remain; the audit gate stays enabled.
Additional local assertions verify cookie-only mutation rejection and the exact 900-second access-token lifetime in api/test/sessions.test.ts.
Both API and web container builds pass in the same verification run.

| Item     | Code                                                             | Test and evidence scope                                                                                                                     |
| -------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| AUTH-005 | api/src/auth.ts; api/src/routes/auth.ts; web/src/auth.tsx        | api/integration/sessions.test.ts; web/e2e/auth.live.spec.ts verify immediate revocation and server-confirmed logout                         |
| AUTH-006 | api/src/sessions.ts; api/src/config.ts; api/prisma/schema.prisma | api/test/session-policy.test.ts; api/integration/sessions.test.ts verify TTL values, rotation, and absolute expiry                          |
| AUTH-007 | api/src/routes/auth.ts; api/src/sessions.ts                      | api/integration/sessions.test.ts verifies replay-family revocation, independent sessions, and concurrent refresh                            |
| AUTH-008 | api/src/sessions.ts; api/prisma/schema.prisma; web/src/api.ts    | API tests verify hashes and Secure/HttpOnly/Strict/host-only production flags; real browsers verify HttpOnly behavior                       |
| AUTH-009 | api/src/sessions.ts; api/src/routes/auth.ts; web/src/api.ts      | api/test/sessions.test.ts verifies required custom headers and cross-site rejection; bearer-only mutations reject cookie-only authorization |
| AUTH-012 | api/src/routes/auth.ts; web/src/pages/Security.tsx               | MySQL and real-browser tests verify password proof, matching confirmation, session isolation, and password-change revocation                |

The desktop test now waits for the 204 revocation response and verifies database revocation before the strict 401 access assertion.
This corrects test timing without retries, sleeps, or weaker acceptance criteria.
Session limitations and migration requirements remain explicit in [SESSIONS.md](SESSIONS.md).
This evidence does not certify MFA, password reset, or the entire authentication module.

## Landlord and Property

Verified: 8 November 2026, Asia/Dubai.
Commit: `a208bdebdbbf251fe85aa33e4b40334c13b30515`.
Environment: GitHub Actions, MySQL 8.4, Node 22, Chromium desktop and mobile.
Evidence: [API, database, and real-browser verification](https://github.com/yehiashouman/leaseflow/actions/runs/42436239708).
Preview evidence: [synthetic browser verification](https://github.com/yehiashouman/leaseflow/actions/runs/42435772611).

The run passes 57 API tests, 44 web tests, 26 MySQL cases, and four real-browser cases.
The preview run passes four API-fixture interface cases and two synthetic-preview cases.
Total: 127 automated tests plus ten browser cases.
Lint, builds, migrations, schema validation, and the high/critical audit gate pass.

| Item     | Code                                                                                                                               | Test and evidence scope                                                                                                                     |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| UNIT-001 | api/src/routes/inventory.ts; web/src/pages/Landlords.tsx; web/src/pages/LandlordDetail.tsx; web/src/components/landlord-editor.tsx | api/integration/landlords.test.ts; web/e2e/inventory.live.spec.ts verify scoped CRUD, archive/restore, linked units, history, and conflicts |
| UNIT-002 | api/prisma/schema.prisma; api/src/routes/inventory.ts; web/src/components/landlord-editor.tsx                                      | Database and real-browser cases verify separate name/company capture and the 200-character company limit                                    |
| UNIT-004 | api/src/routes/inventory.ts; web/src/pages/LandlordDetail.tsx                                                                      | MySQL and real-browser cases link two owned units to one landlord; foreign references fail                                                  |
| UNIT-005 | api/src/routes/inventory.ts; web/src/pages/Units.tsx; web/src/pages/UnitDetail.tsx                                                 | Real-browser cases persist and display building, street, area, non-default emirate, and multiline address notes                             |
| UNIT-006 | api/src/routes/inventory.ts; web/src/pages/Units.tsx; web/src/pages/UnitDetail.tsx                                                 | MySQL and browser cases verify latitude zero, longitude, range validation, and unchanged coordinates after edits                            |
| UNIT-009 | api/src/routes/inventory.ts; web/src/pages/Units.tsx; web/src/pages/UnitDetail.tsx                                                 | MySQL and browser cases verify AED 2,500 default-deposit capture, display, and persistence                                                  |

Archive requires all unit links to end before the contact record changes status.
Database cases serialize archive against both unit creation and unit reassignment.
Legacy foreign links remain hidden from details/counts and still block archive.
Unit responses also hide foreign landlord contacts under inconsistent legacy links.
The MySQL regression verifies both sides of this ownership boundary.
Both API and web container builds pass in the same run.
We verified landlord preview screenshots on desktop and mobile.
Public HTML, JavaScript, and CSS return HTTP 200.
Boundary cases verify company/address/street storage and long user-agent audit metadata.
At that commit, documents, unit activation, unit archive/restore, and complete inventory acceptance remained incomplete.

## Operational Cases

Verified: 8 November 2026, Asia/Dubai.
Commit: `ca4ce8c6b66e610f7355428fcd696e3b46c1bcdc`.
Environment: GitHub Actions, MySQL 8.4, Node 22, Chromium desktop and mobile.
Evidence: [API, database, and real-browser verification](https://github.com/yehiashouman/leaseflow/actions/runs/42439739883).
Preview: [synthetic browser verification and deployment](https://github.com/yehiashouman/leaseflow/actions/runs/42439739898).

The run passes 62 API tests, 55 web tests, 39 MySQL cases, and six real-browser cases.
The preview run passes four API-fixture interface cases and four synthetic-preview cases.
Total: 156 automated tests plus fourteen browser cases.
Lint, builds, migrations, schema validation, and the high/critical audit gate pass.
Seven moderate development-tool dependency advisories remain.

| Item     | Code                                                                                                        | Test and evidence scope                                                                                                                                                    |
| -------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CASE-009 | api/src/case-data.ts; api/src/routes/requests.ts; api/prisma/schema.prisma; web/src/pages/RequestDetail.tsx | api/integration/cases.test.ts and web/e2e/cases.live.spec.ts verify actor IDs, immutable name/role snapshots, event sequence, timestamps, and legacy identity preservation |
| CASE-012 | api/src/case-rules.ts; api/src/routes/requests.ts; web/src/pages/RequestDetail.tsx                          | MySQL tests verify that messages and unanswered completion cannot imply acceptance; browser tests require explicit tenant acceptance before manager closure                |

Database cases also verify private ownership, roommate denial, consistent manager relationships, retries, stale versions, concurrent writes, and forbidden role decisions.
Contract/dashboard regression cases verify safe case summaries and exclusion of tenant account secrets.
Real-browser tests submit cases, exchange messages, dispute resolution, accept completion, close cases, and preserve all nine event sequences.
The synthetic preview verifies role exchange and reload persistence without backend requests.
We verified case-history screenshots on desktop and mobile.
The long preview test now uses separate inventory and case journeys without longer timeouts or weaker assertions.
Migration and exact scope: [CASES.md](CASES.md).
All other CASE tasks remain unchecked because their complete workflows lack evidence.
Attachments, specialized financial requests, cost responsibility, deadlines, notifications, and authorized support remain incomplete.

## Inventory, Review, and Draft Controls

Verified: 8 November 2026, Asia/Dubai.
Code commit: `039b56a9d83e4519fa8f0b61dba8ee15c33e8623`.
Environment: GitHub Actions, MySQL 8.4, Node 22, Chromium desktop and mobile.
Evidence: [API, database, and real-browser verification](https://github.com/yehiashouman/leaseflow/actions/runs/42464193791).
Preview: [interface fixtures, synthetic workflows, and deployment](https://github.com/yehiashouman/leaseflow/actions/runs/42464193852).
Earlier real-browser feature evidence: [eight role and workflow journeys](https://github.com/yehiashouman/leaseflow/actions/runs/42463931811).

The acceptance baseline passes 63 API tests, 64 web tests, and 53 MySQL cases.
Total: 180 automated tests; lint, migrations, schema validation, builds, and the high/critical audit gate pass.
Both API and web container builds pass.
Seven moderate development-tool advisories remain.
Browser coverage totals twenty cases: four interface fixtures, eight synthetic previews, and eight real API/MySQL journeys.
These twenty additional task closures include new features and newly verified existing role/space behavior.
They do not certify twenty modules or the complete application.

| Item      | Code                                                                                              | Test and evidence scope                                                                                                                                                |
| --------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AUTH-001  | api/src/routes/auth.ts; web/src/pages/Login.tsx; web/src/pages/Dashboard.tsx                      | Real-browser admin, manager, and tenant journeys verify login and persisted role identity                                                                              |
| AUTH-003  | web/src/pages/Dashboard.tsx; web/src/pages/RoleDashboards.tsx; web/src/App.tsx                    | Real browsers verify Platform overview, Portfolio overview, and My accommodation for their respective roles                                                            |
| AUTH-004  | api/src/auth.ts; web/src/App.tsx                                                                  | api/integration/cases.test.ts and web/e2e/admin.live.spec.ts verify manager-only denial and administrator route fallback                                               |
| AUTH-019  | api/src/auth.ts; api/src/routes/auth.ts; api/src/routes/admin.ts                                  | MySQL tests reject registration role injection, mismatched role claims, and unauthorized administrator endpoints without new users                                     |
| ADMIN-001 | api/src/routes/admin.ts; web/src/pages/Managers.tsx                                               | MySQL, component, and real-browser tests verify account filters, pages, safe summaries, detail links, and ordinary-role denial                                         |
| UNIT-008  | api/prisma/schema.prisma; api/src/routes/inventory.ts; web/src/pages/Units.tsx                    | api/integration/unit-lifecycle.test.ts persists USD/AED, decimal owner rent, and literal multiline payment schedules; real browsers capture and display the schedule   |
| UNIT-015  | api/src/routes/inventory.ts; web/src/unit-amenities.ts; web/src/pages/Units.tsx                   | MySQL and real browsers persist air conditioning, furnished, bed, television, refrigerator, and bathroom flags                                                         |
| UNIT-016  | api/src/routes/inventory.ts; web/src/unit-amenities.ts; web/src/pages/Units.tsx                   | MySQL and real browsers persist kitchen, laundry, balcony, parking, Wi-Fi, and cleaning flags                                                                          |
| UNIT-017  | api/src/routes/inventory.ts; web/src/pages/Units.tsx; web/src/pages/UnitDetail.tsx                | Tests verify custom labels, duplicate-label removal, limits, edits, persistence, and display                                                                           |
| UNIT-018  | api/src/routes/inventory.ts; api/src/space-availability.ts; web/src/components/unit-lifecycle.tsx | MySQL verifies open-contract guards, archive/admission races, preserved history, and single audit events; browsers verify confirmation, reload, and draft-only restore |
| SPACE-002 | api/src/routes/inventory.ts; web/src/pages/UnitDetail.tsx                                         | Existing route, form, and MySQL suites verify Room and Master Room create/edit with required bathroom rules                                                            |
| SPACE-004 | api/prisma/schema.prisma; api/src/routes/inventory.ts; api/src/routes/contracts.ts                | Enum retention and database/API tests verify globally disabled Bed Space and Partition, including legacy active flags                                                  |
| SPACE-005 | api/src/routes/inventory.ts; api/src/routes/contracts.ts                                          | MySQL tests deny legacy disabled-type contracts; route tests deny disabled-type create/edit; public advertisement has no writable initial-release endpoint             |
| SPACE-006 | web/src/pages/UnitDetail.tsx; web/e2e/preview.spec.ts                                             | Desktop keyboard and mobile touch open the Future feature disclosure; the summary also exposes native hover title help                                                 |
| SPACE-007 | api/src/routes/inventory.ts; web/src/pages/UnitDetail.tsx                                         | Route, component, MySQL, and browser suites persist names, supported types, physical capacity, and operational availability                                            |
| SPACE-011 | api/src/routes/contracts.ts; api/src/space-availability.ts                                        | api/integration/space.test.ts verifies contract rejection for inactive and maintenance spaces                                                                          |
| SPACE-015 | api/src/routes/inventory.ts; api/src/routes/contracts.ts                                          | api/integration/space.test.ts and unit-lifecycle.test.ts verify unchanged contract rent/deposit after asking-price and unit-default edits                              |
| TEN-004   | api/src/routes/auth.ts                                                                            | MySQL tests verify absent public tenant registration, rejected TENANT role injection, and no created user                                                              |
| CASE-004  | api/src/case-rules.ts; api/src/routes/requests.ts; web/src/components/case-editor.tsx             | MySQL verifies private Draft, Submitted, Seen, Awaiting Tenant, and Awaiting Manager; real browsers explicitly submit a private draft                                  |
| CASE-007  | api/src/case-rules.ts; api/src/routes/requests.ts                                                 | MySQL verifies version conflicts, serialized decisions, role denial, invalid states, closed-contract draft rejection, and replay-safe events                           |

Owner payment schedules remain descriptive records, not posted obligations or approved due-date calculations.
Additional amenities are unit-specific labels; the global administrator amenity catalog remains incomplete.
Draft content editing/deletion, document review, MFA, account moderation, and approved support remain incomplete.
Unsupported financial case types still reject generic mutations rather than invent business rules.
The account-status mutation endpoint now fails closed until its MFA and identity/document policy prerequisites exist.
Audit summaries exclude arbitrary legacy bodies instead of exposing old sensitive complaint or credential payloads.
We verified administrator review and unit amenity screenshots without clipping.
The failed browser fixture used an exact URL without new filter parameters; pathname matching restores the same failure/retry assertions.
Migration, exact scope, and remaining gates: [OPERATIONS-BATCH.md](OPERATIONS-BATCH.md).

## Tenant Profiles and Case Notices

Verified: 8 November 2026, Asia/Dubai.
Code commit: `1041f1d32d102c04f5d51bba4c0d75f4bf623a46`.
Environment: GitHub Actions, MySQL 8.4, Node 22, Chromium desktop and mobile.
Evidence: [API, database, real-browser, and container verification](https://github.com/yehiashouman/leaseflow/actions/runs/42468327149).
Preview: [synthetic profile, directory, and notice verification](https://github.com/yehiashouman/leaseflow/actions/runs/42468327257).
The run passes 63 API tests, 68 web tests, and 59 MySQL cases: 190 automated tests.
Browser coverage totals twenty-two cases: four interface fixtures, ten synthetic previews, and eight real API/MySQL journeys.
Lint, migrations, schema validation, production/preview builds, both container builds, and the high/critical audit gate pass.
Seven moderate development-tool advisories remain.

| Item     | Code                                                                                                                           | Test and evidence scope                                                                                                                                             |
| -------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DATA-006 | api/prisma/schema.prisma; api/prisma/migrations/20261108040000_profiles_notifications/migration.sql; api/src/routes/profile.ts | MySQL migration and profile tests persist timezone/language alongside existing role, account status, and email/phone verification timestamps                        |
| TEN-006  | api/src/routes/profile.ts; web/src/pages/Profile.tsx                                                                           | MySQL and real browsers save a tenant-supplied phone candidate without changing the verified phone or confirmation timestamps                                       |
| TEN-010  | api/src/routes/profile.ts; web/src/pages/Profile.tsx                                                                           | Tests verify Email, WhatsApp, and Both preference storage; the account security email remains unchanged; external delivery is not certified                         |
| TEN-017  | api/src/routes/profile.ts; web/src/profile-fields.ts; web/src/pages/Profile.tsx                                                | MySQL and component tests accept empty optional gender, nationality, language, culture, and lifestyle preferences without mandatory fields                          |
| TEN-018  | api/src/routes/profile.ts; api/src/routes/contracts.ts; web/src/pages/Profile.tsx                                              | Compatibility values remain descriptive metadata; edits preserve existing contracts, and allocation code does not use these preferences as restrictions             |
| MSG-007  | api/src/routes/notifications.ts; api/src/case-data.ts; web/src/pages/Notifications.tsx                                         | MySQL and real browsers verify private recipient scope, notice history, unread state, read-all isolation, repeated-read timestamps, and replay-safe notice creation |

New MySQL assertions also reject profile owner/verification injection, invalid dates, stale versions, and concurrent edits.
Manager directory tests reject foreign managers, tenants, and administrators and exclude password hashes and pending phone candidates.
Case author snapshots remain unchanged after tenant name edits.
Private drafts create no notices, and inconsistent relationship changes hide previously visible notices.
Read operations cannot change another recipient's unread state.
We verified desktop/mobile profile screenshots and the synthetic workflow without backend requests.
Full tenant onboarding, private documents, phone verification, provider delivery, critical security delivery, and retention policy remain incomplete.
Exact migration and design constraints: [PROFILES-NOTIFICATIONS.md](PROFILES-NOTIFICATIONS.md).

## Contract Detail and Private Records

Verified: 8 November 2026, Asia/Dubai.
Code commits: `d0d615cf152a299cab8439a194a0832b2b6207f1` and `338019ebd9edc5d3303b30de83e773fbe541bfa1`.
Environment: GitHub Actions, MySQL 8.4, Node 22, Chromium desktop and mobile.
Evidence: [API, MySQL, and real-browser verification](https://github.com/yehiashouman/leaseflow/actions/runs/42475466920).
Preview: [interface, synthetic contract, and deployment verification](https://github.com/yehiashouman/leaseflow/actions/runs/42475466916).

The baseline passes 63 API tests, 74 web tests, and 65 MySQL cases: 202 automated tests.
Browser suites pass four interface fixtures, twelve synthetic previews, and ten real API/MySQL journeys: 26 cases.
Lint, migrations, schema validation, production/preview builds, and the high/critical audit gate pass.
Seven moderate development-tool advisories remain.

| Surface            | Code                                                          | Verified assertions                                                                                                             |
| ------------------ | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Contract detail    | api/src/routes/contracts.ts; web/src/pages/ContractDetail.tsx | Stored dates, open-ended terms, notice exceptions, rent, currency, and deposit appear without financial writes                  |
| Access             | api/integration/cases.test.ts                                 | Foreign managers, roommates, administrators, and inconsistent relationships cannot read private contract terms or records       |
| Payment records    | api/integration/cases.test.ts; web/src/contracts.test.tsx     | Decimal values and per-record currencies remain intact; twenty-item pages contain no duplicate records or private evidence keys |
| Deposit entries    | api/integration/cases.test.ts; web/e2e/contracts.live.spec.ts | Stored proposals and dispute dates appear without acceptance or fund settlement                                                 |
| Case records       | api/src/routes/contracts.ts; web/e2e/contracts.live.spec.ts   | Tenant drafts appear only to their tenant; manager lists and totals exclude drafts                                              |
| Browser navigation | web/e2e/contracts.live.spec.ts; web/e2e/preview.spec.ts       | List/detail links, category changes, page resets, reload, and desktop/mobile layouts pass                                       |

We verified real and synthetic desktop/mobile screenshots without page overflow.
The first database run found an incorrect 400 status assertion for schema errors.
The correction preserves the existing 422 API policy and aligns preview validation with it.
No database migration or new dependency accompanies this batch.
The contract list retains its array response but now excludes nested payment/request collections and unsafe legacy fields.
The detail screen uses independently authorized, paged record reads.
Full contract creation, acknowledgements, amendments, annual reviews, ledgers, evidence downloads, and PDF reports remain incomplete.
Both API and web container builds pass.
No additional full checklist item closes from this partial contract implementation.
Exact scope: [CONTRACT-RECORDS.md](CONTRACT-RECORDS.md).

## Private Case PDF Jobs

Verified: 8 November 2026, Asia/Dubai.
Code commit: `f4916f5eca68b3ca8830e3c0c6b6f43d578e3906`.
Environment: GitHub Actions, MySQL 8.4, Node 22, Chromium desktop/mobile, and Poppler.
Evidence: [API, migrations, MySQL, and real-browser reports](https://github.com/yehiashouman/leaseflow/actions/runs/42477399599).
Preview: [synthetic workflows and deployment](https://github.com/yehiashouman/leaseflow/actions/runs/42477305243).

The baseline passes 68 API tests, 78 web tests, and 77 MySQL cases: 223 automated tests.
Browser suites pass four interface fixtures, twelve synthetic previews, and ten real API/MySQL journeys: 26 cases.
The real case journeys now include actual PDF downloads, text extraction, and rendered-page artifacts.
Lint, both migrations, schema validation, production/preview builds, and the high/critical audit gate pass.
Seven moderate development-tool advisories remain.

| Item    | Code                                                          | Verified scope                                                                                                                              |
| ------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| PDF-010 | api/src/case-report.ts; api/src/report-worker.ts              | Report ID, actual generation timestamp, immutable factual SHA-256, and separate PDF-byte hash                                               |
| PDF-011 | api/src/case-report.ts; api/src/routes/reports.ts             | PDF metadata, visible document disclaimer, and JSON source disclaimer state factual records without legal certification                     |
| PDF-012 | api/src/routes/reports.ts; api/src/report-worker.ts           | Scoped queue creation, private snapshots, background claims, fresh download access, and safe export audits                                  |
| PDF-013 | api/prisma/schema.prisma; web/src/components/case-reports.tsx | Persistent QUEUED, RUNNING, COMPLETE, FAILED states and active-job status polls                                                             |
| PDF-014 | api/integration/reports.test.ts                               | Persisted failures, explicit replay-safe retries, retry limits, expired leases, and stale-worker result rejection                           |
| PDF-016 | api/integration/reports.test.ts; web/e2e/cases.live.spec.ts   | Poppler extracts actual PDF text; tests verify original authors, disputes, resolutions, disclaimer, report identity, timestamps, and hashes |

Twelve new MySQL cases verify access, job privacy, retries, corruption, quotas, source preservation, and worker concurrency.
Five renderer tests verify canonical hashes, real PDF structure, long tokens, page breaks, resource limits, and explicit unsupported-text failures.
Four component tests verify replay keys, authorized byte downloads, source fallback, retry commands, pages, and errors.
We verified both pages of a real browser-exported PDF and the mobile export interface without clipping or page overflow.
Private tenant drafts remain hidden from managers, including report lists and replayed creation commands.
Current authorization denies suspended sessions and inconsistent ownership; DEC-26 remains unresolved.
Unsupported PDF glyphs cause a clear failure; UTF-8 JSON preserves the original source text.
The sample PDF uses synthetic test data and does not certify complete relationship-report coverage.
PDF-001 through PDF-009 and PDF-015 remain unchecked.
Both additive migrations must precede deployment.
Both API and web container builds pass.
Details and explicit limits: [PDF-REPORTS.md](PDF-REPORTS.md).

## Maintenance Responsibility and Cost Proposals

Verified: 8 November 2026, Asia/Dubai.
Code commit: `7246134d72313c9dca10fe4e94bbd89c20ad6c69`.
Environment: GitHub Actions, MySQL 8.4, Node 22, Chromium desktop and mobile.
Evidence: [API, MySQL, migration, and real-browser verification](https://github.com/yehiashouman/leaseflow/actions/runs/42485244023).
Preview: [synthetic maintenance, browser, and deployment verification](https://github.com/yehiashouman/leaseflow/actions/runs/42485244021).

The baseline passes 72 API tests, 84 web tests, and 89 MySQL cases: 245 automated tests.
Browser suites pass four interface fixtures, fourteen synthetic previews, and twelve real API/MySQL journeys: 30 cases.
Lint, migration, schema validation, production/preview builds, and the high/critical audit gate pass.
Seven moderate development-tool advisories remain.

| Item      | Code                                                                         | Verified scope                                                                                                                                     |
| --------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| MAINT-002 | api/src/routes/maintenance.ts; web/src/components/maintenance-assessment.tsx | Only the current property manager records responsibility; the operational owner remains Leasing Manager even after tenant cost acceptance          |
| MAINT-003 | api/src/routes/maintenance.ts; api/integration/maintenance.test.ts           | Strict schemas reject external assignments; tenant, roommate, foreign manager, and ordinary administrator writes fail                              |
| MAINT-004 | api/src/maintenance-rules.ts; api/prisma/schema.prisma                       | Normal Wear / Leasing Manager Cost persists without a proposed tenant amount or financial entry                                                    |
| MAINT-005 | api/src/routes/maintenance.ts; web/e2e/maintenance.live.spec.ts              | Tenant-Caused Damage / Proposed Tenant Cost persists exact decimals, contract currency, explanation, and factual evidence notes                    |
| MAINT-006 | api/integration/maintenance.test.ts                                          | Under Review and No Cost remain distinct stored classifications and reject proposed tenant amounts                                                 |
| MAINT-008 | api/integration/maintenance.test.ts; web/e2e/maintenance.live.spec.ts        | Only the primary tenant can accept/dispute the current proposal; revisions retain disputes and accepted responsibility cannot be silently replaced |

Twelve new MySQL cases verify ownership, schemas, decimal values, replay keys, notices, safe audits, stale sessions, and competing writes.
Four rule tests verify classifications and assessment-state boundaries.
Four component tests verify literal amounts, evidence notes, retained conflict inputs, exact proposal targets, and command permissions.
Two adapter tests verify synthetic persistence, replay, role denial, and unchanged payment records.
Two new real-browser cases and two new synthetic-browser cases verify the complete dispute/revision/acceptance journey.
Screenshots show desktop/mobile assessment history without page overflow.
Accepted responsibility leaves payments and deposit entries unchanged.
Repair acceptance leaves a pending cost proposal unanswered until an explicit cost response.
The additive 20261108070000_maintenance_assessments migration must precede deployment.
MAINT-001, MAINT-007, and MAINT-009 through MAINT-012 remain unchecked.
Evidence notes do not complete private file evidence, invoices, expense records, or financial posting.
All twenty-six owner decisions remain unresolved.
Exact scope: [MAINTENANCE.md](MAINTENANCE.md).
Both API and web container builds pass.

## Platform and Startup Controls

Verified: 8 November 2026.
Code commit: `8636bc783ed587cde6297210abaa82fe118bb792`.
Environment: GitHub Actions, Node 22, Docker Compose, MySQL 8.4, Redis, source-built MinIO, Chromium desktop/mobile, and Poppler.
Acceptance: [API, MySQL, real browsers, container builds, and fresh-stack Docker](https://github.com/yehiashouman/leaseflow/actions/runs/42489354506).
Preview: [interface fixtures, synthetic browsers, and Pages deployment](https://github.com/yehiashouman/leaseflow/actions/runs/42488032013).

The [thirty-item matrix](PLATFORM-BATCH.md#task-evidence) records each task's implementation, test paths, and exact acceptance scope.
The machine-readable [batch record](batch-30.json) contains exactly thirty unique existing task identifiers and the tested commit.
This batch combines new controls and verification of existing behavior; it does not represent thirty new business modules.

The source passes 84 API tests, 84 web tests, 89 MySQL cases, and ten operations tests: 267 automated tests.
Browser suites pass four interface fixtures, fourteen synthetic previews, and twelve real API/MySQL journeys: thirty cases.
One separate isolated Compose journey also passes.
It verifies zero users after normal startup, explicit demo creation, web proxy login, administrator dashboard access, and password change.
It verifies unchanged environment files, unchanged administrator identity, and successful login with the changed password after teardown and restart.
It verifies retained MySQL, Redis, and file-volume identities plus persisted file content.
It verifies private data-service ports, cookie refresh, CSRF rejection, and forged-header rate-limit resistance through Nginx.
Both application container builds, migrations, schema validation, lint, production/preview builds, and the high/critical audit gate pass.
Seven moderate development-tool advisories remain.
We verified real administrator screenshots on desktop and mobile without clipping or horizontal overflow.
The preview HTML and both referenced assets return HTTP 200.

The original MinIO image pull failed in run 42488031986; the pinned official source build fixes the fresh-stack failure.
The development storage image requires separate security and AGPL review before any production use.
Production contract activation and payment writes now return 409 until approved policy receives verified implementation.
All twenty-six owner decisions remain PENDING.
DEV-013 and DEV-014 remain unchecked because the exact public Codespaces upload/PDF journey is not verified.
Private uploads, providers, MFA, production bootstrap, complete financial ledgers, recovery, and production acceptance remain incomplete.
Strict completion now equals 102 of 764 tasks: 13.35%; 662 tasks remain without full completion evidence.

## Account and Private Document Controls

Commit: `8e7ee86140dae5f522903197c625bfe2e3787cc9`.
Environment: GitHub Actions, Node 22, MySQL 8.4, MinIO, ClamAV, Chromium desktop/mobile.
Verified: 9 November 2026, Asia/Dubai.
Evidence: [application acceptance](https://github.com/yehiashouman/leaseflow/actions/runs/42525841227) and [preview acceptance](https://github.com/yehiashouman/leaseflow/actions/runs/42525841269).

We verified 60 additional requirements from the 100-item target.
All 362 automated tests and 36 browser cases pass.
Real MinIO tests verify private uploads and anonymous object denial.
Real ClamAV tests verify clean and EICAR streams.
Desktop/mobile tests verify upload, scan status, immutable versions, and authorized downloads.
SMTP and Twilio staging delivery remain unverified.
Production approval remains separate.
The [complete matrix](ACCOUNT-DOCUMENT-BATCH.md) records all 40 incomplete items.

| Item         | Code                                                                                                                                                                 | Test                                                                                                                                    |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| BASE-003     | api/src/account-policy.ts; api/src/routes/accounts.ts; api/prisma/schema.prisma; web/src/pages/Account.tsx                                                           | api/test/account-policy.test.ts; api/integration/accounts.test.ts; web/e2e/accounts.live.spec.ts                                        |
| BASE-005     | api/src/routes/invitations.ts; api/src/routes/accounts.ts; web/src/pages/Invitations.tsx; web/src/pages/Account.tsx                                                  | api/integration/accounts.test.ts; api/integration/cases.test.ts; web/e2e/accounts.live.spec.ts                                          |
| BASE-016     | api/src/app.ts; api/src/file-storage.ts; api/src/file-policy.ts; docker-compose.yml                                                                                  | api/test/file-startup.test.ts; api/test/file-storage.test.ts; api/acceptance/files.test.ts; web/e2e/documents.files.spec.ts             |
| DATA-007     | api/prisma/schema.prisma; api/prisma/migrations/20261109000000_private_documents/migration.sql; api/prisma/migrations/20261109010000_account_lifecycle/migration.sql | api/integration/accounts.test.ts; api/integration/documents.test.ts                                                                     |
| DATA-016     | api/prisma/schema.prisma; api/prisma/migrations/20261109000000_private_documents/migration.sql; api/prisma/migrations/20261109010000_account_lifecycle/migration.sql | api/integration/accounts.test.ts; api/integration/documents.test.ts                                                                     |
| AUTH-010     | api/src/routes/accounts.ts; web/src/pages/Account.tsx; api/src/account-policy.ts                                                                                     | api/integration/accounts.test.ts; api/test/account-policy.test.ts; web/src/account.test.tsx; web/e2e/accounts.live.spec.ts              |
| AUTH-011     | api/src/routes/accounts.ts; web/src/pages/Account.tsx; api/src/account-policy.ts                                                                                     | api/integration/accounts.test.ts; api/test/account-policy.test.ts; web/src/account.test.tsx; web/e2e/accounts.live.spec.ts              |
| AUTH-017     | api/src/errors.ts; api/src/app.ts; api/src/db.ts; api/src/file-worker.ts; api/src/email-worker.ts                                                                    | api/test/platform-contract.test.ts; api/integration/accounts.test.ts; api/integration/documents.test.ts                                 |
| AUTH-018     | api/src/errors.ts; api/src/app.ts; api/src/db.ts; api/src/file-worker.ts; api/src/email-worker.ts                                                                    | api/test/platform-contract.test.ts; api/integration/accounts.test.ts; api/integration/documents.test.ts                                 |
| MGR-001      | api/src/routes/accounts.ts; web/src/pages/Account.tsx; api/src/account-policy.ts                                                                                     | api/integration/accounts.test.ts; api/test/account-policy.test.ts; web/e2e/accounts.live.spec.ts                                        |
| MGR-002      | api/src/routes/accounts.ts; web/src/pages/Account.tsx; api/src/account-policy.ts                                                                                     | api/integration/accounts.test.ts; api/test/account-policy.test.ts; web/e2e/accounts.live.spec.ts                                        |
| MGR-003      | api/src/routes/accounts.ts; api/src/routes/documents.ts; web/src/pages/Account.tsx; web/src/components/documents.tsx                                                 | api/integration/accounts.test.ts; api/integration/documents.test.ts; web/e2e/accounts.live.spec.ts; web/e2e/documents.files.spec.ts     |
| MGR-004      | api/src/routes/accounts.ts; api/src/routes/documents.ts; web/src/pages/Account.tsx; web/src/components/documents.tsx                                                 | api/integration/accounts.test.ts; api/integration/documents.test.ts; web/e2e/accounts.live.spec.ts; web/e2e/documents.files.spec.ts     |
| MGR-005      | api/src/routes/accounts.ts; web/src/pages/Account.tsx; api/src/account-policy.ts                                                                                     | api/integration/accounts.test.ts; api/test/account-policy.test.ts; web/e2e/accounts.live.spec.ts                                        |
| MGR-006      | api/src/routes/accounts.ts; web/src/pages/Account.tsx; api/src/account-policy.ts                                                                                     | api/integration/accounts.test.ts; api/test/account-policy.test.ts; web/e2e/accounts.live.spec.ts                                        |
| MGR-007      | api/src/routes/accounts.ts; web/src/pages/Account.tsx; api/src/account-policy.ts                                                                                     | api/integration/accounts.test.ts; api/test/account-policy.test.ts; web/e2e/accounts.live.spec.ts                                        |
| MGR-010      | api/src/account-policy.ts; api/src/routes/accounts.ts; api/prisma/schema.prisma; web/src/pages/Account.tsx                                                           | api/test/account-policy.test.ts; api/integration/accounts.test.ts; web/e2e/accounts.live.spec.ts                                        |
| MGR-011      | api/src/account-policy.ts; api/src/routes/accounts.ts; api/prisma/schema.prisma; web/src/pages/Account.tsx                                                           | api/test/account-policy.test.ts; api/integration/accounts.test.ts; web/e2e/accounts.live.spec.ts                                        |
| MGR-012      | api/src/routes/accounts.ts; api/src/routes/documents.ts; web/src/pages/Account.tsx; web/src/components/documents.tsx                                                 | api/integration/accounts.test.ts; api/integration/documents.test.ts; web/e2e/accounts.live.spec.ts; web/e2e/documents.files.spec.ts     |
| MGR-013      | api/src/routes/accounts.ts; api/src/routes/documents.ts; web/src/pages/Account.tsx; web/src/components/documents.tsx                                                 | api/integration/accounts.test.ts; api/integration/documents.test.ts; web/e2e/accounts.live.spec.ts; web/e2e/documents.files.spec.ts     |
| MGR-015      | api/src/routes/accounts.ts; web/src/pages/Account.tsx; api/src/account-policy.ts                                                                                     | api/integration/accounts.test.ts; api/test/account-policy.test.ts; web/e2e/accounts.live.spec.ts                                        |
| FILE-003     | api/src/routes/documents.ts; api/src/file-worker.ts; web/src/components/documents.tsx                                                                                | api/integration/documents.test.ts; api/acceptance/files.test.ts; web/e2e/documents.files.spec.ts                                        |
| FILE-004     | api/src/routes/documents.ts; api/src/file-worker.ts; web/src/components/documents.tsx                                                                                | api/integration/documents.test.ts; api/acceptance/files.test.ts; web/e2e/documents.files.spec.ts                                        |
| FILE-005     | api/src/routes/documents.ts; api/src/file-worker.ts; web/src/components/documents.tsx                                                                                | api/integration/documents.test.ts; api/acceptance/files.test.ts; web/e2e/documents.files.spec.ts                                        |
| FILE-006     | api/src/routes/documents.ts; api/src/file-worker.ts; web/src/components/documents.tsx                                                                                | api/integration/documents.test.ts; api/acceptance/files.test.ts; web/e2e/documents.files.spec.ts                                        |
| FILE-007     | api/src/file-storage.ts; api/src/file-policy.ts; docker-compose.yml                                                                                                  | api/test/file-storage.test.ts; api/acceptance/files.test.ts; web/e2e/documents.files.spec.ts                                            |
| FILE-008     | api/src/file-storage.ts; api/src/file-policy.ts; docker-compose.yml                                                                                                  | api/test/file-storage.test.ts; api/acceptance/files.test.ts; web/e2e/documents.files.spec.ts                                            |
| FILE-009     | api/src/file-grant.ts; api/src/routes/documents.ts; web/src/components/documents.tsx                                                                                 | api/test/file-policy.test.ts; api/integration/documents.test.ts; api/acceptance/files.test.ts; web/e2e/documents.files.spec.ts          |
| FILE-010     | api/src/routes/documents.ts; api/src/file-worker.ts; web/src/components/documents.tsx                                                                                | api/integration/documents.test.ts; api/acceptance/files.test.ts; web/e2e/documents.files.spec.ts                                        |
| FILE-011     | api/src/routes/documents.ts; api/src/file-worker.ts; web/src/components/documents.tsx                                                                                | api/integration/documents.test.ts; api/acceptance/files.test.ts; web/e2e/documents.files.spec.ts                                        |
| FILE-012     | api/src/routes/inventory.ts; api/src/routes/documents.ts; web/src/pages/UnitDetail.tsx; web/src/components/documents.tsx                                             | api/integration/unit-lifecycle.test.ts; api/integration/documents.test.ts; web/e2e/documents.files.spec.ts                              |
| FILE-013     | api/src/routes/documents.ts; api/src/case-data.ts; api/src/routes/maintenance.ts; web/src/pages/RequestDetail.tsx                                                    | api/integration/documents.test.ts; api/integration/maintenance.test.ts; api/integration/cases.test.ts; web/e2e/maintenance.live.spec.ts |
| FILE-014     | api/src/account-policy.ts; api/src/routes/accounts.ts; api/src/routes/admin.ts                                                                                       | api/integration/accounts.test.ts; api/integration/cases.test.ts                                                                         |
| FILE-015     | api/src/account-email.ts; api/src/routes/invitations.ts; api/src/app.ts; api/src/db.ts                                                                               | api/test/account-policy.test.ts; api/integration/accounts.test.ts; api/test/platform-contract.test.ts                                   |
| FILE-019     | api/src/routes/documents.ts; api/src/file-worker.ts; web/src/components/documents.tsx                                                                                | api/integration/documents.test.ts; api/acceptance/files.test.ts; web/e2e/documents.files.spec.ts                                        |
| TEN-001      | api/src/routes/invitations.ts; api/src/routes/accounts.ts; web/src/pages/Invitations.tsx; web/src/pages/Account.tsx                                                  | api/integration/accounts.test.ts; api/integration/cases.test.ts; web/e2e/accounts.live.spec.ts                                          |
| TEN-002      | api/src/routes/invitations.ts; api/src/routes/accounts.ts; web/src/pages/Invitations.tsx; web/src/pages/Account.tsx                                                  | api/integration/accounts.test.ts; api/integration/cases.test.ts; web/e2e/accounts.live.spec.ts                                          |
| TEN-003      | api/src/routes/invitations.ts; api/src/routes/accounts.ts; web/src/pages/Invitations.tsx; web/src/pages/Account.tsx                                                  | api/integration/accounts.test.ts; api/integration/cases.test.ts; web/e2e/accounts.live.spec.ts                                          |
| TEN-005      | api/src/routes/invitations.ts; api/src/routes/accounts.ts; web/src/pages/Invitations.tsx; web/src/pages/Account.tsx                                                  | api/integration/accounts.test.ts; api/integration/cases.test.ts; web/e2e/accounts.live.spec.ts                                          |
| TEN-008      | api/src/routes/accounts.ts; api/src/routes/documents.ts; web/src/pages/Account.tsx; web/src/components/documents.tsx                                                 | api/integration/accounts.test.ts; api/integration/documents.test.ts; web/e2e/accounts.live.spec.ts; web/e2e/documents.files.spec.ts     |
| TEN-009      | api/src/routes/invitations.ts; api/src/routes/accounts.ts; web/src/pages/Invitations.tsx; web/src/pages/Account.tsx                                                  | api/integration/accounts.test.ts; api/integration/cases.test.ts; web/e2e/accounts.live.spec.ts                                          |
| TEN-011      | api/src/account-email.ts; api/src/routes/accounts.ts; api/src/routes/profile.ts                                                                                      | api/integration/accounts.test.ts; api/integration/cases.test.ts                                                                         |
| UNIT-003     | api/src/routes/inventory.ts; api/src/routes/documents.ts; web/src/pages/LandlordDetail.tsx                                                                           | api/integration/landlords.test.ts; api/integration/documents.test.ts; web/e2e/inventory.live.spec.ts                                    |
| UNIT-010     | api/src/routes/inventory.ts; api/src/routes/documents.ts; web/src/pages/UnitDetail.tsx; web/src/components/documents.tsx                                             | api/integration/unit-lifecycle.test.ts; api/integration/documents.test.ts; web/e2e/documents.files.spec.ts                              |
| UNIT-011     | api/src/routes/inventory.ts; api/src/routes/documents.ts; web/src/pages/UnitDetail.tsx; web/src/components/documents.tsx                                             | api/integration/unit-lifecycle.test.ts; api/integration/documents.test.ts; web/e2e/documents.files.spec.ts                              |
| CASE-016     | api/src/routes/documents.ts; api/src/case-data.ts; api/src/routes/maintenance.ts; web/src/pages/RequestDetail.tsx                                                    | api/integration/documents.test.ts; api/integration/maintenance.test.ts; api/integration/cases.test.ts; web/e2e/maintenance.live.spec.ts |
| MAINT-001    | api/src/routes/documents.ts; api/src/case-data.ts; api/src/routes/maintenance.ts; web/src/pages/RequestDetail.tsx                                                    | api/integration/documents.test.ts; api/integration/maintenance.test.ts; api/integration/cases.test.ts; web/e2e/maintenance.live.spec.ts |
| MAINT-007    | api/src/routes/documents.ts; api/src/case-data.ts; api/src/routes/maintenance.ts; web/src/pages/RequestDetail.tsx                                                    | api/integration/documents.test.ts; api/integration/maintenance.test.ts; api/integration/cases.test.ts; web/e2e/maintenance.live.spec.ts |
| MSG-011      | api/src/routes/accounts.ts; api/src/account-email.ts; api/src/email-worker.ts                                                                                        | api/integration/accounts.test.ts; api/test/account-policy.test.ts                                                                       |
| MSG-014      | api/src/routes/accounts.ts; api/src/account-email.ts; api/src/email-worker.ts                                                                                        | api/integration/accounts.test.ts; api/test/account-policy.test.ts                                                                       |
| MSG-016      | api/src/account-email.ts; api/src/routes/invitations.ts; api/src/app.ts; api/src/db.ts                                                                               | api/test/account-policy.test.ts; api/integration/accounts.test.ts; api/test/platform-contract.test.ts                                   |
| MSG-017      | api/src/routes/accounts.ts; api/src/account-email.ts; api/src/email-worker.ts                                                                                        | api/integration/accounts.test.ts; api/test/account-policy.test.ts                                                                       |
| RESOURCE-001 | api/src/routes/accounts.ts; web/src/pages/Account.tsx; api/src/account-policy.ts                                                                                     | api/integration/accounts.test.ts; api/test/account-policy.test.ts; web/e2e/accounts.live.spec.ts                                        |
| RESOURCE-003 | api/src/routes/invitations.ts; api/src/routes/accounts.ts; web/src/pages/Invitations.tsx; web/src/pages/Account.tsx                                                  | api/integration/accounts.test.ts; api/integration/cases.test.ts; web/e2e/accounts.live.spec.ts                                          |
| RESOURCE-017 | api/src/routes/documents.ts; api/src/file-worker.ts; web/src/components/documents.tsx                                                                                | api/integration/documents.test.ts; api/acceptance/files.test.ts; web/e2e/documents.files.spec.ts                                        |
| WORKER-007   | api/src/routes/invitations.ts; api/src/routes/accounts.ts; web/src/pages/Invitations.tsx; web/src/pages/Account.tsx                                                  | api/integration/accounts.test.ts; api/integration/cases.test.ts; web/e2e/accounts.live.spec.ts                                          |
| WORKER-010   | api/src/routes/documents.ts; api/src/file-worker.ts; web/src/components/documents.tsx                                                                                | api/integration/documents.test.ts; api/acceptance/files.test.ts; web/e2e/documents.files.spec.ts                                        |
| CONFIG-008   | api/src/app.ts; api/src/file-storage.ts; api/src/file-policy.ts; docker-compose.yml                                                                                  | api/test/file-startup.test.ts; api/test/file-storage.test.ts; api/acceptance/files.test.ts; web/e2e/documents.files.spec.ts             |
| TEST-AUTH-03 | api/src/routes/invitations.ts; api/src/routes/accounts.ts; web/src/pages/Invitations.tsx; web/src/pages/Account.tsx                                                  | api/integration/accounts.test.ts; api/integration/cases.test.ts; web/e2e/accounts.live.spec.ts                                          |
| TEST-DOC-01  | api/src/routes/documents.ts; api/src/file-worker.ts; web/src/components/documents.tsx                                                                                | api/integration/documents.test.ts; api/acceptance/files.test.ts; web/e2e/documents.files.spec.ts                                        |
