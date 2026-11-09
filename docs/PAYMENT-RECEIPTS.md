# External Rent Payment Records

The contract payment panel exposes individual external payment receipts and private evidence.
Each receipt preserves amount, original currency, external payment time, method, reference, actor, and cumulative recorded paid total.
The original obligation amount remains unchanged.
Receipt creation and aggregate updates share one MySQL transaction and an audit event.
Actor and payment locks serialize concurrent writes.
An actor-scoped UUID prevents duplicate records and rejects different content under the same key.
Decimal arithmetic preserves cents.
The API rejects overpayment, future payment dates, direct storage keys, disputed obligations, and draft contracts.
The manager and primary tenant can inspect authorized receipt history.
Other tenants, unrelated managers, and administrators cannot inspect business receipts through these routes.
The interface requires explicit confirmation that the external payment already happened.
The application does not collect funds or imply tenant acknowledgement.

## Limits

Production writes remain disabled until financial and acknowledgement policies receive approval.
Historical aggregate amounts can predate individual receipt records.
The interface labels this boundary explicitly.
Correction, reversal, allocation, advance payment, tenant error reports, and receipt PDF workflows remain incomplete.
No ordinary receipt edit or delete route exists.
Private evidence uses the existing quarantine, scan, version, and authorization workflow.

## API

`POST /api/v1/payments/:id/record` requires manager authentication and a UUID `clientId`.
The body requires a decimal-string `amountPaid`, ISO timestamp `paidAt`, and nonempty `method`.
`reference` is optional and nullable.
The first successful request returns 201; an exact retry returns the original receipt with 200.
Changed content under the same key returns 409.
`GET /api/v1/payments/:id/receipts?page=1` returns twenty records per page, with a maximum page of 10000.
Order uses creation time descending, then identifier descending.
The response states the total and preserves original currency.
