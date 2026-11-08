# Private Case Reports

Date: 8 November 2026, Asia/Dubai.

## Scope

This batch exports one authorized case and its recorded event history.
It does not implement the complete financial relationship report.
Snapshots exclude account secrets, private storage paths, arbitrary metadata, and current mutable profile fields.
Both participants receive the same factual snapshot hash for the same case version.
Each participant owns separate jobs and cannot download another participant's job.
Private tenant drafts remain inaccessible to managers.
Ordinary administrators cannot use these report endpoints.

## Durable Jobs

- Create jobs with a replay key and expected case version.
- Store immutable snapshots, SHA-256 hashes, and private PDF bytes in MySQL.
- Expose QUEUED, RUNNING, COMPLETE, and FAILED states.
- Claim jobs through row locks and SKIP LOCKED.
- Recover expired sixty-second leases after process interruption.
- Stop automatic recovery after three interrupted attempts.
- Reject stale worker results through lease-token comparisons.
- Permit three explicit failed-job retries without a snapshot change.
- Replay identical retry commands without duplicate audits.
- Limit each account to three queued or active jobs.
- Poll active jobs through the case detail screen.
- Audit queue creation, retries, and successful downloads without private report text.

The API process runs a worker only after its listen event.
Shutdown waits for its current job before database disconnect.
Multiple API instances can claim separate jobs without duplicate completion.
No external provider receives report content.

## API

| Method | Path                         | Purpose                                                                |
| ------ | ---------------------------- | ---------------------------------------------------------------------- |
| POST   | /reports                     | Queue a case snapshot through requestId, expectedVersion, and clientId |
| GET    | /reports?requestId=ID&page=1 | Inspect twenty-item private job pages                                  |
| GET    | /reports/:id                 | Inspect safe job status and hashes                                     |
| GET    | /reports/:id/file            | Download a complete PDF after fresh authorization and integrity checks |
| GET    | /reports/:id/source          | Download the complete UTF-8 JSON snapshot                              |
| POST   | /reports/:id/retry           | Retry a failed job through expectedRetryCount                          |

Every endpoint verifies current account/session access and consistent case ownership.
Downloads require the original job owner and current relationship access.
Responses use no-store and attachment downloads use nosniff.
PDF downloads expose separate factual-snapshot and file-byte SHA-256 headers.
The PDF includes the report ID, generation timestamp, factual hash, UTC timestamps, and page numbers.
Every export states that records are factual, not legal findings or certification.

## Limits

Initial PDF output uses Helvetica and the WinAnsi character set.
Unsupported characters fail explicitly; the UTF-8 JSON source preserves the complete text.
Multilingual fonts, right-to-left layout, and multilingual PDF acceptance remain incomplete.
Technical snapshot limits are 2,000 events and 512,000 UTF-8 bytes.
These limits protect resources; they do not approve the production targets under DEC-20.
Financial ledgers, documents, evidence attachments, and full relationship reports remain incomplete.
DEC-17 retention and DEC-26 closed/suspended relationship access remain unresolved.
Current access denies suspended accounts and inconsistent relationships.
PDF storage uses the private database, not public URLs or the production object-storage acceptance workflow.
The public preview clearly disables PDF exports because it has no live report worker.

## Migration and Verification

Apply the additive 20261108050000_case_report_jobs migration before deployment.
The API adds pdf-lib as a runtime dependency.
CI installs Poppler for actual PDF text and render assertions.
Local renderer/component tests pass; hosted MySQL and browser evidence remains pending.
Acceptance must verify extracted content and rendered pages, not only HTTP status codes.
