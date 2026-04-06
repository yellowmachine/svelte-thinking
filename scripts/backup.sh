#!/bin/sh
# Daily PostgreSQL → Cloudflare R2 backup
# Runs inside the backup container via crond (BusyBox).
# Env vars required: POSTGRES_HOST, POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB,
#                    R2_BUCKET, R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
# Optional: BACKUP_RETENTION_DAYS (default: 30)

set -e

RETENTION=${BACKUP_RETENTION_DAYS:-30}
TIMESTAMP=$(date -u +"%Y-%m-%dT%H-%M-%SZ")
FILENAME="scholio_${TIMESTAMP}.sql.gz"
TMPFILE="/tmp/${FILENAME}"

echo "[backup] Starting dump: ${FILENAME}"

PGPASSWORD="${POSTGRES_PASSWORD}" PGSSLMODE=disable pg_dump \
  -h "${POSTGRES_HOST}" \
  -U "${POSTGRES_USER}" \
  -d "${POSTGRES_DB}" \
  --no-owner \
  --no-acl \
  | gzip > "${TMPFILE}"

echo "[backup] Upload to R2: s3://${R2_BUCKET}/${FILENAME}"

AWS_ACCESS_KEY_ID="${R2_ACCESS_KEY_ID}" \
AWS_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY}" \
aws s3 cp "${TMPFILE}" "s3://${R2_BUCKET}/${FILENAME}" \
  --endpoint-url "${R2_ENDPOINT}" \
  --region auto

rm -f "${TMPFILE}"
echo "[backup] Upload complete"

# Retention: delete backups older than RETENTION days
echo "[backup] Pruning backups older than ${RETENTION} days"

CUTOFF=$(date -u -d "${RETENTION} days ago" +"%Y-%m-%dT%H-%M-%SZ" 2>/dev/null \
  || date -u -v-${RETENTION}d +"%Y-%m-%dT%H-%M-%SZ")  # macOS fallback (unused in prod)

AWS_ACCESS_KEY_ID="${R2_ACCESS_KEY_ID}" \
AWS_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY}" \
aws s3 ls "s3://${R2_BUCKET}/" \
  --endpoint-url "${R2_ENDPOINT}" \
  --region auto \
  | awk '{print $4}' \
  | while read -r key; do
      # Extract timestamp from filename: scholio_YYYY-MM-DDTHH-MM-SSZ.sql.gz
      filedate=$(echo "${key}" | sed 's/scholio_//;s/\.sql\.gz//')
      if [ "${filedate}" \< "${CUTOFF}" ]; then
        echo "[backup] Deleting old backup: ${key}"
        AWS_ACCESS_KEY_ID="${R2_ACCESS_KEY_ID}" \
        AWS_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY}" \
        aws s3 rm "s3://${R2_BUCKET}/${key}" \
          --endpoint-url "${R2_ENDPOINT}" \
          --region auto
      fi
    done

echo "[backup] Done"
