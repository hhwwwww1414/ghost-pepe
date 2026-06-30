#!/usr/bin/env bash
# Deploy a DE exit node. Host xray/hysteria are managed by systemd; compose runs node-agent.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/../lib/common.sh"
load_secrets

require_var DE_HOST
require_var DE_USER
: "${DE_PORT:=22}"
SSH_OPTS=(-p "$DE_PORT")
[ -n "${DE_SSH_KEY_PATH:-}" ] && SSH_OPTS+=(-i "$DE_SSH_KEY_PATH")
REMOTE="$DE_USER@$DE_HOST"
REMOTE_DIR=/opt/ghostpepe

log "1/7 checking SSH access to $REMOTE"
ssh "${SSH_OPTS[@]}" -o BatchMode=yes -o ConnectTimeout=10 "$REMOTE" 'echo ok' >/dev/null \
  || die "cannot SSH to $REMOTE"

log "2/7 rendering configs"
bash "$REPO_ROOT/scripts/generate-configs/generate-configs.sh"

log "3/7 creating remote dirs"
ssh "${SSH_OPTS[@]}" "$REMOTE" "mkdir -p $REMOTE_DIR /etc/ghostpepe/{xray,hysteria,certs}"

apply_host_tuning "$REMOTE" "${SSH_OPTS[@]}"
install_porthop_unit "$REMOTE" "${SSH_OPTS[@]}"

log "4/7 uploading repo"
rsync -az -e "ssh ${SSH_OPTS[*]}" \
  --exclude node_modules --exclude .git --exclude 'secrets/' --exclude 'open-vpn/' --exclude 'scratch/' --exclude 'CONNECT.md' \
  "$REPO_ROOT/" "$REMOTE:$REMOTE_DIR/"

log "5/7 uploading .env.production and rendered configs"
[ -f "$REPO_ROOT/.env.production" ] && scp "${SSH_OPTS[@]/-p/-P}" "$REPO_ROOT/.env.production" "$REMOTE:$REMOTE_DIR/.env.production" || warn ".env.production missing"
rsync -az -e "ssh ${SSH_OPTS[*]}" "$REPO_ROOT/infra/.rendered/" "$REMOTE:$REMOTE_DIR/infra/.rendered/"

log "6/7 starting node-agent"
ssh "${SSH_OPTS[@]}" "$REMOTE" "cd $REMOTE_DIR && docker compose -f infra/compose/docker-compose.prod.exit.yml up -d --build" \
  || die "DE deploy failed during compose up"

log "7/7 done"
log "DE deployed. Enable host xray/hysteria systemd units after copying rendered configs into /etc/ghostpepe."
