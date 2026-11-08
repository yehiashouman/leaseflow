# LeaseFlow - Complete Project Requirements

- Repository: `yehiashouman/leaseflow`.
- Document date: 7 November 2026.
- Purpose: deliver the complete initial-release application, not a scaffold or prototype.
- Status: requirements baseline; this document does not certify implementation or production readiness.
- Source: `SPECIFICATION.md`, blob `5bdbb40dc46eef253cd3c11231513a9bf5fa7192`.
- Original source: `Dubai_Shared_Accommodation_Management_System_Specification.docx`, Draft 1.0, 5 September 2026.
- Sections 1-20 retain the source product rules, with the approved UI-stack change noted below.
- UI change, 7 November 2026: use shadcn/ui, Tailwind CSS, Radix primitives, and Lucide instead of Bootstrap/SCSS.
- This explicit UI decision supersedes the original Tailwind exclusion; all other product rules remain unchanged.
- Sections 21-28 expand delivery requirements, interface coverage, tests, and operational acceptance.
- Section 29 identifies unresolved decisions; developers must not silently invent their answers.
- Preserve existing product rules when technical details differ.
- Preserve the repository stack unless the owner explicitly approves a replacement.
- Keep future features outside the initial-release completion claim.
- Treat original delivery phases as implementation order, not permission to omit initial-release modules.

## Document Map

Implementation status is recorded in `docs/IMPLEMENTATION.md`.
Full scope progress and verified checklist evidence are recorded in `docs/PROGRESS.md` and `docs/EVIDENCE.md`.
Session API implementation, migration, and deployment constraints are recorded in `docs/SESSIONS.md`; they do not approve unresolved owner decisions.
Landlord lifecycle, property metadata, archive guards, and verification scope are recorded in `docs/INVENTORY.md`.
Operational case APIs, immutable history, tenant acknowledgement, migration, and incomplete scope are recorded in `docs/CASES.md`.
Unit archive, amenities, owner schedules, administrator review, and request drafts are recorded in `docs/OPERATIONS-BATCH.md`.
The GitHub Pages preview is synthetic and does not replace API or production acceptance.
See `docs/PREVIEW.md` for deployment and isolation requirements.

| Sections | Coverage |
|---|---|
| 1-5 | Product, scope, roles, inventory, tenants, and occupancy |
| 6-10 | Contracts, rent, payments, deposits, cases, transfers, and expenses |
| 11-17 | Dashboards, notifications, PDFs, data, API, security, and business limits |
| 18-20 | Original delivery phases, acceptance criteria, and explicit assumptions |
| 21-23 | Delivery contract, complete screen inventory, and API requirements |
| 24-26 | Data invariants, background jobs, external services, and deployment |
| 27-28 | Acceptance tests, traceability, and release gates |
| 29 | Decisions that require owner confirmation |

---

**PRODUCT SPECIFICATION**

Dubai Shared Accommodation  
Management System

API-first operational platform for Leasing Managers and tenants

| **Document**   | **Value**                                 |
|----------------|-------------------------------------------|
| Status         | Functional draft                          |
| Version        | 1.0                                       |
| Date           | 5 September 2026                          |
| Primary market | Dubai, United Arab Emirates               |
| Primary roles  | Leasing Manager, Tenant, Administrator    |
| Architecture   | Separate API and responsive web front end |

| **Core structure:** Unit → Rental Space → Contract → Primary Tenant / Secondary Occupant. Landlords are stored as records linked to units; a landlord login interface is postponed. |
|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|

*This specification captures the agreed product behavior. Legal documents are submitted and declared by Leasing Managers; the platform and its administrators do not certify legal sufficiency, ownership, authorization or regulatory compliance.*

# 1. Product Definition

The application manages existing shared-accommodation operations: properties, rental spaces, occupants, monthly agreements, rent records, deposits, expenses, requests, complaints, maintenance and evidence. It is not initially a public property marketplace, but its inventory model preserves the images, amenities and availability data needed for a future listing service.

## 1.1 Objectives

- Give Leasing Managers one operational view of units, spaces, occupants, upcoming dues, late payments, deposits, expenses and unresolved requests.

- Give tenants a transparent view of their occupancy, rent history, next payment, deposit, requests, responses and evidence.

- Preserve a timestamped factual record that either party can export if a disagreement must be handled outside the platform.

- Keep the back end independent from the web interface so separate mobile applications can be introduced later.

- Support future staff, landlord and public-listing interfaces without including them in the initial release.

## 1.2 Terminology

| **Term**           | **Meaning**                                                                                                        |
|--------------------|--------------------------------------------------------------------------------------------------------------------|
| Leasing Manager    | The main business user who manages units, rental spaces, tenants, payments, expenses and requests.                 |
| Landlord           | The owner or contracting party for a unit. Stored as a reusable record; no login interface in the initial release. |
| Unit               | A complete apartment, villa or other property managed by a Leasing Manager.                                        |
| Rental Space       | A rentable area inside a unit: room, master room or a future accommodation type.                                   |
| Master Room        | A room with private bathroom/toilet facilities and potentially additional amenities.                               |
| Primary Tenant     | The account holder and legally responsible occupant for a contract.                                                |
| Secondary Occupant | An optional identity record, typically for the primary tenant’s partner; it has no separate account.               |
| Contract           | An open-ended monthly occupancy arrangement attached to one rental space.                                          |

# 2. Scope and Release Boundaries

## 2.1 Initial release

- Public Leasing Manager registration and verification.

- Administrator account moderation.

- Landlord records without landlord login.

- Units, rental spaces, images, amenities and availability.

- Tenant invitation, verification, identity documents and contracts.

- Monthly rent calculations, recorded payments, receipts and evidence.

- Deposits, deductions, refunds and disputes.

- Tenant requests, complaints, maintenance, room transfers and move-out.

- Leasing Manager expenses, owner rent, utilities and profitability.

- Email and WhatsApp communication using Twilio.

- PDF interaction/dispute reports.

- English-first localization-ready responsive web application.

## 2.2 Disabled and future features

- Bed Space and Partition types exist in configuration and data structures but cannot be activated, assigned, advertised or contracted. Hover/help text displays “Future feature.”

- Landlord login and dashboard.

- Leasing Manager staff accounts and granular staff permissions.

- Public advertising and tenant self-service discovery.

- Native mobile applications.

- Online payment collection; payments are recorded only.

# 3. Roles and Permissions

| **Capability** | **Leasing Manager**                            | **Tenant**                            | **Administrator**                           |
|----------------|------------------------------------------------|---------------------------------------|---------------------------------------------|
| Account        | Register, verify and maintain profile          | Invitation only; verify account       | Moderate, suspend and support               |
| Inventory      | Manage own landlords, units and spaces         | View assigned unit/space              | View/report/suspend; no legal certification |
| Contracts      | Create, amend, transfer and close              | View, acknowledge and request changes | Read for support/audit                      |
| Payments       | Record, evidence and correct with audit trail  | View and acknowledge receipt          | Read/audit; no silent edits                 |
| Requests       | Respond, approve/reject and resolve            | Create, respond, accept or dispute    | Read for platform support only              |
| Reports        | Operational, financial and interaction reports | Own interaction report                | Platform and audit reports                  |

## 3.1 Leasing Manager onboarding

- Anyone may register publicly as a Leasing Manager.

- Required profile data: full legal name, date of birth, nationality, email, mobile number, Emirates ID number and expiry date, and Emirates ID document.

- Verification sequence: email-link verification, followed by WhatsApp OTP through Twilio.

- A UAE licence may be uploaded when applicable, including type, number, issuing authority, issue date and expiry date.

- The Leasing Manager accepts declarations that submitted identity, property and authorization information is genuine, current and legally sufficient.

- Administrator approval activates the account for platform use, but does not certify the legal validity of any uploaded document.

