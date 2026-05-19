# ── Stage 1: Build ────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

RUN npm install -g pnpm@9

WORKDIR /app

# Copy workspace manifests for layer caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/types/package.json ./packages/types/
COPY packages/db/package.json ./packages/db/
COPY packages/api/package.json ./packages/api/

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
FROM node:22-alpine AS runner

RUN npm install -g pnpm@9

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/types/package.json ./packages/types/
COPY packages/db/package.json ./packages/db/
COPY packages/api/package.json ./packages/api/

# Install all deps (including devDeps for tsx which runs migrations)
RUN pnpm install --frozen-lockfile

# Copy built API and types output
COPY --from=builder /app/packages/types/dist ./packages/types/dist
COPY --from=builder /app/packages/api/dist ./packages/api/dist

# Copy DB source (tsx runs migrations directly from .ts files)
COPY packages/db/src ./packages/db/src
COPY packages/db/tsconfig.json ./packages/db/

COPY tsconfig.base.json ./

EXPOSE 4000

# Run migrations via tsx then start the API
CMD ["sh", "-c", "node --import tsx/esm packages/db/src/migrate.ts up && node packages/api/dist/server.js"]
