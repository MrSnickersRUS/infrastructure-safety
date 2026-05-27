# Deploy

Production target: a single VPS running Docker. The stack is three services
defined in `docker-compose.yml`:

- `db`  — Postgres 15 with a named volume.
- `api` — Node 20 Express API behind helmet + rate-limit, auto-seeds from
  `db.json` on first start when the table is empty.
- `web` — nginx serving the built Vite SPA and reverse-proxying `/api/` to
  `api:3001`.

Public surface: only `:80` (the `web` container). Postgres is bound to
`127.0.0.1` on the host so it isn't reachable from the internet.

## First-time setup on a fresh server

```bash
# 1) Install docker (Ubuntu example)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER" && newgrp docker

# 2) Free :80 — disable the host nginx if present
sudo systemctl disable --now nginx || true

# 3) Get the code
git clone <repo> /opt/infrastructure-safety
cd /opt/infrastructure-safety

# 4) Create .env with strong secrets
cp .env.production.example .env
sed -i "s|__CHANGE_ME__|$(openssl rand -hex 24)|" .env   # for DB_PASSWORD
# then regenerate JWT_SECRET as well:
JWT="$(openssl rand -hex 48)" sed -i "s|^JWT_SECRET=.*|JWT_SECRET=${JWT}|" .env
chmod 600 .env

# 5) Deploy
chmod +x scripts/*.sh
./scripts/deploy.sh
```

After a successful deploy:

- `curl -fsS http://<server>/`            → SPA
- `curl -fsS http://<server>/api/health`  → `{"status":"ok"}`
- `curl -fsS http://<server>/api/ready`   → `{"status":"ready"}` (also pings DB)

## Day-to-day commands

```bash
./scripts/deploy.sh              # pull + rebuild + restart + wait /api/ready
./scripts/backup.sh              # dump db to ./backups/db-<ts>.sql.gz (prunes >14d)
./scripts/restore.sh <file.gz>   # restore from a dump
docker compose logs -f --tail=200 api    # tail api logs
docker compose logs -f --tail=200 web    # tail nginx logs
docker compose ps                # container/health status
```

## Common operations

**Reset the DB and reseed from db.json:**

```bash
FRESH=1 ./scripts/deploy.sh
```

**Create the first admin user (the API has no privileged role yet — registration
is open).** Hit the register endpoint once:

```bash
curl -fsS -X POST http://127.0.0.1/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"name":"admin","email":"admin@example.com","password":"<strong-pass>"}'
```

When you have user roles, restrict `/api/auth/register` and bootstrap admins
via a separate script.

**Rotate JWT_SECRET:** edit `.env`, then `docker compose up -d api`. All
existing tokens become invalid — users will need to log in again. That's the
desired effect.

**Cron a nightly backup:**

```cron
30 3 * * * cd /opt/infrastructure-safety && ./scripts/backup.sh >> /var/log/infra-backup.log 2>&1
```

## Troubleshooting

| Symptom                              | Check                                                                 |
| ------------------------------------ | --------------------------------------------------------------------- |
| 502 from nginx                       | `docker compose ps` — is `api` healthy? `docker compose logs api`     |
| 500 from nginx with rewrite loop     | `dist/` is empty — `Dockerfile.web` build failed. Rebuild with logs.  |
| `/api/auth/login` returns 429        | Rate limit (20 req / 15 min per IP). Wait or raise in `server/index.js`. |
| API restarts on boot                 | `.env` missing `JWT_SECRET` or `DB_PASSWORD` — compose's `:?` guard fires. |
| Port 80 already in use               | `sudo systemctl disable --now nginx` (or move `WEB_PORT` in `.env`).  |
