FROM alpine:3.20

RUN apk add --no-cache \
    postgresql16-client \
    aws-cli \
    gzip

COPY scripts/backup.sh /scripts/backup.sh
RUN chmod +x /scripts/backup.sh

# Install crontab for root
COPY scripts/backup.crontab /var/spool/cron/crontabs/root

CMD ["crond", "-f", "-l", "6"]
