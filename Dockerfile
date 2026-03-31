# =============================================================================
# CapitalForge — Backend Dockerfile
# Multi-stage build: stage 1 compiles TypeScript, stage 2 runs production only
# =============================================================================

# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

# Install build dependencies (needed for native modules like bcrypt)
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy manifests first to leverage Docker layer cache
COPY package.json package-lock.json ./
COPY prisma ./prisma/

# Install ALL dependencies (including devDeps needed for TypeScript compile)
RUN npm ci --ignore-scripts

# Generate Prisma client
RUN npx prisma generate

# Copy source
COPY tsconfig.json ./
COPY src/backend ./src/backend/
COPY src/shared ./src/shared/

# Compile TypeScript → dist/
RUN npm run build:backend


# ── Stage 2: Production runtime ───────────────────────────────────────────────
FROM node:20-alpine AS runner

# Security: install dumb-init for proper PID 1 signal handling
RUN apk add --no-cache dumb-init

ENV NODE_ENV=production
ENV PORT=4000

WORKDIR /app

# Create non-root user before copying files
RUN addgroup --system --gid 1001 capitalforge \
    && adduser --system --uid 1001 --ingroup capitalforge capitalforge

# Copy production package manifests and install production deps only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

# Copy compiled output and Prisma artifacts from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY prisma ./prisma/

# Set ownership
RUN chown -R capitalforge:capitalforge /app

USER capitalforge

EXPOSE 4000

# Health check — hits the /api/health endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:4000/api/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "dist/src/backend/server.js"]
