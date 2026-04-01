# CapitalForge — Kubernetes Deployment Guide (EKS)

This directory contains all Kubernetes manifests for deploying CapitalForge to
Amazon EKS. Resources are managed with [Kustomize](https://kustomize.io/) and
live in the `capitalforge` namespace.

---

## Directory contents

| File | Purpose |
|---|---|
| `namespace.yaml` | `capitalforge` namespace |
| `configmap.yaml` | Non-secret runtime config (NODE_ENV, URLs, log level) |
| `secrets.yaml` | Secret template — replace placeholders before applying |
| `backend-deployment.yaml` | Express API (port 4000), 2 replicas, rolling update |
| `frontend-deployment.yaml` | Next.js standalone (port 3000), 2 replicas, rolling update |
| `backend-service.yaml` | ClusterIP service for the backend |
| `frontend-service.yaml` | ClusterIP service for the frontend |
| `ingress.yaml` | nginx ingress with TLS, `/api/*` → backend, `/*` → frontend |
| `hpa.yaml` | HPA: min 2 / max 10 pods, CPU target 70% |
| `cronjob-backup.yaml` | Daily DB backup at 02:00 UTC (`scripts/backup.sh`) |
| `cronjob-apr-alerts.yaml` | Hourly APR expiry checker |
| `network-policy.yaml` | Default-deny, allow only required traffic paths |
| `kustomization.yaml` | Kustomize root — references all manifests |

---

## Prerequisites

### EKS cluster

- EKS 1.28+ recommended
- [AWS VPC CNI](https://github.com/aws/amazon-vpc-cni-k8s) with Network Policy enabled
  (VPC CNI v1.14+):
  ```sh
  aws eks update-addon \
    --cluster-name <cluster-name> \
    --addon-name vpc-cni \
    --configuration-values '{"enableNetworkPolicy": "true"}'
  ```
  Alternatively install [Calico](https://docs.tigera.io/calico/latest/getting-started/kubernetes/managed-public-cloud/eks)
  for NetworkPolicy enforcement.

### Cluster add-ons

| Add-on | Required for |
|---|---|
| [ingress-nginx](https://kubernetes.github.io/ingress-nginx/) | Ingress routing and TLS termination |
| [cert-manager](https://cert-manager.io/) | Automatic TLS certificates via Let's Encrypt |
| [metrics-server](https://github.com/kubernetes-sigs/metrics-server) | HorizontalPodAutoscaler CPU/memory metrics |

Install with Helm:

```sh
# ingress-nginx
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx --create-namespace

# cert-manager (with CRDs)
helm repo add jetstack https://charts.jetstack.io
helm install cert-manager jetstack/cert-manager \
  --namespace cert-manager --create-namespace \
  --set installCRDs=true

# metrics-server
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
```

After cert-manager is running, create a ClusterIssuer for Let's Encrypt:

```yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: devops@capitalforge.io      # replace with your email
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
      - http01:
          ingress:
            class: nginx
```

---

## Configuration

### 1. Secrets

`secrets.yaml` contains base64 placeholder values. Before deploying, either:

**Option A — Edit in place (not recommended for production):**

```sh
echo -n "postgresql://capitalforge:password@<rds-host>:5432/capitalforge" | base64
# Paste output into secrets.yaml under DATABASE_URL
```

**Option B — External Secrets Operator (recommended):**

Install [External Secrets Operator](https://external-secrets.io/) and create
an `ExternalSecret` that syncs from AWS Secrets Manager. Delete `secrets.yaml`
from the Kustomize `resources:` list and replace with your `ExternalSecret`
manifest.

**Minimum required secrets:**

| Key | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis URL with password |
| `JWT_SECRET` | Min 32 random bytes (`openssl rand -base64 32`) |

### 2. Domain name

Update the `host` field in `ingress.yaml` and `FRONTEND_URL` in
`configmap.yaml` to your actual domain:

```sh
# In ingress.yaml — replace app.capitalforge.io
sed -i 's/app.capitalforge.io/your.domain.com/g' infra/k8s/ingress.yaml

# In configmap.yaml
sed -i 's/app.capitalforge.io/your.domain.com/g' infra/k8s/configmap.yaml
```

### 3. Container images

Update image names in `kustomization.yaml` to your ECR repositories:

```sh
cd infra/k8s

kustomize edit set image \
  capitalforge/backend=<account>.dkr.ecr.us-east-1.amazonaws.com/capitalforge/backend:<git-sha>

kustomize edit set image \
  capitalforge/frontend=<account>.dkr.ecr.us-east-1.amazonaws.com/capitalforge/frontend:<git-sha>
```

---

## Deployment

### First deploy

```sh
# 1. Ensure kubectl context points to the target cluster
kubectl config current-context

# 2. Preview the rendered manifests
kubectl kustomize infra/k8s/

# 3. Apply (creates namespace first, then all resources)
kubectl apply -k infra/k8s/

# 4. Watch rollout
kubectl -n capitalforge rollout status deployment/backend
kubectl -n capitalforge rollout status deployment/frontend

# 5. Verify pods are healthy
kubectl -n capitalforge get pods -o wide
```

### Rolling update (CI/CD)

```sh
# Build and push images in CI, then:
cd infra/k8s
kustomize edit set image \
  capitalforge/backend=<ecr-uri>:<new-tag> \
  capitalforge/frontend=<ecr-uri>:<new-tag>

kubectl apply -k infra/k8s/
kubectl -n capitalforge rollout status deployment/backend --timeout=300s
kubectl -n capitalforge rollout status deployment/frontend --timeout=300s
```

### Rollback

```sh
kubectl -n capitalforge rollout undo deployment/backend
kubectl -n capitalforge rollout undo deployment/frontend
```

---

## External services (RDS and ElastiCache)

When using managed AWS services instead of in-cluster postgres/redis, update the
NetworkPolicy egress rules in `network-policy.yaml` to use `ipBlock` CIDRs
instead of `podSelector` (commented stubs are already provided in the file).

---

## HPA and autoscaling

- Backend scales from 2 to 10 pods at 70% CPU / 80% memory.
- Frontend scales from 2 to 6 pods at 70% CPU / 80% memory.
- Scale-up stabilisation: 60 s. Scale-down stabilisation: 300 s.
- Requires `metrics-server` to be running.

Check current scale status:

```sh
kubectl -n capitalforge get hpa
```

---

## CronJobs

| Job | Schedule | Purpose |
|---|---|---|
| `db-backup` | `0 2 * * *` (02:00 UTC daily) | pg_dump → gzip → S3 |
| `apr-expiry-checker` | `0 * * * *` (hourly) | POST /api/jobs/apr-expiry-check |

The APR checker uses a `CRON_SECRET` env var (add to `secrets.yaml`) for the
`X-Cron-Secret` header. Add a matching check to the backend route handler.

Monitor CronJob history:

```sh
kubectl -n capitalforge get cronjobs
kubectl -n capitalforge get jobs
kubectl -n capitalforge logs job/db-backup-<hash>
```

---

## Troubleshooting

```sh
# Pod logs
kubectl -n capitalforge logs -l app.kubernetes.io/component=backend --tail=100

# Describe failing pod
kubectl -n capitalforge describe pod <pod-name>

# Check ingress events
kubectl -n capitalforge describe ingress capitalforge

# Check HPA events
kubectl -n capitalforge describe hpa backend

# Exec into a pod for debugging
kubectl -n capitalforge exec -it deploy/backend -- /bin/sh
```
