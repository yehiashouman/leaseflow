# Durable Business Jobs and Annual Reviews

The standalone worker stores schedules, calendar cursors, leases, attempts, recovery reasons, and effect counts in MySQL.
Redis supplies wake signals and disposable scan checkpoints.
Periodic database scans recover work after a restart or lost Redis data.
A Redis outage does not remove or replace database job state.

## Runtime

Docker Compose starts `worker` after migrations and optional demo initialization.
The explicit command is `node api/dist/src/worker.js`.
`BUSINESS_JOBS_ENABLED=true` enables this process.
`BUSINESS_REDIS_PREFIX` isolates wake and checkpoint keys.
The worker records a database heartbeat and exposes a container health probe.
Heartbeat age detects stopped or interrupted processes.
Redis degradation still permits database polling.

## Monthly Obligations

Each contract has a persistent monthly cursor.
The worker catches up one period per transaction.
Later months use the full stored monthly rent across every calendar month length.
Initial obligations already created during contract admission remain unchanged.
A missing initial development record uses the existing explicit provisional proration rule.
The database unique period constraint, locked job, and lease token prevent duplicate effects.
A payment, its audit event, and cursor movement share one transaction.
The worker preserves original due dates and original currency.
A separate daily status job derives due/late state without a new charge or amount change.

Production financial generation remains paused.
Unsupported due days, unknown applied amendments, final-month policy, ownership inconsistency, and changed source allocation require explicit resolution.
No automatic conversion, deduction, credit, fee, or refund occurs.

## Annual Reviews

Calendar anniversaries create one review at 12, 24, 36, and subsequent same-space months.
Leap-day anchors remain stable across later leap years.
The review preserves source space names, start date, milestone, and immutable events.
A manager receives an in-app notice and configured external intent.
The manager can record no change, a next-month price proposal, or a deferred date.
A tenant can inspect the shared history and any proposed rent and effective month.
Every price proposal remains `PROPOSED`; the original contract rent remains unchanged.
The platform does not apply amendments before the acknowledgement policy receives approval.
Deferred/no-change reminder repetition remains unresolved under DEC-21.
A changed allocation stops source-dependent work instead of silently resetting history.
The complete transfer workflow and anniversary reset remain separate incomplete requirements.

## Room-Change Expiry

A recorded unapproved room-change request expires after five Dubai calendar days.
The immutable reason is `Approval period expired.`
An approval history prevents automatic expiry during negotiation.
The state change, immutable event, participant notices, audit rule, and job result share one transaction.
This worker does not enable the incomplete room-change submission, transfer, or negotiation workflows.
The seven-day negotiation outcome remains gated by DEC-06.

## Operational Recovery

Administrators can inspect opaque job state through `/admin/business-jobs`.
The response excludes contract identifiers, participant names, source identifiers, and lease tokens.
A failed/paused job supports bounded development retries with an explicit reason and UUID.
Retries preserve the original cursor and source context.
Changed retry content or stale retry counts return 409.
Production recovery remains gated by administrator MFA and policy approval.

## API

| Method | Path                                       | Access                                                                     |
| ------ | ------------------------------------------ | -------------------------------------------------------------------------- |
| GET    | /api/v1/reviews                            | Scoped manager or primary tenant; twenty-item pages; search/status filters |
| GET    | /api/v1/reviews/:id                        | Scoped participant history                                                 |
| POST   | /api/v1/reviews/:id/decision               | Owning manager; version, UUID, and decision-specific fields                |
| GET    | /api/v1/operations/business-jobs           | Administrator; opaque bounded job list                                     |
| POST   | /api/v1/operations/business-jobs/:id/retry | Development administrator; UUID, expected retry count, reason              |

Apply the complete migration set before rollout.
Legacy duplicate contract review dates require manual investigation before the new uniqueness constraint can succeed.
The migration does not discard or merge prior records.
The notification constraint requires exactly one case or review event source.
Acceptance must cover actual MySQL execution, real Redis checkpoint loss, replicas, stale leases, and desktop/mobile review decisions.
