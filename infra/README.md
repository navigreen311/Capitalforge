# Infrastructure — Terraform

AWS infrastructure for the Corporate Funding Stack, provisioned with Terraform. All resources deploy into `us-east-1` and are namespaced by `project_name` + `environment` to support multiple environments from the same configuration.

## Architecture Overview

```
Internet
    │
    ▼
AWS WAF (rate limiting, SQLi, XSS protection)
    │
    ▼
Application Load Balancer (public subnets, HTTPS only)
    │            │
    ▼            ▼
Frontend      Backend          ← ECS Fargate (private subnets)
(Next.js)    (Node.js API)     ← Auto-scaling: min 2, max 10
                 │    │
                 ▼    ▼
           RDS Postgres  ElastiCache Redis  ← database subnets
           (Multi-AZ)    (Multi-AZ)
                 │
                 ▼
           Secrets Manager  S3 (documents)
```

## Prerequisites

| Tool | Min version | Install |
|------|-------------|---------|
| Terraform | 1.5.0 | https://developer.hashicorp.com/terraform/install |
| AWS CLI | 2.x | https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html |
| AWS credentials | — | `aws configure` or environment variables |

Required before first apply:
- An S3 bucket named `corporate-funding-stack-tfstate` in `us-east-1` (for remote state)
- A DynamoDB table named `corporate-funding-stack-tfstate-lock` with partition key `LockID` (string) for state locking
- An ACM certificate for your domain in `us-east-1`
- ECR repositories (or other registry) with backend and frontend images pushed

### Bootstrap the S3 backend (one-time)

```bash
aws s3api create-bucket \
  --bucket corporate-funding-stack-tfstate \
  --region us-east-1

aws s3api put-bucket-versioning \
  --bucket corporate-funding-stack-tfstate \
  --versioning-configuration Status=Enabled

aws s3api put-bucket-encryption \
  --bucket corporate-funding-stack-tfstate \
  --server-side-encryption-configuration \
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'

aws dynamodb create-table \
  --table-name corporate-funding-stack-tfstate-lock \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region us-east-1
```

## Configuration

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your values — never commit this file
```

Key values to set:
- `domain_name` — your application domain (e.g. `app.example.com`)
- `acm_certificate_arn` — ARN of an issued ACM certificate for that domain
- `backend_image` / `frontend_image` — ECR (or other) image URIs
- `alert_email_addresses` — ops team emails for CloudWatch alarms

## Workflow

### Initialize

```bash
cd infra/terraform
terraform init
```

### Plan

Review changes before applying:

```bash
# Staging
terraform plan -var="environment=staging" -out=tfplan

# Production
terraform plan -var="environment=production" -out=tfplan
```

### Apply

```bash
terraform apply tfplan
```

For non-interactive CI pipelines:

```bash
terraform apply -auto-approve -var="environment=staging"
```

### Inspect outputs

```bash
terraform output alb_dns_name
terraform output documents_bucket_name
terraform output rds_endpoint        # sensitive — use -raw
terraform output -raw rds_endpoint
terraform output -raw redis_endpoint
```

### Destroy

```bash
# Staging — safe to destroy
terraform destroy -var="environment=staging"

# Production — deletion_protection is enabled on RDS and ALB.
# You must manually disable it first, or override:
terraform destroy -var="environment=production" \
  -target=aws_db_instance.main    # will fail until deletion_protection=false
```

## File Reference

| File | Purpose |
|------|---------|
| `main.tf` | Provider config, backend (S3 state), required versions |
| `variables.tf` | All input variables with descriptions and defaults |
| `terraform.tfvars.example` | Example values — copy to `terraform.tfvars` |
| `outputs.tf` | Exported values (ALB DNS, RDS endpoint, etc.) |
| `vpc.tf` | VPC, public/private/database subnets across 2 AZs, NAT gateway, security groups |
| `ecs.tf` | ECS Fargate cluster, backend + frontend services, ALB, task definitions, auto-scaling |
| `rds.tf` | PostgreSQL RDS (db.t3.medium), Multi-AZ, KMS encryption, 7-day backups |
| `elasticache.tf` | Redis ElastiCache replication group, encryption in transit, Multi-AZ |
| `s3.tf` | Document storage bucket — versioning, AES-256 encryption, 90-day Glacier lifecycle |
| `secrets.tf` | Secrets Manager secrets for DB credentials, Redis auth, JWT, API keys |
| `waf.tf` | WAF v2 with rate limiting (2 000 req/5 min), SQLi, XSS, bad-input managed rules |
| `monitoring.tf` | CloudWatch alarms (CPU >80%, memory >80%, 5xx >1%), SNS alerts, dashboard |

## Post-Deploy Steps

1. **DNS** — Create a Route 53 alias record pointing your domain to `alb_dns_name`.
2. **API keys** — Populate real values in the `corporate-funding-stack/<env>/api-keys` secret via the AWS Console or:
   ```bash
   aws secretsmanager put-secret-value \
     --secret-id "corporate-funding-stack/staging/api-keys" \
     --secret-string '{"STRIPE_SECRET_KEY":"sk_live_...","SENDGRID_API_KEY":"SG...."}'
   ```
3. **Database migrations** — Run Prisma (or your migration tool) against the RDS endpoint from within the VPC (e.g. via ECS exec or a bastion):
   ```bash
   aws ecs execute-command \
     --cluster corporate-funding-stack-staging \
     --task <task-id> \
     --container backend \
     --interactive \
     --command "npx prisma migrate deploy"
   ```
4. **Alert subscriptions** — Confirm the SNS email subscription sent to each address in `alert_email_addresses`.

## Security Notes

- RDS and ElastiCache are in isolated database subnets with no route to the internet.
- All secrets are KMS-encrypted; ECS tasks retrieve them at runtime via `secrets` in the task definition.
- WAF is attached to the ALB — all traffic is inspected before reaching containers.
- The documents S3 bucket enforces HTTPS-only access via bucket policy.
- `deletion_protection` is enabled on RDS and ALB in `production`.
- State file is encrypted at rest in S3 and locked via DynamoDB.
