# ── Stage 1: Build ────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

# Install pnpm
RUN npm install -g pnpm@9

WORKDIR /app

# Copy workspace manifests first for better layer caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/types/package.json ./packages/types/
COPY packages/db/package.json ./packages/db/
COPY packages/api/package.json ./packages/api/

# Install all dependencies
RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/types ./packages/types
COPY packages/db ./packages/db
COPY packages/api ./packages/api
COPY tsconfig.base.json ./

# Build packages in dependency order
RUN pnpm --filter @alpaca/types build
RUN pnpm --filter @alpaca/db build
RUN pnpm --filter @alpaca/api build

# ── Stage 2: Production image ──────────────────────────────────────────────
FROM node:20-alpine AS runner

RUN npm install -g pnpm@9

WORKDIR /app

# Copy workspace manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/types/package.json ./packages/types/
COPY packages/db/package.json ./packages/db/
COPY packages/api/package.json ./packages/api/

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy built output from builder
COPY --from=builder /app/packages/types/dist ./packages/types/dist
COPY --from=builder /app/packages/db/dist ./packages/db/dist
COPY --from=builder /app/packages/api/dist ./packages/api/dist

# Copy DB migrations (needed at runtime for migrate command)
COPY packages/db/src/migrations ./packages/db/src/migrations

EXPOSE 4000

CMD ["node", "packages/api/dist/server.js"]
