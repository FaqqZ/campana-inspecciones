#!/bin/sh
# Arranque del contenedor: genera una clave JWT propia si no se definió, crea el administrador inicial y levanta el servidor.
set -e
SECRETO=/app/server/uploads/.jwt_secret
if [ -z "$JWT_SECRET" ]; then
  [ -s "$SECRETO" ] || head -c 48 /dev/urandom | base64 | tr -d '\n=+/' > "$SECRETO"
  JWT_SECRET="$(cat "$SECRETO")"
  export JWT_SECRET
fi
node seeder.js
exec node server.js
