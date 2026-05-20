# ── Stage 1: Build ────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

RUN npm install -g pnpm@9

WORKDIR /app

# Copy workspace manifests for layer caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/types/package.json ./packages/types/
COPY packages/db/package.json ./packages/db/
COPY packages/api/package.json ./packages/api/
COPY apps/web/package.json ./apps/web/

RUN pnpm install --frozen-lockfile

# Copy source (only what we need to build the API)
COPY packages/types ./packages/types
COPY packages/db ./packages/db
COPY packages/api ./packages/api
COPY tsconfig.base.json ./

# Build packages in dependency order
RUN pnpm --filter @alpaca/types build
RUN pnpm --filter @alpaca/db build
RUN pnpm --filter @alpaca/api build

# ── Stage 2: Production image ──────────────────────────────────────────────
FROM node:22-alpine AS runner

RUN npm install -g pnpm@9

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/types/package.json ./packages/types/
COPY packages/db/package.json ./packages/db/
COPY packages/api/package.json ./packages/api/
COPY apps/web/package.json ./apps/web/

# Install all deps (tsx is needed for migrations)
RUN pnpm install --frozen-lockfile

# Copy built output
COPY --from=builder /app/packages/types/dist ./packages/types/dist
COPY --from=builder /app/packages/api/dist ./packages/api/dist

# Copy DB migration source files (tsx runs .ts directly)
COPY packages/db/src/migrations ./packages/db/src/migrations
COPY packages/db/src/migrate.ts ./packages/db/src/migrate.ts
COPY packages/db/tsconfig.json ./packages/db/
COPY tsconfig.base.json ./

EXPOSE 4000

# Use sh -c so cd works; run migrations from packages/db then start API
CMD ["sh", "-c", "cd /app/packages/db && node --import tsx/esm src/migrate.ts up && cd /app && node packages/api/dist/server.js"]
