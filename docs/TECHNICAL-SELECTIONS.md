# Technical Selections

These records describe implementation choices, not owner approval of unresolved business policies.
Requirements remain authoritative; technical selections cannot resolve DEC items.

| Area            | Current selection                               | Authority and boundary                                                          |
| --------------- | ----------------------------------------------- | ------------------------------------------------------------------------------- |
| API             | Fastify, TypeScript, REST /api/v1               | Existing required stack                                                         |
| Data            | MySQL, Prisma migrations                        | Existing required stack; unresolved ledger policies stay pending                |
| Web             | React, TypeScript, Vite, React Router           | Existing required stack                                                         |
| Interface       | shadcn/ui, Radix, Tailwind CSS 4, Lucide        | Requested interface stack                                                       |
| Client data     | React Query, Axios                              | Existing implementation selection                                               |
| Case PDFs       | pdf-lib                                         | Agent technical selection; complete multilingual PDF acceptance remains pending |
| PDF queue       | Private MySQL snapshots and leased jobs         | Interim implementation; complete Redis scheduler requirement remains pending    |
| Browser tests   | Playwright and Chromium                         | Agent technical selection; real and synthetic acceptance remain distinct        |
| Unit tests      | Vitest, React Testing Library, Node test runner | Agent technical selection                                                       |
| Local runtime   | Docker Compose, named volumes, Node 22          | Existing deployment direction; startup now verifies the web/API path            |
| Private storage | S3-compatible production design and local MinIO | Required direction; complete upload, scan, and file acceptance remain pending   |
| Deployment      | Existing Helm, Terraform, and AWS files         | No replacement architecture or production acceptance claim                      |
| Proxy trust     | Explicit IP/CIDR allowlist or false             | Security configuration; no implicit production trust                            |

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
The original SPECIFICATION.md retains its recorded SHA-256 hash.
