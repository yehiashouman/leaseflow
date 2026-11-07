# LeaseFlow Project Checklist

Source: [requirements.md](requirements.md), blob `76eba54271889ebb4ec52dc61efeaf0b99386974`.
Date: 7 November 2026.
Target repository: `yehiashouman/leaseflow`.
Scope: complete initial release, not a scaffold or prototype.

## Status Rules

All boxes start unchecked.
Unchecked means completion is not verified; it does not prove the feature is absent.
This document does not audit current implementation.
Each identifier is stable after this baseline.

- Mark an item complete only after code, API, interface, persistence, authorization, and applicable tests satisfy its requirement.
- Attach commit, implementation path, test path, and verification evidence to each completed item.
- Record failed tests, known defects, and blocked dependencies beside the affected item.
- Resolve applicable DEC identifiers before final approval of dependent workflows.
- Do not treat packages, schemas, infrastructure files, or health probes as feature completion.
- Keep landlord portals, staff accounts, public listings, native mobile apps, and online payment collection outside initial-release work.
- Keep Bed Space and Partition server-disabled with the label "Future feature."
- Preserve the original product rules and the current repository stack.
- Use requirement sections to resolve detail; do not silently replace them with assumptions.
- Update this checklist when approved requirements change.

## Module Completion Evidence

Use this format beside a completed task:

`Commit: <sha>; Code: <path>; Test: <path>; Evidence: <artifact>; Environment: <name>; Verified: <date>`.

A module is complete only after its implementation, interface, API, tests, and applicable release gates pass.

## Execution Order

| Order | Work | Dependencies |
|---|---|---|
| 1 | Scope, decisions, stack, data, authorization, files, providers | Original requirements |
| 2 | Accounts, verification, moderation, invitations | Identity, private files, email, Twilio |
| 3 | Landlords, units, spaces, tenants, contracts | Account activation and ownership |
| 4 | Rent, payments, deposits, cases, transfers, move-out | Contracts, dates, ledgers, decisions |
| 5 | Expenses, dashboards, notifications, reports | Scoped operational data and provider jobs |
| 6 | Complete interfaces, API coverage, security, deployment | Functional modules |
| 7 | Full acceptance suite, browser journey, release evidence | All initial-release modules |

Phases define order, not permission to omit initial-release modules.
Independent tasks can proceed while unrelated decisions remain open.

## 1. Scope and Architecture

Requirements: 1-3, 15, 18-21.

- [ ] **BASE-001** Preserve Unit -> Rental Space -> Contract -> Primary Tenant / Secondary Occupant.
- [ ] **BASE-002** Keep landlords reusable records without initial-release login.
- [ ] **BASE-003** Keep Leasing Managers responsible for legal sufficiency and authorization.
- [ ] **BASE-004** Describe administrator approval as platform activation, never legal certification.
- [ ] **BASE-005** Keep public manager registration and invitation-only tenant accounts.
- [ ] **BASE-006** Keep payments external; record money without collection or escrow.
- [ ] **BASE-007** Preserve future inventory images, amenities, and availability without a public marketplace.
- [ ] **BASE-008** Keep optional compatibility fields non-binding.
- [ ] **BASE-009** Retain Fastify and TypeScript in the api workspace.
- [ ] **BASE-010** Retain MySQL and Prisma migrations.
- [ ] **BASE-011** Retain React, TypeScript, Vite, and React Router in the web workspace.
- [ ] **BASE-012** Retain Bootstrap 5, Bootstrap Icons, SCSS, React Query, and Axios.
- [ ] **BASE-013** Exclude Tailwind.
- [ ] **BASE-014** Keep REST API independent from web deployment.
- [ ] **BASE-015** Use Redis with durable workers and a scheduler.
- [ ] **BASE-016** Use private S3-compatible storage and development MinIO.
- [ ] **BASE-017** Retain Docker Compose, Codespaces, Helm, Terraform, and the AWS baseline.
- [ ] **BASE-018** Select maintained PDF, job, upload-scan, and browser-test libraries.
- [ ] **BASE-019** Record technical selections without claims of original user approval.
- [ ] **BASE-020** Make all initial-release workflows accessible through real screens and APIs.

## 2. Decisions and Change Control

Requirements: 20, 24, 29.

- [ ] **PLAN-001** Assign an owner and status to every DEC item in section 29 of requirements.md.
- [ ] **PLAN-002** Record each approved answer, date, rationale, and affected task identifiers.
- [ ] **PLAN-003** Resolve money, due-day, notice, final-month, transfer, and eligibility rules before dependent acceptance.
- [ ] **PLAN-004** Resolve privacy, retention, security, provider, performance, and recovery policies before production approval.
- [ ] **PLAN-005** Keep unapproved proposals separate from accepted business rules.
- [ ] **PLAN-006** Do not silently adopt last-day due dates or half-open allocation intervals.
- [ ] **PLAN-007** Preserve unaffected work while decisions remain open.
- [ ] **PLAN-008** Update requirements, API schemas, interface copy, and tests for each approved change.
- [ ] **PLAN-009** Preserve past contract terms when defaults change.
- [ ] **PLAN-010** Preserve SPECIFICATION.md as the original source.
- [ ] **PLAN-011** Maintain a requirement-to-code-to-test evidence matrix.

## 3. Data and Persistence

Requirements: 14, 24.

- [ ] **DATA-001** Create versioned Prisma migrations for all required entities listed in the entity inventory below.
- [ ] **DATA-002** Add manager ownership to each business record.
- [ ] **DATA-003** Add foreign keys for every domain relationship.
- [ ] **DATA-004** Add uniqueness constraints for identity and retry-sensitive operations.
- [ ] **DATA-005** Index ownership, relationship, status, deadline, period, and report query paths.
- [ ] **DATA-006** Persist verification states, role, account status, language, and timezone.
- [ ] **DATA-007** Persist invitation lifecycle, security sessions, declarations, and immutable consent hashes.
- [ ] **DATA-008** Persist primary and secondary occupants with effective allocation dates.
- [ ] **DATA-009** Persist original contract terms and effective-dated amendments.
- [ ] **DATA-010** Persist separate original due dates and approved expected dates.
- [ ] **DATA-011** Persist obligations, payments, allocations, credits, reversals, charges, deductions, and refunds.
- [ ] **DATA-012** Use decimal arithmetic or integer minor units for money.
- [ ] **DATA-013** Apply the approved currency-round policy; never use binary floating-point for posted balances.
- [ ] **DATA-014** Store original currency, original amount, AED value, rate, source, and source time.
- [ ] **DATA-015** Keep AED as default and support USD.
- [ ] **DATA-016** Persist file versions, private object keys, scan status, and expiry.
- [ ] **DATA-017** Persist append-only audit, case, payment correction, and deposit events.
- [ ] **DATA-018** Record real administrator and effective identity for impersonated actions.
- [ ] **DATA-019** Preserve historical relationship access under the approved retention policy.
- [ ] **DATA-020** Reject archive actions that invalidate active contracts or erase protected history.
- [ ] **DATA-021** Use transactions and locks for capacity, finance, allocation, and transfer invariants.
- [ ] **DATA-022** Prevent payment and deposit over-allocation.
- [ ] **DATA-023** Keep disputed proposals separate from accepted deductions.
- [ ] **DATA-024** Keep deposit liabilities outside rent income and operational profit.
- [ ] **DATA-025** Require explicit allocations for payments across multiple obligations.
- [ ] **DATA-026** Keep financial history queryable after defaults and exchange rates change.

## 4. Authentication and Session Security

Requirements: 3, 16, 22.2, 23-24.

- [ ] **AUTH-001** Implement role-aware login for Administrator, Leasing Manager, and Tenant.
- [ ] **AUTH-002** Enforce verification and account-status restrictions on every protected request.
- [ ] **AUTH-003** Route each role to its own dashboard.
- [ ] **AUTH-004** Prevent administrator fallback to manager-only endpoints.
- [ ] **AUTH-005** Implement logout and session revocation.
- [ ] **AUTH-006** Issue short-lived access tokens and rotating refresh tokens.
- [ ] **AUTH-007** Detect refresh-token replay and revoke affected sessions.
- [ ] **AUTH-008** Protect refresh-token storage and transport.
- [ ] **AUTH-009** Protect cookie-authenticated mutations against CSRF.
- [ ] **AUTH-010** Implement password reset with expiring single-use tokens.
- [ ] **AUTH-011** Revoke affected sessions after password reset.
- [ ] **AUTH-012** Implement password change and authorized session review.
- [ ] **AUTH-013** Reverify changed email addresses and phone numbers.
- [ ] **AUTH-014** Require administrator MFA before privileged access.
- [ ] **AUTH-015** Offer manager MFA according to the approved security policy.
- [ ] **AUTH-016** Enforce rate limits for login, OTP, invitations, uploads, and reports.
- [ ] **AUTH-017** Return safe actionable errors and request identifiers.
- [ ] **AUTH-018** Exclude passwords, tokens, OTP values, and sensitive identifiers from logs.
- [ ] **AUTH-019** Verify unauthorized role transitions cannot elevate privileges.

## 5. Manager Registration and Activation

Requirements: 3.1, 16, 22.2.

- [ ] **MGR-001** Implement public manager registration without tenant self-registration.
- [ ] **MGR-002** Capture full legal name, date of birth, nationality, email, and mobile number.
- [ ] **MGR-003** Capture Emirates ID number, expiry date, and private document.
- [ ] **MGR-004** Capture optional UAE licence type, number, authority, issue date, expiry, and document.
- [ ] **MGR-005** Verify email through an expiring single-use link.
- [ ] **MGR-006** Provide controlled email resend.
- [ ] **MGR-007** Require email verification before Twilio WhatsApp OTP.
- [ ] **MGR-008** Verify the manager's phone through Twilio.
- [ ] **MGR-009** Enforce approved OTP expiry, attempts, and resend limits.
- [ ] **MGR-010** Capture declarations for genuine, current identity, property, and authorization information.
- [ ] **MGR-011** Store declaration version, accepted text hash, timestamp, and IP/session.
- [ ] **MGR-012** Show profile and document completeness.
- [ ] **MGR-013** Submit completed accounts to administrator moderation.
- [ ] **MGR-014** Show pending, rejected, suspended, and active status with permitted actions.
- [ ] **MGR-015** Prevent duplicate registration submissions.
- [ ] **MGR-016** Apply approved rejection-resubmission and suspension policies.
- [ ] **MGR-017** Notify the manager of moderation outcomes.