## 3.2 Administrator design

Administrator responsibility is platform governance—not participation in, approval of or legal responsibility for the Leasing Manager’s accommodation business.

- Approve, reject, suspend or restore platform accounts based on completeness, identity signals, abuse, security and platform policy.

- View submitted identity and unit files for completeness or obvious risk; never label them legally approved or verified property.

- Manage global feature flags, request categories, amenity lists, notification templates and system defaults.

- Review security alerts, duplicate identities, reports, suspicious activity and audit history.

- Provide support using audited impersonation. Every impersonation requires a reason and is visible in the audit log.

- Access operational reports without silently changing confirmed payments, contracts, evidence or conversations.

- Use sub-roles later: Super Administrator, Verification/Moderation Administrator, Support Administrator and Finance/Audit Administrator.

| **Required wording:** Use factual statuses such as Information Complete, Documents Submitted, Expired, Reported or Suspended. Never use “legally approved,” “verified property,” or equivalent certification language. |
|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|

# 4. Inventory Model

## 4.1 Landlords

A Leasing Manager can create a landlord record once and link it to one or more units. Store name, company/legal name if applicable, email, phone, WhatsApp number, preferred contact method, address, notes and supporting documents.

## 4.2 Units

- Name/internal reference, building, street, community/area, emirate, postal/address notes and GPS latitude/longitude.

- Linked landlord and Leasing Manager.

- Images, common-area images and documents.

- Owner rent paid by the Leasing Manager, payment schedule and currency.

- Default security deposit amount inherited by new contracts unless explicitly amended during negotiation.

- Amenities: air conditioning, furnished, bed, television, refrigerator, private bathroom, shared bathroom, kitchen, laundry, balcony, parking, Wi-Fi, cleaning and configurable additions.

- Required manager declaration and uploaded supporting files, such as tenancy contract, landlord consent/delegation letter, title deed copy or other manager-selected evidence.

- Activation after required information and declarations are complete. Legal responsibility remains with the Leasing Manager.

## 4.3 Rental spaces

| **Type**    | **Initial status** | **Important fields**                                         |
|-------------|--------------------|--------------------------------------------------------------|
| Room        | Enabled            | Capacity, price guidance, amenities, photos and availability |
| Master Room | Enabled            | Room fields plus private bathroom and extra amenities        |
| Bed Space   | Disabled           | Data model retained; displayed as Future feature             |
| Partition   | Disabled           | Data model retained; displayed as Future feature             |

Each space supports an internal name/number, type, capacity, occupancy state, preferred matching notes, images, amenities, base asking rent, deposit inherited from the unit, and active/inactive/maintenance status.

# 5. Tenant and Occupancy Management

## 5.1 Tenant account creation

- Tenants cannot self-register. A Leasing Manager creates an invitation using the tenant’s email.

- The tenant opens the email verification link, supplies their own phone number and verifies it with a Twilio WhatsApp OTP.

- After verification, the tenant completes full name, date of birth, nationality, Emirates ID number, expiry date and document upload.

- The account is linked only to the inviting Leasing Manager unless a future cross-manager identity policy is introduced.

- Notification preferences allow email, WhatsApp or both. Critical account/security notifications cannot be fully disabled.

## 5.2 Occupancy patterns

- Single occupant: one primary tenant, one contract and one rental space.

- Couple: one primary tenant and one contract; an optional secondary occupant identity/Emirates ID record may be attached. The primary tenant remains responsible.

- Two unrelated occupants: two primary tenant accounts and two separate contracts allocated to the same room.

- Sex, nationality, language, broad cultural background and lifestyle/sleeping preferences are optional matching information, not mandatory eligibility rules.

- The interface may show non-binding compatibility information such as sleep schedule, smoking preference, noise preference and shared-language preference. The Leasing Manager makes the final allocation.

# 6. Contract and Rent Rules

Contracts are monthly and open-ended. They have a start date but no required annual end date. A tenant may leave after providing the notice required by their profile/contract.

| **Rule**            | **Agreed behavior**                                                                                              |
|---------------------|------------------------------------------------------------------------------------------------------------------|
| Monthly rent        | Negotiated and stored per contract/tenant; AED is the default currency.                                          |
| Due day             | Configurable per contract; day 1 is the default.                                                                 |
| First partial month | Monthly rent ÷ actual days in that calendar month × occupied days, including the move-in day.                    |
| Later months        | Full monthly amount regardless of whether the month has 28, 29, 30 or 31 days.                                   |
| Notice period       | Default 30 days; configurable per tenant/contract, including exceptions such as 15 days.                         |
| Open-ended term     | Continues monthly until a move-out is confirmed.                                                                 |
| Annual review       | After 12 continuous months in the same space, remind the Leasing Manager to review pricing; no automatic change. |
| Currency            | AED and USD supported. Store the transaction currency, AED value and exchange-rate snapshot.                     |

## 6.1 Annual review workflow

- A monthly job identifies contracts reaching 12, 24, 36 and subsequent continuous months in the same rental space.

- Create a Contract Review record and notify the Leasing Manager by configured channels.

- The Leasing Manager may mark Reviewed / No Change, propose a price effective next month, or defer with a review date.

- The tenant sees any proposed amendment and its effective month. The original rent and every amendment remain in history.

- A room transfer resets the same-space anniversary for space-specific review while preserving the complete contract history.

# 7. Payment Recording

The platform does not collect money. It records obligations and payments made outside the system.

- Generate monthly rent obligations from the active contract, due day, amendments and approved late-payment extension.

- Leasing Manager records amount, date, method, reference, notes and optional image/PDF evidence.

- Evidence is recommended but not required. A payment may still be marked paid without an attachment.

- The tenant receives an in-system receipt and notification showing the recorded amount, date, payer, period and evidence status.

- Tenant may acknowledge the payment record or report an error. Corrections create linked reversal/correction entries; confirmed history is never silently overwritten.

- Statuses: Upcoming, Due, Partially Paid, Paid, Late, Waived/Adjusted and Disputed.

- Dashboard shows payments due, overdue, received this month and upcoming next month.

## 7.1 Late-payment request

| **Setting / rule**  | **Behavior**                                                                                 |
|---------------------|----------------------------------------------------------------------------------------------|
| Submission window   | Configured per tenant, but only within the final 10 days before the payment due date.        |
| Requested extension | Up to the per-tenant maximum; system maximum is 5 calendar days after the original due date. |
| Frequency           | One approved late-payment request per rolling six months for this request type.              |
| Approval            | Leasing Manager approves, rejects or asks for clarification.                                 |
| Effect              | Approval changes that obligation’s expected date without changing the monthly rent.          |
| History             | Request, decision, messages, original due date and revised date remain permanently visible.  |

# 8. Deposits, Move-Out and Deductions

## 8.1 Deposit

- Default deposit is configured on the unit and copied into a new contract.

- The negotiated contract may record the final deposit, amount received, date, method, evidence and remaining balance.

- Move-out requests create a projected refund liability visible on the Leasing Manager dashboard.

- Deposit statuses: Not Required, Due, Partially Received, Held, Refund Pending, Partially Refunded, Refunded and Disputed.

## 8.2 Notice and automatic deduction calculation

When a tenant selects a desired move-out date, the system compares it with the earliest penalty-free date based on the notice period.

| **Calculation**           | **Formula**                                                                                         |
|---------------------------|-----------------------------------------------------------------------------------------------------|
| Daily notice rate         | Monthly contract rent ÷ actual days in the calendar month containing the uncovered notice days.     |
| Missing notice days       | Required notice end date − requested move-out date, limited to the uncovered period.                |
| Proposed notice deduction | Sum of daily notice rates for each uncovered calendar day, capped by the available deposit balance. |
| Projected refund          | Deposit held − approved notice deduction − approved damage/other deductions.                        |

