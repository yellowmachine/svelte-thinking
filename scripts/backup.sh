#!/bin/sh
# Daily PostgreSQL → AWS S3 backup
# Runs inside the backup container via supercronic.
# Env vars required: POSTGRES_HOST, POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB,
#                    S3_BUCKET, AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
# Optional: BACKUP_RETENTION_DAYS (default: 30)

set -e

RETENTION=${BACKUP_RETENTION_DAYS:-30}
TIMESTAMP=$(date -u +"%Y-%m-%dT%H-%M-%SZ")
FILENAME="scholio_${TIMESTAMP}.sql.gz"
TMPFILE="/tmp/${FILENAME}"

echo "[backup] Starting dump: ${FILENAME}"

PGPASSWORD="${POSTGRES_PASSWORD}" pg_dump \
  -h "${POSTGRES_HOST}" \
  -U "${POSTGRES_USER}" \
  -d "${POSTGRES_DB}" \
  --no-owner \
  --no-acl \
  | gzip > "${TMPFILE}"

echo "[backup] Upload to S3: s3://${S3_BUCKET}/${FILENAME}"

AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID}" \
AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY}" \
AWS_DEFAULT_REGION="${AWS_REGION}" \
aws s3 cp "${TMPFILE}" "s3://${S3_BUCKET}/${FILENAME}"

rm -f "${TMPFILE}"
echo "[backup] Upload complete"

# Retention: delete backups older than RETENTION days
echo "[backup] Pruning backups older than ${RETENTION} days"

CUTOFF=$(date -u -d "${RETENTION} days ago" +"%Y-%m-%dT%H-%M-%SZ" 2>/dev/null \
  || date -u -v-${RETENTION}d +"%Y-%m-%dT%H-%M-%SZ")  # macOS fallback (unused in prod)

AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID}" \
AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY}" \
AWS_DEFAULT_REGION="${AWS_REGION}" \
aws s3 ls "s3://${S3_BUCKET}/" \
  | awk '{print $4}' \
  | while read -r key; do
      filedate=$(echo "${key}" | sed 's/scholio_//;s/\.sql\.gz//')
      if [ "${filedate}" \< "${CUTOFF}" ]; then
        echo "[backup] Deleting old backup: ${key}"
        AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID}" \
        AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY}" \
        AWS_DEFAULT_REGION="${AWS_REGION}" \
        aws s3 rm "s3://${S3_BUCKET}/${key}"
      fi
    done

echo "[backup] Done"
