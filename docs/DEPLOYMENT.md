# Production deployment

## AWS services

- EKS with managed EC2 node groups across three availability zones
- RDS MySQL Multi-AZ with encryption, deletion protection and automated backups
- ElastiCache Redis replication group with encryption and automatic failover
- S3 private bucket with encryption, versioning and public access blocked
- AWS Load Balancer Controller with HTTPS-only ALB
- AWS Secrets Manager synchronized through External Secrets Operator
- CloudWatch or OpenTelemetry-compatible centralized logs and metrics

## GitHub configuration

Create `staging` and `production` GitHub environments. Configure:

| Name | Type | Purpose |
|---|---|---|
| `AWS_DEPLOY_ROLE_ARN` | Secret | OIDC-assumable deployment role |
| `ACM_CERTIFICATE_ARN` | Secret | TLS certificate for the application hostname |
| `AWS_REGION` | Variable | AWS region, e.g. `me-central-1` |
| `EKS_CLUSTER_NAME` | Variable | Provisioned EKS cluster name |
| `APP_HOST` | Variable | Public application hostname |

Protect production with required reviewers. Restrict the AWS trust policy to this repository and the named GitHub environment.

## Application secret

Create one Secrets Manager value synchronized to Kubernetes secret `leaseflow-production` containing:

`DATABASE_URL`, `REDIS_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, Twilio Verify values, mail values and S3 values.

Use at least 32 random bytes for each JWT secret. Do not reuse secrets across environments.

## Required cluster add-ons

- AWS Load Balancer Controller
- External Secrets Operator
- metrics-server
- EBS CSI driver
- CoreDNS, kube-proxy and VPC CNI managed add-ons

## Database changes

The Helm pre-upgrade hook runs `prisma migrate deploy` before rolling out application pods. Migrations must be backward compatible with the currently running application. Use expand/migrate/contract for destructive schema changes.

## Availability

Run at least three API and three web pods across availability zones. Configure topology spread constraints in environment overrides when node groups span zones. RDS and Redis must use private subnets. Allow database and Redis access only from EKS workload security groups.

## Rollback

```bash
helm history leaseflow -n leaseflow
helm rollback leaseflow <revision> -n leaseflow --wait
```

Database migrations are not automatically reversed. Rollbacks must remain compatible with the deployed schema.
