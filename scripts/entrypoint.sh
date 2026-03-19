#!/bin/sh
set -e

# 1. Ejecutar migraciones (como superuser via MIGRATION_DATABASE_URL)
echo "→ Ejecutando migraciones..."
bun scripts/migrate.mjs

# 2. Arrancar la app (como app_user via DATABASE_URL)
echo "→ Iniciando servidor..."
exec bun run build/index.js
