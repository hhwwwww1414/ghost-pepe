#!/usr/bin/env bash
# Shared helpers for deploy/config scripts.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

log()  { printf '\033[36m[ghostpepe]\033[0m %s\n' "$*"; }
warn() { printf '\033[33m[ghostpepe]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[31m[ghostpepe] ERROR:\033[0m %s\n' "$*" >&2; exit 1; }

# Load KEY=VALUE pairs from a file into the environment (ignores #comments / ## md headers).
load_env_file() {
  local file="$1"
  local overwrite="${2:-true}"
  [ -f "$file" ] || return 0
  log "loading $file"
  while IFS= read -r line; do
    line="${line%%#*}"                       # strip trailing comments
    line="$(echo "$line" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    [ -z "$line" ] && continue
    case "$line" in
      *=*)
        local key="${line%%=*}"
        local value="${line#*=}"
        if [ "$overwrite" = "true" ] || [ -z "${!key:-}" ]; then
          export "$key"="$value"
        fi
        ;;
    esac
  done < "$file"
}

# Load secrets in priority order. Real secrets win over .env.example.
load_secrets() {
  load_env_file "$REPO_ROOT/.env.production"
  load_env_file "$REPO_ROOT/.env.local"
  load_env_file "$REPO_ROOT/infra/secrets/secrets.local.md"
  load_env_file "$REPO_ROOT/.env.example" false
}

require_var() {
  local name="$1"
  [ -n "${!name:-}" ] || die "missing required variable: $name (fill infra/secrets/secrets.local.md)"
}

# Install kernel transport tuning (TCP BBR + large UDP/QUIC buffers) on a node and
# apply it immediately. Idempotent and safe to run on every deploy. Without this,
# QUIC/Hysteria runs with the ~208 KB default UDP buffer and connections stall.
# Usage: apply_host_tuning "$REMOTE" SSH_OPTS_ARRAY_NAME
apply_host_tuning() {
  local remote="$1"; shift
  local -a ssh_opts=("$@")
  log "applying host transport tuning (sysctl) on $remote"
  scp "${ssh_opts[@]/-p/-P}" "$REPO_ROOT/infra/sysctl/99-ghostpepe-vpn.conf" \
    "$remote:/tmp/99-ghostpepe-vpn.conf" \
    || die "failed to upload sysctl drop-in to $remote"
  ssh "${ssh_opts[@]}" "$remote" '
    SUDO=""; [ "$(id -u)" -ne 0 ] && SUDO="sudo"
    $SUDO install -m 0644 /tmp/99-ghostpepe-vpn.conf /etc/sysctl.d/99-ghostpepe-vpn.conf &&
    $SUDO sysctl --system >/dev/null &&
    echo "rmem_max=$(sysctl -n net.core.rmem_max)"
  ' || die "failed to apply sysctl on $remote"
}

# Install + enable the Hysteria2 port-hopping NAT unit (UDP 20000-50000 -> 443)
# on an exit node. Idempotent. Pair with HYSTERIA_PORT_HOP_RANGE in .env so the
# subscription links advertise the same range.
# Usage: install_porthop_unit "$REMOTE" SSH_OPTS...
install_porthop_unit() {
  local remote="$1"; shift
  local -a ssh_opts=("$@")
  log "installing Hysteria port-hopping NAT unit on $remote"
  scp "${ssh_opts[@]/-p/-P}" "$REPO_ROOT/infra/systemd/hysteria-porthop.service.tpl" \
    "$remote:/tmp/hysteria-porthop.service" \
    || die "failed to upload port-hop unit to $remote"
  ssh "${ssh_opts[@]}" "$remote" '
    SUDO=""; [ "$(id -u)" -ne 0 ] && SUDO="sudo"
    $SUDO install -m 0644 /tmp/hysteria-porthop.service /etc/systemd/system/hysteria-porthop.service &&
    $SUDO systemctl daemon-reload &&
    $SUDO systemctl enable --now hysteria-porthop &&
    $SUDO systemctl is-active hysteria-porthop
  ' || die "failed to enable port-hop unit on $remote"
}

# Install + enable the Yandex whitelist bridge port-hopping NAT unit. The bridge
# runs two Hysteria processes, so FI and DE get separate ranges mapped to their
# respective listen ports.
# Usage: install_yc_porthop_unit "$REMOTE" SSH_OPTS...
install_yc_porthop_unit() {
  local remote="$1"; shift
  local -a ssh_opts=("$@")
  log "installing Yandex whitelist Hysteria port-hopping NAT unit on $remote"
  scp "${ssh_opts[@]/-p/-P}" "$REPO_ROOT/infra/systemd/hysteria-porthop-yc.service.tpl" \
    "$remote:/tmp/hysteria-porthop-yc.service" \
    || die "failed to upload YC port-hop unit to $remote"
  ssh "${ssh_opts[@]}" "$remote" '
    SUDO=""; [ "$(id -u)" -ne 0 ] && SUDO="sudo"
    $SUDO install -m 0644 /tmp/hysteria-porthop-yc.service /etc/systemd/system/hysteria-porthop-yc.service &&
    $SUDO systemctl daemon-reload &&
    $SUDO systemctl enable --now hysteria-porthop-yc &&
    $SUDO systemctl is-active hysteria-porthop-yc
  ' || die "failed to enable YC port-hop unit on $remote"
}

# Render a template by substituting ${VARS}. Requires envsubst (gettext) or falls back to perl.
render_tpl() {
  local src="$1" dst="$2"
  mkdir -p "$(dirname "$dst")"
  if command -v envsubst >/dev/null 2>&1; then
    envsubst < "$src" > "$dst"
  else
    perl -pe 's/\$\{(\w+)\}/defined $ENV{$1} ? $ENV{$1} : "\${$1}"/ge' < "$src" > "$dst"
  fi
  log "rendered $dst"
}
