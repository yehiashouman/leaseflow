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
3. Generates development-only JWT secrets and `CORS_ORIGINS` that include `http://localhost:8080`, `http://127.0.0.1:8080` and the Codespaces application/editor origins.
4. Sets `DEMO_MODE=true` so a demo administrator is seeded automatically.
5. Builds and starts Docker Compose, runs migrations, seeds the demo administrator, and waits for health checks.
6. Prints the exact `https://${CODESPACE_NAME}-8080.app.github.dev` application URL.

Port 8080 is forwarded automatically, labeled "LeaseFlow", and opened in the browser once it is ready. The API, MySQL and Redis ports stay private.

## `make demo` / `make demo-reset`

`make demo` is the single idempotent command that repairs or starts the whole stack: it creates missing env files, starts Docker Compose, runs migrations, seeds/updates the demo administrator, waits for MySQL/API/web health checks, and prints the application URL and demo credentials. Safe to re-run after stopping and restarting the Codespace or your machine.

`make demo-reset` warns that it deletes local demo data, removes only the LeaseFlow Docker development volumes (MySQL, Redis, MinIO), recreates the database, runs migrations, reseeds the demo administrator, and starts the application again.

### Demo administrator

When `DEMO_MODE=true` (Codespaces and local demo by default), a fixed demo administrator is seeded idempotently:

- Email: `admin@leaseflow.local`
- Password: `Admin123456!`

The password is stored as an Argon2id hash; the hash itself is never printed. Startup refuses to continue if `DEMO_MODE=true` while `NODE_ENV=production`, and demo credentials are never created in production.

## Local start (manual)

Requirements: Docker Engine 25+ with Docker Compose v2.

```bash
cp .env.example .env
cp api/.env.example api/.env
# Replace every placeholder secret in both files.
docker compose up --build
```

Open `http://localhost:8080`. API documentation is at `http://localhost:8080/documentation` when routed directly to the API, or `http://localhost:3000/documentation` during API development.

Prefer `make demo` over these manual steps in Codespaces or for local demos — it automates all of the above and seeds the demo administrator for you.

## CORS

`CORS_ORIGINS` is a comma-separated allow-list of exact origins (trailing slashes are ignored). Requests without an `Origin` header (curl, health checks, server-to-server) are always allowed. In `development`/`test`, `http://localhost:8080`, `http://127.0.0.1:8080` and any `https://*.app.github.dev` / `https://*.github.dev` origin are allowed in addition to `CORS_ORIGINS`, using a hostname-suffix check (never substring matching) so origins cannot be spoofed. In `production`, only exact `CORS_ORIGINS` entries are allowed, `origin: true` is never used, and rejected origins receive `HTTP 403` (never `500`) with the rejected origin and request ID logged — never credentials or secrets.

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