Before submission, the tenant sees the requested move-out date, required notice, missing days, calculated deduction and projected refund. Submission requires explicit acknowledgement. The Leasing Manager can respond, waive or reduce the deduction, but cannot exceed the applicable contract amount or available deposit without creating a separate charge.

## 8.3 Deduction and dispute workflow

- Leasing Manager proposes each deduction separately with category, amount, explanation and evidence.

- Categories include insufficient notice, tenant-caused damage, missing item/key, exceptional cleaning and other documented contractual charge.

- Tenant accepts or disputes each proposed deduction and can add text and evidence.

- Both parties can continue a timestamped discussion and revise a proposal without deleting earlier versions.

- If no agreement is reached, mark Deadlock / External Resolution Required. The administrator does not decide the dispute.

- Each party can export the same factual interaction record for independent advice or external authorities.

- After payment, the Leasing Manager records the refund and uploads optional evidence; the tenant is asked to acknowledge receipt.

# 9. Requests and Case Management

| **Request type**   | **Key rules**                                                                                                                                                     |
|--------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Maintenance        | Category, description, urgency, photos/files, manager response, responsibility and completion evidence.                                                           |
| Neighbor complaint | Select the involved occupant when known, describe issue, attach evidence and record manager communication/action.                                                 |
| Late payment       | Final-ten-day window, maximum five-day extension, one approved request per rolling six months.                                                                    |
| Room change        | One approved request per rolling six months; Leasing Manager has up to five days to approve/reject. Approved request opens a one-week viewing/negotiation period. |
| Move-out           | Enforces contract notice; previews any insufficient-notice deduction before tenant confirmation.                                                                  |
| Key/lock change    | Reason, security urgency, authorization, cost responsibility and completion evidence.                                                                             |
| General request    | Configurable catch-all with description, attachments and response deadline.                                                                                       |

## 9.1 Common case behavior

- Statuses: Draft, Submitted, Seen, Awaiting Leasing Manager, Awaiting Tenant, Approved, Rejected, In Progress, Resolved, Accepted, Reopened, Deadlock and Closed.

- Every message, status change, attachment, assignment, deadline and acknowledgement is timestamped and immutable in the event history.

- Both parties receive updates using their notification preferences.

- A completed request asks the tenant to accept or dispute completion. If the tenant does not respond, the item remains completed-unacknowledged rather than rewriting history.

- Automated decisions must be explicit. The agreed room-change rule is automatic rejection after five days without approval; record the reason as “Approval period expired.”

- Sensitive complaint details are visible only to the relevant tenant, Leasing Manager and authorized support administrators.

## 9.2 Maintenance responsibility and cost

- Leasing Manager is operationally responsible for handling maintenance; no technician, building-management or landlord workflow is included initially.

- Response classification: Normal Wear / Leasing Manager Cost, Tenant-Caused Damage / Proposed Tenant Cost, Under Review, or No Cost.

- For tenant-caused damage, the Leasing Manager supplies an explanation, proposed amount and evidence. The tenant accepts or disputes it.

- An accepted tenant cost may become a direct charge or proposed deposit deduction. The system must prevent double charging.

- Maintenance bookkeeping records vendor, category, unit, rental space, amount, currency, date, invoice/evidence and whether any amount was recovered from a tenant.

## 9.3 Room-transfer workflow

- Tenant submits reason and optional preferences.

- Leasing Manager approves/rejects within five days; no response produces automatic rejection.

- Approval opens a seven-day negotiation/viewing period outside and inside the recorded conversation.

- If a space is accepted, the Leasing Manager selects the new unit/space, effective date, new rent, deposit treatment and any prorated difference.

- The system creates a contract amendment, closes the old allocation on the effective date and reserves/occupies the new space atomically.

- The original space becomes available only after the effective transfer and any operational hold/maintenance block.

# 10. Financial Bookkeeping and Profitability

Financial reporting is for Leasing Manager bookkeeping. It does not process payments or represent audited accounting.

- Income: recorded tenant rent, accepted tenant charges and other unit income.

- Expenses: rent paid to property owner, electricity/water/cooling, internet, maintenance, cleaning, furnishings, licences/fees and other categorized costs.

- Allocate expenses to the whole portfolio, landlord, unit, rental space or contract where meaningful.

- Unit gross profit = unit-attributed income − owner rent − utilities − maintenance − other unit expenses.

- Rental-space contribution = space-attributed income − directly attributable space costs; shared unit costs may be allocated by configured method.

- Store original currency and exchange-rate snapshot. Default financial dashboards report AED.

- Reports: monthly income/expense, unit profitability, occupancy, arrears, deposit liability, maintenance cost and contract contribution.

# 11. Dashboards

## 11.1 Leasing Manager dashboard

- Units, enabled rental spaces, occupied spaces, vacancies and spaces under maintenance.

- Rent due today, due within seven days, overdue, partially paid and received this month.

- Deposit held, projected refunds, refunds due and disputed deductions.

- Open maintenance, neighbor complaints, room changes, late-payment requests and move-outs.

- Requests awaiting the Leasing Manager and deadlines approaching.

- Contracts reaching 12-month review milestones.

- Expiring Emirates IDs, licences, unit documents and consent files.

- Monthly income, owner rent, expenses and estimated profit by unit.

## 11.2 Tenant dashboard

- Current unit/space, move-in date, months and days of occupancy.

- Next payment date, monthly rent, current amount due and payment history.

- Deposit held, proposed deductions, projected refund and refund status.

- Open requests, unresolved items, recent responses and actions awaiting acknowledgement.

- Current contract rules: due day, notice period, late-request window and late-extension allowance.

- Primary tenant details and optional secondary occupant identity status.

- Quick actions: report maintenance, complaint, request late payment, room change or move-out, and export interaction report.

# 12. Notifications and Communications

| **Channel**    | **Initial implementation**                                                                       |
|----------------|--------------------------------------------------------------------------------------------------|
| Email          | Verification links, account/security messages, receipts, reminders, request updates and reports. |
| WhatsApp       | Twilio OTP and transactional notifications/templates.                                            |
| In application | Notification center with unread state and direct links to the relevant record.                   |

- User preference: Email, WhatsApp or Both for non-security messages.

- Store template, recipient, channel, language, related entity, attempt time, provider status and delivery status.

- Avoid exposing sensitive identity-document contents in email or WhatsApp; link users back to the authenticated application.

- Support preferred language on every profile and template fallback to English.

- Recommended events: invitation, verification, approval/suspension, payment due, payment recorded, overdue, request submitted/responded/expired, move-out, deposit proposal/refund, annual review and expiring document.

# 13. Interaction and Dispute Report

Either the primary tenant or Leasing Manager can generate a PDF report for their relationship. Both exports draw from the same immutable event data and clearly identify who supplied each statement or document.

- Parties and verified contact/identity summary, with sensitive identifiers masked by default.

- Unit, rental space, contract dates, occupancy changes, rent and deposit terms.

- Payment schedule, payment history, punctuality, corrections and evidence references.

- Requests and complaints by type, status, response time and outcome.

- Maintenance claims, responsibility proposals, deductions, acceptances and disputes.

- Move-out notice calculation, deposit ledger and refund status.

- Chronological messages, status changes, acknowledgements and attachments.

- Generation timestamp, report identifier and integrity hash.

- Statement that the report is a platform-generated factual activity record, not a legal finding or certification.

# 14. Core Data Model

