# Ghost Pepe VPN

Monorepo for a Telegram Stars VPN product with:

- FI control-plane and exit node
- DE exit node
- Yandex Cloud whitelist bridge
- VLESS+Reality and Hysteria2 profiles
- Telegram bot, subscription page, admin UI, API, and node-agent

## Quick Start

```bash
cp .env.example .env.local
npm install
make dev
```

Useful commands:

```bash
make typecheck
make test
make generate-configs
make smoke-test
```

## Layout

- `apps/api` - control-plane API
- `apps/bot` - Telegram bot and Stars payment flow
- `apps/sub-page` - subscription import page
- `apps/admin-web` - admin panel
- `apps/node-agent` - node heartbeat, stats and config rendering
- `packages/shared` - shared constants, profile matrix and helpers
- `packages/db` - Prisma schema and seed
- `packages/vpn-config` - client/server config builders
- `infra` - compose files, host templates and node inventory
- `scripts` - deployment, config rendering, backup/restore and smoke checks

## Deployment

Fill `.env.production` and host variables (`FI_HOST`, `DE_HOST`, `YC_HOST`, users and key paths), then:

```bash
make generate-configs
make deploy-fi
make deploy-de
make deploy-yandex
```

See `docs/runbooks` for add-node, backup/restore, incident response, and whitelist bridge verification.
