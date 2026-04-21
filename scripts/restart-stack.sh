#!/bin/bash
# restart-stack.sh — Restart the scholio prod docker compose stack.
# Called by both scholio and librarian staging watchers after a successful build.

set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/scholio}"

log() { echo "[restart-stack] $(date '+%Y-%m-%d %H:%M:%S') $*"; }

log "Running docker compose up -d in ${REPO_DIR} ..."
docker compose -f "${REPO_DIR}/docker-compose.prod.yml" up -d
log "Done."
