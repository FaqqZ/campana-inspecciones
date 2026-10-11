#!/usr/bin/env bash
# Empaqueta la base y las fotos de ESTA máquina en un solo archivo para llevarlo a otra PC.
# El archivo contiene datos reales y hashes de contraseñas: no se versiona ni se sube a ningún repositorio.
#   deploy/exportar-datos.sh [carpeta-destino]
set -euo pipefail
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
DESTINO="${1:-$HOME/campana-respaldo}"
BASE="${MONGO_DB:-campana-inspecciones}"
FECHA="$(date +%F-%H%M)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$DESTINO"
if [ -n "${MONGO_URI:-}" ]; then ORIGEN=(--uri "$MONGO_URI"); else ORIGEN=(--db "$BASE"); fi
mongodump "${ORIGEN[@]}" --archive="$TMP/mongo.gz" --gzip
if [ -d "$RAIZ/server/uploads" ]; then
  tar -czf "$TMP/uploads.tar.gz" -C "$RAIZ/server" --exclude='uploads/.jwt_secret' uploads
else
  mkdir -p "$TMP/vacio/uploads" && tar -czf "$TMP/uploads.tar.gz" -C "$TMP/vacio" uploads
fi
SALIDA="$DESTINO/campana-datos-$FECHA.tar.gz"
tar -czf "$SALIDA" -C "$TMP" mongo.gz uploads.tar.gz
chmod 600 "$SALIDA"
echo "Listo: $SALIDA"
