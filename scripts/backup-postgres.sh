#!/usr/bin/env bash
# Create a gzipped PostgreSQL dump from DATABASE_URL or POSTGRES_* env.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"
load_secrets

mkdir -p "$REPO_ROOT/backups"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
OUT="$REPO_ROOT/backups/ghostpepe-$STAMP.sql.gz"

if [ -n "${DATABASE_URL:-}" ]; then
  pg_dump "$DATABASE_URL" | gzip -9 > "$OUT"
else
  require_var POSTGRES_HOST
  require_var POSTGRES_USER
  require_var POSTGRES_DB
  PGPASSWORD="${POSTGRES_PASSWORD:-}" pg_dump -h "$POSTGRES_HOST" -p "${POSTGRES_PORT:-5432}" -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip -9 > "$OUT"
fi

log "backup written to $OUT"
