# Deploy runbook

## Prerequisites

- `infra/secrets/secrets.local.md` filled (SSH, domains, secrets).
- DNS records pointed (see docs/architecture/06 §4).
- Reality keys + Hysteria secrets generated (infra/xray/reality-keygen.md).

## Order

```bash
make deploy-fi        # control-plane + exit (db migrate, services, health)
make deploy-de        # exit node
make deploy-yandex    # whitelist bridge
# or
make deploy-all
```

## What each does

- **deploy-fi**: checks SSH, creates dirs, uploads `.env.production` + compose +
  HAProxy/Caddy/Xray/Hysteria configs, runs `prisma migrate deploy`, starts
  services, checks `/health`, prints URLs.
- **deploy-de / deploy-yandex**: install packages, upload node-agent + configs,
  open ports, register node heartbeat.

If a server fails, the script prints the error and stops — it does not hide the
failure (docs 06 §13/§27).

## Health checks after deploy

```bash
curl https://api.<domain>/health
# FI/DE/YC show online in Admin → Серверы
```
