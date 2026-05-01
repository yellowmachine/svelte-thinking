# ─── Stage 1: deps (all — needed for build) ───────────────────────────────────
FROM oven/bun:1 AS deps
WORKDIR /app

# Build tools needed for native modules (better-sqlite3, etc.)
RUN apt-get update -qq && apt-get install -y --no-install-recommends \
    python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# ─── Stage 2: prod-deps (runtime only, no devDependencies) ────────────────────
FROM oven/bun:1 AS prod-deps
WORKDIR /app

RUN apt-get update -qq && apt-get install -y --no-install-recommends \
    python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production --ignore-scripts

# ─── Stage 3: build ───────────────────────────────────────────────────────────
FROM oven/bun:1 AS build
WORKDIR /app

# Build flags (baked in at build time via --build-arg)
ARG PUBLIC_SENTRY_DSN=""
# Set ENABLE_SW=true to include the Service Worker / offline support.
# Default is false — no SW, no offline, no interference with online UX.
ARG ENABLE_SW=false

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Minimal runtime-independent vars so vite build doesn't fail.
# Real values are injected at container startup via docker-compose env.
ENV NODE_ENV=production
ENV ORIGIN=https://placeholder.local
ENV DATABASE_URL=postgres://placeholder
ENV PUBLIC_SENTRY_DSN=${PUBLIC_SENTRY_DSN}
ENV ENABLE_SW=${ENABLE_SW}

RUN BETTER_AUTH_SECRET=build-placeholder SCIPY_API_KEY=build-placeholder bun run build

# ─── Stage 4: prod ────────────────────────────────────────────────────────────
# svelte-adapter-bun genera un servidor que corre con Bun, no con Node.
FROM oven/bun:1 AS prod
WORKDIR /app

ENV NODE_ENV=production

# Output del build, migraciones SQL y scripts
COPY --from=build /app/build ./build
COPY --from=build /app/package.json ./
COPY --from=build /app/drizzle ./drizzle
COPY scripts/entrypoint.sh ./entrypoint.sh
COPY scripts/migrate.mjs ./scripts/migrate.mjs

# Deps de runtime únicamente (sin devDependencies)
COPY --from=prod-deps /app/node_modules ./node_modules

RUN chmod +x entrypoint.sh

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD bun -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

EXPOSE 3000

CMD ["sh", "entrypoint.sh"]
