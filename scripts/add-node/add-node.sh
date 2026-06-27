#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/../lib/common.sh"
load_secrets
NODE_CODE="${1:-}"
[ -n "$NODE_CODE" ] || die "usage: make add-node NODE_CODE=<code>"
cd "$REPO_ROOT"
npx tsx scripts/add-node/add-node.ts "$NODE_CODE"
