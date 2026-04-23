#!/bin/bash
# restart-stack.sh — Restart the scholio prod docker compose stack and wait for health.
# Called by both scholio and librarian staging watchers after a successful build.

set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/scholio}"
HEALTH_URL="${HEALTH_URL:-https://scholio.app/api/health}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-120}"  # seconds to wait for app to be healthy
HEALTH_INTERVAL=5                        # seconds between retries

log() { echo "[restart-stack] $(date '+%Y-%m-%d %H:%M:%S') $*"; }

log "Running docker compose up -d in ${REPO_DIR} ..."
docker compose -f "${REPO_DIR}/docker-compose.prod.yml" up -d
log "Stack started. Waiting for ${HEALTH_URL} ..."

elapsed=0
while [ "$elapsed" -lt "$HEALTH_TIMEOUT" ]; do
  status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$HEALTH_URL" || echo "000")
  if [ "$status" = "200" ]; then
    log "Health check passed (${elapsed}s)."
    exit 0
  fi
  log "Health check: HTTP ${status} — retrying in ${HEALTH_INTERVAL}s (${elapsed}/${HEALTH_TIMEOUT}s)"
  sleep "$HEALTH_INTERVAL"
  elapsed=$((elapsed + HEALTH_INTERVAL))
done

log "ERROR: Health check timed out after ${HEALTH_TIMEOUT}s."
exit 1
