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

## Unverified Release Gates

The new MySQL integration suite has no local execution evidence because this host lacks MySQL and Docker.
CI must run migrations and execute api/integration/space.test.ts before database acceptance.
Real provider delivery, full release journeys, recovery, and production approval remain unverified.
