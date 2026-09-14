#!/usr/bin/env bash
# Nightly backup, run on the server from cron:
#
#   0 3 * * * /opt/villa-saya/backup.sh >> /var/log/villa-saya-backup.log 2>&1
#
# Produces two files per run in BACKUP_DIR: a consistent snapshot of the
# database, and a tar of the uploaded receipts. The database goes through
# VACUUM INTO rather than a file copy — see server/src/scripts/backup.ts for
# why copying a live SQLite file is not safe.
#
# BACKUP_DIR is on the same server, which protects against a bad deploy but not
# against losing the machine. Sync it somewhere else as well; the last line of
# this script is where to do that.
set -euo pipefail

DEPLOY_PATH="${DEPLOY_PATH:-/opt/villa-saya}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/villa-saya}"
KEEP_DAYS="${KEEP_DAYS:-14}"
VOLUME="${VOLUME:-villa-saya_villa_data}"

stamp="$(date +%F-%H%M)"
cd "$DEPLOY_PATH"
mkdir -p "$BACKUP_DIR"
# Backups hold staff personal data; keep them off a world-readable path.
chmod 700 "$BACKUP_DIR"

echo "==> $(date -Is) backing up"

# 1. Consistent snapshot, written inside the container's volume first.
docker compose exec -T app node server/dist/scripts/backup.js "/data/backups/$stamp.sqlite"

# 2. Move it onto the host and out of the volume it was protecting.
docker compose cp "app:/data/backups/$stamp.sqlite" "$BACKUP_DIR/villa-$stamp.sqlite"
docker compose exec -T app rm -f "/data/backups/$stamp.sqlite"

# 3. Uploaded receipts are ordinary immutable files, so tar is fine for these.
docker run --rm -v "$VOLUME:/data" -v "$BACKUP_DIR:/out" alpine \
  tar czf "/out/uploads-$stamp.tar.gz" -C /data uploads

chmod 600 "$BACKUP_DIR/villa-$stamp.sqlite" "$BACKUP_DIR/uploads-$stamp.tar.gz"

# 4. Retention.
find "$BACKUP_DIR" -name 'villa-*.sqlite'    -mtime "+$KEEP_DAYS" -delete
find "$BACKUP_DIR" -name 'uploads-*.tar.gz'  -mtime "+$KEEP_DAYS" -delete

echo "==> done: $(ls -lh "$BACKUP_DIR/villa-$stamp.sqlite" | awk '{print $5}')"

# 5. Off-server copy. Uncomment and point at wherever you keep them —
#    an object store, another machine, anything that is not this one.
# rclone copy "$BACKUP_DIR" remote:villa-saya-backups --max-age 25h
