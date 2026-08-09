#!/bin/sh
set -e

bun scripts/migrate.mjs
exec bun run build/index.js
