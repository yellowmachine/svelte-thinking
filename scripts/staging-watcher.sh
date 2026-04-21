#!/bin/bash
# staging-watcher.sh — Poll staging branch, rebuild changed Docker images locally
#
# Mirrors .github/workflows/build-ghcr.yml path-filter logic:
#   - app image       → always rebuilds on any change
#   - typst/scipy/embed/backup → only when their service dir changes
#
# Setup:
#   1. chmod +x /opt/scholio/scripts/staging-watcher.sh
#   2. crontab -e and add:
#
#        REPO_DIR=/opt/scholio
#
#        # Check staging every 10 minutes
#        */10 * * * * /opt/scholio/scripts/staging-watcher.sh >> /var/log/scholio-watcher.log 2>&1

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
REPO_DIR="${REPO_DIR:-/opt/scholio}"

# Load SLACK_WEBHOOK_URL from repo .env (if present)
ENV_FILE="${REPO_DIR}/.env"
if [ -f "$ENV_FILE" ]; then
  SLACK_WEBHOOK_URL=$(grep -E '^SLACK_WEBHOOK_URL=' "$ENV_FILE" | cut -d '=' -f2- | tr -d '"' || true)
fi
SLACK_WEBHOOK_URL="${SLACK_WEBHOOK_URL:-}"

REPO_NAME="scholio"

LOCK_FILE="/tmp/scholio-watcher.lock"

# ── Lock ──────────────────────────────────────────────────────────────────────
if [ -f "$LOCK_FILE" ]; then
  LOCK_PID=$(cat "$LOCK_FILE")
  if kill -0 "$LOCK_PID" 2>/dev/null; then
    echo "[watcher] Already running (pid $LOCK_PID), skipping."
    exit 0
  fi
fi
echo $$ > "$LOCK_FILE"
trap 'rm -f "$LOCK_FILE"' EXIT

# ── Helpers ───────────────────────────────────────────────────────────────────
log() { echo "[watcher] $(date '+%Y-%m-%d %H:%M:%S') $*"; }

notify_slack() {
  [ -z "$SLACK_WEBHOOK_URL" ] && return 0
  curl -s -X POST "$SLACK_WEBHOOK_URL" \
    -H 'Content-Type: application/json' \
    -d "{\"text\":\"$1\"}" || true
}

docker_build() {
  local tag="$1" context="$2" dockerfile="$3"
  log "Building ${tag} ..."
  docker build \
    --platform linux/amd64 \
    -t "$tag" \
    -f "$dockerfile" \
    "$context"
  log "Built ${tag} OK"
}

# ── Check for new commits ─────────────────────────────────────────────────────
cd "$REPO_DIR"
git checkout staging --quiet
git fetch origin staging --quiet

LOCAL_SHA=$(git rev-parse HEAD)
REMOTE_SHA=$(git rev-parse origin/staging)

if [ "$LOCAL_SHA" = "$REMOTE_SHA" ]; then
  log "No changes on staging (${LOCAL_SHA:0:8}). Nothing to do."
  exit 0
fi

log "New commits detected: ${LOCAL_SHA:0:8} → ${REMOTE_SHA:0:8}"

CHANGED_FILES=$(git diff --name-only "$LOCAL_SHA" "$REMOTE_SHA")
log "Changed files:"
echo "$CHANGED_FILES" | sed 's/^/  /'

# ── Pull ──────────────────────────────────────────────────────────────────────
git pull origin staging --quiet
log "Pulled staging."

# ── Detect which services changed (mirrors dorny/paths-filter) ────────────────
changed_typst=false
changed_scipy=false
changed_embed=false
changed_backup=false

while IFS= read -r f; do
  case "$f" in
    typst-service/*)  changed_typst=true ;;
    scipy-service/*)  changed_scipy=true ;;
    embed-service/*)  changed_embed=true ;;
    backup-service/*) changed_backup=true ;;
  esac
done <<< "$CHANGED_FILES"

BUILD_FAILED=false

# ── build-app (always) ────────────────────────────────────────────────────────
log "--- build-app ---"
if docker_build "${REPO_NAME}:latest" "${REPO_DIR}" "${REPO_DIR}/Dockerfile"; then
  :
else
  log "ERROR: build-app failed"
  BUILD_FAILED=true
fi

# ── build-typst ───────────────────────────────────────────────────────────────
if $changed_typst; then
  log "--- build-typst (typst-service/ changed) ---"
  if docker_build "scholio-typst:latest" "${REPO_DIR}/typst-service" "${REPO_DIR}/typst-service/Dockerfile"; then
    :
  else
    log "ERROR: build-typst failed"
    BUILD_FAILED=true
  fi
else
  log "Skipping build-typst (no changes in typst-service/)."
fi

# ── build-scipy ───────────────────────────────────────────────────────────────
if $changed_scipy; then
  log "--- build-scipy (scipy-service/ changed) ---"
  if docker_build "scholio-scipy:latest" "${REPO_DIR}/scipy-service" "${REPO_DIR}/scipy-service/Dockerfile"; then
    :
  else
    log "ERROR: build-scipy failed"
    BUILD_FAILED=true
  fi
else
  log "Skipping build-scipy (no changes in scipy-service/)."
fi

# ── build-embed ───────────────────────────────────────────────────────────────
if $changed_embed; then
  log "--- build-embed (embed-service/ changed) ---"
  if docker_build "scholio-embed:latest" "${REPO_DIR}/embed-service" "${REPO_DIR}/embed-service/Dockerfile"; then
    :
  else
    log "ERROR: build-embed failed"
    BUILD_FAILED=true
  fi
else
  log "Skipping build-embed (no changes in embed-service/)."
fi

# ── build-backup ──────────────────────────────────────────────────────────────
if $changed_backup; then
  log "--- build-backup (backup-service/ changed) ---"
  if docker_build "scholio-backup:latest" "${REPO_DIR}" "${REPO_DIR}/backup-service/Dockerfile"; then
    :
  else
    log "ERROR: build-backup failed"
    BUILD_FAILED=true
  fi
else
  log "Skipping build-backup (no changes in backup-service/)."
fi

# ── Notify ────────────────────────────────────────────────────────────────────
if $BUILD_FAILED; then
  log "One or more builds failed."
  notify_slack "🔴 *Build failed* · \`${REPO_NAME}\` · branch \`staging\` @ \`${REMOTE_SHA:0:8}\`"
  exit 1
fi

notify_slack "✅ *Build OK* · \`${REPO_NAME}\` · branch \`staging\` @ \`${REMOTE_SHA:0:8}\`"
log "Done."
