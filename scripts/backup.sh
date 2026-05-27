#!/usr/bin/env bash
# Dump the Postgres database to ./backups/<timestamp>.sql.gz
#
# Usage:
#   ./scripts/backup.sh
#   BACKUP_DIR=/var/backups/infra ./scripts/backup.sh
#
set -euo pipefail

cd "$(dirname "$0")/.."

BACKUP_DIR="${BACKUP_DIR:-./backups}"
mkdir -p "${BACKUP_DIR}"

ts="$(date +%Y%m%d-%H%M%S)"
out="${BACKUP_DIR}/db-${ts}.sql.gz"

# Read DB creds from .env so we don't duplicate them.
# shellcheck disable=SC1091
set -a; source .env; set +a

docker compose exec -T db pg_dump \
  -U "${DB_USER:-postgres}" \
  -d "${DB_NAME:-infrastructure_safety}" \
  | gzip -9 > "${out}"

echo "wrote ${out} ($(du -h "${out}" | cut -f1))"

# Prune older than 14 days
find "${BACKUP_DIR}" -name 'db-*.sql.gz' -type f -mtime +14 -print -delete
