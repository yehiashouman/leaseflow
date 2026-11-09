# Contract Records

Date: 9 November 2026, Asia/Dubai.

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

Contract records support private term views, development contract setup, occupant snapshots, and immutable external payment receipts.
Stored payment statuses and deposit proposals do not certify funds or settle disputes.
Development contract creation now exists.
Acknowledgements, amendments, annual reviews, transfers, closure, and production activation remain incomplete.
Primary and optional secondary occupants now use encrypted identity snapshots and authorized private evidence.
External payment receipts and private evidence now exist; see [PAYMENT-RECEIPTS.md](PAYMENT-RECEIPTS.md).
Financial corrections and complete relationship PDF exports remain incomplete.
Scoped case-history exports now exist; see [PDF-REPORTS.md](PDF-REPORTS.md).
The preview uses synthetic browser-local records and creates no backend records.
Apply the complete migration set for occupant snapshots and receipt records.
The original read-only record layer required no additional migration.
All twenty-six owner decisions remain unresolved.

## Contract Setup Continuation

`GET /api/v1/contracts/options` returns bounded owned active tenants and allowed enabled spaces.
`POST /api/v1/contracts` requires a UUID, current owned references, explicit terms, and sufficient locked capacity.
Exact retries preserve one contract, initial obligation, occupant set, occupancy update, and audit effect.
Changed content under the same key returns 409.
The contract editor supports single/couple setup and explicit primary responsibility.
Due day defaults to 1; notice defaults to 30 days and permits explicit exceptions.
The server copies a matching-currency unit deposit once, unless the manager supplies an explicit deposit.
Cross-currency setup requires an explicit deposit.
Tenant views exclude manager draft contracts, private owner costs, raw identity numbers, and storage keys.
Development proration uses exact decimal arithmetic with an explicit provisional round policy.
Production activation remains gated by the unresolved financial and acknowledgement decisions.