| **Entity**                  | **Purpose / principal relationships**                                                    |
|-----------------------------|------------------------------------------------------------------------------------------|
| users                       | Authentication identity, role, email/phone verification, status and preferred language.  |
| leasing_manager_profiles    | Legal/profile data, Emirates ID, licence and declarations.                               |
| tenant_profiles             | Identity, Emirates ID, matching preferences and manager relationship.                    |
| landlords                   | Reusable landlord/contact records owned by a Leasing Manager.                            |
| units                       | Property, address/GPS, landlord, owner-rent terms, default deposit and status.           |
| rental_spaces               | Unit subdivision, type, capacity, amenities, pricing guidance and availability.          |
| occupants                   | Primary or secondary identity records linked to a contract.                              |
| contracts                   | Open-ended monthly agreement, space, primary tenant, rent, currency, due day and notice. |
| contract_amendments         | Effective-dated rent, space, deposit, due-day or notice changes.                         |
| rent_obligations / payments | Monthly dues and external payment records, receipts and corrections.                     |
| deposits / deposit_ledger   | Received, held, proposed deductions, refunds and disputes.                               |
| requests / request_events   | Typed cases, status, deadlines, messages and immutable history.                          |
| expenses                    | Owner rent, utilities, maintenance and other bookkeeping costs.                          |
| documents / media           | Versioned identity, property, consent, evidence, images and reports.                     |
| notifications               | Email, WhatsApp and in-app delivery history.                                             |
| audit_events                | Actor, action, old/new values, reason, time, IP/session and entity reference.            |
| contract_reviews            | Twelve-month reminders, decisions and proposed amendments.                               |

## 14.1 Important model constraints

- All business records are scoped to the owning Leasing Manager; cross-manager access is prohibited.

- A rental space cannot exceed its enabled capacity on any date.

- A couple uses one contract with one primary tenant and an optional secondary occupant record.

- Unrelated occupants require separate contracts even when assigned to the same space.

- Financial and contractual changes are effective-dated; historical values remain queryable.

- Documents are versioned and never overwritten in place.

- Bed Space and Partition types are globally disabled by feature flag and server-side validation, not only hidden in the interface.

- All timestamps are stored in UTC and displayed in the user’s timezone; Dubai defaults to Asia/Dubai.

# 15. API and Application Architecture

| **Approved stack:** REST/JSON API with OpenAPI documentation; Fastify/TypeScript API; MySQL with Prisma; React responsive web front end; shadcn/ui with Tailwind CSS, Radix primitives, and Lucide icons. |
|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|

- Separate API service and front-end deployment with versioned endpoints such as /api/v1.

- Token-based authentication suitable for the current web client and future mobile clients; use secure rotating refresh tokens.

- Role- and ownership-based authorization enforced in the API for every resource.

- Background jobs for notifications, recurring obligations, overdue detection, annual review and document-expiry reminders.

- Object storage for documents/images with private access, signed short-lived downloads, virus scanning and file validation.

- Twilio integration isolated behind a messaging service so the provider can be changed later.

- Exchange-rate integration isolated behind a currency service; each financial record saves the applied rate and source time.

- Idempotency keys for payment recording, request submission, transfer completion and other retry-sensitive writes.

- API supports pagination, filtering, sorting, localized errors and machine-readable validation codes.

## 15.1 Suggested API modules

| **Module**     | **Representative resources**                                                                  |
|----------------|-----------------------------------------------------------------------------------------------|
| Identity       | registrations, invitations, email verification, WhatsApp OTP, sessions, profiles              |
| Inventory      | landlords, units, rental spaces, amenities, images, documents, availability                   |
| Occupancy      | tenants, occupants, contracts, amendments, transfers, annual reviews                          |
| Finance        | rent obligations, payments, receipts, deposits, deductions, refunds, expenses, exchange rates |
| Cases          | requests, messages, events, complaints, maintenance, attachments                              |
| Communications | preferences, templates, notifications, delivery events                                        |
| Reporting      | dashboards, profitability, interaction reports, exports                                       |
| Administration | moderation, feature flags, taxonomies, audit logs, support access                             |

# 16. Security, Privacy and Audit

- Encrypt transport and stored sensitive data; keep Emirates ID files private and access-controlled.

- Apply least privilege, tenant/manager ownership checks and administrator sub-roles.

- Require multi-factor authentication for administrators and recommend it for Leasing Managers.

- Log authentication, document access, exports, impersonation, contract/payment changes and moderation actions.

- Mask Emirates ID numbers and contact data in dashboards and reports unless full access is necessary.

- Define retention rules for identity documents, closed contracts, evidence, notifications and audit records.

- Provide account/data export and legally appropriate deletion/anonymization workflows without destroying required financial or dispute history.

- Rate-limit OTP, login, invitation, upload and report-generation endpoints.

- Validate MIME type and content, scan uploads, strip dangerous metadata where appropriate and prevent executable files.

- Display terms and declarations with version, timestamp, IP/session and accepted text hash.

# 17. Key Business Rules Summary

| **Rule**                | **Value**                                                                  |
|-------------------------|----------------------------------------------------------------------------|
| Default payment day     | 1st day of the month; configurable per contract                            |
| Partial first month     | Monthly rent ÷ actual days in month × occupied days                        |
| Default notice period   | 30 days; configurable per contract/tenant                                  |
| Late-request submission | Within configured window, never earlier than final 10 days before due date |
| Maximum late extension  | 5 calendar days; may be lower per tenant                                   |
| Late-request frequency  | One approved request per rolling six months                                |
| Room-change decision    | Five days; otherwise automatically rejected                                |
| Room-change frequency   | One approved request per rolling six months                                |
| Transfer negotiation    | Up to seven days after approval                                            |
| Contract review         | Every 12 continuous months in the same rental space                        |
| Default deposit         | Defined per unit and copied to new contracts                               |
| Payment processing      | None; external payments are recorded                                       |
| Default currency        | AED; USD supported with stored conversion snapshot                         |
| Bed Space / Partition   | Disabled by global server-side feature flag                                |

# 18. Recommended Delivery Phases

| **Phase**          | **Deliverables**                                                                         |
|--------------------|------------------------------------------------------------------------------------------|
| 1\. Foundation     | Authentication, roles, verification, profiles, admin moderation, audit and file storage. |
| 2\. Inventory      | Landlords, units, rental spaces, amenities, documents, images and availability.          |
| 3\. Occupancy      | Tenant invitation, occupants, contracts, proration, assignments and annual reviews.      |
| 4\. Finance        | Monthly obligations, recorded payments, receipts, deposits, expenses and profitability.  |
| 5\. Cases          | Maintenance, complaints, late payment, room transfer, move-out and deposit disputes.     |
| 6\. Communications | Twilio WhatsApp, email, templates, preferences and notification center.                  |
| 7\. Reporting      | Dashboards, interaction PDFs, financial reports, exports and integrity metadata.         |
| 8\. Expansion      | Staff, landlord portal, public listings and native mobile applications.                  |

# 19. Acceptance Criteria for Initial Release

- A verified and administrator-activated Leasing Manager can create a landlord, unit and enabled rental space.

- The API prevents activation or contracting of Bed Space and Partition types while returning a Future feature reason.

- A manager can invite a tenant who completes email and Twilio WhatsApp verification.

- A room can hold one couple contract or separate contracts for unrelated occupants without exceeding capacity.

- First-month rent is correctly prorated by actual days in the calendar month; later obligations use full monthly rent.

- Payments can be recorded with or without evidence, and the tenant receives a durable in-system receipt.

- Late-payment, room-change, maintenance, complaint and move-out workflows enforce the agreed limits and preserve event history.

- Deposit notice deductions are previewed before move-out submission and support accept/dispute/deadlock states.

- Leasing Manager can see upcoming deposit refunds and estimated profitability by unit.

- Either party can generate a consistent PDF interaction report containing factual history and evidence references.

- Administrator actions, support impersonation and corrections are fully audited.

- No interface claims that the administrator or platform legally approved a unit or document.

# 20. Explicit Assumptions

- Initial interface language is English, with all user-visible strings prepared for localization.

