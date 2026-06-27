#!/usr/bin/env bash
# Render HAProxy/Caddy/Xray/Hysteria templates into infra/.rendered/ (docs 06 §21).
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/../lib/common.sh"
load_secrets

OUT="$REPO_ROOT/infra/.rendered"
mkdir -p "$OUT"

# Map per-node Reality/Hysteria envs into the generic names the templates use.
export REALITY_SERVER_NAME="${FI_REALITY_SERVER_NAME:-www.microsoft.com}"
export REALITY_PRIVATE_KEY="${FI_REALITY_PRIVATE_KEY:-}"
export REALITY_SHORT_ID="${FI_REALITY_SHORT_ID:-}"
export HYSTERIA_TRAFFIC_API_SECRET="${FI_HYSTERIA_TRAFFIC_API_SECRET:-changeme}"
export HYSTERIA_OBFS_PASSWORD="${FI_HYSTERIA_OBFS_PASSWORD:-changeme}"
export HYSTERIA_AUTH_PORT="${HYSTERIA_AUTH_PORT:-18081}"

render_tpl "$REPO_ROOT/infra/haproxy/haproxy.fi.cfg.tpl"     "$OUT/haproxy/haproxy.fi.cfg"
render_tpl "$REPO_ROOT/infra/haproxy/haproxy.bridge.cfg.tpl" "$OUT/haproxy/haproxy.bridge.cfg"
render_tpl "$REPO_ROOT/infra/caddy/Caddyfile.tpl"           "$OUT/caddy/Caddyfile"
render_tpl "$REPO_ROOT/infra/xray/xray-exit.json.tpl"       "$OUT/xray/xray-exit.json"
render_tpl "$REPO_ROOT/infra/xray/xray-bridge.json.tpl"     "$OUT/xray/xray-bridge.json"
render_tpl "$REPO_ROOT/infra/hysteria/hysteria-exit.yaml.tpl"   "$OUT/hysteria/hysteria-exit.yaml"
render_tpl "$REPO_ROOT/infra/hysteria/hysteria-bridge.yaml.tpl" "$OUT/hysteria/hysteria-bridge.yaml"

log "configs rendered into $OUT"
log "NOTE: per-device Xray/Hysteria users are injected live by the node-agent at runtime."
