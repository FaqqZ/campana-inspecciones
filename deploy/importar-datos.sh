#!/usr/bin/env bash
# Carga en la instalación Docker de esta PC un archivo generado por exportar-datos.sh.
# REEMPLAZA la base y suma las fotos. Ejecutar desde la raíz del proyecto, con la aplicación ya levantada:
#   docker compose up -d --build
#   deploy/importar-datos.sh campana-datos-AAAA-MM-DD-HHMM.tar.gz
set -euo pipefail
ARCHIVO="${1:?Indicá el archivo campana-datos-*.tar.gz}"
[ -f "$ARCHIVO" ] || { echo "No existe $ARCHIVO"; exit 1; }
cd "$(dirname "$0")/.."
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
tar -xzf "$ARCHIVO" -C "$TMP"
docker compose up -d mongo app
echo "Restaurando la base (reemplaza la actual)..."
docker compose exec -T mongo mongorestore --archive --gzip --drop --nsInclude 'campana-inspecciones.*' < "$TMP/mongo.gz"
echo "Copiando las fotos..."
docker compose exec -T app tar -xzf - -C /app/server < "$TMP/uploads.tar.gz"
docker compose restart app
echo "Listo. Entrá con el usuario y la contraseña que tenía la base original."