## 6. Administration and Support

Requirements: 3.2, 16, 22.3.

- [ ] **ADMIN-001** Build the account review queue.
- [ ] **ADMIN-002** Show platform counts, security alerts, and operational health summaries.
- [ ] **ADMIN-003** Inspect account identity status, declarations, documents, and history.
- [ ] **ADMIN-004** Approve, reject, suspend, and restore accounts with reasons.
- [ ] **ADMIN-005** Audit every moderation action.
- [ ] **ADMIN-006** Inspect submitted unit information, document expiry, reports, and suspension status.
- [ ] **ADMIN-007** Use Information Complete, Documents Submitted, Expired, Reported, and Suspended labels where appropriate.
- [ ] **ADMIN-008** Exclude legally approved and verified property certification claims.
- [ ] **ADMIN-009** Manage global feature flags and system defaults.
- [ ] **ADMIN-010** Manage request categories and amenity lists.
- [ ] **ADMIN-011** Manage notification templates and language fallbacks.
- [ ] **ADMIN-012** Review duplicate identity signals, abuse, suspicious activity, and audit history.
- [ ] **ADMIN-013** Provide governed operational and platform audit exports.
- [ ] **ADMIN-014** Require a reason before support impersonation.
- [ ] **ADMIN-015** Display an unmistakable impersonation banner.
- [ ] **ADMIN-016** Record actual actor, effective identity, session start, session end, and actions.
- [ ] **ADMIN-017** Enforce the approved impersonation restrictions.
- [ ] **ADMIN-018** Allow support sessions to end explicitly.
- [ ] **ADMIN-019** Prevent silent edits to confirmed payments, contracts, evidence, and conversations.
- [ ] **ADMIN-020** Prevent administrator decisions on tenant-manager disputes.
- [ ] **ADMIN-021** Keep future administrator sub-roles distinct from current role permissions.

## 7. Private Documents and Media

Requirements: 4-5, 13-16, 23-26.

- [ ] **FILE-001** Implement authorized upload for identity, licence, property, consent, payment, maintenance, complaint, and report files.
- [ ] **FILE-002** Validate approved MIME types, actual content, file size, and ownership.
- [ ] **FILE-003** Prevent executable uploads.
- [ ] **FILE-004** Strip dangerous metadata where appropriate.
- [ ] **FILE-005** Quarantine uploads until a virus scan accepts them.
- [ ] **FILE-006** Expose scan status and rejected-file errors.
- [ ] **FILE-007** Store documents in private S3-compatible buckets.
- [ ] **FILE-008** Block public object access.
- [ ] **FILE-009** Issue short-lived signed downloads after authorization.
- [ ] **FILE-010** Audit document access and exports.
- [ ] **FILE-011** Version documents instead of overwrite.
- [ ] **FILE-012** Support unit, common-area, and space photos with authorized access.
- [ ] **FILE-013** Preserve attachment authorship and case references.
- [ ] **FILE-014** Mask sensitive identity numbers in routine screens and reports.
- [ ] **FILE-015** Avoid document contents in email or WhatsApp.
- [ ] **FILE-016** Implement approved expiry and retention policies.
- [ ] **FILE-017** Implement authorized data export and appropriate deletion/anonymization.
- [ ] **FILE-018** Preserve dispute holds and required financial/audit history.
- [ ] **FILE-019** Verify unauthorized, expired-link, unscanned, oversized, and unsafe file paths.

## 8. Landlords and Units

Requirements: 4.1-4.2, 22.4.

- [ ] **UNIT-001** Implement scoped landlord list, detail, create, edit, archive, and linked units.
- [ ] **UNIT-002** Capture landlord name and optional company/legal name.
- [ ] **UNIT-003** Capture email, phone, WhatsApp, preferred contact method, address, notes, and documents.
- [ ] **UNIT-004** Allow one landlord record to serve multiple manager-owned units.
- [ ] **UNIT-005** Capture unit name/reference, building, street, area/community, emirate, and address notes.
- [ ] **UNIT-006** Capture GPS latitude and longitude.
- [ ] **UNIT-007** Link each unit to its manager and landlord.
- [ ] **UNIT-008** Capture owner rent, payment schedule, and currency.
- [ ] **UNIT-009** Capture the default unit security deposit.
- [ ] **UNIT-010** Support unit and common-area images.
- [ ] **UNIT-011** Support property documents and manager declarations.
- [ ] **UNIT-012** Capture tenancy contract, consent/delegation, title-deed copy, or approved evidence categories.
- [ ] **UNIT-013** Prevent unit activation without required data, declarations, and documents.
- [ ] **UNIT-014** Apply the confirmed evidence policy rather than infer legal sufficiency.
- [ ] **UNIT-015** Support air conditioning, furnished, bed, television, refrigerator, and bathroom amenities.
- [ ] **UNIT-016** Support kitchen, laundry, balcony, parking, Wi-Fi, and cleaning amenities.
- [ ] **UNIT-017** Support configurable additional amenities.
- [ ] **UNIT-018** Expose unit status and safe archive/restore actions.
- [ ] **UNIT-019** Show unit spaces, occupants, contracts, finance, maintenance, and deposit exposure.

## 9. Rental Spaces and Availability

Requirements: 2.2, 4.3, 5.2, 14.1, 24.2.

- [ ] **SPACE-001** Implement space list, detail, create, edit, status, and permitted archive actions.
- [ ] **SPACE-002** Enable Room and Master Room.
- [ ] **SPACE-003** Require private bathroom facilities for Master Room classification.
- [ ] **SPACE-004** Retain Bed Space and Partition types as globally disabled future features.
- [ ] **SPACE-005** Reject disabled-type activation, allocation, advertisement, and contracts in the API.
- [ ] **SPACE-006** Show Future feature explanation through keyboard, touch, and hover-compatible help.
- [ ] **SPACE-007** Capture internal name/number, type, capacity, and availability.
- [ ] **SPACE-008** Capture photos, amenities, optional compatibility notes, and base asking rent.
- [ ] **SPACE-009** Inherit unit deposit defaults for new contract proposals.
- [ ] **SPACE-010** Support active, inactive, and maintenance status.
- [ ] **SPACE-011** Block new allocations to inactive or maintenance spaces.
- [ ] **SPACE-012** Count primary and secondary occupants against physical capacity.
- [ ] **SPACE-013** Verify capacity across every affected date.
- [ ] **SPACE-014** Serialize concurrent reservations and transfers.
- [ ] **SPACE-015** Preserve historical contracts when asking prices and defaults change.
- [ ] **SPACE-016** Implement approved reservation and expiry policy.
- [ ] **SPACE-017** Preserve operational holds after effective transfer or move-out.

## 10. Tenant Invitations and Occupants

Requirements: 5, 22.2, 22.4-22.5.

- [ ] **TEN-001** Allow managers to invite tenants by email.
- [ ] **TEN-002** Scope each invitation to its manager and intended tenant.
- [ ] **TEN-003** Implement invitation inspect, resend, revoke, expiry, and acceptance.
- [ ] **TEN-004** Reject public tenant self-registration.
- [ ] **TEN-005** Verify invitation email before tenant phone confirmation.
- [ ] **TEN-006** Let tenants supply their own phone numbers.
- [ ] **TEN-007** Verify tenant WhatsApp OTP through Twilio.
- [ ] **TEN-008** Capture full name, date of birth, nationality, Emirates ID number, expiry, and document.
- [ ] **TEN-009** Link the tenant only to the inviting manager under the initial policy.
- [ ] **TEN-010** Implement email, WhatsApp, or Both preferences for non-security notices.
- [ ] **TEN-011** Prevent complete removal of critical security notices.
- [ ] **TEN-012** Support one primary tenant and one contract for a single occupant.
- [ ] **TEN-013** Support one primary tenant and optional secondary occupant for a couple.
- [ ] **TEN-014** Capture secondary occupant identity and Emirates ID status without a separate account.
- [ ] **TEN-015** Keep primary tenant responsibility explicit.
- [ ] **TEN-016** Use separate accounts and contracts for unrelated occupants in the same room.
- [ ] **TEN-017** Keep sex, nationality, language, culture, and lifestyle preferences optional.
- [ ] **TEN-018** Keep sleep schedule, smoking, noise, and shared-language compatibility non-binding.
- [ ] **TEN-019** Show tenant completion, contacts, identity, occupancy, contract, finance, and request history.

## 11. Contracts and Annual Reviews

Requirements: 6, 14, 17, 22-24.

- [ ] **CON-001** Implement open-ended monthly contracts without a mandatory annual end date.
- [ ] **CON-002** Capture space, primary tenant, occupants, start date, monthly rent, currency, due day, notice, and deposit.
- [ ] **CON-003** Default due day to 1 and notice to 30 days.
- [ ] **CON-004** Support explicit per-contract notice exceptions such as 15 days.
- [ ] **CON-005** Preserve original terms and all effective-dated amendments.
- [ ] **CON-006** Implement tenant visibility and the approved acknowledgement policy.
- [ ] **CON-007** Prevent automatic rent changes at annual review.
- [ ] **CON-008** Create same-space reviews at 12, 24, 36, and subsequent continuous-month milestones.
- [ ] **CON-009** Notify managers through configured channels.
- [ ] **CON-010** Support Reviewed / No Change, next-month price proposal, and deferred review date.
- [ ] **CON-011** Show proposed amendments and effective months to tenants.
- [ ] **CON-012** Reset same-space anniversary after transfer without loss of history.
- [ ] **CON-013** Prevent duplicate annual reviews.
- [ ] **CON-014** Apply approved reminder behavior for deferred and no-change reviews.
- [ ] **CON-015** Close contracts through confirmed move-out without silent record deletion.

