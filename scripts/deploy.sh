#!/usr/bin/env bash
# Deploy the stack on the target server.
#
# Usage (run on the server, from the project root):
#   ./scripts/deploy.sh           # pull latest, rebuild, restart
#   FRESH=1 ./scripts/deploy.sh   # also wipe the db volume (DESTRUCTIVE)
#
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ ! -f .env ]]; then
  echo "ERROR: .env is missing. Copy .env.production.example to .env and fill it in." >&2
  exit 1
fi

# Required vars sanity-check (matches docker-compose's :? guards but with a nicer message)
missing=()
for var in DB_PASSWORD JWT_SECRET; do
  value="$(grep -E "^${var}=" .env | tail -n1 | cut -d= -f2- || true)"
  if [[ -z "${value}" || "${value}" == "__CHANGE_ME__" ]]; then
    missing+=("${var}")
  fi
done
if (( ${#missing[@]} > 0 )); then
  echo "ERROR: the following .env variables must be set to real values: ${missing[*]}" >&2
  exit 1
fi

if [[ -d .git ]]; then
  echo "==> git pull"
  git pull --ff-only
fi

if [[ "${FRESH:-0}" == "1" ]]; then
  echo "==> FRESH=1 — bringing stack down and removing the db volume"
  docker compose down -v
fi

echo "==> building images"
docker compose build --pull

echo "==> bringing up the stack"
docker compose up -d --remove-orphans

echo "==> waiting for /api/ready"
deadline=$(( $(date +%s) + 90 ))
while (( $(date +%s) < deadline )); do
  if curl -fsS http://127.0.0.1/api/ready >/dev/null 2>&1; then
    echo "==> API is ready"
    exit 0
  fi
  sleep 2
done

echo "ERROR: API did not become ready in 90s — recent logs:" >&2
docker compose logs --tail=80 api web db >&2
exit 1
