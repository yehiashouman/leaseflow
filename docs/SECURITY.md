# Security operations

- Never commit `.env`, credentials, ID documents or production exports.
- Rotate JWT, Twilio, database and storage credentials after suspected exposure.
- Require MFA for administrator accounts and GitHub production approvers.
- Retain immutable audit events for authentication, exports, document access, payment corrections, contract changes, moderation and impersonation.
- Virus-scan uploads before making them available. Allowlist MIME types and verify file signatures.
- Mask Emirates ID numbers in logs, notifications and ordinary reports.
- Keep Twilio and email messages free of identity-document content; link to authenticated pages.
- Use AWS WAF rules at the ALB for managed threats, rate-based rules and IP reputation.
- Run dependency, container and infrastructure scans in CI before production approval.

Report vulnerabilities privately to the repository owner. Do not create public issues containing exploit details or personal data.