## 12. Rent Obligations and Calculations

Requirements: 6-7, 17, 24.3.

- [ ] **RENT-001** Generate obligations from active contract terms and effective amendments.
- [ ] **RENT-002** Calculate first rent as monthly rent / actual calendar days * occupied days.
- [ ] **RENT-003** Include the move-in day.
- [ ] **RENT-004** Use full monthly rent for subsequent complete months.
- [ ] **RENT-005** Apply confirmed final-month and due-day policies.
- [ ] **RENT-006** Store amount, period, original due date, approved expected date, allocations, and balance.
- [ ] **RENT-007** Prevent duplicate obligations per contract period.
- [ ] **RENT-008** Support Upcoming, Due, Partially Paid, Paid, Late, Waived/Adjusted, and Disputed states.
- [ ] **RENT-009** Audit waivers and adjustments.
- [ ] **RENT-010** Verify AED 3,100 with 17 January move-in produces 15 days and AED 1,500.
- [ ] **RENT-011** Verify AED 2,900 with leap-year 15 February move-in produces 15 days and AED 1,500.
- [ ] **RENT-012** Verify AED 2,800 with non-leap 15 February move-in produces 14 days and AED 1,400.
- [ ] **RENT-013** Verify first-day move-in produces full rent.
- [ ] **RENT-014** Verify later full February rent remains the negotiated monthly amount.
- [ ] **RENT-015** Verify month boundaries, leap years, timezone boundaries, and approved round policy.
- [ ] **RENT-016** Verify job retries do not duplicate obligations or notifications.

## 13. External Payments and Receipts

Requirements: 7, 23-24.

- [ ] **PAY-001** Record external payment amount, date, method, reference, payer, period, and notes.
- [ ] **PAY-002** Allow optional image/PDF evidence without a mandatory attachment.
- [ ] **PAY-003** Allocate payments explicitly to obligations.
- [ ] **PAY-004** Support partial payments and multiple allocations.
- [ ] **PAY-005** Prevent allocations above available payment or obligation balances.
- [ ] **PAY-006** Apply approved overpayment, advance rent, and credit policies.
- [ ] **PAY-007** Create durable in-system tenant receipts.
- [ ] **PAY-008** Include amount, date, payer, period, and evidence status on receipts.
- [ ] **PAY-009** Notify the tenant after recorded payment.
- [ ] **PAY-010** Allow tenant acknowledgement and error reports.
- [ ] **PAY-011** Create linked reversals or correction entries instead of silent overwrite.
- [ ] **PAY-012** Audit financial corrections with actor, reason, timestamp, and reference.
- [ ] **PAY-013** Protect financial writes with idempotency keys.
- [ ] **PAY-014** Reject repeated keys with different payloads.
- [ ] **PAY-015** Keep recorded payments intact after notification-provider failures.
- [ ] **PAY-016** Show due, overdue, received-this-month, and upcoming-next-month totals.
- [ ] **PAY-017** Verify AED 3,000 minus AED 1,000 payment leaves AED 2,000 outstanding.

## 14. Late-Payment Requests

Requirements: 7.1, 9, 17, 29.

- [ ] **LATE-001** Expose the tenant's permitted submission window and extension limit.
- [ ] **LATE-002** Restrict requests to the configured final-ten-day window before the original due date.
- [ ] **LATE-003** Apply approved same-day and overdue submission rules.
- [ ] **LATE-004** Cap extensions at five calendar days after the original due date.
- [ ] **LATE-005** Apply stricter per-tenant limits.
- [ ] **LATE-006** Allow one approved late-payment request per rolling six months.
- [ ] **LATE-007** Use approved eligibility anchor and calendar-boundary rules.
- [ ] **LATE-008** Keep the late-payment allowance independent from room-change allowance.
- [ ] **LATE-009** Allow manager approval, rejection, and clarification.
- [ ] **LATE-010** Preserve original date, revised expected date, decision, messages, and evidence.
- [ ] **LATE-011** Change expected payment date without a change to monthly rent.
- [ ] **LATE-012** Notify both parties according to preferences.
- [ ] **LATE-013** Verify denied, repeated, boundary-date, and concurrent requests.

## 15. Case Lifecycle and Tenant Requests

Requirements: 9, 22-25.

- [ ] **CASE-001** Implement maintenance, neighbor complaint, late payment, room change, move-out, key/lock, and general request forms.
- [ ] **CASE-002** Capture type, description, attachments, relevant contract, and authorized relationship.
- [ ] **CASE-003** Support configurable request categories and response deadlines.
- [ ] **CASE-004** Support Draft, Submitted, Seen, Awaiting Leasing Manager, and Awaiting Tenant states.
- [ ] **CASE-005** Support Approved, Rejected, In Progress, Resolved, Accepted, Reopened, Deadlock, and Closed states.
- [ ] **CASE-006** Define valid transitions per request type and role.
- [ ] **CASE-007** Reject invalid or concurrent transitions.
- [ ] **CASE-008** Preserve immutable messages, status changes, attachments, assignments, deadlines, and acknowledgements.
- [ ] **CASE-009** Identify each event author and timestamp.
- [ ] **CASE-010** Notify both parties of case updates.
- [ ] **CASE-011** Ask tenants to accept or dispute completion.
- [ ] **CASE-012** Keep unanswered completion completed-unacknowledged.
- [ ] **CASE-013** Allow authorized reopening without deletion of previous resolution.
- [ ] **CASE-014** Restrict sensitive complaint details to the relevant tenant, manager, and authorized support.
- [ ] **CASE-015** Allow the complainant to select an involved occupant when known.
- [ ] **CASE-016** Record complaint evidence and manager communication/actions.
- [ ] **CASE-017** Capture key/lock reason, security urgency, authorization, cost responsibility, and completion evidence.
- [ ] **CASE-018** Keep general requests configurable without loss of event history.

## 16. Maintenance and Cost Responsibility

Requirements: 9.2-10.

- [ ] **MAINT-001** Capture category, urgency, description, photos/files, response, and completion evidence.
- [ ] **MAINT-002** Keep operational maintenance responsibility with the Leasing Manager.
- [ ] **MAINT-003** Exclude technician, building-management, and landlord workflows from initial scope.
- [ ] **MAINT-004** Support Normal Wear / Leasing Manager Cost classification.
- [ ] **MAINT-005** Support Tenant-Caused Damage / Proposed Tenant Cost classification.
- [ ] **MAINT-006** Support Under Review and No Cost classifications.
- [ ] **MAINT-007** Capture proposed tenant cost, explanation, and evidence.
- [ ] **MAINT-008** Allow tenant acceptance or dispute.
- [ ] **MAINT-009** Create direct charge or proposed deposit deduction from accepted responsibility.
- [ ] **MAINT-010** Prevent duplicate recovery through both charge and deposit routes.
- [ ] **MAINT-011** Record vendor, category, unit, space, amount, currency, date, and invoice/evidence.
- [ ] **MAINT-012** Record tenant recoveries separately from gross maintenance expense.

## 17. Room Changes and Atomic Transfers

Requirements: 9.3, 17, 24.2, 29.

- [ ] **TRANS-001** Capture tenant reason and optional destination preferences.
- [ ] **TRANS-002** Allow one approved room-change request per rolling six months.
- [ ] **TRANS-003** Apply approved eligibility and cancellation policies.
- [ ] **TRANS-004** Give the manager five calendar days to approve or reject.
- [ ] **TRANS-005** Automatically reject unapproved requests at expiry.
- [ ] **TRANS-006** Record the reason Approval period expired.
- [ ] **TRANS-007** Open seven calendar days of negotiation after approval.
- [ ] **TRANS-008** Preserve messages and relevant outcomes from discussions outside the platform.
- [ ] **TRANS-009** Apply only the confirmed negotiation-expiry policy.
- [ ] **TRANS-010** Select accepted destination unit, space, and effective date.
- [ ] **TRANS-011** Capture new rent, deposit treatment, and approved prorated difference.
- [ ] **TRANS-012** Preview terms and financial effects before confirmation.
- [ ] **TRANS-013** Verify destination ownership, active state, maintenance blocks, and dated capacity.
- [ ] **TRANS-014** Commit amendment, source release, destination allocation, and ledger effects atomically.
- [ ] **TRANS-015** Retain the original allocation and balances if any operation fails.
- [ ] **TRANS-016** Release the original space only at effective transfer after operational holds.
- [ ] **TRANS-017** Reset same-space annual-review anniversary without loss of history.
- [ ] **TRANS-018** Verify concurrent destination claims and retry-safe completion.

## 18. Deposits, Move-Out, and Disputes

Requirements: 8, 9, 17, 24, 29.

