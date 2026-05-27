#!/usr/bin/env bash
# Restore a backup into the running Postgres container.
#
# Usage:
#   ./scripts/restore.sh backups/db-20260101-120000.sql.gz
#
set -euo pipefail

cd "$(dirname "$0")/.."

file="${1:-}"
if [[ -z "${file}" || ! -f "${file}" ]]; then
  echo "Usage: $0 <path-to-dump.sql.gz>" >&2
  exit 1
fi

# shellcheck disable=SC1091
set -a; source .env; set +a

echo "==> restoring ${file} into ${DB_NAME:-infrastructure_safety}"
echo "==> THIS WILL DROP EXISTING DATA. Press Ctrl+C within 5s to abort."
sleep 5

gunzip -c "${file}" | docker compose exec -T db psql \
  -U "${DB_USER:-postgres}" \
  -d "${DB_NAME:-infrastructure_safety}" \
  -v ON_ERROR_STOP=1

echo "==> done"
