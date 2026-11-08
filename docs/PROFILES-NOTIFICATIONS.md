# Tenant Profiles and Case Notices

Date: 8 November 2026, Asia/Dubai.

## Tenant Profile

Tenants can edit their own name, birth date, nationality, gender, language tag, timezone, and optional compatibility preferences.
Gender, nationality, language, culture, lifestyle, sleep, smoking, noise, and shared-language preferences remain optional and non-binding.
Profile edits do not modify contracts, capacity, payments, deposits, or historical case-author snapshots.
Version checks and account locks reject stale or concurrent edits.
Audit records contain the profile version, not phone numbers or compatibility details.

A new phone entry remains an unverified candidate.
It cannot replace the verified account phone or alter verification timestamps.
Email, account role/status, manager ownership, and verification fields remain read-only.
Email, WhatsApp, and Both preferences apply to future non-security delivery.
The account email remains the security address; this batch does not implement security-email delivery.
The interface remains English; language/timezone storage does not imply complete localization.
Identity documents, WhatsApp OTP, verified phone changes, and complete onboarding remain incomplete.

## Tenant Directory

Managers can search and page through their own tenants.
Detail pages show authorized contact/profile summaries and consistent owned contract references.
Directory responses exclude password hashes, full identity numbers, private preference details, and pending phone candidates.
Tenants, administrators, and foreign managers cannot access another manager's tenant detail.
Invitation, tenant creation, full financial history, and identity-document review remain incomplete.

## In-App Case Notices

Each shared case event creates one notice for each participant in the case transaction.
Private drafts create no notices.
Event/recipient uniqueness and replay-safe case mutations prevent duplicate notices.
Notice reads support pages, unread/read filters, counts, single-read, and read-all operations.
Repeated reads preserve the original read timestamp.
Read-all affects only the authenticated recipient's visible notices.
Every query rechecks the current case relationship before it returns a title or link.
Notices store no complaint body, message text, identity document, or external provider credential.
Case links lead to the separately authorized request detail endpoint.
Read mutations resolve visible IDs before updates, rather than lock case rows through an update join.

Recipient IDs are immutable historical identifiers, like existing case actor IDs, not cascading User relations.
Each notice has a foreign key to its immutable request event.
This avoids cross-participant User foreign-key locks inside concurrent case transactions.
Retention, erasure, and suspended/closed relationship policies remain explicit release gates.
No provider call occurs inside case transactions.
Email/WhatsApp adapters, provider callbacks, retries, templates, and real delivery remain incomplete.
This implementation delivers only in-app notices; it is not a complete external notification outbox.

## Deployment and Verification

Migration: api/prisma/migrations/20261108040000_profiles_notifications/migration.sql.
Apply the migration before the new API.
It adds user timezone/profile version, an unverified tenant phone candidate, and the Notification table.
Existing case events remain unchanged; no fabricated historical notices are backfilled.

Local verification passes 63 API tests, 68 web tests, lint, and builds.
New MySQL assertions cover privacy, replay, stale edits, concurrent edits, unread state, and preserved authorship.
Real-browser journeys edit profiles, inspect manager tenant details, and clear notice unread state.
Hosted verification passes 59 MySQL cases and twenty-two browser cases across all suites.
Evidence: [API, database, real browsers, and container builds](https://github.com/yehiashouman/leaseflow/actions/runs/42468327149).
Preview: [synthetic browsers and deployment](https://github.com/yehiashouman/leaseflow/actions/runs/42468327257).
We verified tenant profile screenshots on desktop and mobile without overlap or page overflow.
The public preview uses separate synthetic browser-local profile and notice state.
