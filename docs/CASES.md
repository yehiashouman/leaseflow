# Operational Cases

Date: 8 November 2026, Asia/Dubai.
Scope: maintenance, neighbor complaints, key/lock requests, and general requests.
This implementation does not complete the case or maintenance modules.

## Interfaces

- Tenants select an open contract and submit a title, description, category, and urgency.
- Tenants can save a private draft and explicitly submit it after review; managers cannot inspect unsubmitted drafts.
- Both parties filter case lists by title, type, and status.
- Each case shows immutable messages, status events, author snapshots, and Dubai timestamps.
- Managers respond, request tenant input, start work, reject, or report resolution.
- Tenants accept completion or reopen a case with an explanation.
- Managers can close accepted cases, but cannot accept completion for tenants.
- Resolved cases remain unacknowledged until tenants explicitly accept completion.
- Reopen events preserve previous resolution events and their timestamps.
- Failed forms retain text; stale decisions require review before another attempt.
- A neighbor complaint can identify a current occupant in the same unit. The form shows first name, last initial, and room. A case retains the selected label as it appeared at submission.

## API

| Method | Path                                   | Behavior                                                                                                                                                                               |
| ------ | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | /api/v1/requests                       | Scoped list. See [list filters and paging](LIST-API.md).                                                                                                                               |
| GET    | /api/v1/requests/options               | Tenant-only open contracts and four supported request types                                                                                                                            |
| GET    | /api/v1/requests/options/:id/occupants | Options for a tenant's own contract. Returns a label and opaque selection per eligible occupant.                                                                                       |
| GET    | /api/v1/requests/:id                   | Private case, safe contract summary, history, and permitted actions                                                                                                                    |
| POST   | /api/v1/requests                       | Tenant-only submission. Provide contractId, clientId, type, title, and description. Optional fields include category, urgency, draft, and involvedOccupantId for a neighbor complaint. |
| POST   | /api/v1/requests/:id/messages          | Append immutable message; clientId and message                                                                                                                                         |
| POST   | /api/v1/requests/:id/respond           | Version-checked decision; clientId, expectedVersion, status, and optional message                                                                                                      |

clientId must contain a UUID.
Unchanged retries return current state without duplicate events.
Reused keys with altered content return 409.
Forbidden role decisions return 403; stale or invalid state decisions return 409.
Unknown fields and invalid input return 422.
Resolution, rejection, reopen, and requests for tenant input require explanations.
Closed cases require a reopen decision before new messages.
No endpoint edits or deletes historical events.

## Privacy and Transactions

Case scope requires a consistent contract, tenant, and property manager relationship.
Roommates and foreign managers cannot read or modify another tenant's case.
Ordinary administrators cannot access these endpoints; authorized support access remains incomplete.
Responses exclude owner rent, identity documents, arbitrary legacy metadata, and internal replay keys.
Related tenant contract/dashboard responses expose only case summaries and safe room/property fields.
Manager contract responses exclude tenant account secrets and unrelated identity-profile fields.
Case responses use Cache-Control: no-store.
New audit records contain identifiers, status, and version, never complaint or message text.
Existing legacy audits remain unchanged; historical audit privacy requires separate review.

Mutations lock the actor account and then the relevant contract or case row.
Transactions use READ COMMITTED so post-lock reads observe earlier committed mutations.
Case state, event, sequence, and audit writes share one transaction.
Status decisions also require the current version from the client.
Database unique constraints protect replay keys and event sequences.
Author snapshots preserve the name and role at event creation after later profile changes.

## Migration

Migration: api/prisma/migrations/20261108020000_request_history/migration.sql.
Deploy this migration before the new API.
It adds case versions, submission keys, author snapshots, event sequences, and replay constraints.
Legacy events retain original actor IDs and timestamps without invented names or roles.
Legacy sequences remain null and precede new sequenced events.
Existing descriptions, events, and audits remain intact.

## Verification

Local API and web suites, lint, production builds, and preview builds pass.
New tests cover role rules, form failures, history, retries, stale decisions, and synthetic persistence.
MySQL cases cover privacy, concurrent messages/decisions, legacy relationships, and transactional history.
Real-browser cases exercise tenant/manager messages, dispute, resolution, acceptance, closure, and narrow layouts.
The case acceptance baseline passes 62 API tests, 55 web tests, 39 MySQL cases, and fourteen browser cases.
Evidence: [API, MySQL, and real browsers](https://github.com/yehiashouman/leaseflow/actions/runs/42439739883).
Preview: [synthetic browsers and Pages deployment](https://github.com/yehiashouman/leaseflow/actions/runs/42439739898).
We verified both desktop and mobile case-history screenshots without clipping.
Live tests model separate clients through test-only proxy headers; production rate limits remain enabled.
This does not approve a production trusted-proxy policy.
The subsequent contract regression adds one API test and maps rolled-back Prisma P2034 conflicts to 409 without financial retries.

## Remaining Scope

- Room transfer and move-out still require their dedicated workflows.
- Existing specialized cases remain privately readable and retain permitted messages.
- Attachments, complaint occupant selection, financial cost posting, and completion evidence remain incomplete.
- Maintenance responsibility assessments and explicit cost acceptance/dispute now exist; see [MAINTENANCE.md](MAINTENANCE.md).
- Configurable categories, response deadlines, assignments, and Deadlock workflows remain incomplete.
- Private draft save/submit is implemented; draft content editing and deletion remain incomplete.
- Provider notifications, automatic reminders, exports, and approved support access remain incomplete.
- Historical access after suspension or closure remains subject to unresolved owner decisions.
- The public preview uses synthetic browser-local records without API, financial, or provider effects.

Late-payment approvals update the expected payment date. Other case decisions leave financial records separate.

## Key and lock changes

The reason and security urgency are part of the original submission. An approval records who has authorization and what the authorization covers. Resolution records authorization, cost responsibility, and evidence of completion. Participants can add private evidence files to the case. Case history and PDF exports preserve manager decisions and recorded evidence text. The cost classification does not create a charge, receipt, or deposit entry.

## Request categories

Administrators in development and preview can add, edit, or deactivate request categories at `/admin/request-categories`. Each category belongs to one operational request type and can include one optional or required tenant question. Tenants see active categories for the selected type. The request stores the selected category version, name, question, and answer. Changing or deactivating a category applies to future selections. Existing requests and exact submission retries retain their original facts. Production category edits require administrator MFA.

## Case assignment

The responsible leasing manager can assign an open case to themselves or clear the assignment. Each action stores the actor, reason, and time as a new case event. Authorized participants see the current assignment and earlier assignments in the case history. Assignment changes preserve case status and access scope.

## Late-payment requests

- Tenants select an eligible unpaid rent obligation and a date within their manager-configured limits.
- Submission opens up to ten Dubai calendar days before the original due date and closes as that date starts.
- The manager can approve, reject, or request clarification. Managers can edit tenant limits from the tenant detail screen.
- Approval changes the expected date. Contract records and case history retain the original due date.
- One approval counts per tenant per six Dubai calendar months. A cancellation retains the approval in the history.
- Participants receive case notices according to their preferences. Existing case evidence and PDF controls apply.
- The preview supports the workflow with synthetic records.
