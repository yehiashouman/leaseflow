# Inventory, Review, and Draft Controls

Date: 8 November 2026, Asia/Dubai.
This batch covers operational controls, not production approval of the complete application.

## Units

- Managers search current, archived, or all owned units by name, area, or building.
- Unit forms capture twelve standard amenity flags and up to twenty additional amenity labels.
- Owner monthly rent, AED/USD currency, and a literal owner payment schedule persist separately from tenant terms.
- Payment schedule text does not create obligations, calculate due dates, or convert currencies.
- Unit details show the schedule and amenities without an additional financial calculation.
- Explicit archive preserves rooms, closed contracts, and audit history.
- Draft, active, transfer-pending, or move-out-pending contracts prevent archive.
- Archive disables the unit, new rooms, room edits, and contract admission.
- Restore returns the unit to draft, never automatic activation.
- Unit archive and contract admission share the unit database lock.
- Archive/restore retries do not duplicate audit events.
- Changes to unit defaults never rewrite existing tenant rent or deposits.
- Bed Space and Partition remain disabled; a disclosure supports keyboard and touch access to the Future feature explanation.

Migration: api/prisma/migrations/20261108030000_unit_lifecycle/migration.sql.
Apply the migration before the new API.
The migration adds nullable archive state, owner schedule text, and an ownership/archive index.
Existing units and records remain intact.

## Administrator Review

- Account review supports status/name/email filters and twenty-record pages.
- Account details show email/phone confirmation, declaration timestamp, masked identifiers, and available profile metadata.
- The account history exposes safe moderation event summaries.
- Audit history supports resource/action filters and twenty-record pages.
- Audit responses exclude arbitrary old/new bodies, complaint text, document contents, and credential fields.
- Ordinary managers and tenants cannot access the administrator endpoints or routes.
- Identity numbers remain masked in routine review pages.
- Review pages explicitly distinguish unavailable document review from recorded confirmation signals.
- The previous unsafe account-status endpoint now returns 409 until approved MFA and identity/document policies exist.
- This batch does not implement moderation, legal certification, MFA, document inspection, or approved impersonation.
- Administrator read access still requires the separate MFA release gate before production approval.

## Request Drafts

- Tenants can save a complete request form as a private draft.
- Managers cannot list or inspect private drafts.
- Drafts have no message composer and do not increase manager open-case counts.
- A tenant explicitly submits a draft through a version-checked confirmation.
- Submission rechecks the contract status and preserves draft author/timestamp history.
- Closed contracts block draft submission without a shared event.
- Identical submission retries do not duplicate events.
- Draft content editing and draft deletion remain incomplete.
- Generic late-payment, transfer, and move-out workflows remain blocked.

## Authentication Boundaries

Public registration remains manager-only.
Unknown registration/login fields now return 422, including attempted role injection.
Public tenant registration has no route.
Session role claims must match the persisted user role.
No new endpoint changes account roles or bypasses session status checks.

## Verification

Local baseline: 63 API tests, 64 web tests, lint, schema validation, and production builds pass.
Hosted MySQL and browser results remain pending until recorded in EVIDENCE.md.
New MySQL tests cover archive races, defaults, custom amenities, private drafts, administrator privacy, and role injection.
Real browsers cover administrator login/review, masked identities, unit forms/archive/restore, and explicit draft submission.
Synthetic preview tests cover the same interfaces without backend requests or real records.

The complete invitation, document, financial, notification, and release workflows remain incomplete.
