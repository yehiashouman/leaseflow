# Account and Private Document Batch

Date: 9 November 2026, Asia/Dubai.

Target: 100 existing checklist items.
This target does not mean 100 completed items.
The baseline remains 102 of 764 until acceptance evidence confirms additional closures.

## Delivered Code

- We added private file quarantine, antivirus scans, sanitized copies, immutable versions, and session-bound downloads.
- We added manager registration, email verification, WhatsApp checks, scoped setup sessions, and password recovery.
- We added tenant invitation creation, inspection, resend, revocation, expiry, and acceptance.
- We added encrypted email intent, bounded retries, immutable declarations, and encrypted new Emirates ID values.
- We added private document, account setup, recovery, and invitation interfaces.

## Explicit Limits

- Production account and private file activation remains gated.
- All 26 owner decisions remain pending.
- Real SMTP and Twilio delivery requires separate staging evidence.
- Moderation decisions, MFA, contact changes, retention, anonymization, and complete financial workflows remain incomplete.
- File expiry uses 00:00 UTC as a development default; production policy remains unapproved.
- Development limits are 5 MB, JPEG/PNG/PDF, 60-second grants, and seven-day invitations.
- SMTP completion means server acceptance; it does not prove inbox delivery.
- Original quarantined objects remain private; retention and orphan removal require an approved policy.
- Key rotation requires coordinated re-encryption of email intent and sealed identity values.

## Requirement Matrix