- The Leasing Manager—not the platform administrator—is solely responsible for the legality, accuracy and sufficiency of submitted documents and accommodation activity.

- The system provides operational records and calculations, not legal advice, regulatory approval, escrow, payment processing or binding dispute resolution.

- When a rule is configurable per tenant and also has a platform maximum, the stricter value applies.

- All deadlines use calendar days in the contract’s configured timezone unless later changed to business days.

- Future legal or regulatory changes can enable or permanently retire accommodation types through configuration and server-side enforcement.

---

# 21. Delivery Contract

## 21.1 Definition of complete

- Deliver every initial-release workflow through the responsive web interface and the API.
- Persist real application data through database migrations.
- Connect every visible action to its authorized backend operation.
- Provide complete create, view, edit, archive, and restore flows where the domain permits them.
- Never delete financial history, evidence, declarations, or case events through ordinary CRUD actions.
- Replace placeholder dashboard values with authorized database aggregates.
- Expose failures clearly; never present failed writes as successful actions.
- Include tests, reproducible setup, deployment instructions, and operational recovery procedures.
- Do not label a module complete from database tables or API handlers alone.
- Do not label a deployment healthy from process health alone.
- Verify actual browser workflows through the deployed web proxy.
- Record unimplemented requirements as incomplete.
- Do not claim production readiness without the evidence required in section 28.

## 21.2 Repository stack

| Layer | Required baseline |
|---|---|
| Workspace | Existing npm workspaces: `api` and `web` |
| API | Fastify, TypeScript, versioned REST/JSON |
| Database | MySQL with Prisma migrations |
| Web | React, TypeScript, Vite, React Router |
| Interface | shadcn/ui, Tailwind CSS 4, Radix primitives, Lucide icons; no Bootstrap |
| Data access | Existing React Query and Axios patterns |
| Session security | Short-lived access tokens and secure rotating refresh tokens |
| Cache and jobs | Redis; durable retry-safe worker and scheduler |
| Files | S3-compatible private storage; MinIO for development |
| External messages | Twilio WhatsApp OTP and transactional notifications; configured email service |
| PDF | Server-generated interaction reports with authorization and immutable source history |
| Development | Docker Compose and GitHub Codespaces |
| Production | Existing Helm and Terraform AWS deployment baseline |
| Tests | Vitest component/unit tests; jsdom and React Testing Library; Playwright browser tests; database, authorization, and deployment tests |

Package presence does not prove a feature exists.
Infrastructure files do not prove a production deployment exists.
Keep editable shadcn/ui components in `web/src/components/ui`.
Keep shared class composition in `web/src/lib/utils.ts`.
Use `web/components.json` for component generation and aliases.
Use Tailwind through `@tailwindcss/vite` and semantic CSS-variable tokens in `web/src/styles.css`.
Use accessible Radix primitives for dialogs and other complex controls.
Preserve keyboard access, focus behavior, form labels, responsive layouts, and existing API contracts.
Do not mix Bootstrap classes, icon fonts, or SCSS imports into the new UI.
See `docs/UI.md` for component conventions and generation commands.
Select maintained job, PDF, and upload-scan libraries within this architecture.
Use Playwright for browser regression tests and Vitest with React Testing Library for component tests.
Do not claim those selections as original user preferences.

# 22. Required Screens and Actions

## 22.1 Shared interface

- Provide responsive layouts for desktop and mobile.
- Provide accessible labels, keyboard controls, focus states, and validation messages.
- Provide load, empty, error, success, unauthorized, expired-session, and offline states.
- Preserve unsaved form values after recoverable server failures.
- Show field errors beside the relevant input.
- Show safe server error details and a request identifier.
- Confirm destructive, financial, and final contract actions.
- Provide pagination, filters, sort controls, and search on operational lists.
- Use the authenticated role to select navigation and the dashboard.
- Never send an administrator to the Leasing Manager dashboard by default.
- Hide unauthorized actions and enforce the same restrictions in the API.
- Display money with currency and dates with the relevant timezone.
- Provide notification preferences, profile, security, and session controls.

## 22.2 Public and account screens

| Screen | Required actions and content |
|---|---|
| Login | Authenticate; show real validation errors; route by role and account status |
| Manager registration | Capture required profile fields; accept versioned declarations; prevent duplicate submissions |
| Email verification | Verify valid token; reject expired or reused token; provide controlled resend |
| WhatsApp verification | Capture own phone number; request OTP; verify OTP; enforce retry and resend limits |
| Identity and licence | Upload private documents; capture expiry and licence fields; show completion status |
| Approval status | Show pending, rejected, suspended, or active state; display permitted next actions |
| Tenant invitation | Accept scoped invitation; complete email, WhatsApp, identity, and profile requirements |
| Password recovery | Issue expiring single-use reset token; set new password; revoke affected sessions |
| Profile and security | Edit authorized details; reverify changed contacts; change password; review and revoke sessions |

Password recovery and session controls are technical completeness requirements.
They do not replace the original verification sequence.

## 22.3 Administrator screens

| Screen | Required actions and content |
|---|---|
| Dashboard | Account review queue, platform counts, security alerts, and operational health summaries |
| Account review | Inspect completeness; approve, reject, suspend, or restore with reason and audit event |
| Account detail | View identity status, declarations, documents, history, and authorized support data |
| Unit review | View submitted information, reports, document expiry, and suspension status |
| Audit explorer | Filter actor, entity, date, action, impersonation, export, and document access |
| Support session | Require reason; show impersonation banner; record actor and effective identity; end session |
| Configuration | Manage feature flags, categories, amenities, templates, and system defaults |
| Platform reports | Show governed operational and audit exports without silent business-record edits |

Administrator approval means platform account activation only.
Administrator screens must not decide tenant-manager disputes.

## 22.4 Leasing Manager screens

| Screen | Required actions and content |
|---|---|
| Dashboard | Every metric, deadline, action, and alert from section 11.1 |
| Landlords | List, create, edit, archive, documents, and linked units |
| Units | List, create, edit, declaration, owner-rent schedule, amenities, images, documents, and status |
| Unit detail | Spaces, occupants, contracts, income, expenses, owner rent, maintenance, and deposit exposure |
| Rental spaces | Type, capacity, availability, asking rent, deposit default, amenities, photos, and maintenance blocks |
| Tenants | Invite, resend or revoke invitation, view profile, verify completion, and inspect own relationship history |
| Tenant detail | Contracts, occupants, dues, payments, deposits, requests, documents, and export |
| Contracts | Create, inspect, propose effective-dated amendments, record acknowledgement, transfer, and close |
| Annual reviews | Review milestones; record no change, proposed amendment, or deferral |
| Rent obligations | Filter period and status; inspect amount, allocations, original due date, and revised expected date |
| Payments | Record external payment; attach optional evidence; issue receipt; record audited correction |
| Deposits | Record receipt, balance, proposed deductions, dispute, refund liability, and refund evidence |
| Cases | Type-specific forms, messages, evidence, deadlines, decisions, completion, dispute, and event history |
| Transfers | Approve or reject; negotiate; select destination; preview terms; confirm atomic effective transfer |
| Move-out | Review notice preview, waivers, final allocation, deductions, deposit settlement, and closure |
| Expenses | Category, owner rent, utilities, vendor, scope, currency, date, evidence, and recoveries |
| Reports | Income, expenses, occupancy, arrears, profit, deposit liability, maintenance, and interaction PDF |
| Notifications | Read state, relevant record links, preferences, and visible delivery failures where appropriate |
| Settings | Profile, security, defaults, permitted per-tenant limits, language, and timezone |

## 22.5 Tenant screens

