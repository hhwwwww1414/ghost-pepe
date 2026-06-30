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

run_remote() {
  ssh "${SSH_OPTS[@]}" "$REMOTE" "$@"
}

log "1/11 checking SSH access to $REMOTE"
ssh "${SSH_OPTS[@]}" -o BatchMode=yes -o ConnectTimeout=10 "$REMOTE" 'echo ok' >/dev/null \
  || die "cannot SSH to $REMOTE"

log "2/11 rendering configs"
bash "$REPO_ROOT/scripts/generate-configs/generate-configs.sh"

log "3/11 installing host runtime packages"
run_remote "sudo apt-get update && sudo apt-get install -y rsync curl ca-certificates gnupg haproxy openssl unzip"
run_remote "if ! command -v node >/dev/null || ! node -v | grep -q '^v22'; then curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs; fi"
run_remote "if ! command -v xray >/dev/null; then curl -fsSL https://github.com/XTLS/Xray-install/raw/main/install-release.sh | sudo bash -s -- install; fi"
run_remote "if ! command -v hysteria >/dev/null; then curl -fsSL https://get.hy2.sh/ | sudo bash; fi"

log "4/11 creating remote dirs"
run_remote "sudo mkdir -p $REMOTE_DIR /etc/ghostpepe/{xray,hysteria,certs} && sudo chown -R $YC_USER:$YC_USER $REMOTE_DIR"

apply_host_tuning "$REMOTE" "${SSH_OPTS[@]}"
install_yc_porthop_unit "$REMOTE" "${SSH_OPTS[@]}"

log "5/11 uploading repo"
rsync -az -e "ssh ${SSH_OPTS[*]}" \
  --exclude node_modules --exclude .git --exclude 'secrets/' --exclude 'open-vpn/' --exclude 'scratch/' --exclude 'CONNECT.md' \
  "$REPO_ROOT/" "$REMOTE:$REMOTE_DIR/"

log "6/11 uploading .env.production and rendered configs"
[ -f "$REPO_ROOT/.env.production" ] && scp "${SSH_OPTS[@]/-p/-P}" "$REPO_ROOT/.env.production" "$REMOTE:$REMOTE_DIR/.env.production" || warn ".env.production missing"
rsync -az -e "ssh ${SSH_OPTS[*]}" "$REPO_ROOT/infra/.rendered/" "$REMOTE:$REMOTE_DIR/infra/.rendered/"

log "7/11 installing node dependencies"
run_remote "cd $REMOTE_DIR && npm install"

log "8/11 installing rendered host configs"
run_remote "sudo cp $REMOTE_DIR/infra/.rendered/xray/xray-bridge.json /etc/ghostpepe/xray/config.json && \
  sudo cp $REMOTE_DIR/infra/.rendered/haproxy/haproxy.bridge.cfg /etc/haproxy/haproxy.cfg"
# Hysteria cert must be a proper CA:FALSE leaf cert. Happ 4.13 currently
# imports hy2 more reliably through public TLS validation than URI pin params.
run_remote "if [ ! -f /etc/ghostpepe/certs/hysteria.crt ] || [ ! -f /etc/ghostpepe/certs/hysteria.key ]; then \
  sudo openssl req -x509 -newkey rsa:2048 -nodes -days 3650 -subj '/CN=${YC_PUBLIC_IPV4:-$YC_HOST}' \
    -addext 'subjectAltName=IP:${YC_PUBLIC_IPV4:-$YC_HOST}' \
    -addext 'basicConstraints=critical,CA:FALSE' \
    -addext 'keyUsage=critical,digitalSignature,keyEncipherment' \
    -addext 'extendedKeyUsage=serverAuth' \
    -keyout /etc/ghostpepe/certs/hysteria.key -out /etc/ghostpepe/certs/hysteria.crt; fi"
# Print the cert fingerprint for diagnostics / non-Happ clients.
run_remote "echo -n 'YC_HYSTERIA_CERT_SHA256='; sudo openssl x509 -in /etc/ghostpepe/certs/hysteria.crt -noout -fingerprint -sha256 | sed 's/.*=//; s/://g' | tr 'A-Z' 'a-z'"

log "9/11 installing systemd services"
run_remote "sudo rm -rf /etc/systemd/system/xray.service.d && \
  sudo cp $REMOTE_DIR/infra/systemd/xray.service.tpl /etc/systemd/system/xray.service && \
  sudo cp $REMOTE_DIR/infra/systemd/hysteria@.service.tpl /etc/systemd/system/hysteria-server@.service"
run_remote "grep -v -E '^(NODE_CODE|CONTROL_PLANE_URL|AGENT_MOCK)=' $REMOTE_DIR/.env.production > $REMOTE_DIR/.env.node-agent && \
  sudo tee /etc/systemd/system/node-agent.service >/dev/null <<'EOF'
[Unit]
Description=Ghost Pepe node-agent (Yandex bridge)
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/ghostpepe
EnvironmentFile=/opt/ghostpepe/.env.node-agent
Environment=NODE_CODE=yc-bridge-01
Environment=CONTROL_PLANE_URL=${API_BASE_URL}
Environment=AGENT_MOCK=false
ExecStart=/usr/bin/node --import tsx /opt/ghostpepe/apps/node-agent/src/index.ts
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF"

log "10/11 starting host services"
run_remote "sudo systemctl daemon-reload && sudo systemctl disable --now hysteria-server 2>/dev/null || true && \
  sudo systemctl enable --now xray haproxy node-agent hysteria-server@wl-hysteria-to-fi hysteria-server@wl-hysteria-to-de && \
  sudo systemctl restart xray haproxy node-agent hysteria-server@wl-hysteria-to-fi hysteria-server@wl-hysteria-to-de"

log "11/11 verifying services"
run_remote "systemctl is-active xray haproxy node-agent hysteria-server@wl-hysteria-to-fi hysteria-server@wl-hysteria-to-de"

log "Yandex bridge deployed. Verify whitelist profiles egress through FI/DE, not YC."
