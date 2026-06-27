#!/usr/bin/env bash
# Dispatch deployment by node code.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/../lib/common.sh"

NODE_CODE="${1:-}"
[ -n "$NODE_CODE" ] || die "usage: make deploy-node NODE_CODE=<code>"

case "$NODE_CODE" in
  fi-control-01) exec bash "$REPO_ROOT/scripts/deploy-fi/deploy-fi.sh" ;;
  de-exit-01) exec bash "$REPO_ROOT/scripts/deploy-de/deploy-de.sh" ;;
  yc-bridge-01) exec bash "$REPO_ROOT/scripts/deploy-yandex/deploy-yandex.sh" ;;
  *)
    die "no deploy script is wired for $NODE_CODE yet; add it to scripts/deploy-fi/deploy-node.sh"
    ;;
esac
