# Leaseflow

Shared-accommodation operations platform for Leasing Managers and tenants, under implementation.
The full application is not production-ready.

## Repository

- `api/` — Fastify, TypeScript, Prisma and MySQL REST API
- `web/` — React, TypeScript, shadcn/ui, Tailwind CSS and Lucide web application
- `helm/` — portable Kubernetes deployment chart
- `infrastructure/terraform/` — AWS VPC, EKS, RDS MySQL, ElastiCache Redis and S3 foundation
- `SPECIFICATION.md` — complete functional and technical specification
- `requirements.md` — delivery requirements and acceptance criteria
- `checklist.md` — detailed implementation and verification tasks
- `docs/UI.md` — shadcn/ui component, theme and accessibility conventions
- `docs/PREVIEW.md` — public GitHub Pages preview setup and boundaries
- `docs/IMPLEMENTATION.md` — implemented workflows and outstanding release work
- `docs/PROGRESS.md`: full checklist progress and remaining scope
- `docs/EVIDENCE.md`: verified task evidence and test results
- `docs/SESSIONS.md`: session security, API contracts, and migration constraints
- `docs/INVENTORY.md`: landlord lifecycle, property fields, and archive safeguards
- `docs/CONTRACT-RECORDS.md`: scoped contract detail, paged records, and incomplete financial scope
- `docs/PDF-REPORTS.md`: private case PDF jobs, authorized downloads, font limits, and both required migrations
- `docs/MAINTENANCE.md`: maintenance responsibility, proposed costs, tenant responses, and the required migration
- `docs/STARTUP.md`: repeatable local startup, guarded reset, and exact verification limits
- `docs/CONFIGURATION.md`: all configuration groups, proxy policy, and pending provider settings
- `docs/TECHNICAL-SELECTIONS.md`: implementation selections without implied owner approval
- `docs/decisions.json`: owner and pending status for all twenty-six business decisions

## Public Preview

The GitHub Pages preview uses synthetic browser-local data, not the production API.
Open the [live preview](https://yehiashouman.github.io/leaseflow/).
See [preview details](docs/PREVIEW.md) for deployment status and isolation limits.
See [implementation progress](docs/IMPLEMENTATION.md) before any completion claim.
The session migration requires existing API users to sign in again; see [session deployment](docs/SESSIONS.md).

## GitHub Codespaces

Open this repository in a Codespace. The devcontainer runs `scripts/codespaces-setup.sh` automatically on first create, which:

1. Detects `CODESPACE_NAME`.
2. Creates `.env` and `api/.env` from their `.env.example` files if they do not already exist (existing files are never overwritten).
3. Generates independent database, Redis, MinIO, and JWT secrets in private files without shell evaluation.
4. Uses the explicit --demo flag; production configuration always refuses this helper.
5. Builds and starts Docker Compose, runs migrations, seeds the demo administrator, and waits for health checks.
6. Prints the exact `https://${CODESPACE_NAME}-8080.app.github.dev` application URL.

Port 8080 is forwarded automatically, labeled "LeaseFlow", and opened in the browser once it is ready. The API, MySQL and Redis ports stay private.

## `make demo` / `make demo-reset`

`make demo` starts the non-production stack through one repeatable helper.
It creates missing environment files, applies migrations, creates an absent demo administrator, waits for readiness, and verifies the web/API proxy.
Existing credentials, account roles, changed passwords, and data volumes remain intact.
The helper prints the application URL, not credentials.

`make demo-reset` refuses to delete data without the exact confirmation argument in [STARTUP.md](docs/STARTUP.md).
Production environments always refuse this destructive helper.

### Demo administrator

Explicit non-production demo mode creates an absent demo administrator:

Email:

```text
admin@leaseflow.local
```

Password:

```text
Admin123456!
```

The password is stored as an Argon2id hash; the hash itself is never printed. Startup refuses to continue if `DEMO_MODE=true` while `NODE_ENV=production`, and demo credentials are never created in production.

## Local start (manual)

Requirements: Docker Engine 25+ with Docker Compose v2.

```bash
make up
```

Open `http://localhost:8080`.
The API documentation uses its internal /documentation route and is not published by the default web proxy.

Prefer `make demo` over these manual steps in Codespaces or for local demos — it automates all of the above and seeds the demo administrator for you.

## CORS

Production requires explicit HTTPS CORS_ORIGINS and an explicit TRUST_PROXY allowlist or false.
Development Codespaces allowances never extend to production.
The web proxy replaces client-supplied forwarding headers; global proxy trust is forbidden.
See [CONFIGURATION.md](docs/CONFIGURATION.md) for exact boundaries and deployment prerequisites.

## Development

```bash
npm ci
npm run dev -w api
npm run dev -w web
```

## Production

1. Provision AWS infrastructure from `infrastructure/terraform` using a remote encrypted Terraform state backend.
2. Install AWS Load Balancer Controller, External Secrets Operator, metrics-server and a supported observability stack in EKS.
3. Create application secrets in AWS Secrets Manager and synchronize them as `leaseflow-production`.
4. Configure GitHub environment variables and the OIDC deployment role documented in `docs/DEPLOYMENT.md`.
5. Run the container workflow, then manually approve the `Deploy EKS` workflow.

Production deployments use immutable commit-SHA image tags, rolling updates, health probes, autoscaling and PodDisruptionBudgets. MySQL and Redis are managed AWS services and are not deployed inside Kubernetes.

## Important boundary

Leaseflow stores documents and operational records. It does not certify legal sufficiency, ownership, authorization or regulatory compliance. Those responsibilities remain with the Leasing Manager.
