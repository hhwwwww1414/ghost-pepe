# Ghost Pepe VPN — Makefile
# All deploy commands read connection details from infra/secrets/secrets.local.md
# (or environment). See README.md.

SHELL := /bin/bash
COMPOSE_DEV := docker compose -f infra/compose/docker-compose.dev.yml
ENV_FILE ?= .env.local

.DEFAULT_GOAL := help

.PHONY: help
help: ## Show this help
	@grep -E '^[a-zA-Z0-9_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ───────────────────────────── Bootstrap / dev ─────────────────────────────

.PHONY: install
install: ## Install all workspace dependencies
	npm install

.PHONY: bootstrap
bootstrap: ## Full local bootstrap: env file, deps, db up, generate, migrate, seed
	@test -f $(ENV_FILE) || cp .env.example $(ENV_FILE)
	npm install
	$(COMPOSE_DEV) up -d postgres redis
	@echo "Waiting for postgres..." && sleep 5
	npm run db:generate
	npm run db:migrate
	npm run db:seed
	@echo "Bootstrap done. Run 'make dev'."

.PHONY: dev
dev: ## Start full local stack via docker compose (db, redis, api, bot, sub, admin, mock agents)
	@test -f $(ENV_FILE) || cp .env.example $(ENV_FILE)
	$(COMPOSE_DEV) up --build

.PHONY: dev-bg
dev-bg: ## Start full local stack in background
	$(COMPOSE_DEV) up -d --build

.PHONY: down
down: ## Stop local stack
	$(COMPOSE_DEV) down

.PHONY: logs
logs: ## Tail logs of the local stack
	$(COMPOSE_DEV) logs -f --tail=100

# ───────────────────────────── Database ─────────────────────────────

.PHONY: db-migrate
db-migrate: ## Run prisma migrations (deploy)
	npm run db:migrate

.PHONY: db-migrate-dev
db-migrate-dev: ## Create + apply a new dev migration (use NAME=...)
	npm -w @ghostpepe/db run migrate:dev -- --name $(or $(NAME),change)

.PHONY: db-seed
db-seed: ## Seed plans, nodes, node_profiles and bootstrap admin
	npm run db:seed

.PHONY: db-generate
db-generate: ## Generate prisma client
	npm run db:generate

.PHONY: backup-db
backup-db: ## pg_dump the database to backups/
	bash scripts/backup-postgres.sh

.PHONY: restore-db
restore-db: ## Restore from BACKUP_FILE=...
	bash scripts/restore-postgres.sh "$(BACKUP_FILE)"

# ───────────────────────────── Quality ─────────────────────────────

.PHONY: typecheck
typecheck: ## TypeScript typecheck across the monorepo
	npm run typecheck

.PHONY: build
build: ## Build (typecheck) all workspaces + admin/sub frontends
	npm run typecheck
	npm -w @ghostpepe/sub-page run build
	npm -w @ghostpepe/admin-web run build

.PHONY: test
test: ## Run unit/acceptance tests
	npm test

.PHONY: smoke-test
smoke-test: ## Run smoke tests against a running stack
	bash scripts/smoke-test/smoke-test.sh

# ───────────────────────────── Config generation ─────────────────────────────

.PHONY: generate-configs
generate-configs: ## Render Xray/Hysteria/HAProxy/Caddy configs from nodes + templates
	bash scripts/generate-configs/generate-configs.sh

.PHONY: render-configs
render-configs: generate-configs ## Alias for generate-configs

# ───────────────────────────── Nodes ─────────────────────────────

.PHONY: add-node
add-node: ## Register a node from infra/nodes/nodes.local.yml (use NODE_CODE=...)
	bash scripts/add-node/add-node.sh "$(NODE_CODE)"

# ───────────────────────────── Deploy ─────────────────────────────

.PHONY: deploy-fi
deploy-fi: ## Deploy control-plane + exit to FI
	bash scripts/deploy-fi/deploy-fi.sh

.PHONY: deploy-de
deploy-de: ## Deploy exit node to DE
	bash scripts/deploy-de/deploy-de.sh

.PHONY: deploy-yandex
deploy-yandex: ## Deploy whitelist bridge to Yandex Cloud
	bash scripts/deploy-yandex/deploy-yandex.sh

.PHONY: deploy-all
deploy-all: deploy-fi deploy-de deploy-yandex ## Deploy FI, DE and Yandex bridge

.PHONY: deploy-node
deploy-node: ## Deploy a single node by NODE_CODE=...
	bash scripts/deploy-fi/deploy-node.sh "$(NODE_CODE)"
