# Technical Selections

These records describe implementation choices, not owner approval of unresolved business policies.
Requirements remain authoritative; technical selections cannot resolve DEC items.

| Area            | Current selection                               | Authority and boundary                                                             |
| --------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------- |
| API             | Fastify, TypeScript, REST /api/v1               | Existing required stack                                                            |
| Data            | MySQL, Prisma migrations                        | Existing required stack; unresolved ledger policies stay pending                   |
| Web             | React, TypeScript, Vite, React Router           | Existing required stack                                                            |
| Interface       | shadcn/ui, Radix, Tailwind CSS 4, Lucide        | Requested interface stack                                                          |
| Client data     | React Query, Axios                              | Existing implementation selection                                                  |
| Case PDFs       | pdf-lib                                         | Agent technical selection; complete multilingual PDF acceptance remains pending    |
| PDF queue       | Private MySQL snapshots and leased jobs         | Interim implementation; complete Redis scheduler requirement remains pending       |
| Browser tests   | Playwright and Chromium                         | Agent technical selection; real and synthetic acceptance remain distinct           |
| Unit tests      | Vitest, React Testing Library, Node test runner | Agent technical selection                                                          |
| Local runtime   | Docker Compose, named volumes, Node 22          | Existing deployment direction; startup now verifies the web/API path               |
| Private storage | S3-compatible production design and local MinIO | Private versioned objects and guarded downloads; production policy remains pending |
| Deployment      | Existing Helm, Terraform, and AWS files         | No replacement architecture or production acceptance claim                         |
| Proxy trust     | Explicit IP/CIDR allowlist or false             | Security configuration; no implicit production trust                               |

Landlords remain reusable records without account roles or login endpoints.
Platform activation does not certify legal sufficiency or property authorization.
The Leasing Manager retains legal sufficiency and authorization responsibility.
Payments remain external records; this application does not collect or escrow funds.
Optional tenant compatibility preferences remain descriptive, not allocation restrictions.

## Decision Ownership

The PROJECT_OWNER role owns every unresolved DEC item.
The itemDefaults object in decisions.json applies to every item unless an item explicitly overrides it.
All twenty-six current items remain PENDING with no approved answer or approval date.
Approved business changes require explicit owner evidence and updates to dependent code and tests.
Proposed due-day, rounding, date-boundary, retention, and acknowledgement options remain unapproved.
Production contract activation and payment writes return 409 until financial and acknowledgement policies receive approval and verified implementation.
Development-only financial scaffolds remain available for tests; they are not accepted business rules.
The original SPECIFICATION.md retains its recorded SHA-256 hash.

## Account and Document Selections

| Area                   | Selection                          | Boundary                                                                         |
| ---------------------- | ---------------------------------- | -------------------------------------------------------------------------------- |
| Raster files           | Sharp                              | Decode, rotate, resize, and remove metadata after an antivirus scan.             |
| PDF files              | pdf-lib                            | Reject active content and rebuild pages without annotations or source metadata.  |
| Antivirus              | ClamAV INSTREAM                    | Real service acceptance remains separate from deterministic database adapters.   |
| File jobs              | Durable MySQL leases               | Retry bounds and interrupted-worker recovery preserve quarantine.                |
| Email                  | Nodemailer SMTP                    | Encrypted transactional intent; server acceptance does not prove inbox delivery. |
| WhatsApp               | Twilio Verify                      | Provider approval controls verification; real staging delivery remains pending.  |
| Private links          | HMAC grants and live authorization | Grants bind document, digest, account, session, and expiry.                      |
| New Emirates ID values | AES-256-GCM                        | Existing plaintext values require a separately verified migration.               |

Private files require the private-files Compose profile and FILES_ENABLED=true in development.
Account email requires ACCOUNT_EMAIL_ENABLED=true and a valid SMTP deployment.
The public preview never uploads identity documents or sends invitations.
These selections do not approve DEC-15 through DEC-19 or production deployment.

MinIO uses bucket policies; its ACL endpoint returns a dummy response.
S3_PROVIDER=minio selects policy verification; S3_PROVIDER=s3 also requires an owner-only ACL.
The real-service suite verifies anonymous object denial for quarantine and sanitized objects.
Reference: https://github.com/minio/minio/blob/master/docs/minio-limits.md.
