# KMS Key for Secrets Manager
resource "aws_kms_key" "secrets" {
  description             = "${var.project_name}-${var.environment} Secrets Manager encryption key"
  deletion_window_in_days = 14
  enable_key_rotation     = true

  tags = {
    Name = "${var.project_name}-${var.environment}-secrets-kms"
  }
}

resource "aws_kms_alias" "secrets" {
  name          = "alias/${var.project_name}-${var.environment}-secrets"
  target_key_id = aws_kms_key.secrets.key_id
}

# Database Credentials
resource "aws_secretsmanager_secret" "db_credentials" {
  name                    = "${var.project_name}/${var.environment}/db-credentials"
  description             = "RDS PostgreSQL credentials"
  kms_key_id              = aws_kms_key.secrets.arn
  recovery_window_in_days = var.environment == "production" ? 30 : 0

  tags = {
    Name = "${var.project_name}-${var.environment}-db-credentials"
  }
}

# Redis Credentials
resource "aws_secretsmanager_secret" "redis_credentials" {
  name                    = "${var.project_name}/${var.environment}/redis-credentials"
  description             = "ElastiCache Redis auth token and connection details"
  kms_key_id              = aws_kms_key.secrets.arn
  recovery_window_in_days = var.environment == "production" ? 30 : 0

  tags = {
    Name = "${var.project_name}-${var.environment}-redis-credentials"
  }
}

# JWT Secret
resource "random_password" "jwt_secret" {
  length  = 64
  special = false
}

resource "aws_secretsmanager_secret" "jwt_secret" {
  name                    = "${var.project_name}/${var.environment}/jwt-secret"
  description             = "JWT signing secret"
  kms_key_id              = aws_kms_key.secrets.arn
  recovery_window_in_days = var.environment == "production" ? 30 : 0

  tags = {
    Name = "${var.project_name}-${var.environment}-jwt-secret"
  }
}

resource "aws_secretsmanager_secret_version" "jwt_secret" {
  secret_id     = aws_secretsmanager_secret.jwt_secret.id
  secret_string = jsonencode({ secret = random_password.jwt_secret.result })
}

# API Keys — placeholder, actual values set via console or CI/CD
resource "aws_secretsmanager_secret" "api_keys" {
  name                    = "${var.project_name}/${var.environment}/api-keys"
  description             = "Third-party API keys (Stripe, SendGrid, etc.)"
  kms_key_id              = aws_kms_key.secrets.arn
  recovery_window_in_days = var.environment == "production" ? 30 : 0

  tags = {
    Name = "${var.project_name}-${var.environment}-api-keys"
  }
}

resource "aws_secretsmanager_secret_version" "api_keys" {
  secret_id = aws_secretsmanager_secret.api_keys.id

  secret_string = jsonencode({
    STRIPE_SECRET_KEY       = "REPLACE_ME"
    STRIPE_WEBHOOK_SECRET   = "REPLACE_ME"
    SENDGRID_API_KEY        = "REPLACE_ME"
    OPENAI_API_KEY          = "REPLACE_ME"
    PLAID_CLIENT_ID         = "REPLACE_ME"
    PLAID_SECRET            = "REPLACE_ME"
  })

  lifecycle {
    ignore_changes = [secret_string]
  }
}

# Session Secret
resource "random_password" "session_secret" {
  length  = 64
  special = false
}

resource "aws_secretsmanager_secret" "session_secret" {
  name                    = "${var.project_name}/${var.environment}/session-secret"
  description             = "Express session secret"
  kms_key_id              = aws_kms_key.secrets.arn
  recovery_window_in_days = var.environment == "production" ? 30 : 0

  tags = {
    Name = "${var.project_name}-${var.environment}-session-secret"
  }
}

resource "aws_secretsmanager_secret_version" "session_secret" {
  secret_id     = aws_secretsmanager_secret.session_secret.id
  secret_string = jsonencode({ secret = random_password.session_secret.result })
}

# Rotation schedule for DB credentials (optional — requires Lambda rotation function)
# Uncomment when rotation Lambda is deployed
# resource "aws_secretsmanager_secret_rotation" "db_credentials" {
#   secret_id           = aws_secretsmanager_secret.db_credentials.id
#   rotation_lambda_arn = var.secrets_rotation_lambda_arn
#   rotation_rules {
#     automatically_after_days = 30
#   }
# }
