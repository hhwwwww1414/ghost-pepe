#!/usr/bin/env bash
# Minimal smoke tests for a running local or production-like stack.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/../lib/common.sh"
load_secrets

API="${API_BASE_URL:-http://localhost:8080}"
SUB="${PUBLIC_BASE_URL:-http://localhost:8082}"

log "checking API health at $API/health"
curl -fsS "$API/health" >/dev/null

log "checking subscription page health at $SUB/health"
curl -fsS "$SUB/health" >/dev/null

log "smoke test passed"
