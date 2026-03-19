# ─── Stage 1: deps ────────────────────────────────────────────────────────────
FROM oven/bun:1 AS deps
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# ─── Stage 2: build ───────────────────────────────────────────────────────────
FROM oven/bun:1 AS build
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Variables mínimas para que vite build no falle.
# Los valores reales se inyectan en runtime.
ENV NODE_ENV=production
ENV ORIGIN=https://placeholder.local
ENV BETTER_AUTH_SECRET=build-placeholder
ENV DATABASE_URL=postgres://placeholder

RUN bun run build

# ─── Stage 3: prod ────────────────────────────────────────────────────────────
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

# Deps de runtime (postgres, drizzle-orm, etc.)
COPY --from=deps /app/node_modules ./node_modules

RUN chmod +x entrypoint.sh

HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/ || exit 1

EXPOSE 3000

CMD ["sh", "entrypoint.sh"]
