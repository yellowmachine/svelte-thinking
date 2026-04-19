#!/bin/bash
# Host metrics report → Slack
# Runs directly on the host (not inside Docker).
#
# Setup:
#   1. chmod +x /opt/scholio/scripts/host-metrics.sh
#   2. crontab -e and add:
#
#        SLACK_WEBHOOK_URL=https://hooks.slack.com/...
#
#        # Daily host metrics at 07:00
#        0 7 * * * /opt/scholio/scripts/host-metrics.sh
#
#        # Weekly Docker image prune (Sunday 02:00) — prevents disk bloat
#        0 2 * * 0 docker image prune -f >> /var/log/docker-prune.log 2>&1

SLACK_WEBHOOK_URL="${SLACK_WEBHOOK_URL:-}"

if [ -z "$SLACK_WEBHOOK_URL" ]; then
  echo "[host-metrics] SLACK_WEBHOOK_URL not set, exiting." >&2
  exit 1
fi

notify_slack() {
  curl -s -X POST "$SLACK_WEBHOOK_URL" \
    -H 'Content-Type: application/json' \
    -d "{\"text\":\"$1\"}" || true
}

# ── Disk (host) ───────────────────────────────────────────────────────────────
DISK_LINE=$(df -h / | awk 'NR==2 {print $3, $2, $5}')
DISK_USED=$(echo "$DISK_LINE" | awk '{print $1}')
DISK_TOTAL=$(echo "$DISK_LINE" | awk '{print $2}')
DISK_PCT=$(echo "$DISK_LINE" | awk '{print $3}')

DISK_NUM=$(echo "$DISK_PCT" | tr -d '%')
if [ "$DISK_NUM" -ge 85 ]; then
  DISK_ICON="🔴"
elif [ "$DISK_NUM" -ge 70 ]; then
  DISK_ICON="🟡"
else
  DISK_ICON="🟢"
fi

# ── Memory ────────────────────────────────────────────────────────────────────
MEM_TOTAL=$(free -h | awk '/^Mem:/ {print $2}')
MEM_USED=$(free -h  | awk '/^Mem:/ {print $3}')
MEM_PCT=$(free      | awk '/^Mem:/ {printf "%.0f", $3/$2*100}')

if [ "$MEM_PCT" -ge 85 ]; then
  MEM_ICON="🔴"
elif [ "$MEM_PCT" -ge 70 ]; then
  MEM_ICON="🟡"
else
  MEM_ICON="🟢"
fi

# ── Docker images ─────────────────────────────────────────────────────────────
DOCKER_IMAGES=$(docker images --format '{{.Repository}}:{{.Tag}}' 2>/dev/null | wc -l)
DOCKER_SIZE=$(docker system df --format '{{.Size}}' 2>/dev/null | head -1 || echo "n/a")
DOCKER_DANGLING=$(docker images -f "dangling=true" -q 2>/dev/null | wc -l)

if [ "$DOCKER_DANGLING" -gt 5 ]; then
  DOCKER_ICON="🟡"
else
  DOCKER_ICON="🟢"
fi

# ── Compose ───────────────────────────────────────────────────────────────────
MSG="📊 *Daily host report* — $(date '+%Y-%m-%d %H:%M')\n"
MSG="${MSG}${DISK_ICON} *Disk:* ${DISK_USED} / ${DISK_TOTAL} (${DISK_PCT})\n"
MSG="${MSG}${MEM_ICON} *Memory:* ${MEM_USED} / ${MEM_TOTAL} (${MEM_PCT}%)\n"
MSG="${MSG}${DOCKER_ICON} *Docker images:* ${DOCKER_IMAGES} total"
if [ "$DOCKER_DANGLING" -gt 0 ]; then
  MSG="${MSG} · ${DOCKER_DANGLING} dangling ⚠️  \`docker image prune\`"
fi

notify_slack "$MSG"
