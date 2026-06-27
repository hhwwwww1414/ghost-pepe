#!/usr/bin/env bash
# Restore a gzipped PostgreSQL dump. Destructive for target DB contents.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"
load_secrets

BACKUP_FILE="${1:-}"
[ -n "$BACKUP_FILE" ] || die "usage: make restore-db BACKUP_FILE=backups/file.sql.gz"
[ -f "$BACKUP_FILE" ] || die "backup file not found: $BACKUP_FILE"

warn "restoring $BACKUP_FILE into configured database"
if [ -n "${DATABASE_URL:-}" ]; then
  gunzip -c "$BACKUP_FILE" | psql "$DATABASE_URL"
else
  require_var POSTGRES_HOST
  require_var POSTGRES_USER
  require_var POSTGRES_DB
  PGPASSWORD="${POSTGRES_PASSWORD:-}" gunzip -c "$BACKUP_FILE" | psql -h "$POSTGRES_HOST" -p "${POSTGRES_PORT:-5432}" -U "$POSTGRES_USER" "$POSTGRES_DB"
fi

log "restore completed"
