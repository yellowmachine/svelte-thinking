#!/bin/sh
set -e

echo "[backup] Container starting"
echo "[backup] POSTGRES_HOST=${POSTGRES_HOST}"
echo "[backup] POSTGRES_USER=${POSTGRES_USER}"
echo "[backup] POSTGRES_DB=${POSTGRES_DB}"
echo "[backup] R2_ENDPOINT=${R2_ENDPOINT}"
echo "[backup] R2_BUCKET=${R2_BUCKET}"
echo "[backup] BACKUP_RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-30}"

# Verify required env vars
for var in POSTGRES_HOST POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB R2_ENDPOINT R2_BUCKET R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY; do
    eval val=\$$var
    if [ -z "$val" ]; then
        echo "[backup] ERROR: $var is not set"
        exit 1
    fi
done

echo "[backup] All required env vars present"
echo "[backup] pg_dump version: $(pg_dump --version)"
echo "[backup] aws version: $(aws --version 2>&1)"
echo "[backup] Cron schedule: $(cat /var/spool/cron/crontabs/root)"
echo "[backup] Starting crond..."

exec crond -f -l 6
