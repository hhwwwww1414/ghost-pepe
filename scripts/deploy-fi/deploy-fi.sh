#!/usr/bin/env bash
# Deploy control-plane + exit to FI (docs 06 §21.1).
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/../lib/common.sh"
load_secrets

require_var FI_HOST
require_var FI_USER
: "${FI_PORT:=22}"
SSH_OPTS=(-p "$FI_PORT")
[ -n "${FI_SSH_KEY_PATH:-}" ] && SSH_OPTS+=(-i "$FI_SSH_KEY_PATH")
REMOTE="$FI_USER@$FI_HOST"
REMOTE_DIR=/opt/ghostpepe

log "1/9 checking SSH access to $REMOTE"
ssh "${SSH_OPTS[@]}" -o BatchMode=yes -o ConnectTimeout=10 "$REMOTE" 'echo ok' >/dev/null \
  || die "cannot SSH to $REMOTE — check FI_HOST/FI_USER/FI_SSH_KEY_PATH"

log "2/9 rendering configs"
bash "$REPO_ROOT/scripts/generate-configs/generate-configs.sh"

log "3/9 creating remote dirs"
ssh "${SSH_OPTS[@]}" "$REMOTE" "mkdir -p $REMOTE_DIR /etc/ghostpepe/{xray,hysteria,certs}"

log "4/9 uploading repo (rsync, excluding secrets/node_modules)"
rsync -az -e "ssh ${SSH_OPTS[*]}" \
  --exclude node_modules --exclude .git --exclude 'secrets/' --exclude 'CONNECT.md' \
  "$REPO_ROOT/" "$REMOTE:$REMOTE_DIR/"

log "5/9 uploading .env.production"
[ -f "$REPO_ROOT/.env.production" ] || warn ".env.production missing — create it from .env.example on FI"
[ -f "$REPO_ROOT/.env.production" ] && scp "${SSH_OPTS[@]/-p/-P}" "$REPO_ROOT/.env.production" "$REMOTE:$REMOTE_DIR/.env.production" || true

log "6/9 uploading rendered HAProxy/Caddy/Xray/Hysteria"
rsync -az -e "ssh ${SSH_OPTS[*]}" "$REPO_ROOT/infra/.rendered/" "$REMOTE:$REMOTE_DIR/infra/.rendered/"

log "7/9 db migrate + bring up control-plane"
ssh "${SSH_OPTS[@]}" "$REMOTE" "cd $REMOTE_DIR && \
  docker compose -f infra/compose/docker-compose.prod.fi.yml run --rm api npx prisma db push --schema packages/db/prisma/schema.prisma --accept-data-loss && \
  docker compose -f infra/compose/docker-compose.prod.fi.yml run --rm api npx tsx packages/db/src/seed.ts && \
  docker compose -f infra/compose/docker-compose.prod.fi.yml up -d --build" \
  || die "FI deploy failed during compose up"

log "8/9 health check"
sleep 5
ssh "${SSH_OPTS[@]}" "$REMOTE" "curl -fsS http://127.0.0.1:8080/health" || die "FI /health failed"

log "9/9 done"
log "FI deployed. URLs: https://${API_DOMAIN:-api.example.com} (api), https://${ADMIN_DOMAIN:-admin.example.com} (admin), https://${SUB_DOMAIN:-sub.example.com} (sub)"
log "Reminder: install/enable host systemd units for xray + hysteria (infra/systemd) and HAProxy SNI router."
