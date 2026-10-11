#!/usr/bin/env bash
# Respaldo diario de MongoDB y fotos. Programar con cron, por ejemplo:
#   30 2 * * * /opt/campana-inspecciones/deploy/backup.sh
set -euo pipefail
DESTINO="${DESTINO:-/var/backups/campana-inspecciones}"
APP="${APP:-/opt/campana-inspecciones}"
FECHA="$(date +%F)"
mkdir -p "$DESTINO"
mongodump --db campana-inspecciones --archive="$DESTINO/mongo-$FECHA.gz" --gzip
tar -czf "$DESTINO/uploads-$FECHA.tar.gz" -C "$APP/server" uploads
# Conserva 14 días
find "$DESTINO" -type f -mtime +14 -delete
