#!/usr/bin/env bash
# Deploy Yandex Cloud whitelist bridge node.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/../lib/common.sh"
load_secrets

require_var YC_HOST
require_var YC_USER
: "${YC_PORT:=22}"
SSH_OPTS=(-p "$YC_PORT")
[ -n "${YC_SSH_KEY_PATH:-}" ] && SSH_OPTS+=(-i "$YC_SSH_KEY_PATH")
REMOTE="$YC_USER@$YC_HOST"
REMOTE_DIR=/opt/ghostpepe

log "1/7 checking SSH access to $REMOTE"
ssh "${SSH_OPTS[@]}" -o BatchMode=yes -o ConnectTimeout=10 "$REMOTE" 'echo ok' >/dev/null \
  || die "cannot SSH to $REMOTE"

log "2/7 rendering configs"
bash "$REPO_ROOT/scripts/generate-configs/generate-configs.sh"

log "3/7 creating remote dirs"
ssh "${SSH_OPTS[@]}" "$REMOTE" "mkdir -p $REMOTE_DIR /etc/ghostpepe/{xray,hysteria,certs}"

log "4/7 uploading repo"
rsync -az -e "ssh ${SSH_OPTS[*]}" \
  --exclude node_modules --exclude .git --exclude 'secrets/' --exclude 'CONNECT.md' \
  "$REPO_ROOT/" "$REMOTE:$REMOTE_DIR/"

log "5/7 uploading .env.production and rendered configs"
[ -f "$REPO_ROOT/.env.production" ] && scp "${SSH_OPTS[@]/-p/-P}" "$REPO_ROOT/.env.production" "$REMOTE:$REMOTE_DIR/.env.production" || warn ".env.production missing"
rsync -az -e "ssh ${SSH_OPTS[*]}" "$REPO_ROOT/infra/.rendered/" "$REMOTE:$REMOTE_DIR/infra/.rendered/"

log "6/7 starting bridge node-agent"
ssh "${SSH_OPTS[@]}" "$REMOTE" "cd $REMOTE_DIR && docker compose -f infra/compose/docker-compose.prod.bridge.yml up -d --build" \
  || die "Yandex bridge deploy failed during compose up"

log "7/7 done"
log "Yandex bridge deployed. Verify whitelist profiles egress through FI/DE, not YC."