| Screen | Required actions and content |
|---|---|
| Dashboard | Every metric, rule, acknowledgement, and action from section 11.2 |
| Occupancy and contract | Current space, history, terms, amendments, documents, and primary/secondary occupant details |
| Rent and payments | Current obligations, prior payments, receipts, evidence, acknowledgement, and error report |
| Deposit | Held amount, proposals, explanations, evidence, accept/dispute actions, refund, and acknowledgement |
| Requests | Submit each enabled type; inspect timeline; reply; attach evidence; accept or dispute completion |
| Late payment | Show eligibility, permitted dates, frequency limit, decision, and original/revised due dates |
| Room change | Show eligibility, five-day deadline, decision, seven-day negotiation, and accepted destination |
| Move-out | Preview notice calculation, missing days, deduction, and refund before explicit acknowledgement |
| Interaction report | Select own relationship; request PDF; download authorized report; inspect generation status |
| Profile and preferences | Own identity, contacts, language, timezone, security, and notification preferences |

# 23. API Contract

## 23.1 Conventions

- Use `/api/v1` for business resources.
- Document actual methods, schemas, authorization, state transitions, and errors through OpenAPI.
- Validate request bodies, query parameters, route parameters, and file metadata.
- Derive manager ownership from authenticated context, not trusted request fields.
- Verify ownership of every referenced parent and child entity.
- Return stable machine-readable error codes with safe messages and request identifiers.
- Use 401 for absent or invalid authentication.
- Use 403 for authenticated but forbidden actions.
- Use 409 for conflicting state or capacity.
- Use 422 or the documented validation status consistently for invalid domain input.
- Never expose secrets, stack traces, document bytes, or another manager's data in errors.
- Document pagination, filter fields, sort fields, limits, and stable order.
- Require idempotency for retry-sensitive financial and allocation writes.
- Reject reuse of an idempotency key with a different request payload.
- Restrict refresh tokens to secure transport and appropriate cookie or client storage policy.
- Protect cookie-authenticated mutations against CSRF.
- Keep production CORS origins explicit.
- Do not weaken production origin controls to repair development access.

## 23.2 Resource coverage

Resource names below define coverage, not a claim about existing endpoints.
Document exact endpoint names in OpenAPI before implementation acceptance.

| Module | Required API operations |
|---|---|
| Authentication | Register manager; login; logout; refresh; password reset; current session; session revocation |
| Verification | Email token verification/resend; WhatsApp OTP request/confirmation; contact reverification |
| Invitations | Create, inspect, accept, resend, expire, and revoke tenant invitation |
| Profiles | Own profile, manager profile, tenant profile, secondary occupant, preferences |
| Administration | Account review queue, moderation decisions, flags, taxonomies, templates, audit, support sessions |
| Landlords | List, detail, create, edit, archive, and linked units |
| Units | CRUD subject to history rules; declarations, amenities, owner-rent schedules, documents, and status |
| Spaces | CRUD subject to history rules; capacity, availability, type restrictions, photos, and maintenance blocks |
| Contracts | Create, detail, amendments, acknowledgement, allocation history, reviews, closure |
| Obligations | Monthly schedule, period detail, balances, allocations, adjustments, original and revised dates |
| Payments | Record, evidence, receipt, acknowledgement, error report, correction/reversal |
| Deposits | Receipt, ledger, proposals, acceptance/dispute, settlement, refunds, acknowledgement |
| Cases | Type-specific submit, messages, evidence, transition, deadline, decision, completion, and dispute |
| Transfers | Eligibility, approval, negotiation, preview, destination, effective execution, and event history |
| Move-out | Notice preview, acknowledgement, decision, waiver, effective exit, and settlement |
| Expenses | Categories, entries, allocations, evidence, recoveries, and audited adjustments |
| Documents | Authorized upload, scan status, version, metadata, expiring private download, and access audit |
| Notifications | List, read/unread state, preferences, internal delivery records, provider callbacks |
| Reports | Role-specific dashboards, filtered financial data, export jobs, PDF status, and downloads |
| Operations | Liveness, readiness, protected metrics, job status, and deployment smoke probes |

## 23.3 Role-specific dashboards

- Provide distinct administrator, Leasing Manager, and tenant dashboard contracts.
- Reject unauthorized role access without redirect loops.
- Verify the admin browser path without a manager-only endpoint.
- Verify list totals and dashboard totals use the same scoped source data.
- Treat unavailable dependencies as explicit errors, not zero business totals.

# 24. Data Integrity and Financial Rules

## 24.1 Persistence requirements

- Use foreign keys, unique constraints, indexes, and transactions for domain invariants.
- Use decimal arithmetic or integer minor units for money.
- Never use binary floating-point calculations for posted financial balances.
- Store currency, original amount, AED equivalent, applied exchange rate, source, and source time.
- Store original due date separately from an approved extension date.
- Store effective-dated contract terms without loss of original values.
- Keep versioned document metadata and private object keys.
- Keep append-only case, payment correction, deposit, and audit events.
- Record both real administrator and effective user during support impersonation.
- Prevent ordinary users from modification or deletion of audit history.
- Preserve historical relationship access after move-out, subject to retention policy.
- Reject archive operations that invalidate active contracts or erase required records.

## 24.2 Occupancy invariants

- Count primary and secondary occupants against physical capacity.
- Verify capacity for every affected date, not only today's occupancy.
- Lock or serialize conflicting reservations and transfers.
- Commit source release, destination allocation, amendment, and ledger effects as one transaction.
- Preserve the original allocation if any transfer operation fails.
- Reject contracts for disabled space types through direct API requests.
- Reject new allocation to inactive or maintenance-blocked spaces.
- Preserve existing history when unit defaults or asking prices change.

## 24.3 Rent examples

| Case | Required result |
|---|---|
| Rent AED 3,100; move-in 17 January | 15 occupied days; first obligation AED 1,500 |
| Rent AED 2,900; move-in 15 February in a leap year | 15 occupied days; first obligation AED 1,500 |
| Rent AED 2,800; move-in 15 February in a non-leap year | 14 occupied days; first obligation AED 1,400 |
| Rent AED 3,000; move-in on first day | Full monthly rent |
| Rent AED 3,000; later full February | AED 3,000, regardless of February length |
| Obligation AED 3,000; payment AED 1,000 | Paid allocation AED 1,000; outstanding AED 2,000 |
| Job retry for the same contract month | One obligation, not a duplicate |
| Default deposit changes after contract creation | Existing contract deposit remains unchanged |
| Approved extension | Original due date remains; revised expected date and approval remain visible |

These examples do not resolve unspecified final-month rent rules.
Verify uncovered notice days separately for each calendar month.
Cap applied deposit deductions at the available balance.
Do not classify a deposit receipt as rent income.

## 24.4 Ledger requirements

- Distinguish obligations, receipts, allocations, credits, reversals, deductions, and refunds.
- Preserve gross recorded amounts and correction links.
- Prevent over-allocation of a payment or deposit.
- Separate disputed proposals from accepted deductions and paid refunds.
- Keep deposit liabilities separate from operational profit.
- Separate cash receipts from unpaid accepted charges in reports.
- Label report basis explicitly.
- Prevent duplicate tenant cost recovery through both expense recovery and deposit deduction.
- Record every financial adjustment with actor, time, reason, and reference.
- Require explicit allocation before one payment settles multiple obligations.

# 25. Jobs and External Services

## 25.1 Background job coverage

| Job | Required behavior |
|---|---|
| Monthly obligations | Generate applicable obligations once per contract and period |
| Due/overdue notifications | Respect expected dates, preferences, and duplicate prevention |
| Room-change expiry | Reject unapproved requests after five calendar days; record the required expiry reason |
| Negotiation deadline | Expose the seven-day deadline; apply only the confirmed expiry policy from section 29 |
| Annual reviews | Create one review per same-space anniversary; preserve transfer history |
| Document expiry | Notify affected users; show expired status without false legal certification |
| Invitations and security tokens | Enforce expiry, resend limits, revocation, and single-use verification |
| Email/WhatsApp delivery | Retry transient failures; preserve provider result and attempt history |
| Reports | Generate authorized PDFs; expose queued, complete, and failed states |
| File scan | Quarantine uploads until accepted; reject unsafe content |
| Retention | Apply the confirmed policy without destruction of protected history |

