# Maintenance Responsibility

Date: 8 November 2026, Asia/Dubai.

## Implemented Scope

- Keep the Leasing Manager as the operational maintenance owner.
- Persist Normal Wear / Leasing Manager Cost, Tenant-Caused Damage / Proposed Tenant Cost, Under Review, and No Cost assessments.
- Capture proposed tenant amount, contract currency, explanation, and factual evidence notes.
- Require a positive decimal string with at most two decimal places for tenant-cost proposals.
- Reject proposed amounts on the other three classifications.
- Allow only the primary tenant to accept or dispute the current proposal.
- Keep repair completion and cost responsibility separate.
- Preserve prior proposals, tenant responses, author snapshots, and timestamps.
- Allow a manager to revise a pending or disputed assessment through a new immutable assessment.
- Prevent silent replacement of accepted cost responsibility.
- Preserve replay keys and reject stale case versions or competing decisions.
- Create safe audit records and transactional in-app notices for both participants.
- Exclude technician, landlord, and building-management assignments and account workflows.
- Provide matching synthetic preview behavior without backend requests.

## API

| Method | Path                                            | Role                                                      |
| ------ | ----------------------------------------------- | --------------------------------------------------------- |
| POST   | /requests/:id/maintenance                       | Current property Leasing Manager                          |
| POST   | /requests/:id/maintenance/:assessmentId/respond | Contract primary tenant                                   |
| GET    | /requests/:id                                   | Authorized participant; safe assessments and action flags |

Mutations require clientId and expectedVersion.
Assessments require classification and explanation.
Tenant-cost proposals also require proposedAmount and evidenceNotes.
Tenant responses require ACCEPTED or DISPUTED and an explanation.
The API derives currency from the contract; clients cannot override it.
All mutations lock the current actor and case, then verify the account session and consistent tenant/property ownership.
Private drafts remain hidden from managers.
Ordinary administrators and foreign relationships cannot mutate assessments.
Tenant response remains available for an existing pending proposal after operational repair closure.
Repair closure does not accept a cost proposal or settle a financial dispute.

## Limits

Accepted responsibility does not create a charge, payment, expense, or deposit deduction.
Ledger posting, double-recovery prevention, and bookkeeping remain incomplete.
Evidence notes are factual text, not uploaded photos, invoices, or attachments.
Private file uploads, quarantine, download permissions, and complete evidence acceptance remain incomplete.
Assessment evidence notes require at least three characters; this is a technical validation rule, not evidence authentication.
Currency conversion and financial rounding policies remain unchanged.
No provider delivery, external technician workflow, or automatic financial claim accompanies an assessment.
All unresolved owner decisions remain unresolved.

## Migration and Verification

Apply the additive 20261108070000_maintenance_assessments migration before deployment.
Local API, component, preview-adapter, and build verification precedes hosted MySQL and browser acceptance.
Hosted evidence remains pending until EVIDENCE.md records a successful workflow run.