| Item         | Status               | Implementation                                                                                | Acceptance                                                                                             |
| ------------ | -------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| BASE-003     | PENDING_VERIFICATION | `api/src/routes/accounts.ts`, `web/src/pages/Account.tsx`, `api/src/account-policy.ts`        | `api/integration/accounts.test.ts`, `api/test/account-policy.test.ts`, `web/e2e/accounts.live.spec.ts` |
| BASE-005     | PENDING_VERIFICATION | `api/src/routes/invitations.ts`, `web/src/pages/Invitations.tsx`, `web/src/pages/Account.tsx` | `api/integration/accounts.test.ts`, `web/e2e/accounts.live.spec.ts`                                    |
| BASE-016     | PENDING_VERIFICATION | `api/src/routes/documents.ts`, `api/src/file-worker.ts`, `web/src/components/documents.tsx`   | `api/integration/documents.test.ts`, `api/acceptance/files.test.ts`, `web/e2e/documents.files.spec.ts` |
| BASE-018     | PARTIAL              | `api/src/routes/accounts.ts`, `web/src/pages/Account.tsx`, `api/src/account-policy.ts`        | `api/integration/accounts.test.ts`, `api/test/account-policy.test.ts`, `web/e2e/accounts.live.spec.ts` |
| DATA-007     | PENDING_VERIFICATION | `api/src/routes/accounts.ts`, `web/src/pages/Account.tsx`, `api/src/account-policy.ts`        | `api/integration/accounts.test.ts`, `api/test/account-policy.test.ts`, `web/e2e/accounts.live.spec.ts` |
| DATA-016     | PENDING_VERIFICATION | `api/src/routes/documents.ts`, `api/src/file-worker.ts`, `web/src/components/documents.tsx`   | `api/integration/documents.test.ts`, `api/acceptance/files.test.ts`, `web/e2e/documents.files.spec.ts` |
| AUTH-010     | PENDING_VERIFICATION | `api/src/routes/accounts.ts`, `web/src/pages/Account.tsx`, `api/src/account-policy.ts`        | `api/integration/accounts.test.ts`, `api/test/account-policy.test.ts`, `web/e2e/accounts.live.spec.ts` |
| AUTH-011     | PENDING_VERIFICATION | `api/src/routes/accounts.ts`, `web/src/pages/Account.tsx`, `api/src/account-policy.ts`        | `api/integration/accounts.test.ts`, `api/test/account-policy.test.ts`, `web/e2e/accounts.live.spec.ts` |
| AUTH-013     | PARTIAL              | `api/src/routes/accounts.ts`, `web/src/pages/Account.tsx`, `api/src/account-policy.ts`        | `api/integration/accounts.test.ts`, `api/test/account-policy.test.ts`, `web/e2e/accounts.live.spec.ts` |
| AUTH-016     | BLOCKED              | `api/src/routes/accounts.ts`, `web/src/pages/Account.tsx`, `api/src/account-policy.ts`        | `api/integration/accounts.test.ts`, `api/test/account-policy.test.ts`, `web/e2e/accounts.live.spec.ts` |
| AUTH-017     | PENDING_VERIFICATION | `api/src/routes/accounts.ts`, `web/src/pages/Account.tsx`, `api/src/account-policy.ts`        | `api/integration/accounts.test.ts`, `api/test/account-policy.test.ts`, `web/e2e/accounts.live.spec.ts` |
| AUTH-018     | PENDING_VERIFICATION | `api/src/routes/accounts.ts`, `web/src/pages/Account.tsx`, `api/src/account-policy.ts`        | `api/integration/accounts.test.ts`, `api/test/account-policy.test.ts`, `web/e2e/accounts.live.spec.ts` |
| MGR-001      | PENDING_VERIFICATION | `api/src/routes/accounts.ts`, `web/src/pages/Account.tsx`, `api/src/account-policy.ts`        | `api/integration/accounts.test.ts`, `api/test/account-policy.test.ts`, `web/e2e/accounts.live.spec.ts` |
| MGR-002      | PENDING_VERIFICATION | `api/src/routes/accounts.ts`, `web/src/pages/Account.tsx`, `api/src/account-policy.ts`        | `api/integration/accounts.test.ts`, `api/test/account-policy.test.ts`, `web/e2e/accounts.live.spec.ts` |
| MGR-003      | PENDING_VERIFICATION | `api/src/routes/accounts.ts`, `web/src/pages/Account.tsx`, `api/src/account-policy.ts`        | `api/integration/accounts.test.ts`, `api/test/account-policy.test.ts`, `web/e2e/accounts.live.spec.ts` |
| MGR-004      | PENDING_VERIFICATION | `api/src/routes/accounts.ts`, `web/src/pages/Account.tsx`, `api/src/account-policy.ts`        | `api/integration/accounts.test.ts`, `api/test/account-policy.test.ts`, `web/e2e/accounts.live.spec.ts` |
| MGR-005      | PENDING_VERIFICATION | `api/src/routes/accounts.ts`, `web/src/pages/Account.tsx`, `api/src/account-policy.ts`        | `api/integration/accounts.test.ts`, `api/test/account-policy.test.ts`, `web/e2e/accounts.live.spec.ts` |
| MGR-006      | PENDING_VERIFICATION | `api/src/routes/accounts.ts`, `web/src/pages/Account.tsx`, `api/src/account-policy.ts`        | `api/integration/accounts.test.ts`, `api/test/account-policy.test.ts`, `web/e2e/accounts.live.spec.ts` |
| MGR-007      | PENDING_VERIFICATION | `api/src/routes/accounts.ts`, `web/src/pages/Account.tsx`, `api/src/account-policy.ts`        | `api/integration/accounts.test.ts`, `api/test/account-policy.test.ts`, `web/e2e/accounts.live.spec.ts` |
| MGR-008      | PARTIAL              | `api/src/routes/accounts.ts`, `web/src/pages/Account.tsx`, `api/src/account-policy.ts`        | `api/integration/accounts.test.ts`, `api/test/account-policy.test.ts`, `web/e2e/accounts.live.spec.ts` |
| MGR-009      | BLOCKED              | `api/src/routes/accounts.ts`, `web/src/pages/Account.tsx`, `api/src/account-policy.ts`        | `api/integration/accounts.test.ts`, `api/test/account-policy.test.ts`, `web/e2e/accounts.live.spec.ts` |
| MGR-010      | PENDING_VERIFICATION | `api/src/routes/accounts.ts`, `web/src/pages/Account.tsx`, `api/src/account-policy.ts`        | `api/integration/accounts.test.ts`, `api/test/account-policy.test.ts`, `web/e2e/accounts.live.spec.ts` |
| MGR-011      | PENDING_VERIFICATION | `api/src/routes/accounts.ts`, `web/src/pages/Account.tsx`, `api/src/account-policy.ts`        | `api/integration/accounts.test.ts`, `api/test/account-policy.test.ts`, `web/e2e/accounts.live.spec.ts` |
| MGR-012      | PENDING_VERIFICATION | `api/src/routes/accounts.ts`, `web/src/pages/Account.tsx`, `api/src/account-policy.ts`        | `api/integration/accounts.test.ts`, `api/test/account-policy.test.ts`, `web/e2e/accounts.live.spec.ts` |
| MGR-013      | PENDING_VERIFICATION | `api/src/routes/accounts.ts`, `web/src/pages/Account.tsx`, `api/src/account-policy.ts`        | `api/integration/accounts.test.ts`, `api/test/account-policy.test.ts`, `web/e2e/accounts.live.spec.ts` |
| MGR-014      | BLOCKED              | `api/src/routes/accounts.ts`, `web/src/pages/Account.tsx`, `api/src/account-policy.ts`        | `api/integration/accounts.test.ts`, `api/test/account-policy.test.ts`, `web/e2e/accounts.live.spec.ts` |
| MGR-015      | PENDING_VERIFICATION | `api/src/routes/accounts.ts`, `web/src/pages/Account.tsx`, `api/src/account-policy.ts`        | `api/integration/accounts.test.ts`, `api/test/account-policy.test.ts`, `web/e2e/accounts.live.spec.ts` |
| MGR-016      | BLOCKED              | `api/src/routes/accounts.ts`, `web/src/pages/Account.tsx`, `api/src/account-policy.ts`        | `api/integration/accounts.test.ts`, `api/test/account-policy.test.ts`, `web/e2e/accounts.live.spec.ts` |
| MGR-017      | BLOCKED              | `api/src/routes/accounts.ts`, `web/src/pages/Account.tsx`, `api/src/account-policy.ts`        | `api/integration/accounts.test.ts`, `api/test/account-policy.test.ts`, `web/e2e/accounts.live.spec.ts` |
| FILE-001     | PARTIAL              | `api/src/routes/documents.ts`, `api/src/file-worker.ts`, `web/src/components/documents.tsx`   | `api/integration/documents.test.ts`, `api/acceptance/files.test.ts`, `web/e2e/documents.files.spec.ts` |
| FILE-002     | BLOCKED              | `api/src/routes/documents.ts`, `api/src/file-worker.ts`, `web/src/components/documents.tsx`   | `api/integration/documents.test.ts`, `api/acceptance/files.test.ts`, `web/e2e/documents.files.spec.ts` |
| FILE-003     | PENDING_VERIFICATION | `api/src/routes/documents.ts`, `api/src/file-worker.ts`, `web/src/components/documents.tsx`   | `api/integration/documents.test.ts`, `api/acceptance/files.test.ts`, `web/e2e/documents.files.spec.ts` |
| FILE-004     | PENDING_VERIFICATION | `api/src/routes/documents.ts`, `api/src/file-worker.ts`, `web/src/components/documents.tsx`   | `api/integration/documents.test.ts`, `api/acceptance/files.test.ts`, `web/e2e/documents.files.spec.ts` |
| FILE-005     | PENDING_VERIFICATION | `api/src/routes/documents.ts`, `api/src/file-worker.ts`, `web/src/components/documents.tsx`   | `api/integration/documents.test.ts`, `api/acceptance/files.test.ts`, `web/e2e/documents.files.spec.ts` |
| FILE-006     | PENDING_VERIFICATION | `api/src/routes/documents.ts`, `api/src/file-worker.ts`, `web/src/components/documents.tsx`   | `api/integration/documents.test.ts`, `api/acceptance/files.test.ts`, `web/e2e/documents.files.spec.ts` |
| FILE-007     | PENDING_VERIFICATION | `api/src/routes/documents.ts`, `api/src/file-worker.ts`, `web/src/components/documents.tsx`   | `api/integration/documents.test.ts`, `api/acceptance/files.test.ts`, `web/e2e/documents.files.spec.ts` |
| FILE-008     | PENDING_VERIFICATION | `api/src/routes/documents.ts`, `api/src/file-worker.ts`, `web/src/components/documents.tsx`   | `api/integration/documents.test.ts`, `api/acceptance/files.test.ts`, `web/e2e/documents.files.spec.ts` |
| FILE-009     | PENDING_VERIFICATION | `api/src/routes/documents.ts`, `api/src/file-worker.ts`, `web/src/components/documents.tsx`   | `api/integration/documents.test.ts`, `api/acceptance/files.test.ts`, `web/e2e/documents.files.spec.ts` |
| FILE-010     | PENDING_VERIFICATION | `api/src/routes/documents.ts`, `api/src/file-worker.ts`, `web/src/components/documents.tsx`   | `api/integration/documents.test.ts`, `api/acceptance/files.test.ts`, `web/e2e/documents.files.spec.ts` |
| FILE-011     | PENDING_VERIFICATION | `api/src/routes/documents.ts`, `api/src/file-worker.ts`, `web/src/components/documents.tsx`   | `api/integration/documents.test.ts`, `api/acceptance/files.test.ts`, `web/e2e/documents.files.spec.ts` |
| FILE-012     | PENDING_VERIFICATION | `api/src/routes/documents.ts`, `api/src/file-worker.ts`, `web/src/components/documents.tsx`   | `api/integration/documents.test.ts`, `api/acceptance/files.test.ts`, `web/e2e/documents.files.spec.ts` |
| FILE-013     | PENDING_VERIFICATION | `api/src/routes/documents.ts`, `api/src/file-worker.ts`, `web/src/components/documents.tsx`   | `api/integration/documents.test.ts`, `api/acceptance/files.test.ts`, `web/e2e/documents.files.spec.ts` |
| FILE-014     | PENDING_VERIFICATION | `api/src/routes/documents.ts`, `api/src/file-worker.ts`, `web/src/components/documents.tsx`   | `api/integration/documents.test.ts`, `api/acceptance/files.test.ts`, `web/e2e/documents.files.spec.ts` |
| FILE-015     | PENDING_VERIFICATION | `api/src/routes/documents.ts`, `api/src/file-worker.ts`, `web/src/components/documents.tsx`   | `api/integration/documents.test.ts`, `api/acceptance/files.test.ts`, `web/e2e/documents.files.spec.ts` |
| FILE-016     | BLOCKED              | `api/src/routes/documents.ts`, `api/src/file-worker.ts`, `web/src/components/documents.tsx`   | `api/integration/documents.test.ts`, `api/acceptance/files.test.ts`, `web/e2e/documents.files.spec.ts` |
| FILE-017     | BLOCKED              | `api/src/routes/documents.ts`, `api/src/file-worker.ts`, `web/src/components/documents.tsx`   | `api/integration/documents.test.ts`, `api/acceptance/files.test.ts`, `web/e2e/documents.files.spec.ts` |
| FILE-018     | BLOCKED              | `api/src/routes/documents.ts`, `api/src/file-worker.ts`, `web/src/components/documents.tsx`   | `api/integration/documents.test.ts`, `api/acceptance/files.test.ts`, `web/e2e/documents.files.spec.ts` |
| FILE-019     | PENDING_VERIFICATION | `api/src/routes/documents.ts`, `api/src/file-worker.ts`, `web/src/components/documents.tsx`   | `api/integration/documents.test.ts`, `api/acceptance/files.test.ts`, `web/e2e/documents.files.spec.ts` |
| TEN-001      | PENDING_VERIFICATION | `api/src/routes/invitations.ts`, `web/src/pages/Invitations.tsx`, `web/src/pages/Account.tsx` | `api/integration/accounts.test.ts`, `web/e2e/accounts.live.spec.ts`                                    |
| TEN-002      | PENDING_VERIFICATION | `api/src/routes/invitations.ts`, `web/src/pages/Invitations.tsx`, `web/src/pages/Account.tsx` | `api/integration/accounts.test.ts`, `web/e2e/accounts.live.spec.ts`                                    |
| TEN-003      | PENDING_VERIFICATION | `api/src/routes/invitations.ts`, `web/src/pages/Invitations.tsx`, `web/src/pages/Account.tsx` | `api/integration/accounts.test.ts`, `web/e2e/accounts.live.spec.ts`                                    |
| TEN-005      | PENDING_VERIFICATION | `api/src/routes/invitations.ts`, `web/src/pages/Invitations.tsx`, `web/src/pages/Account.tsx` | `api/integration/accounts.test.ts`, `web/e2e/accounts.live.spec.ts`                                    |
| TEN-007      | PARTIAL              | `api/src/routes/invitations.ts`, `web/src/pages/Invitations.tsx`, `web/src/pages/Account.tsx` | `api/integration/accounts.test.ts`, `web/e2e/accounts.live.spec.ts`                                    |
| TEN-008      | PENDING_VERIFICATION | `api/src/routes/invitations.ts`, `web/src/pages/Invitations.tsx`, `web/src/pages/Account.tsx` | `api/integration/accounts.test.ts`, `web/e2e/accounts.live.spec.ts`                                    |
| TEN-009      | PENDING_VERIFICATION | `api/src/routes/invitations.ts`, `web/src/pages/Invitations.tsx`, `web/src/pages/Account.tsx` | `api/integration/accounts.test.ts`, `web/e2e/accounts.live.spec.ts`                                    |
| TEN-011      | PENDING_VERIFICATION | `api/src/routes/invitations.ts`, `web/src/pages/Invitations.tsx`, `web/src/pages/Account.tsx` | `api/integration/accounts.test.ts`, `web/e2e/accounts.live.spec.ts`                                    |
| TEN-019      | PARTIAL              | `api/src/routes/invitations.ts`, `web/src/pages/Invitations.tsx`, `web/src/pages/Account.tsx` | `api/integration/accounts.test.ts`, `web/e2e/accounts.live.spec.ts`                                    |
| UNIT-003     | PENDING_VERIFICATION | `api/src/routes/documents.ts`, `api/src/file-worker.ts`, `web/src/components/documents.tsx`   | `api/integration/documents.test.ts`, `api/acceptance/files.test.ts`, `web/e2e/documents.files.spec.ts` |
| UNIT-010     | PENDING_VERIFICATION | `api/src/routes/documents.ts`, `api/src/file-worker.ts`, `web/src/components/documents.tsx`   | `api/integration/documents.test.ts`, `api/acceptance/files.test.ts`, `web/e2e/documents.files.spec.ts` |
| UNIT-011     | PENDING_VERIFICATION | `api/src/routes/documents.ts`, `api/src/file-worker.ts`, `web/src/components/documents.tsx`   | `api/integration/documents.test.ts`, `api/acceptance/files.test.ts`, `web/e2e/documents.files.spec.ts` |
| UNIT-012     | BLOCKED              | `api/src/routes/documents.ts`, `api/src/file-worker.ts`, `web/src/components/documents.tsx`   | `api/integration/documents.test.ts`, `api/acceptance/files.test.ts`, `web/e2e/documents.files.spec.ts` |
| UNIT-013     | BLOCKED              | `api/src/routes/documents.ts`, `api/src/file-worker.ts`, `web/src/components/documents.tsx`   | `api/integration/documents.test.ts`, `api/acceptance/files.test.ts`, `web/e2e/documents.files.spec.ts` |
| UNIT-014     | BLOCKED              | `api/src/routes/documents.ts`, `api/src/file-worker.ts`, `web/src/components/documents.tsx`   | `api/integration/documents.test.ts`, `api/acceptance/files.test.ts`, `web/e2e/documents.files.spec.ts` |
| SPACE-008    | PARTIAL              | `api/src/routes/documents.ts`, `api/src/file-worker.ts`, `web/src/components/documents.tsx`   | `api/integration/documents.test.ts`, `api/acceptance/files.test.ts`, `web/e2e/documents.files.spec.ts` |
| CASE-002     | PARTIAL              | `api/src/routes/documents.ts`, `api/src/file-worker.ts`, `web/src/components/documents.tsx`   | `api/integration/documents.test.ts`, `api/acceptance/files.test.ts`, `web/e2e/documents.files.spec.ts` |
| CASE-008     | PARTIAL              | `api/src/routes/documents.ts`, `api/src/file-worker.ts`, `web/src/components/documents.tsx`   | `api/integration/documents.test.ts`, `api/acceptance/files.test.ts`, `web/e2e/documents.files.spec.ts` |
| CASE-010     | PARTIAL              | `api/src/routes/documents.ts`, `api/src/file-worker.ts`, `web/src/components/documents.tsx`   | `api/integration/documents.test.ts`, `api/acceptance/files.test.ts`, `web/e2e/documents.files.spec.ts` |
| CASE-014     | PARTIAL              | `api/src/routes/documents.ts`, `api/src/file-worker.ts`, `web/src/components/documents.tsx`   | `api/integration/documents.test.ts`, `api/acceptance/files.test.ts`, `web/e2e/documents.files.spec.ts` |
| CASE-016     | PENDING_VERIFICATION | `api/src/routes/documents.ts`, `api/src/file-worker.ts`, `web/src/components/documents.tsx`   | `api/integration/documents.test.ts`, `api/acceptance/files.test.ts`, `web/e2e/documents.files.spec.ts` |
| MAINT-001    | PENDING_VERIFICATION | `api/src/routes/documents.ts`, `api/src/file-worker.ts`, `web/src/components/documents.tsx`   | `api/integration/documents.test.ts`, `api/acceptance/files.test.ts`, `web/e2e/documents.files.spec.ts` |
| MAINT-007    | PENDING_VERIFICATION | `api/src/routes/documents.ts`, `api/src/file-worker.ts`, `web/src/components/documents.tsx`   | `api/integration/documents.test.ts`, `api/acceptance/files.test.ts`, `web/e2e/documents.files.spec.ts` |
| MAINT-011    | PARTIAL              | `api/src/routes/documents.ts`, `api/src/file-worker.ts`, `web/src/components/documents.tsx`   | `api/integration/documents.test.ts`, `api/acceptance/files.test.ts`, `web/e2e/documents.files.spec.ts` |
| MSG-003      | PARTIAL              | `api/src/account-email.ts`, `api/src/email-worker.ts`, `api/src/routes/accounts.ts`           | `api/integration/accounts.test.ts`, `api/test/account-policy.test.ts`                                  |
| MSG-004      | PARTIAL              | `api/src/account-email.ts`, `api/src/email-worker.ts`, `api/src/routes/accounts.ts`           | `api/integration/accounts.test.ts`, `api/test/account-policy.test.ts`                                  |
| MSG-005      | PARTIAL              | `api/src/account-email.ts`, `api/src/email-worker.ts`, `api/src/routes/accounts.ts`           | `api/integration/accounts.test.ts`, `api/test/account-policy.test.ts`                                  |
| MSG-008      | PARTIAL              | `api/src/account-email.ts`, `api/src/email-worker.ts`, `api/src/routes/accounts.ts`           | `api/integration/accounts.test.ts`, `api/test/account-policy.test.ts`                                  |
| MSG-009      | PARTIAL              | `api/src/account-email.ts`, `api/src/email-worker.ts`, `api/src/routes/accounts.ts`           | `api/integration/accounts.test.ts`, `api/test/account-policy.test.ts`                                  |
| MSG-010      | PARTIAL              | `api/src/account-email.ts`, `api/src/email-worker.ts`, `api/src/routes/accounts.ts`           | `api/integration/accounts.test.ts`, `api/test/account-policy.test.ts`                                  |
| MSG-011      | PENDING_VERIFICATION | `api/src/account-email.ts`, `api/src/email-worker.ts`, `api/src/routes/accounts.ts`           | `api/integration/accounts.test.ts`, `api/test/account-policy.test.ts`                                  |
| MSG-014      | PENDING_VERIFICATION | `api/src/account-email.ts`, `api/src/email-worker.ts`, `api/src/routes/accounts.ts`           | `api/integration/accounts.test.ts`, `api/test/account-policy.test.ts`                                  |
| MSG-015      | BLOCKED              | `api/src/account-email.ts`, `api/src/email-worker.ts`, `api/src/routes/accounts.ts`           | `api/integration/accounts.test.ts`, `api/test/account-policy.test.ts`                                  |
| MSG-016      | PENDING_VERIFICATION | `api/src/account-email.ts`, `api/src/email-worker.ts`, `api/src/routes/accounts.ts`           | `api/integration/accounts.test.ts`, `api/test/account-policy.test.ts`                                  |
| MSG-017      | PENDING_VERIFICATION | `api/src/account-email.ts`, `api/src/email-worker.ts`, `api/src/routes/accounts.ts`           | `api/integration/accounts.test.ts`, `api/test/account-policy.test.ts`                                  |
| MSG-018      | BLOCKED              | `api/src/account-email.ts`, `api/src/email-worker.ts`, `api/src/routes/accounts.ts`           | `api/integration/accounts.test.ts`, `api/test/account-policy.test.ts`                                  |
| MODEL-014    | PARTIAL              | `api/src/routes/documents.ts`, `api/src/file-worker.ts`, `web/src/components/documents.tsx`   | `api/integration/documents.test.ts`, `api/acceptance/files.test.ts`, `web/e2e/documents.files.spec.ts` |
| MODEL-015    | PARTIAL              | `api/src/routes/documents.ts`, `api/src/file-worker.ts`, `web/src/components/documents.tsx`   | `api/integration/documents.test.ts`, `api/acceptance/files.test.ts`, `web/e2e/documents.files.spec.ts` |
| RESOURCE-001 | PENDING_VERIFICATION | `api/src/routes/accounts.ts`, `web/src/pages/Account.tsx`, `api/src/account-policy.ts`        | `api/integration/accounts.test.ts`, `api/test/account-policy.test.ts`, `web/e2e/accounts.live.spec.ts` |
| RESOURCE-002 | PARTIAL              | `api/src/routes/accounts.ts`, `web/src/pages/Account.tsx`, `api/src/account-policy.ts`        | `api/integration/accounts.test.ts`, `api/test/account-policy.test.ts`, `web/e2e/accounts.live.spec.ts` |
| RESOURCE-003 | PENDING_VERIFICATION | `api/src/routes/invitations.ts`, `web/src/pages/Invitations.tsx`, `web/src/pages/Account.tsx` | `api/integration/accounts.test.ts`, `web/e2e/accounts.live.spec.ts`                                    |
| RESOURCE-017 | PENDING_VERIFICATION | `api/src/routes/documents.ts`, `api/src/file-worker.ts`, `web/src/components/documents.tsx`   | `api/integration/documents.test.ts`, `api/acceptance/files.test.ts`, `web/e2e/documents.files.spec.ts` |
| RESOURCE-018 | PARTIAL              | `api/src/routes/accounts.ts`, `web/src/pages/Account.tsx`, `api/src/account-policy.ts`        | `api/integration/accounts.test.ts`, `api/test/account-policy.test.ts`, `web/e2e/accounts.live.spec.ts` |
| WORKER-007   | PENDING_VERIFICATION | `api/src/routes/accounts.ts`, `web/src/pages/Account.tsx`, `api/src/account-policy.ts`        | `api/integration/accounts.test.ts`, `api/test/account-policy.test.ts`, `web/e2e/accounts.live.spec.ts` |
| WORKER-008   | PARTIAL              | `api/src/account-email.ts`, `api/src/email-worker.ts`, `api/src/routes/accounts.ts`           | `api/integration/accounts.test.ts`, `api/test/account-policy.test.ts`                                  |
| WORKER-010   | PENDING_VERIFICATION | `api/src/routes/documents.ts`, `api/src/file-worker.ts`, `web/src/components/documents.tsx`   | `api/integration/documents.test.ts`, `api/acceptance/files.test.ts`, `web/e2e/documents.files.spec.ts` |
| CONFIG-006   | BLOCKED              | `api/src/routes/accounts.ts`, `web/src/pages/Account.tsx`, `api/src/account-policy.ts`        | `api/integration/accounts.test.ts`, `api/test/account-policy.test.ts`, `web/e2e/accounts.live.spec.ts` |
| CONFIG-007   | BLOCKED              | `api/src/account-email.ts`, `api/src/email-worker.ts`, `api/src/routes/accounts.ts`           | `api/integration/accounts.test.ts`, `api/test/account-policy.test.ts`                                  |
| CONFIG-008   | PENDING_VERIFICATION | `api/src/routes/documents.ts`, `api/src/file-worker.ts`, `web/src/components/documents.tsx`   | `api/integration/documents.test.ts`, `api/acceptance/files.test.ts`, `web/e2e/documents.files.spec.ts` |
| CONFIG-009   | BLOCKED              | `api/src/routes/accounts.ts`, `web/src/pages/Account.tsx`, `api/src/account-policy.ts`        | `api/integration/accounts.test.ts`, `api/test/account-policy.test.ts`, `web/e2e/accounts.live.spec.ts` |
| TEST-AUTH-03 | PENDING_VERIFICATION | `api/src/routes/invitations.ts`, `web/src/pages/Invitations.tsx`, `web/src/pages/Account.tsx` | `api/integration/accounts.test.ts`, `web/e2e/accounts.live.spec.ts`                                    |
| TEST-DOC-01  | PENDING_VERIFICATION | `api/src/routes/documents.ts`, `api/src/file-worker.ts`, `web/src/components/documents.tsx`   | `api/integration/documents.test.ts`, `api/acceptance/files.test.ts`, `web/e2e/documents.files.spec.ts` |
