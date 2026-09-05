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

| **Recommended stack:** REST/JSON API with OpenAPI documentation; Laravel or Node.js back end; PostgreSQL or MySQL; React responsive web front end; Bootstrap 5 plus SCSS or CSS Modules. Tailwind must not be used. |
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
