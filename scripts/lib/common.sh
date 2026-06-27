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
  [ -f "$file" ] || return 0
  log "loading $file"
  while IFS= read -r line; do
    line="${line%%#*}"                       # strip trailing comments
    line="$(echo "$line" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    [ -z "$line" ] && continue
    case "$line" in
      *=*) export "${line%%=*}"="${line#*=}";;
    esac
  done < "$file"
}

# Load secrets in priority order. Real secrets win over .env.example.
load_secrets() {
  load_env_file "$REPO_ROOT/.env.production"
  load_env_file "$REPO_ROOT/.env.local"
  load_env_file "$REPO_ROOT/infra/secrets/secrets.local.md"
  load_env_file "$REPO_ROOT/.env.example"   # defaults only (no override)
}

require_var() {
  local name="$1"
  [ -n "${!name:-}" ] || die "missing required variable: $name (fill infra/secrets/secrets.local.md)"
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