- [ ] **DEP-001** Copy unit deposit default into new contracts.
- [ ] **DEP-002** Allow explicitly negotiated contract deposit amounts.
- [ ] **DEP-003** Preserve old contract deposits after default changes.
- [ ] **DEP-004** Record deposit receipts, amount, date, method, evidence, and outstanding balance.
- [ ] **DEP-005** Support Not Required, Due, Partially Received, Held, and Refund Pending states.
- [ ] **DEP-006** Support Partially Refunded, Refunded, and Disputed states.
- [ ] **DEP-007** Expose held balances and projected refund liabilities.
- [ ] **DEP-008** Capture desired move-out date and notice submission time.
- [ ] **DEP-009** Apply confirmed notice inclusivity and penalty-free-date rules.
- [ ] **DEP-010** Calculate uncovered days across actual calendar months.
- [ ] **DEP-011** Use the relevant monthly rent and actual days per uncovered month.
- [ ] **DEP-012** Cap applied notice deduction at available deposit balance.
- [ ] **DEP-013** Preview requested date, notice, missing days, deduction, and projected refund.
- [ ] **DEP-014** Require explicit tenant acknowledgement before move-out submission.
- [ ] **DEP-015** Allow manager response, waiver, or reduced notice deduction.
- [ ] **DEP-016** Require separate charges for amounts beyond available deposit or applicable contract limits.
- [ ] **DEP-017** Propose each deduction separately with category, explanation, amount, and evidence.
- [ ] **DEP-018** Support insufficient notice, damage, missing item/key, exceptional cleaning, and other documented contractual charges.
- [ ] **DEP-019** Let tenants accept or dispute each deduction.
- [ ] **DEP-020** Preserve proposal versions, discussions, and evidence.
- [ ] **DEP-021** Never convert a disputed proposal silently into an accepted deduction.
- [ ] **DEP-022** Mark unresolved disagreement Deadlock / External Resolution Required.
- [ ] **DEP-023** Prevent administrator arbitration.
- [ ] **DEP-024** Calculate projected refund from held deposit minus approved deductions.
- [ ] **DEP-025** Apply confirmed final-rent and move-out closure policy.
- [ ] **DEP-026** Record external refund payment and optional evidence.
- [ ] **DEP-027** Ask the tenant to acknowledge refund receipt.
- [ ] **DEP-028** Show refunds due, projected liabilities, and disputes on manager dashboards.
- [ ] **DEP-029** Apply approved refund target dates and unresolved-dispute closure policy.

## 19. Expenses, Currency, and Financial Reports

Requirements: 10, 14, 24, 29.

- [ ] **FIN-001** Record tenant rent receipts, accepted charges, and other unit income distinctly.
- [ ] **FIN-002** Record owner rent, electricity, water, cooling, internet, maintenance, and cleaning costs.
- [ ] **FIN-003** Record furnishings, licences/fees, and other categorized expenses.
- [ ] **FIN-004** Capture vendor, date, amount, currency, scope, notes, and evidence.
- [ ] **FIN-005** Allocate costs to portfolio, landlord, unit, space, or contract where meaningful.
- [ ] **FIN-006** Apply confirmed shared-cost allocation rules and effective dates.
- [ ] **FIN-007** Calculate unit gross profit from unit income minus owner rent and attributed expenses.
- [ ] **FIN-008** Calculate space contribution from attributed income minus direct space costs.
- [ ] **FIN-009** Show separately allocated shared costs.
- [ ] **FIN-010** Keep deposit receipt and refund liabilities outside operational profit.
- [ ] **FIN-011** Separate cash receipts from unpaid accepted charges.
- [ ] **FIN-012** Label cash/accrual basis explicitly under the approved policy.
- [ ] **FIN-013** Default report totals to AED.
- [ ] **FIN-014** Preserve original currency and saved conversion snapshot.
- [ ] **FIN-015** Use the approved rate provider, refresh, fallback, and manual-override policy.
- [ ] **FIN-016** Provide monthly income/expense, unit profit, occupancy, arrears, and deposit liability reports.
- [ ] **FIN-017** Provide maintenance-cost and contract-contribution reports.
- [ ] **FIN-018** Support authorized filters, exports, and reconciliation to ledger source records.

## 20. Dashboards

Requirements: 11, 22-23.

- [ ] **DASH-001** Build an administrator dashboard separate from business-role dashboards.
- [ ] **DASH-002** Build a manager dashboard from owned operational data.
- [ ] **DASH-003** Show units, enabled spaces, occupancy, vacancies, and maintenance blocks.
- [ ] **DASH-004** Show rent due today, within seven days, overdue, partially paid, and received this month.
- [ ] **DASH-005** Show deposits held, projected refunds, refunds due, and disputed deductions.
- [ ] **DASH-006** Show open maintenance, complaints, room changes, late requests, and move-outs.
- [ ] **DASH-007** Show requests that await the manager and approaching deadlines.
- [ ] **DASH-008** Show annual-review milestones and expiring identity, licence, unit, and consent documents.
- [ ] **DASH-009** Show monthly income, owner rent, expenses, and estimated unit profit.
- [ ] **DASH-010** Build a tenant dashboard scoped to the authenticated relationship.
- [ ] **DASH-011** Show current unit/space, move-in date, and months/days of occupancy.
- [ ] **DASH-012** Show next payment date, rent, current balance, and payment history.
- [ ] **DASH-013** Show held deposit, proposals, projected refund, and refund status.
- [ ] **DASH-014** Show unresolved requests, recent replies, and pending acknowledgements.
- [ ] **DASH-015** Show due day, notice, late-request window, and permitted extension.
- [ ] **DASH-016** Show primary and optional secondary occupant identity status.
- [ ] **DASH-017** Connect maintenance, complaint, late-payment, room-change, move-out, and PDF actions.
- [ ] **DASH-018** Reconcile dashboard totals with the same scoped list and ledger sources.
- [ ] **DASH-019** Show dependency failures as errors, never false zero totals.

## 21. Notifications and Provider Delivery

Requirements: 12, 25.

- [ ] **MSG-001** Implement email, Twilio WhatsApp, and in-application notification channels.
- [ ] **MSG-002** Honor Email, WhatsApp, and Both preferences for non-security messages.
- [ ] **MSG-003** Preserve a mandatory channel for critical security notices.
- [ ] **MSG-004** Support user language and English template fallback.
- [ ] **MSG-005** Store template, recipient, channel, language, related entity, attempt time, and provider/delivery status.
- [ ] **MSG-006** Link notices to the correct authorized application record.
- [ ] **MSG-007** Provide unread state and notification history.
- [ ] **MSG-008** Persist transactional notification intent before provider delivery.
- [ ] **MSG-009** Retry transient failures with bounded attempts.
- [ ] **MSG-010** Expose terminal failures for operational recovery.
- [ ] **MSG-011** Keep valid business transactions independent from provider success.
- [ ] **MSG-012** Verify provider callback signatures.
- [ ] **MSG-013** Reject duplicate and replayed callbacks.
- [ ] **MSG-014** Use real Twilio credentials outside automated test adapters.
- [ ] **MSG-015** Use approved WhatsApp templates where required.
- [ ] **MSG-016** Keep OTP plaintext and sensitive documents out of logs and messages.
- [ ] **MSG-017** Provide deterministic email and Twilio test adapters.
- [ ] **MSG-018** Verify real email and WhatsApp delivery separately in staging.

## 22. PDF Interaction Reports

Requirements: 13, 22-25.

- [ ] **PDF-001** Allow each primary tenant and manager to export their authorized relationship report.
- [ ] **PDF-002** Use the same immutable factual event sources for both parties.
- [ ] **PDF-003** Include masked parties and verified contact/identity summary.
- [ ] **PDF-004** Include unit, space, contract dates, occupancy changes, rent, and deposit terms.
- [ ] **PDF-005** Include obligations, payment history, punctuality, corrections, and evidence references.
- [ ] **PDF-006** Include requests, complaints, deadlines, response times, and outcomes.
- [ ] **PDF-007** Include maintenance responsibility, deduction proposals, acceptance, and disputes.
- [ ] **PDF-008** Include move-out notice calculation, deposit ledger, and refund status.
- [ ] **PDF-009** Include chronological messages, authorship, acknowledgements, status changes, and attachments.
- [ ] **PDF-010** Add generation timestamp, report identifier, and integrity hash.
- [ ] **PDF-011** State that reports are factual platform records, not legal findings or certifications.
- [ ] **PDF-012** Generate PDFs through authorized background jobs.
- [ ] **PDF-013** Expose queued, complete, and failed report states.
- [ ] **PDF-014** Allow recovery from failed report generation.
- [ ] **PDF-015** Authorize every report download and respect approved closed-relationship access.
- [ ] **PDF-016** Verify actual PDF content, not only a successful HTTP status.

## 23. Shared Interface and Accessibility

Requirements: 21-22.

- [ ] **UX-001** Use real forms, tables, dialogs, and commands for each required screen below.
- [ ] **UX-002** Connect every visible action to an authorized backend operation.
- [ ] **UX-003** Persist edits and verify success before success messages.
- [ ] **UX-004** Provide desktop and mobile layouts without overlap or clipped controls.
- [ ] **UX-005** Provide labels, keyboard access, focus states, and accessible validation.
- [ ] **UX-006** Provide load, empty, error, success, unauthorized, expired-session, and offline states.
- [ ] **UX-007** Keep unsaved form values after recoverable failures.
- [ ] **UX-008** Show field errors beside inputs.
- [ ] **UX-009** Show safe server messages with request identifiers.
- [ ] **UX-010** Confirm destructive, financial, and final contract actions.
- [ ] **UX-011** Provide search, pagination, filters, and sort controls for operational lists.
- [ ] **UX-012** Choose navigation from authenticated role and account status.
- [ ] **UX-013** Hide unauthorized controls without reliance on client-only permission enforcement.
- [ ] **UX-014** Display currency and relevant timezone alongside money and dates.
- [ ] **UX-015** Keep English-first interface strings ready for localization.
- [ ] **UX-016** Provide profile, security, session, language, timezone, and notification controls.
- [ ] **UX-017** Remove placeholder values, inactive actions, and dead-end pages.
- [ ] **UX-018** Verify archived-record workflows only where domain rules permit archive and restore.

## 24. API Standards and Ownership

Requirements: 15, 23-24.