- Use durable jobs with bounded retries and visible terminal failures.
- Recover overdue work after worker or scheduler downtime.
- Prevent duplicate effects across multiple worker replicas.
- Inject a test clock for deadline tests.
- Store UTC timestamps and apply contract timezone rules to calendar deadlines.
- Audit automatic decisions with rule, timestamp, and affected entity.
- Do not treat Redis cache eviction as permission to lose financial jobs.
- Persist transactional notification intent before external delivery.

## 25.2 Provider integration

- Use real Twilio credentials outside automated test adapters.
- Verify provider webhook signatures and reject replayed or duplicate callbacks.
- Never expose OTP values in application logs.
- Store verification outcomes without permanent OTP plaintext.
- Use configured WhatsApp templates where the provider requires them.
- Record provider delivery failures without reversal of valid business transactions.
- Keep email verification links bound to the intended account and purpose.
- Keep upload buckets private and signed download links short-lived.
- Verify authorization before each signed download.
- Avoid public identity-document URLs and sensitive message attachments.
- Provide deterministic fake providers for tests only.
- Document real-provider staging verification separately from fake-provider tests.

# 26. Configuration, Deployment, and Operations

## 26.1 Configuration

| Group | Required configuration |
|---|---|
| Environment | Runtime mode, app URL, API URL, timezone, demo flag |
| Database | MySQL connection and migration credentials |
| Redis | Authenticated connection and durable worker configuration |
| Authentication | Distinct access/refresh secrets, lifetimes, secure cookie policy |
| Origins | Explicit production CORS allowlist and trusted proxy configuration |
| Twilio | Account SID, auth token, Verify service SID, sender/template configuration |
| Email | Provider or SMTP credentials, sender, callback configuration |
| Storage | S3 endpoint/region, bucket, private credentials, signed-link lifetime |
| Upload safety | Allowed content types, file size limits, scan service |
| Financial defaults | AED, exchange-rate source, due day, notice, permitted request limits |
| Observability | Log level, metrics access, error reporting, request IDs |
| Retention | Approved retention periods, purge policy, protected-record exceptions |

- Include documented environment examples without real secrets.
- Validate required configuration before production startup.
- Keep separate credentials and data for development, tests, staging, and production.
- Store production secrets through the existing secret-management deployment.
- Do not commit real identity documents, tokens, production credentials, or environment files.

## 26.2 Local and Codespaces delivery

- Provide a verified idempotent startup command.
- Create missing environment files without overwrite of existing values.
- Run migrations before application readiness.
- Seed demo users only in explicit non-production demo mode.
- Refuse production startup with demo mode enabled.
- Document initial administrator bootstrap outside demo mode.
- Preserve database and file volumes across ordinary restarts.
- Require explicit confirmation before destructive demo reset.
- Expose the application through the web service, not an internal container hostname.
- Keep MySQL, Redis, and private storage administration ports private.
- Use the correct HTTP backend protocol for forwarded development ports.
- Verify browser login through the exact public Codespaces URL.
- Verify refresh, role routing, API proxy paths, uploads, and PDF downloads through that URL.
- Do not require users to bypass Git hooks as normal deployment procedure.

## 26.3 Production baseline

- Use the existing AWS Terraform and Helm architecture unless the owner approves another target.
- Deploy API and web with immutable commit-SHA image tags.
- Deploy the durable worker and scheduler with controlled concurrency.
- Use private database and Redis subnets.
- Use managed encrypted MySQL with backups and deletion protection.
- Use encrypted Redis with failover.
- Use private versioned S3 with public access blocked.
- Terminate public HTTPS with a valid certificate.
- Configure health probes, resource limits, autoscale, and disruption budgets.
- Use approved GitHub environments and OIDC deployment roles.
- Require explicit production deployment approval.
- Run backward-compatible migrations before rollout.
- Document application rollback separately from database restore.
- Verify backup restore into an isolated environment.
- Verify object access and database references after restore.
- Define recovery objectives before production sign-off.
- Alert on failed jobs, provider failures, readiness failures, and storage errors.
- Redact passwords, tokens, OTPs, identity numbers, and document content from logs.

# 27. Acceptance Tests and Traceability

Use these tests alongside all acceptance criteria in section 19.
Each release must record the implementation path, test path, and evidence for every requirement group.

| ID | Required verification |
|---|---|
| AUTH-01 | Manager completes public registration, email, WhatsApp, identity, declarations, and administrator activation |
| AUTH-02 | Unverified, pending, rejected, and suspended accounts cannot bypass their permitted access |
| AUTH-03 | Tenant public self-registration fails; scoped invitation acceptance succeeds |
| AUTH-04 | Expired, reused, revoked, or mismatched verification tokens fail |
| AUTH-05 | Wrong OTP, resend abuse, login abuse, password reset, refresh replay, and logout enforce security controls |
| ROLE-01 | Admin, manager, and tenant reach distinct functional dashboards |
| ROLE-02 | Admin login through the web proxy never calls a manager-only dashboard |
| ROLE-03 | Every list, detail, export, upload, download, and mutation rejects cross-manager access |
| ROLE-04 | Tenant cannot read another tenant's unrelated evidence, requests, identity files, or contract |
| ADMIN-01 | Account approval, rejection, suspension, restore, and support impersonation create audit events |
| ADMIN-02 | Impersonation records real actor, effective identity, reason, start, end, and restricted actions |
| ADMIN-03 | Admin screens never claim legal certification or binding dispute decisions |
| INV-01 | Manager creates reusable landlord, declared unit, enabled space, amenities, images, and private documents |
| INV-02 | Bed Space and Partition remain disabled in interface and direct API requests |
| INV-03 | Missing required information prevents unit activation |
| OCC-01 | Single tenant, couple, and unrelated occupants use the required account and contract structure |
| OCC-02 | Concurrent allocation cannot exceed capacity or bypass maintenance blocks |
| CON-01 | Open-ended contract stores negotiated rent, due day, notice, deposit, currency, and occupancy dates |
| CON-02 | Amendments preserve past terms and apply on the explicit effective date |
| RENT-01 | First-month proration passes every example in section 24.3 |
| RENT-02 | Later months retain full rent across 28-, 29-, 30-, and 31-day months |
| RENT-03 | Multiple scheduler runs produce one obligation per contract period |
| RENT-04 | Same-space annual reviews recur without duplicate reviews or automatic price changes |
| PAY-01 | External payment without evidence succeeds and creates a durable tenant receipt |
| PAY-02 | Partial payment, multiple allocations, correction, reversal, and tenant error report preserve balances and audit |
| PAY-03 | Repeated idempotent payment request cannot duplicate money |
| LATE-01 | Request outside the configured final-ten-day window fails |
| LATE-02 | Extension beyond five calendar days or stricter tenant maximum fails |
| LATE-03 | Second approved request inside its six-month window fails |
| LATE-04 | Approval preserves original due date, revised expected date, decision, and messages |
| DEP-01 | Deposit defaults copy once; receipt, partial receipt, refund, and liability reconcile |
| DEP-02 | Notice preview handles cross-month daily rates and caps deductions at available deposit |
| DEP-03 | Tenant acknowledgement precedes move-out submission |
| DEP-04 | Deduction acceptance, dispute, revisions, deadlock, refund, and acknowledgement preserve history |
| DEP-05 | Disputed proposal cannot silently become an accepted deduction |
| CASE-01 | Each case type supports required fields, evidence, messages, response, resolution, and tenant acknowledgement |
| CASE-02 | Complaint privacy, reopening, cost responsibility, and evidence permissions remain enforced |
| CASE-03 | No tenant response leaves completion unacknowledged, not automatically accepted |
| CASE-04 | Accepted damage cost cannot trigger duplicate direct and deposit charges |
| TRANS-01 | Unapproved room-change request expires after five calendar days with the specified reason |
| TRANS-02 | Approval exposes the seven-day negotiation period and independent six-month frequency limit |
| TRANS-03 | Transfer atomically updates allocation, amendment, effective dates, and explicit financial treatment |
| TRANS-04 | Failed or concurrent destination allocation leaves the original space and balances intact |
| EXP-01 | Owner rent, utilities, maintenance, shared costs, and recoveries reconcile by scope |
| FIN-01 | Income, profit, occupancy, arrears, and deposit liability match authorized ledger data |
| FIN-02 | Currency conversion preserves original amount and saved rate; later rate changes do not rewrite history |
| MSG-01 | Preferences control non-security email and WhatsApp; critical security notices retain a required channel |
| MSG-02 | Delivery retry, provider rejection, duplicate callback, and bad signature retain correct business state |
| DOC-01 | Unsafe upload, oversized file, unauthorized download, expired URL, and unscanned file fail safely |
| PDF-01 | Both parties export the same factual event history with masked identities, authorship, timestamp, and integrity metadata |
| PDF-02 | Failed report job exposes a recoverable error; unauthorized report download fails |
| UI-01 | Every initial-release screen has functional actions and load, empty, error, success, and validation states |
| UI-02 | Mobile and desktop layouts preserve forms, navigation, tables, dialogs, and readable controls |
| OPS-01 | Clean environment starts, migrates, seeds only permitted demo data, and passes browser smoke tests |
| OPS-02 | Restart preserves data; scheduler recovery catches missed deadlines without duplicate effects |
| OPS-03 | Production refuses demo mode and placeholder secrets |
| OPS-04 | Upgrade, rollback compatibility, database restore, and private-file restore pass documented procedures |

