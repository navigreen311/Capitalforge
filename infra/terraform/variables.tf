# ─── Global ───────────────────────────────────────────────────

variable "aws_region" {
  description = "AWS region for all resources"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Project name used as a prefix for all resource names"
  type        = string
  default     = "corporate-funding-stack"
}

variable "environment" {
  description = "Deployment environment (staging | production)"
  type        = string
  default     = "staging"

  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be 'staging' or 'production'."
  }
}

variable "domain_name" {
  description = "Primary domain name for the application (e.g. app.example.com)"
  type        = string
}

variable "acm_certificate_arn" {
  description = "ARN of the ACM certificate for HTTPS (must be in us-east-1 for ALB)"
  type        = string
}

# ─── Networking ───────────────────────────────────────────────

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "enable_nat_gateway_ha" {
  description = "Deploy one NAT gateway per AZ for high availability (doubles NAT cost)"
  type        = bool
  default     = false
}

# ─── ECS — Backend ────────────────────────────────────────────

variable "backend_image" {
  description = "Docker image for the backend service (without tag)"
  type        = string
}

variable "backend_image_tag" {
  description = "Docker image tag for the backend service"
  type        = string
  default     = "latest"
}

variable "backend_port" {
  description = "Port the backend container listens on"
  type        = number
  default     = 3000
}

variable "backend_cpu" {
  description = "CPU units for backend Fargate task (1024 = 1 vCPU)"
  type        = number
  default     = 512
}

variable "backend_memory" {
  description = "Memory (MiB) for backend Fargate task"
  type        = number
  default     = 1024
}

variable "backend_desired_count" {
  description = "Initial desired number of backend tasks"
  type        = number
  default     = 2
}

variable "backend_health_check_path" {
  description = "HTTP path for backend health check"
  type        = string
  default     = "/health"
}

# ─── ECS — Frontend ───────────────────────────────────────────

variable "frontend_image" {
  description = "Docker image for the frontend service (without tag)"
  type        = string
}

variable "frontend_image_tag" {
  description = "Docker image tag for the frontend service"
  type        = string
  default     = "latest"
}

variable "frontend_port" {
  description = "Port the frontend container listens on"
  type        = number
  default     = 3001
}

variable "frontend_cpu" {
  description = "CPU units for frontend Fargate task (1024 = 1 vCPU)"
  type        = number
  default     = 512
}

variable "frontend_memory" {
  description = "Memory (MiB) for frontend Fargate task"
  type        = number
  default     = 1024
}

variable "frontend_desired_count" {
  description = "Initial desired number of frontend tasks"
  type        = number
  default     = 2
}

# ─── RDS ──────────────────────────────────────────────────────

variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.medium"
}

variable "db_name" {
  description = "PostgreSQL database name"
  type        = string
  default     = "appdb"
}

variable "db_username" {
  description = "PostgreSQL master username"
  type        = string
  default     = "dbadmin"
}

variable "db_allocated_storage" {
  description = "Initial allocated storage for RDS (GiB)"
  type        = number
  default     = 20
}

variable "db_max_allocated_storage" {
  description = "Maximum storage autoscaling ceiling for RDS (GiB)"
  type        = number
  default     = 100
}

variable "db_multi_az" {
  description = "Enable Multi-AZ deployment for RDS"
  type        = bool
  default     = true
}

# ─── ElastiCache ──────────────────────────────────────────────

variable "redis_node_type" {
  description = "ElastiCache Redis node type"
  type        = string
  default     = "cache.t3.micro"
}

variable "redis_num_cache_nodes" {
  description = "Number of Redis cache nodes (2+ enables Multi-AZ)"
  type        = number
  default     = 2
}

# ─── Monitoring ───────────────────────────────────────────────

variable "alert_email_addresses" {
  description = "List of email addresses to receive CloudWatch alarm notifications"
  type        = list(string)
  default     = []
}

variable "log_retention_days" {
  description = "CloudWatch log group retention period in days"
  type        = number
  default     = 30

  validation {
    condition     = contains([1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1827, 3653], var.log_retention_days)
    error_message = "log_retention_days must be a valid CloudWatch retention value."
  }
}
