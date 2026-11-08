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
Documents, unit activation, unit archive/restore, and the complete inventory module remain incomplete.
