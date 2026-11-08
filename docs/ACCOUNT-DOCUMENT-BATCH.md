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

## Remaining Acceptance and Policy Work

| Item         | Remaining requirement                                                                                      |
| ------------ | ---------------------------------------------------------------------------------------------------------- |
| BASE-018     | Redis-backed durable scheduler selection remains incomplete.                                               |
| AUTH-013     | Changed-email and changed-phone reverification remains incomplete.                                         |
| AUTH-016     | Approved endpoint limits require DEC-18; development limits exist.                                         |
| MGR-008      | Twilio Verify code exists; real WhatsApp staging evidence remains absent.                                  |
| MGR-009      | Approved OTP expiry, attempt, and resend limits require DEC-18.                                            |
| MGR-014      | Rejected and suspended account access requires DEC-16 and further interface work.                          |
| MGR-016      | Rejection, resubmission, and suspension policy requires DEC-16.                                            |
| MGR-017      | Moderation outcomes require the remaining moderation and MFA implementation.                               |
| FILE-001     | Generated reports retain their existing private report path; complete upload coverage remains open.        |
| FILE-002     | Actual content, size, and ownership controls exist; approved limits require DEC-18.                        |
| FILE-016     | Approved retention and document-expiry policy requires DEC-15 and DEC-17.                                  |
| FILE-017     | Authorized whole-account export and deletion remain incomplete under DEC-17.                               |
| FILE-018     | Explicit dispute holds and protected-record purge rules require DEC-17.                                    |
| TEN-007      | Twilio verification code exists; real tenant WhatsApp staging evidence remains absent.                     |
| TEN-019      | Complete tenant finance, identity, and historical relationship detail remains incomplete.                  |
| UNIT-012     | Approved required evidence categories require DEC-14; generic property and consent uploads exist.          |
| UNIT-013     | Unit activation remains disabled until the approved evidence policy exists.                                |
| UNIT-014     | The owner has not approved DEC-14 evidence policy.                                                         |
| SPACE-008    | Authorized photos exist; complete compatibility-note forms remain incomplete.                              |
| CASE-002     | Operational case attachments exist; specialized financial case forms remain incomplete.                    |
| CASE-008     | Immutable evidence events exist; complete assignments and deadlines remain incomplete.                     |
| CASE-010     | Transactional in-app notices exist; preference-based external case delivery remains incomplete.            |
| CASE-014     | Complaint participant isolation exists; governed support access remains incomplete.                        |
| MAINT-011    | Maintenance evidence exists; expense vendor, currency, invoice, and recovery records remain incomplete.    |
| MSG-003      | Mandatory recovery email exists; complete security-event delivery coverage remains incomplete.             |
| MSG-004      | Account templates use English; complete user-language template selection remains incomplete.               |
| MSG-005      | Encrypted account email jobs exist; complete channel delivery and attempt history remains incomplete.      |
| MSG-008      | Account email intent persists transactionally; complete business-event provider intent remains incomplete. |
| MSG-009      | Email retries exist; complete WhatsApp notification retries remain incomplete.                             |
| MSG-010      | File scan recovery exists; governed email delivery recovery remains incomplete.                            |
| MSG-015      | Approved WhatsApp template and sender acceptance requires DEC-19 and staging evidence.                     |
| MSG-018      | Real SMTP and Twilio staging delivery remains unverified.                                                  |
| MODEL-014    | Private document versions exist; complete report and retention model acceptance remains incomplete.        |
| MODEL-015    | In-app notices and account email jobs exist; complete WhatsApp delivery history remains incomplete.        |
| RESOURCE-002 | Initial verification exists; changed-contact reverification remains incomplete.                            |
| RESOURCE-018 | Internal notices exist; complete provider callback endpoints remain incomplete.                            |
| WORKER-008   | Durable email jobs exist; complete WhatsApp notification delivery remains incomplete.                      |
| CONFIG-006   | Twilio Verify integration exists; approved sender and template validation remains pending.                 |
| CONFIG-007   | SMTP configuration exists; approved production sender and real staging delivery remain pending.            |
| CONFIG-009   | Development content limits and ClamAV exist; approved upload policy requires DEC-18.                       |