- [ ] **API-001** Use /api/v1 for business resources.
- [ ] **API-002** Publish OpenAPI for actual methods, schemas, authorization, transitions, and errors.
- [ ] **API-003** Validate bodies, routes, query fields, and file metadata.
- [ ] **API-004** Derive manager ownership from authenticated context.
- [ ] **API-005** Verify all referenced parent and child ownership.
- [ ] **API-006** Enforce role and ownership on lists, detail, exports, uploads, downloads, and mutations.
- [ ] **API-007** Return stable error codes, safe messages, and request IDs.
- [ ] **API-008** Use 401 for absent or invalid authentication.
- [ ] **API-009** Use 403 for authenticated forbidden actions.
- [ ] **API-010** Use 409 for conflicting state or capacity.
- [ ] **API-011** Use documented consistent validation status, such as 422.
- [ ] **API-012** Document pagination, allowed filters, sort fields, limits, and stable order.
- [ ] **API-013** Use idempotency for payments, request submission, transfer completion, and other retry-sensitive writes.
- [ ] **API-014** Reject key reuse with a different payload.
- [ ] **API-015** Protect cookie mutations against CSRF.
- [ ] **API-016** Enforce explicit production CORS origins and trusted proxies.
- [ ] **API-017** Keep development fixes separate from production origin policy.
- [ ] **API-018** Prevent redirect loops for forbidden role access.
- [ ] **API-019** Verify all resource groups in the API inventory below.

## 25. Jobs, Deadlines, and Recovery

Requirements: 6, 9, 25.

- [ ] **JOB-001** Create durable workers and a scheduler with bounded retries.
- [ ] **JOB-002** Persist critical work independently of cache eviction.
- [ ] **JOB-003** Catch up overdue tasks after downtime.
- [ ] **JOB-004** Prevent duplicate effects across worker replicas.
- [ ] **JOB-005** Inject a test clock for deadline verification.
- [ ] **JOB-006** Store UTC timestamps and apply contract timezone calendar rules.
- [ ] **JOB-007** Default Dubai display and contract configuration to Asia/Dubai.
- [ ] **JOB-008** Use calendar days, not unapproved business-day interpretations.
- [ ] **JOB-009** Audit automatic decisions with rule, timestamp, and entity.
- [ ] **JOB-010** Implement every job in the job inventory below.
- [ ] **JOB-011** Keep notification intent transactionally tied to business events.
- [ ] **JOB-012** Expose job failures and authorized operational recovery.
- [ ] **JOB-013** Verify duplicate execution, worker interruption, scheduler restart, and delayed provider response.

## 26. Security and Privacy

Requirements: 16, 24-26, 29.

- [ ] **SEC-001** Encrypt transport and sensitive stored data.
- [ ] **SEC-002** Apply least privilege to users, administrators, storage, database, and deployment roles.
- [ ] **SEC-003** Keep private identities inaccessible across managers and unrelated tenants.
- [ ] **SEC-004** Audit authentication, document access, exports, impersonation, finance, contracts, and moderation.
- [ ] **SEC-005** Protect audit records from ordinary-user edits and deletion.
- [ ] **SEC-006** Mask Emirates ID numbers and private contact details unless necessary.
- [ ] **SEC-007** Keep versioned consent text hashes and declarations.
- [ ] **SEC-008** Enforce approved retention, anonymization, deletion, and protected-record exceptions.
- [ ] **SEC-009** Verify account and data export permissions.
- [ ] **SEC-010** Scan files and prevent unsafe execution.
- [ ] **SEC-011** Protect report, invitation, OTP, upload, and login endpoints against abuse.
- [ ] **SEC-012** Keep sensitive data out of provider messages, logs, errors, and CI artifacts.
- [ ] **SEC-013** Verify MFA, session expiry, token replay, CSRF, and unauthorized API calls.

## 27. Local Setup and Codespaces

Requirements: 21, 26.1-26.2.

- [ ] **DEV-001** Document a verified idempotent startup command.
- [ ] **DEV-002** Create missing environment files without overwrite.
- [ ] **DEV-003** Validate configuration before production startup.
- [ ] **DEV-004** Run migrations before readiness.
- [ ] **DEV-005** Create demo accounts only in explicit non-production demo mode.
- [ ] **DEV-006** Refuse production startup with demo mode enabled.
- [ ] **DEV-007** Document secure initial administrator bootstrap outside demo mode.
- [ ] **DEV-008** Preserve database and file volumes across restarts.
- [ ] **DEV-009** Require explicit confirmation before destructive demo reset.
- [ ] **DEV-010** Keep MySQL, Redis, and storage administration ports private.
- [ ] **DEV-011** Expose the application through the web service.
- [ ] **DEV-012** Use the correct HTTP backend protocol for forwarded development ports.
- [ ] **DEV-013** Verify login through the exact public Codespaces URL.
- [ ] **DEV-014** Verify refresh, role routes, API proxy, upload, and PDF download through that URL.
- [ ] **DEV-015** Verify production CORS remains restrictive.
- [ ] **DEV-016** Do not require Git-hook bypass as normal workflow.
- [ ] **DEV-017** Document all configuration groups in the inventory below.
- [ ] **DEV-018** Keep real secrets and identity documents outside version control.
- [ ] **DEV-019** Use separate credentials and data per environment.

## 28. Production Infrastructure and Delivery

Requirements: 26.3, 28-29.

- [ ] **OPS-001** Use the existing Terraform AWS and Helm architecture unless the owner approves a replacement.
- [ ] **OPS-002** Provision private database and Redis subnets.
- [ ] **OPS-003** Use encrypted managed MySQL with backups and deletion protection.
- [ ] **OPS-004** Use encrypted Redis with failover.
- [ ] **OPS-005** Use private versioned S3 with public access blocked.
- [ ] **OPS-006** Deploy valid public HTTPS certificates.
- [ ] **OPS-007** Deploy API and web with immutable commit-SHA image tags.
- [ ] **OPS-008** Deploy durable workers and scheduler with controlled concurrency.
- [ ] **OPS-009** Configure probes, resource limits, autoscale, and disruption budgets.
- [ ] **OPS-010** Inject production secrets through the existing secret-management baseline.
- [ ] **OPS-011** Configure approved GitHub environments and OIDC deployment roles.
- [ ] **OPS-012** Require explicit production deployment approval.
- [ ] **OPS-013** Run backward-compatible migrations before rollout.
- [ ] **OPS-014** Document application rollback separately from database restore.
- [ ] **OPS-015** Verify rollback compatibility with the deployed schema.
- [ ] **OPS-016** Verify database backup restore in an isolated environment.
- [ ] **OPS-017** Verify private-file restore and database/object references.
- [ ] **OPS-018** Define recovery targets before production sign-off.
- [ ] **OPS-019** Alert on failed jobs, provider failures, readiness failures, and storage errors.
- [ ] **OPS-020** Centralize redacted logs, request IDs, and protected metrics.
- [ ] **OPS-021** Verify all required infrastructure from deployed evidence, not only configuration files.

## 29. Entity Inventory

Requirements: 14, 24.

- [ ] **MODEL-001** Implement `users`: Authentication identity, role, email/phone verification, status and preferred language.
- [ ] **MODEL-002** Implement `leasing_manager_profiles`: Legal/profile data, Emirates ID, licence and declarations.
- [ ] **MODEL-003** Implement `tenant_profiles`: Identity, Emirates ID, matching preferences and manager relationship.
- [ ] **MODEL-004** Implement `landlords`: Reusable landlord/contact records owned by a Leasing Manager.
- [ ] **MODEL-005** Implement `units`: Property, address/GPS, landlord, owner-rent terms, default deposit and status.
- [ ] **MODEL-006** Implement `rental_spaces`: Unit subdivision, type, capacity, amenities, pricing guidance and availability.
- [ ] **MODEL-007** Implement `occupants`: Primary or secondary identity records linked to a contract.
- [ ] **MODEL-008** Implement `contracts`: Open-ended monthly agreement, space, primary tenant, rent, currency, due day and notice.
- [ ] **MODEL-009** Implement `contract_amendments`: Effective-dated rent, space, deposit, due-day or notice changes.
- [ ] **MODEL-010** Implement `rent_obligations / payments`: Monthly dues and external payment records, receipts and corrections.
- [ ] **MODEL-011** Implement `deposits / deposit_ledger`: Received, held, proposed deductions, refunds and disputes.
- [ ] **MODEL-012** Implement `requests / request_events`: Typed cases, status, deadlines, messages and immutable history.
- [ ] **MODEL-013** Implement `expenses`: Owner rent, utilities, maintenance and other bookkeeping costs.
- [ ] **MODEL-014** Implement `documents / media`: Versioned identity, property, consent, evidence, images and reports.
- [ ] **MODEL-015** Implement `notifications`: Email, WhatsApp and in-app delivery history.
- [ ] **MODEL-016** Implement `audit_events`: Actor, action, old/new values, reason, time, IP/session and entity reference.
- [ ] **MODEL-017** Implement `contract_reviews`: Twelve-month reminders, decisions and proposed amendments.

## 30. Required Screen Inventory

Requirements: 22.2-22.5.

Each screen requires functional API access, forms, validation, permissions, persistence, and applicable interface states.

### Public and Account

- [ ] **SCREEN-PUBLIC-001** Implement Login: Authenticate; show real validation errors; route by role and account status.
- [ ] **SCREEN-PUBLIC-002** Implement Manager registration: Capture required profile fields; accept versioned declarations; prevent duplicate submissions.
- [ ] **SCREEN-PUBLIC-003** Implement Email verification: Verify valid token; reject expired or reused token; provide controlled resend.
- [ ] **SCREEN-PUBLIC-004** Implement WhatsApp verification: Capture own phone number; request OTP; verify OTP; enforce retry and resend limits.
- [ ] **SCREEN-PUBLIC-005** Implement Identity and licence: Upload private documents; capture expiry and licence fields; show completion status.
- [ ] **SCREEN-PUBLIC-006** Implement Approval status: Show pending, rejected, suspended, or active state; display permitted next actions.
- [ ] **SCREEN-PUBLIC-007** Implement Tenant invitation: Accept scoped invitation; complete email, WhatsApp, identity, and profile requirements.
- [ ] **SCREEN-PUBLIC-008** Implement Password recovery: Issue expiring single-use reset token; set new password; revoke affected sessions.
- [ ] **SCREEN-PUBLIC-009** Implement Profile and security: Edit authorized details; reverify changed contacts; change password; review and revoke sessions.