## 27.1 Browser release journey

1. Register and verify a Leasing Manager.
2. Activate that manager from the administrator interface.
3. Create a landlord, declared unit, and enabled rental space.
4. Invite a tenant through the real web interface.
5. Complete tenant email, WhatsApp, profile, and private document steps.
6. Create the contract and verify first-month proration.
7. Record a partial payment and inspect the tenant receipt.
8. Record the balance and verify the obligation status.
9. Submit a maintenance case with evidence.
10. Respond as manager and acknowledge resolution as tenant.
11. Verify late-payment eligibility and an approved revised date.
12. Complete a room transfer without capacity or ledger inconsistencies.
13. Preview move-out notice and submit explicit acknowledgement.
14. Propose, accept or dispute, and settle deposit deductions.
15. Record the external refund and tenant acknowledgement.
16. Export matching factual interaction reports from both roles.
17. Verify reports, audit events, notifications, and final balances.

Use fake email/Twilio adapters in CI.
Verify real provider delivery separately in staging.
Neither route alone proves both integration and repeatable regression coverage.

# 28. Release Gates

- Pass lint, type checks, production builds, and unit tests.
- Fail CI if required suites contain no tests.
- Pass database integration and authorization tests against MySQL.
- Pass financial arithmetic and deadline boundary tests with a controlled clock.
- Pass browser tests against the composed web proxy.
- Pass all three role-login and dashboard paths.
- Pass regression tests for Codespaces origin and port behavior.
- Pass upload authorization, scan, and private-download tests.
- Pass report generation and PDF-content tests.
- Pass retry, concurrency, idempotency, and scheduler-recovery tests.
- Verify real email and Twilio delivery in staging.
- Verify accessible mobile and desktop screens.
- Verify deployment health, migrations, secret injection, logs, and alerts.
- Verify database and file backup restore.
- Resolve section 29 decisions before affected production workflows receive approval.
- Record known defects and blocked requirements explicitly.
- Supply a requirement-to-code-to-test evidence matrix.
- Describe infrastructure status separately from application completion.
- Do not equate passed health probes with a working application.
- Do not claim completion while initial-release screens or workflows remain placeholders.

# 29. Open Decisions and Proposed Clarifications

The source does not settle the decisions below.
These are confirmation items, not permission to invent financial or contractual rules.
Preserve unaffected implementation work while these decisions remain open.

| ID | Decision that requires confirmation |
|---|---|
| DEC-01 | Exact currency-round policy and the stage that rounds proration, notice deductions, conversions, and totals |
| DEC-02 | Due-day behavior for day 29, 30, or 31 in shorter months |
| DEC-03 | Exact inclusive date boundaries for notice submission, effective exit, and earliest penalty-free move-out |
| DEC-04 | Final-month rent after confirmed move-out and its interaction with notice deductions |
| DEC-05 | Transfer-month proration, rent differences, deposit movement/top-up/refund, and transfer cancellation |
| DEC-06 | Outcome after seven negotiation days without an accepted destination |
| DEC-07 | Rolling-six-month boundary arithmetic and whether eligibility keys use approval date or another recorded date |
| DEC-08 | Whether withdrawn, cancelled, or reversed approvals consume late-payment and room-change frequency allowances |
| DEC-09 | Whether due-day requests can be submitted on the due date or after it |
| DEC-10 | Payment overpayment, advance rent, credit balances, and allocation order |
| DEC-11 | Report basis: cash, accrual, or separate explicitly labeled views |
| DEC-12 | Shared-cost allocation method and effective-date changes |
| DEC-13 | Exchange-rate provider, refresh cadence, failure fallback, and manual rate authority |
| DEC-14 | Required unit evidence categories and activation completeness policy |
| DEC-15 | Expired identity/licence/document effect on access, existing contracts, and new contracts |
| DEC-16 | Account rejection resubmission and suspension effect on tenant historical access |
| DEC-17 | Document retention, deletion/anonymization, dispute holds, backup retention, and jurisdiction policy |
| DEC-18 | Upload size/type limits, OTP lifetime/attempt limits, invitation expiry, and reminder cadence |
| DEC-19 | Production hostnames, email sender, Twilio templates, deployment region, and recovery objectives |
| DEC-20 | Measurable performance targets, portfolio scale, concurrent users, and report size limits |
| DEC-21 | Whether no-change or deferred annual review repeats reminders before the next anniversary |
| DEC-22 | Administrator MFA method and permitted impersonation actions |
| DEC-23 | Tenant acknowledgement requirements before a contract or rent amendment takes effect |
| DEC-24 | Refund target date, overdue refund alerts, and final closure with unresolved disputes |
| DEC-25 | Capacity reservations during invitation/negotiation and reservation expiry |
| DEC-26 | Availability of closed-relationship reports and documents after account suspension or closure |

## 29.1 Proposed technical defaults

- Use last calendar day when a configured due day does not exist, only after DEC-02 approval.
- Use decimal calculations and explicit minor-unit round policy after DEC-01 approval.
- Use half-open allocation intervals to avoid double occupancy on a transfer boundary, only after date-policy approval.
- Use role-specific routes without inferred fallback to manager permissions.
- Use mandatory administrator MFA before privileged access.
- Use least privilege for support impersonation.
- Use additive migrations and versioned private documents.
- Keep non-production demo data separate from real users.
- Never silently apply proposed financial defaults before owner confirmation.

## 29.2 Change control

- Record approved decisions with date, decision owner, and affected requirement identifiers.
- Update this file, API schemas, interface copy, and tests together.
- Preserve historical contract terms when product defaults change.
- Keep `SPECIFICATION.md` as the original product source.
- Resolve future conflicts explicitly rather than overwrite original business intent.
