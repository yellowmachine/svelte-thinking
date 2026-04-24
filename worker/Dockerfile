# ─── Stage 1: prod deps ───────────────────────────────────────────────────────
FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# ─── Stage 2: runtime ─────────────────────────────────────────────────────────
FROM oven/bun:1 AS prod
WORKDIR /app

ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./

# Worker entrypoint
COPY worker/couch-sync.ts ./worker/couch-sync.ts

# Schema files the worker imports at runtime (no SvelteKit aliases, plain paths)
COPY src/lib/server/db/schemas/documents.schema.ts ./src/lib/server/db/schemas/documents.schema.ts
COPY src/lib/server/db/schemas/projects.schema.ts  ./src/lib/server/db/schemas/projects.schema.ts
COPY src/lib/server/db/scholio-schema.ts            ./src/lib/server/db/scholio-schema.ts

# Sequence file persisted via volume mount in production
VOLUME /app/worker

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD pgrep -f couch-sync || exit 1

CMD ["bun", "run", "worker/couch-sync.ts"]