### Administrator

- [ ] **SCREEN-ADMIN-001** Implement Dashboard: Account review queue, platform counts, security alerts, and operational health summaries.
- [ ] **SCREEN-ADMIN-002** Implement Account review: Inspect completeness; approve, reject, suspend, or restore with reason and audit event.
- [ ] **SCREEN-ADMIN-003** Implement Account detail: View identity status, declarations, documents, history, and authorized support data.
- [ ] **SCREEN-ADMIN-004** Implement Unit review: View submitted information, reports, document expiry, and suspension status.
- [ ] **SCREEN-ADMIN-005** Implement Audit explorer: Filter actor, entity, date, action, impersonation, export, and document access.
- [ ] **SCREEN-ADMIN-006** Implement Support session: Require reason; show impersonation banner; record actor and effective identity; end session.
- [ ] **SCREEN-ADMIN-007** Implement Configuration: Manage feature flags, categories, amenities, templates, and system defaults.
- [ ] **SCREEN-ADMIN-008** Implement Platform reports: Show governed operational and audit exports without silent business-record edits.

### Leasing Manager

- [ ] **SCREEN-MANAGER-001** Implement Dashboard: Every metric, deadline, action, and alert from section 11.1.
- [ ] **SCREEN-MANAGER-002** Implement Landlords: List, create, edit, archive, documents, and linked units.
- [ ] **SCREEN-MANAGER-003** Implement Units: List, create, edit, declaration, owner-rent schedule, amenities, images, documents, and status.
- [ ] **SCREEN-MANAGER-004** Implement Unit detail: Spaces, occupants, contracts, income, expenses, owner rent, maintenance, and deposit exposure.
- [ ] **SCREEN-MANAGER-005** Implement Rental spaces: Type, capacity, availability, asking rent, deposit default, amenities, photos, and maintenance blocks.
- [ ] **SCREEN-MANAGER-006** Implement Tenants: Invite, resend or revoke invitation, view profile, verify completion, and inspect own relationship history.
- [ ] **SCREEN-MANAGER-007** Implement Tenant detail: Contracts, occupants, dues, payments, deposits, requests, documents, and export.
- [ ] **SCREEN-MANAGER-008** Implement Contracts: Create, inspect, propose effective-dated amendments, record acknowledgement, transfer, and close.
- [ ] **SCREEN-MANAGER-009** Implement Annual reviews: Review milestones; record no change, proposed amendment, or deferral.
- [ ] **SCREEN-MANAGER-010** Implement Rent obligations: Filter period and status; inspect amount, allocations, original due date, and revised expected date.
- [ ] **SCREEN-MANAGER-011** Implement Payments: Record external payment; attach optional evidence; issue receipt; record audited correction.
- [ ] **SCREEN-MANAGER-012** Implement Deposits: Record receipt, balance, proposed deductions, dispute, refund liability, and refund evidence.
- [ ] **SCREEN-MANAGER-013** Implement Cases: Type-specific forms, messages, evidence, deadlines, decisions, completion, dispute, and event history.
- [ ] **SCREEN-MANAGER-014** Implement Transfers: Approve or reject; negotiate; select destination; preview terms; confirm atomic effective transfer.
- [ ] **SCREEN-MANAGER-015** Implement Move-out: Review notice preview, waivers, final allocation, deductions, deposit settlement, and closure.
- [ ] **SCREEN-MANAGER-016** Implement Expenses: Category, owner rent, utilities, vendor, scope, currency, date, evidence, and recoveries.
- [ ] **SCREEN-MANAGER-017** Implement Reports: Income, expenses, occupancy, arrears, profit, deposit liability, maintenance, and interaction PDF.
- [ ] **SCREEN-MANAGER-018** Implement Notifications: Read state, relevant record links, preferences, and visible delivery failures where appropriate.
- [ ] **SCREEN-MANAGER-019** Implement Settings: Profile, security, defaults, permitted per-tenant limits, language, and timezone.

### Tenant

- [ ] **SCREEN-TENANT-001** Implement Dashboard: Every metric, rule, acknowledgement, and action from section 11.2.
- [ ] **SCREEN-TENANT-002** Implement Occupancy and contract: Current space, history, terms, amendments, documents, and primary/secondary occupant details.
- [ ] **SCREEN-TENANT-003** Implement Rent and payments: Current obligations, prior payments, receipts, evidence, acknowledgement, and error report.
- [ ] **SCREEN-TENANT-004** Implement Deposit: Held amount, proposals, explanations, evidence, accept/dispute actions, refund, and acknowledgement.
- [ ] **SCREEN-TENANT-005** Implement Requests: Submit each enabled type; inspect timeline; reply; attach evidence; accept or dispute completion.
- [ ] **SCREEN-TENANT-006** Implement Late payment: Show eligibility, permitted dates, frequency limit, decision, and original/revised due dates.
- [ ] **SCREEN-TENANT-007** Implement Room change: Show eligibility, five-day deadline, decision, seven-day negotiation, and accepted destination.
- [ ] **SCREEN-TENANT-008** Implement Move-out: Preview notice calculation, missing days, deduction, and refund before explicit acknowledgement.
- [ ] **SCREEN-TENANT-009** Implement Interaction report: Select own relationship; request PDF; download authorized report; inspect generation status.
- [ ] **SCREEN-TENANT-010** Implement Profile and preferences: Own identity, contacts, language, timezone, security, and notification preferences.

## 31. API Resource Inventory

Requirements: 23.2.

- [ ] **RESOURCE-001** Implement Authentication: Register manager; login; logout; refresh; password reset; current session; session revocation.
- [ ] **RESOURCE-002** Implement Verification: Email token verification/resend; WhatsApp OTP request/confirmation; contact reverification.
- [ ] **RESOURCE-003** Implement Invitations: Create, inspect, accept, resend, expire, and revoke tenant invitation.
- [ ] **RESOURCE-004** Implement Profiles: Own profile, manager profile, tenant profile, secondary occupant, preferences.
- [ ] **RESOURCE-005** Implement Administration: Account review queue, moderation decisions, flags, taxonomies, templates, audit, support sessions.
- [ ] **RESOURCE-006** Implement Landlords: List, detail, create, edit, archive, and linked units.
- [ ] **RESOURCE-007** Implement Units: CRUD subject to history rules; declarations, amenities, owner-rent schedules, documents, and status.
- [ ] **RESOURCE-008** Implement Spaces: CRUD subject to history rules; capacity, availability, type restrictions, photos, and maintenance blocks.
- [ ] **RESOURCE-009** Implement Contracts: Create, detail, amendments, acknowledgement, allocation history, reviews, closure.
- [ ] **RESOURCE-010** Implement Obligations: Monthly schedule, period detail, balances, allocations, adjustments, original and revised dates.
- [ ] **RESOURCE-011** Implement Payments: Record, evidence, receipt, acknowledgement, error report, correction/reversal.
- [ ] **RESOURCE-012** Implement Deposits: Receipt, ledger, proposals, acceptance/dispute, settlement, refunds, acknowledgement.
- [ ] **RESOURCE-013** Implement Cases: Type-specific submit, messages, evidence, transition, deadline, decision, completion, and dispute.
- [ ] **RESOURCE-014** Implement Transfers: Eligibility, approval, negotiation, preview, destination, effective execution, and event history.
- [ ] **RESOURCE-015** Implement Move-out: Notice preview, acknowledgement, decision, waiver, effective exit, and settlement.
- [ ] **RESOURCE-016** Implement Expenses: Categories, entries, allocations, evidence, recoveries, and audited adjustments.
- [ ] **RESOURCE-017** Implement Documents: Authorized upload, scan status, version, metadata, expiring private download, and access audit.
- [ ] **RESOURCE-018** Implement Notifications: List, read/unread state, preferences, internal delivery records, provider callbacks.
- [ ] **RESOURCE-019** Implement Reports: Role-specific dashboards, filtered financial data, export jobs, PDF status, and downloads.
- [ ] **RESOURCE-020** Implement Operations: Liveness, readiness, protected metrics, job status, and deployment smoke probes.

## 32. Background Job Inventory

Requirements: 25.1.

- [ ] **WORKER-001** Implement Monthly obligations: Generate applicable obligations once per contract and period.
- [ ] **WORKER-002** Implement Due/overdue notifications: Respect expected dates, preferences, and duplicate prevention.
- [ ] **WORKER-003** Implement Room-change expiry: Reject unapproved requests after five calendar days; record the required expiry reason.
- [ ] **WORKER-004** Implement Negotiation deadline: Expose the seven-day deadline; apply only the confirmed expiry policy from section 29.
- [ ] **WORKER-005** Implement Annual reviews: Create one review per same-space anniversary; preserve transfer history.
- [ ] **WORKER-006** Implement Document expiry: Notify affected users; show expired status without false legal certification.
- [ ] **WORKER-007** Implement Invitations and security tokens: Enforce expiry, resend limits, revocation, and single-use verification.
- [ ] **WORKER-008** Implement Email/WhatsApp delivery: Retry transient failures; preserve provider result and attempt history.
- [ ] **WORKER-009** Implement Reports: Generate authorized PDFs; expose queued, complete, and failed states.
- [ ] **WORKER-010** Implement File scan: Quarantine uploads until accepted; reject unsafe content.
- [ ] **WORKER-011** Implement Retention: Apply the confirmed policy without destruction of protected history.

## 33. Notification Event Inventory

Requirements: 12, 25.

