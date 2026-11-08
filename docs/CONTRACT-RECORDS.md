# Contract Records

Date: 8 November 2026, Asia/Dubai.

## Implemented Scope

- Managers and primary tenants can inspect their own contract terms.
- Contract terms include stored dates, rent, currency, due day, notice, and deposit.
- A null end date appears as Open-ended.
- Contract lists, tenant detail, and tenant dashboards link to contract detail.
- Payment records show stored amounts, currency, status, date, method, and reference.
- Deposit entries show stored amounts, descriptions, acceptance dates, and dispute dates.
- Case records link to authorized case detail.
- Each record category provides twenty-item pages with deterministic date and ID order.
- Manager case records and totals exclude private tenant drafts.
- Record category changes reset the page.
- Contract read responses exclude account secrets, owner costs, arbitrary occupant JSON, and evidence storage keys.
- Every request verifies the current account session and consistent tenant/property ownership.
- Contract responses use Cache-Control: no-store.

## API

| Method | Path                                           | Result                  |
| ------ | ---------------------------------------------- | ----------------------- |
| GET    | /contracts                                     | Safe contract summaries |
| GET    | /contracts/:id                                 | Safe stored terms       |
| GET    | /contracts/:id/records?section=payments&page=1 | Stored payment records  |
| GET    | /contracts/:id/records?section=deposits&page=1 | Stored deposit entries  |
| GET    | /contracts/:id/records?section=requests&page=1 | Visible case summaries  |

Ordinary administrators receive 403.
Foreign and inconsistent relationships receive 404.
Invalid sections, pages, and extra query fields receive 422.
Record pages return items, total, page, and pageSize.
The existing list endpoint retains its array response and excludes nested payment/request collections.
The detail screen uses the scoped record endpoint instead.

## Verification

Local component and preview-adapter tests cover stored values, currency, pages, section resets, failures, and role denial.
Six MySQL cases cover ownership, draft privacy, decimal values, pagination, safe projections, and reassignment.
Desktop/mobile browser tests cover real API records and equivalent synthetic preview navigation.
Hosted API, MySQL, and browser suites pass.
Evidence: [contract record verification](EVIDENCE.md#contract-detail-and-private-records).

## Limits

This batch adds read-only records, not a complete contract or financial module.
Stored payment statuses and deposit proposals do not certify funds or settle disputes.
Contract creation, acknowledgements, amendments, annual reviews, transfers, and closure remain incomplete.
Secondary-occupant identity data requires its approved schema and access policy.
Receipts, evidence downloads, financial corrections, and complete relationship PDF exports remain incomplete.
Scoped case-history exports now exist; see [PDF-REPORTS.md](PDF-REPORTS.md).
The preview uses synthetic browser-local records and creates no backend records.
No database migration or new dependency accompanies this batch.
All twenty-six owner decisions remain unresolved.
