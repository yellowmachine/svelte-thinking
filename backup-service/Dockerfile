FROM alpine:3.20

RUN apk add --no-cache \
    postgresql-client \
    aws-cli \
    gzip \
    tzdata

COPY scripts/backup.sh /scripts/backup.sh
RUN chmod +x /scripts/backup.sh

# Install crontab for root
COPY scripts/backup.crontab /var/spool/cron/crontabs/root
RUN chmod 600 /var/spool/cron/crontabs/root

COPY backup-service/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