- [ ] **EVENT-001** Deliver tenant invitation notices.
- [ ] **EVENT-002** Deliver verification and account-security notices.
- [ ] **EVENT-003** Deliver account approval, rejection, suspension, and restoration notices.
- [ ] **EVENT-004** Deliver payment-due and overdue notices.
- [ ] **EVENT-005** Deliver recorded-payment receipts and correction notices.
- [ ] **EVENT-006** Deliver request submission, response, and expiry notices.
- [ ] **EVENT-007** Deliver move-out updates.
- [ ] **EVENT-008** Deliver deposit proposal, dispute-update, and refund notices.
- [ ] **EVENT-009** Deliver annual-review notices.
- [ ] **EVENT-010** Deliver expiring-document notices.
- [ ] **EVENT-011** Deliver report availability and failure status through authorized application views.
- [ ] **EVENT-012** Verify each event respects channel, language, privacy, authorization, duplicate prevention, and delivery-history requirements.

## 34. Configuration Inventory

Requirements: 26.1.

- [ ] **CONFIG-001** Document and validate Environment: Runtime mode, app URL, API URL, timezone, demo flag.
- [ ] **CONFIG-002** Document and validate Database: MySQL connection and migration credentials.
- [ ] **CONFIG-003** Document and validate Redis: Authenticated connection and durable worker configuration.
- [ ] **CONFIG-004** Document and validate Authentication: Distinct access/refresh secrets, lifetimes, secure cookie policy.
- [ ] **CONFIG-005** Document and validate Origins: Explicit production CORS allowlist and trusted proxy configuration.
- [ ] **CONFIG-006** Document and validate Twilio: Account SID, auth token, Verify service SID, sender/template configuration.
- [ ] **CONFIG-007** Document and validate Email: Provider or SMTP credentials, sender, callback configuration.
- [ ] **CONFIG-008** Document and validate Storage: S3 endpoint/region, bucket, private credentials, signed-link lifetime.
- [ ] **CONFIG-009** Document and validate Upload safety: Allowed content types, file size limits, scan service.
- [ ] **CONFIG-010** Document and validate Financial defaults: AED, exchange-rate source, due day, notice, permitted request limits.
- [ ] **CONFIG-011** Document and validate Observability: Log level, metrics access, error reporting, request IDs.
- [ ] **CONFIG-012** Document and validate Retention: Approved retention periods, purge policy, protected-record exceptions.

## 35. Calculation and Ledger Examples

Requirements: 24.3.

- [ ] **EXAMPLE-001** Verify Rent AED 3,100; move-in 17 January: 15 occupied days; first obligation AED 1,500.
- [ ] **EXAMPLE-002** Verify Rent AED 2,900; move-in 15 February in a leap year: 15 occupied days; first obligation AED 1,500.
- [ ] **EXAMPLE-003** Verify Rent AED 2,800; move-in 15 February in a non-leap year: 14 occupied days; first obligation AED 1,400.
- [ ] **EXAMPLE-004** Verify Rent AED 3,000; move-in on first day: Full monthly rent.
- [ ] **EXAMPLE-005** Verify Rent AED 3,000; later full February: AED 3,000, regardless of February length.
- [ ] **EXAMPLE-006** Verify Obligation AED 3,000; payment AED 1,000: Paid allocation AED 1,000; outstanding AED 2,000.
- [ ] **EXAMPLE-007** Verify Job retry for the same contract month: One obligation, not a duplicate.
- [ ] **EXAMPLE-008** Verify Default deposit changes after contract creation: Existing contract deposit remains unchanged.
- [ ] **EXAMPLE-009** Verify Approved extension: Original due date remains; revised expected date and approval remain visible.

## 36. Required Acceptance Tests

Requirements: 19, 27.

Each item requires an automated test and recorded evidence; a checklist box alone does not prove coverage.

- [ ] **TEST-AUTH-01** Verify Manager completes public registration, email, WhatsApp, identity, declarations, and administrator activation.
- [ ] **TEST-AUTH-02** Verify Unverified, pending, rejected, and suspended accounts cannot bypass their permitted access.
- [ ] **TEST-AUTH-03** Verify Tenant public self-registration fails; scoped invitation acceptance succeeds.
- [ ] **TEST-AUTH-04** Verify Expired, reused, revoked, or mismatched verification tokens fail.
- [ ] **TEST-AUTH-05** Verify Wrong OTP, resend abuse, login abuse, password reset, refresh replay, and logout enforce security controls.
- [ ] **TEST-ROLE-01** Verify Admin, manager, and tenant reach distinct functional dashboards.
- [ ] **TEST-ROLE-02** Verify Admin login through the web proxy never calls a manager-only dashboard.
- [ ] **TEST-ROLE-03** Verify Every list, detail, export, upload, download, and mutation rejects cross-manager access.
- [ ] **TEST-ROLE-04** Verify Tenant cannot read another tenant's unrelated evidence, requests, identity files, or contract.
- [ ] **TEST-ADMIN-01** Verify Account approval, rejection, suspension, restore, and support impersonation create audit events.
- [ ] **TEST-ADMIN-02** Verify Impersonation records real actor, effective identity, reason, start, end, and restricted actions.
- [ ] **TEST-ADMIN-03** Verify Admin screens never claim legal certification or binding dispute decisions.
- [ ] **TEST-INV-01** Verify Manager creates reusable landlord, declared unit, enabled space, amenities, images, and private documents.
- [ ] **TEST-INV-02** Verify Bed Space and Partition remain disabled in interface and direct API requests.
- [ ] **TEST-INV-03** Verify Missing required information prevents unit activation.
- [ ] **TEST-OCC-01** Verify Single tenant, couple, and unrelated occupants use the required account and contract structure.
- [ ] **TEST-OCC-02** Verify Concurrent allocation cannot exceed capacity or bypass maintenance blocks.
- [ ] **TEST-CON-01** Verify Open-ended contract stores negotiated rent, due day, notice, deposit, currency, and occupancy dates.
- [ ] **TEST-CON-02** Verify Amendments preserve past terms and apply on the explicit effective date.
- [ ] **TEST-RENT-01** Verify First-month proration passes every example in section 24.3.
- [ ] **TEST-RENT-02** Verify Later months retain full rent across 28-, 29-, 30-, and 31-day months.
- [ ] **TEST-RENT-03** Verify Multiple scheduler runs produce one obligation per contract period.
- [ ] **TEST-RENT-04** Verify Same-space annual reviews recur without duplicate reviews or automatic price changes.
- [ ] **TEST-PAY-01** Verify External payment without evidence succeeds and creates a durable tenant receipt.
- [ ] **TEST-PAY-02** Verify Partial payment, multiple allocations, correction, reversal, and tenant error report preserve balances and audit.
- [ ] **TEST-PAY-03** Verify Repeated idempotent payment request cannot duplicate money.
- [ ] **TEST-LATE-01** Verify Request outside the configured final-ten-day window fails.
- [ ] **TEST-LATE-02** Verify Extension beyond five calendar days or stricter tenant maximum fails.
- [ ] **TEST-LATE-03** Verify Second approved request inside its six-month window fails.
- [ ] **TEST-LATE-04** Verify Approval preserves original due date, revised expected date, decision, and messages.
- [ ] **TEST-DEP-01** Verify Deposit defaults copy once; receipt, partial receipt, refund, and liability reconcile.
- [ ] **TEST-DEP-02** Verify Notice preview handles cross-month daily rates and caps deductions at available deposit.
- [ ] **TEST-DEP-03** Verify Tenant acknowledgement precedes move-out submission.
- [ ] **TEST-DEP-04** Verify Deduction acceptance, dispute, revisions, deadlock, refund, and acknowledgement preserve history.
- [ ] **TEST-DEP-05** Verify Disputed proposal cannot silently become an accepted deduction.
- [ ] **TEST-CASE-01** Verify Each case type supports required fields, evidence, messages, response, resolution, and tenant acknowledgement.
- [ ] **TEST-CASE-02** Verify Complaint privacy, reopening, cost responsibility, and evidence permissions remain enforced.
- [ ] **TEST-CASE-03** Verify No tenant response leaves completion unacknowledged, not automatically accepted.
- [ ] **TEST-CASE-04** Verify Accepted damage cost cannot trigger duplicate direct and deposit charges.
- [ ] **TEST-TRANS-01** Verify Unapproved room-change request expires after five calendar days with the specified reason.
- [ ] **TEST-TRANS-02** Verify Approval exposes the seven-day negotiation period and independent six-month frequency limit.
- [ ] **TEST-TRANS-03** Verify Transfer atomically updates allocation, amendment, effective dates, and explicit financial treatment.
- [ ] **TEST-TRANS-04** Verify Failed or concurrent destination allocation leaves the original space and balances intact.
- [ ] **TEST-EXP-01** Verify Owner rent, utilities, maintenance, shared costs, and recoveries reconcile by scope.
- [ ] **TEST-FIN-01** Verify Income, profit, occupancy, arrears, and deposit liability match authorized ledger data.
- [ ] **TEST-FIN-02** Verify Currency conversion preserves original amount and saved rate; later rate changes do not rewrite history.
- [ ] **TEST-MSG-01** Verify Preferences control non-security email and WhatsApp; critical security notices retain a required channel.
- [ ] **TEST-MSG-02** Verify Delivery retry, provider rejection, duplicate callback, and bad signature retain correct business state.
- [ ] **TEST-DOC-01** Verify Unsafe upload, oversized file, unauthorized download, expired URL, and unscanned file fail safely.
- [ ] **TEST-PDF-01** Verify Both parties export the same factual event history with masked identities, authorship, timestamp, and integrity metadata.
- [ ] **TEST-PDF-02** Verify Failed report job exposes a recoverable error; unauthorized report download fails.
- [ ] **TEST-UI-01** Verify Every initial-release screen has functional actions and load, empty, error, success, and validation states.
- [ ] **TEST-UI-02** Verify Mobile and desktop layouts preserve forms, navigation, tables, dialogs, and readable controls.
- [ ] **TEST-OPS-01** Verify Clean environment starts, migrates, seeds only permitted demo data, and passes browser smoke tests.
- [ ] **TEST-OPS-02** Verify Restart preserves data; scheduler recovery catches missed deadlines without duplicate effects.
- [ ] **TEST-OPS-03** Verify Production refuses demo mode and placeholder secrets.
- [ ] **TEST-OPS-04** Verify Upgrade, rollback compatibility, database restore, and private-file restore pass documented procedures.

