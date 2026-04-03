#!/bin/sh
set -e

# 1. Ejecutar migraciones (como superuser via MIGRATION_DATABASE_URL)
echo "→ APP_DB_USER=$APP_DB_USER"
echo "→ NODE_ENV=$NODE_ENV"
echo "→ ORIGIN=$ORIGIN"
echo "→ DATABASE_URL=$DATABASE_URL"
echo "→ REDIS_URL=$REDIS_URL"
echo "→ Ejecutando migraciones..."
bun scripts/migrate.mjs

# 2. Arrancar la app (como app_user via DATABASE_URL)
echo "→ Iniciando servidor..."
exec bun run build/index.js
