# Backup & restore (docs 05 §16)

## Backup

```bash
make backup-db                 # pg_dump -> backups/ghostpepe-YYYYmmdd-HHMMSS.sql.gz
```

- Daily backup (cron the above on FI).
- Before every migration: run `make backup-db` first.
- Copy the encrypted dump to separate storage. Keep ≥ 14 daily backups.
- Weekly: do a **test restore** into a scratch DB. A backup without a test
  restore is considered unreliable.

## Restore

```bash
make restore-db BACKUP_FILE=backups/ghostpepe-20260627-120000.sql.gz
```

Backups are git-ignored (`backups/`, `*.sql.gz`, `*.dump`).
