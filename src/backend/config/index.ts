// ============================================================
// CapitalForge Backend Config
// Central env-var loading with typed defaults
// ============================================================

function required(key: string): string {
  const val = process.env[key];
  if (!val) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return val;
}

function optional(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}

function optionalNumber(key: string, defaultValue: number): number {
  const val = process.env[key];
  if (val === undefined || val === '') return defaultValue;
  const parsed = parseInt(val, 10);
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${key} must be a number, got: ${val}`);
  }
  return parsed;
}

// ── App ─────────────────────────────────────────────────────
export const NODE_ENV = optional('NODE_ENV', 'development');
export const IS_PRODUCTION = NODE_ENV === 'production';
export const IS_TEST = NODE_ENV === 'test';
export const PORT = optionalNumber('PORT', 4000);
export const FRONTEND_URL = optional('FRONTEND_URL', 'http://localhost:3000');

// ── Database ─────────────────────────────────────────────────
export const DATABASE_URL = optional(
  'DATABASE_URL',
  'postgresql://user:password@localhost:5432/capitalforge',
);
export const REDIS_URL = optional('REDIS_URL', 'redis://localhost:6379');

// ── Auth ─────────────────────────────────────────────────────
export const JWT_SECRET = IS_PRODUCTION
  ? required('JWT_SECRET')
  : optional('JWT_SECRET', 'dev-secret-change-in-production');
export const JWT_EXPIRY = optional('JWT_EXPIRY', '15m');
export const REFRESH_TOKEN_EXPIRY = optional('REFRESH_TOKEN_EXPIRY', '7d');

export const AUTH0_DOMAIN = optional('AUTH0_DOMAIN', '');
export const AUTH0_CLIENT_ID = optional('AUTH0_CLIENT_ID', '');
export const AUTH0_CLIENT_SECRET = optional('AUTH0_CLIENT_SECRET', '');

// ── Anthropic / Claude ───────────────────────────────────────
export const ANTHROPIC_API_KEY = optional('ANTHROPIC_API_KEY', '');

// ── Integrations ─────────────────────────────────────────────
export const PLAID_CLIENT_ID = optional('PLAID_CLIENT_ID', '');
export const PLAID_SECRET = optional('PLAID_SECRET', '');
export const STRIPE_SECRET_KEY = optional('STRIPE_SECRET_KEY', '');
export const DOCUSIGN_INTEGRATION_KEY = optional('DOCUSIGN_INTEGRATION_KEY', '');
export const TWILIO_ACCOUNT_SID = optional('TWILIO_ACCOUNT_SID', '');
export const TWILIO_AUTH_TOKEN = optional('TWILIO_AUTH_TOKEN', '');

// ── AWS ──────────────────────────────────────────────────────
export const AWS_REGION = optional('AWS_REGION', 'us-east-1');
export const AWS_ACCESS_KEY_ID = optional('AWS_ACCESS_KEY_ID', '');
export const AWS_SECRET_ACCESS_KEY = optional('AWS_SECRET_ACCESS_KEY', '');
export const S3_BUCKET_NAME = optional('S3_BUCKET_NAME', 'capitalforge-documents');

// ── Aggregated config object (for convenience passing around) ─
export const config = {
  nodeEnv: NODE_ENV,
  isProduction: IS_PRODUCTION,
  isTest: IS_TEST,
  port: PORT,
  frontendUrl: FRONTEND_URL,
  databaseUrl: DATABASE_URL,
  redisUrl: REDIS_URL,
  jwt: {
    secret: JWT_SECRET,
    expiry: JWT_EXPIRY,
    refreshExpiry: REFRESH_TOKEN_EXPIRY,
  },
  auth0: {
    domain: AUTH0_DOMAIN,
    clientId: AUTH0_CLIENT_ID,
    clientSecret: AUTH0_CLIENT_SECRET,
  },
  anthropic: {
    apiKey: ANTHROPIC_API_KEY,
  },
  plaid: {
    clientId: PLAID_CLIENT_ID,
    secret: PLAID_SECRET,
  },
  stripe: {
    secretKey: STRIPE_SECRET_KEY,
  },
  docusign: {
    integrationKey: DOCUSIGN_INTEGRATION_KEY,
  },
  twilio: {
    accountSid: TWILIO_ACCOUNT_SID,
    authToken: TWILIO_AUTH_TOKEN,
  },
  aws: {
    region: AWS_REGION,
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
    s3BucketName: S3_BUCKET_NAME,
  },
} as const;

export default config;