## 37. Full Browser Release Journey

Requirements: 27.1.

- [ ] **E2E-001** Register and verify a Leasing Manager.
- [ ] **E2E-002** Activate that manager from the administrator interface.
- [ ] **E2E-003** Create a landlord, declared unit, and enabled rental space.
- [ ] **E2E-004** Invite a tenant through the real web interface.
- [ ] **E2E-005** Complete tenant email, WhatsApp, profile, and private document steps.
- [ ] **E2E-006** Create the contract and verify first-month proration.
- [ ] **E2E-007** Record a partial payment and inspect the tenant receipt.
- [ ] **E2E-008** Record the balance and verify the obligation status.
- [ ] **E2E-009** Submit a maintenance case with evidence.
- [ ] **E2E-010** Respond as manager and acknowledge resolution as tenant.
- [ ] **E2E-011** Verify late-payment eligibility and an approved revised date.
- [ ] **E2E-012** Complete a room transfer without capacity or ledger inconsistencies.
- [ ] **E2E-013** Preview move-out notice and submit explicit acknowledgement.
- [ ] **E2E-014** Propose, accept or dispute, and settle deposit deductions.
- [ ] **E2E-015** Record the external refund and tenant acknowledgement.
- [ ] **E2E-016** Export matching factual interaction reports from both roles.
- [ ] **E2E-017** Verify reports, audit events, notifications, and final balances.

Use deterministic provider adapters in CI.
Verify real email and WhatsApp separately in staging.
Preserve proof for both paths.

## 38. Owner Decisions and Dependency Gates

Requirements: 29.

All decisions below remain open in the source baseline.
Record the confirmed answer and dependent task identifiers before the affected workflow receives production approval.
Proposed defaults are not accepted business rules.

- [ ] **DEC-01** Confirm Exact currency-round policy and the stage that rounds proration, notice deductions, conversions, and totals.
- [ ] **DEC-02** Confirm Due-day behavior for day 29, 30, or 31 in shorter months.
- [ ] **DEC-03** Confirm Exact inclusive date boundaries for notice submission, effective exit, and earliest penalty-free move-out.
- [ ] **DEC-04** Confirm Final-month rent after confirmed move-out and its interaction with notice deductions.
- [ ] **DEC-05** Confirm Transfer-month proration, rent differences, deposit movement/top-up/refund, and transfer cancellation.
- [ ] **DEC-06** Confirm Outcome after seven negotiation days without an accepted destination.
- [ ] **DEC-07** Confirm Rolling-six-month boundary arithmetic and whether eligibility keys use approval date or another recorded date.
- [ ] **DEC-08** Confirm Whether withdrawn, cancelled, or reversed approvals consume late-payment and room-change frequency allowances.
- [ ] **DEC-09** Confirm Whether due-day requests can be submitted on the due date or after it.
- [ ] **DEC-10** Confirm Payment overpayment, advance rent, credit balances, and allocation order.
- [ ] **DEC-11** Confirm Report basis: cash, accrual, or separate explicitly labeled views.
- [ ] **DEC-12** Confirm Shared-cost allocation method and effective-date changes.
- [ ] **DEC-13** Confirm Exchange-rate provider, refresh cadence, failure fallback, and manual rate authority.
- [ ] **DEC-14** Confirm Required unit evidence categories and activation completeness policy.
- [ ] **DEC-15** Confirm Expired identity/licence/document effect on access, existing contracts, and new contracts.
- [ ] **DEC-16** Confirm Account rejection resubmission and suspension effect on tenant historical access.
- [ ] **DEC-17** Confirm Document retention, deletion/anonymization, dispute holds, backup retention, and jurisdiction policy.
- [ ] **DEC-18** Confirm Upload size/type limits, OTP lifetime/attempt limits, invitation expiry, and reminder cadence.
- [ ] **DEC-19** Confirm Production hostnames, email sender, Twilio templates, deployment region, and recovery objectives.
- [ ] **DEC-20** Confirm Measurable performance targets, portfolio scale, concurrent users, and report size limits.
- [ ] **DEC-21** Confirm Whether no-change or deferred annual review repeats reminders before the next anniversary.
- [ ] **DEC-22** Confirm Administrator MFA method and permitted impersonation actions.
- [ ] **DEC-23** Confirm Tenant acknowledgement requirements before a contract or rent amendment takes effect.
- [ ] **DEC-24** Confirm Refund target date, overdue refund alerts, and final closure with unresolved disputes.
- [ ] **DEC-25** Confirm Capacity reservations during invitation/negotiation and reservation expiry.
- [ ] **DEC-26** Confirm Availability of closed-relationship reports and documents after account suspension or closure.

## 39. Final Release Gates

Requirements: 28.

- [ ] **RELEASE-001** Pass lint, type checks, production builds, and unit tests.
- [ ] **RELEASE-002** Fail CI if required suites contain no tests.
- [ ] **RELEASE-003** Pass database integration and authorization tests against MySQL.
- [ ] **RELEASE-004** Pass financial arithmetic and deadline boundary tests with a controlled clock.
- [ ] **RELEASE-005** Pass browser tests against the composed web proxy.
- [ ] **RELEASE-006** Pass all three role-login and dashboard paths.
- [ ] **RELEASE-007** Pass regression tests for Codespaces origin and port behavior.
- [ ] **RELEASE-008** Pass upload authorization, scan, and private-download tests.
- [ ] **RELEASE-009** Pass report generation and PDF-content tests.
- [ ] **RELEASE-010** Pass retry, concurrency, idempotency, and scheduler-recovery tests.
- [ ] **RELEASE-011** Verify real email and Twilio delivery in staging.
- [ ] **RELEASE-012** Verify accessible mobile and desktop screens.
- [ ] **RELEASE-013** Verify deployment health, migrations, secret injection, logs, and alerts.
- [ ] **RELEASE-014** Verify database and file backup restore.
- [ ] **RELEASE-015** Resolve section 29 decisions before affected production workflows receive approval.
- [ ] **RELEASE-016** Record known defects and blocked requirements explicitly.
- [ ] **RELEASE-017** Supply a requirement-to-code-to-test evidence matrix.
- [ ] **RELEASE-018** Describe infrastructure status separately from application completion.
- [ ] **RELEASE-019** Do not equate passed health probes with a working application.
- [ ] **RELEASE-020** Do not claim completion while initial-release screens or workflows remain placeholders.

## 40. Source Coverage Map

This map routes every requirements section to checklist work.
Specific fields, restrictions, statuses, and calculations remain governed by the source document.

| Requirements section | Checklist sections |
|---|---|
| 1. Product Definition | 1, 8-22 |
| 2. Scope and Release Boundaries | Status Rules, 1, 9 |
| 3. Roles and Permissions | 4-6, 10, 24, 26, 30-31, 36 |
| 4. Inventory Model | 7-9, 29-31, 36 |
| 5. Tenant and Occupancy Management | 9-11, 29-31, 36 |
| 6. Contract and Rent Rules | 11-12, 19, 25, 35-38 |
| 7. Payment Recording | 12-14, 31, 35-37 |
| 8. Deposits, Move-Out and Deductions | 18, 20, 22, 35-38 |
| 9. Requests and Case Management | 14-18, 25, 30-32, 36-38 |
| 10. Financial Bookkeeping and Profitability | 16, 19-20, 22, 36 |
| 11. Dashboards | 6, 20, 30-31, 36 |
| 12. Notifications and Communications | 5-6, 10, 21, 25, 32-33, 36 |
| 13. Interaction and Dispute Report | 7, 22, 30-32, 36-37 |
| 14. Core Data Model | 3, 7-19, 24, 29, 36 |
| 15. API and Application Architecture | 1, 24-25, 31-32 |
| 16. Security, Privacy and Audit | 4-7, 24, 26, 34, 36, 38 |
| 17. Key Business Rules Summary | 9, 11-14, 17-19, 25, 35-38 |
| 18. Recommended Delivery Phases | Execution Order, 1-28 |
| 19. Acceptance Criteria for Initial Release | Module Completion Evidence, 36-37, 39 |
| 20. Explicit Assumptions | 1-2, 19, 23, 25-26, 38 |
| 21. Delivery Contract | Status Rules, 1, 23, 27-28, 36-39 |
| 22. Required Screens and Actions | 4-23, 30, 36-37 |
| 23. API Contract | 4, 24, 31, 36 |
| 24. Data Integrity and Financial Rules | 3, 9, 11-19, 35-38 |
| 25. Jobs and External Services | 7, 21-22, 25, 32-33, 36 |
| 26. Configuration, Deployment, and Operations | 27-28, 34, 36, 38-39 |
| 27. Acceptance Tests and Traceability | Module Completion Evidence, 36-37 |
| 28. Release Gates | 39 |
| 29. Open Decisions and Proposed Clarifications | 2, 38 |

## Completion Record

- [ ] **SIGNOFF-001** Attach the final requirement-to-code-to-test evidence matrix.
- [ ] **SIGNOFF-002** Verify every initial-release task and applicable acceptance test.
- [ ] **SIGNOFF-003** Verify all dependent decisions have approved answers.
- [ ] **SIGNOFF-004** List incomplete tasks, known defects, and deferred future scope explicitly.
- [ ] **SIGNOFF-005** Verify deployment, provider, backup, restore, security, and browser evidence.
- [ ] **SIGNOFF-006** Obtain owner approval for the completed initial release.
- [ ] **SIGNOFF-007** Describe infrastructure readiness separately from application completion.
