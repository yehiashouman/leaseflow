# Leaseflow

Production-oriented shared-accommodation operations platform for Leasing Managers and tenants.

## Repository

- `api/` — Fastify, TypeScript, Prisma and MySQL REST API
- `web/` — React, TypeScript, Bootstrap/SCSS web application
- `helm/` — portable Kubernetes deployment chart
- `infrastructure/terraform/` — AWS VPC, EKS, RDS MySQL, ElastiCache Redis and S3 foundation
- `SPECIFICATION.md` — complete functional and technical specification

## Local start

Requirements: Docker Engine 25+ with Docker Compose v2.

```bash
cp .env.example .env
cp api/.env.example api/.env
# Replace every placeholder secret in both files.
docker compose up --build
```

Open `http://localhost:8080`. API documentation is at `http://localhost:8080/documentation` when routed directly to the API, or `http://localhost:3000/documentation` during API development.

Create the initial administrator through a controlled database seed or operations script; never expose public administrator registration.

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
