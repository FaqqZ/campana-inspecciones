#!/usr/bin/env bash
# Instalación (y actualización) en una VM Debian, sin Docker: Node + MongoDB + servicio systemd + respaldo diario.
# Ejecutar como root desde una copia del repositorio:
#   git clone https://github.com/FaqqZ/campana-inspecciones.git && cd campana-inspecciones
#   sudo deploy/instalar-vm.sh
#
# Variables opcionales (se pasan antes del comando, ej.: sudo PORT=8080 deploy/instalar-vm.sh):
#   PORT=5003                 puerto en el que escucha la aplicación
#   GEO_USER_AGENT="..."      contacto real para Nominatim (solo si se ubican direcciones nuevas)
#   HTTPS=1                   hay un proxy con HTTPS delante (Caddy/Nginx): activa HSTS y TRUST_PROXY
#   MONGO_URI=...             usar un MongoDB existente (Atlas, otro servidor) en vez de instalar uno local
#   DATOS=archivo.tar.gz      cargar un paquete generado por deploy/exportar-datos.sh (REEMPLAZA la base local)
#   APP_DIR=/opt/campana-inspecciones   dónde se instala
# Se puede volver a ejecutar para actualizar: no pisa el .env ni los datos.
set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo "Ejecutalo como root (sudo)."; exit 1; }
. /etc/os-release
[ "${ID:-}" = "debian" ] || { echo "Este script es para Debian (detectado: ${ID:-desconocido})."; exit 1; }

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="${APP_DIR:-/opt/campana-inspecciones}"
PORT="${PORT:-5003}"
USUARIO=campana
SERVICIO=campana-inspecciones
BASE=campana-inspecciones
export DEBIAN_FRONTEND=noninteractive

paso() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }

paso "Paquetes base"
apt-get update -qq
apt-get install -y -qq curl ca-certificates gnupg openssl rsync cron >/dev/null

paso "Node.js 20 o superior"
if command -v node >/dev/null && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 20 ]; then
  echo "Node $(node -v) ya instalado."
else
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
  echo "Node $(node -v) instalado."
fi

if [ -z "${MONGO_URI:-}" ]; then
  paso "MongoDB 8.0 (local)"
  if ! command -v mongod >/dev/null; then
    # MongoDB publica paquetes para Debian 12 (bookworm); en versiones más nuevas se usa ese mismo repositorio.
    CODENAME="${VERSION_CODENAME:-bookworm}"
    [ "$CODENAME" = "bookworm" ] || echo "Aviso: Debian $CODENAME; se usa el repositorio de bookworm. Si falla, instalar MongoDB a mano y volver a correr con MONGO_URI."
    curl -fsSL https://pgp.mongodb.com/server-8.0.asc | gpg --dearmor --yes -o /usr/share/keyrings/mongodb-server-8.0.gpg
    echo "deb [signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg] http://repo.mongodb.org/apt/debian bookworm/mongodb-org/8.0 main" > /etc/apt/sources.list.d/mongodb-org-8.0.list
    apt-get update -qq
    apt-get install -y -qq mongodb-org >/dev/null
  fi
  systemctl enable --now mongod
  for _ in $(seq 1 20); do mongosh --quiet --eval 'db.adminCommand("ping").ok' >/dev/null 2>&1 && break; sleep 1; done
  MONGO_URI="mongodb://127.0.0.1:27017/$BASE"
  MONGO_LOCAL=1
else
  MONGO_LOCAL=0
fi

paso "Usuario del servicio y archivos en $APP_DIR"
id "$USUARIO" >/dev/null 2>&1 || useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin "$USUARIO"
mkdir -p "$APP_DIR"
if [ "$RAIZ" != "$APP_DIR" ]; then
  # copia el código (con .git, para poder actualizar con git pull) sin pisar .env, fotos ni dependencias
  rsync -a --delete --exclude 'node_modules' --exclude 'dist' --exclude 'server/.env' --exclude 'server/uploads' "$RAIZ/" "$APP_DIR/"
fi
mkdir -p "$APP_DIR/server/uploads"

paso "Cliente (build) y servidor (dependencias)"
( cd "$APP_DIR/client" && npm ci --no-audit --no-fund && npm run build )
( cd "$APP_DIR/server" && npm ci --omit=dev --no-audit --no-fund )

NUEVO_ENV=0
if [ ! -f "$APP_DIR/server/.env" ]; then
  paso "Configuración (server/.env)"
  NUEVO_ENV=1
  ADMIN_PASSWORD="$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-16)"
  {
    echo "PORT=$PORT"
    echo "MONGO_URI=$MONGO_URI"
    echo "JWT_SECRET=$(openssl rand -hex 32)"
    echo "ADMIN_USERNAME=admin"
    echo "ADMIN_PASSWORD=$ADMIN_PASSWORD"
    echo "GEO_USER_AGENT=${GEO_USER_AGENT:-campana-inspecciones/1.0 (contacto: definir-en-.env)}"
    echo "GEO_VIEWBOX=-65.33,-26.75,-65.12,-26.93"
    if [ "${HTTPS:-0}" = "1" ]; then echo "INSECURE_HTTP=false"; echo "TRUST_PROXY=1"; else echo "INSECURE_HTTP=true"; fi
  } > "$APP_DIR/server/.env"
else
  echo "Ya existe $APP_DIR/server/.env: no se modifica."
fi
chmod 600 "$APP_DIR/server/.env"

if [ -n "${DATOS:-}" ]; then
  paso "Cargando datos de $DATOS"
  [ "$MONGO_LOCAL" = "1" ] || { echo "DATOS solo se carga en el MongoDB local."; exit 1; }
  TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
  tar -xzf "$DATOS" -C "$TMP"
  systemctl stop "$SERVICIO" 2>/dev/null || true
  mongorestore --uri "$MONGO_URI" --archive="$TMP/mongo.gz" --gzip --drop --nsInclude "$BASE.*"
  tar -xzf "$TMP/uploads.tar.gz" -C "$APP_DIR/server"
fi

chmod -R a+rX "$APP_DIR"
chown -R "$USUARIO":"$USUARIO" "$APP_DIR/server/uploads" "$APP_DIR/server/.env"
chmod 600 "$APP_DIR/server/.env"

paso "Administrador inicial"
( cd "$APP_DIR/server" && runuser -u "$USUARIO" -- node seeder.js )

paso "Servicio systemd"
cat > "/etc/systemd/system/$SERVICIO.service" <<EOF
[Unit]
Description=Campaña de inspecciones (API + cliente)
After=network.target mongod.service
Wants=mongod.service

[Service]
Type=simple
User=$USUARIO
WorkingDirectory=$APP_DIR/server
Environment=NODE_ENV=production
Environment=SERVE_CLIENT=true
ExecStart=$(command -v node) server.js
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ReadWritePaths=$APP_DIR/server/uploads

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable "$SERVICIO" >/dev/null
systemctl restart "$SERVICIO"

if [ "$MONGO_LOCAL" = "1" ]; then
  paso "Respaldo diario (02:30) en /var/backups/campana-inspecciones"
  chmod +x "$APP_DIR/deploy/backup.sh"
  echo "30 2 * * * root APP=$APP_DIR $APP_DIR/deploy/backup.sh >> /var/log/campana-backup.log 2>&1" > /etc/cron.d/campana-backup
fi

paso "Verificación"
PUERTO="$(grep -E '^PORT=' "$APP_DIR/server/.env" | cut -d= -f2)"
for _ in $(seq 1 20); do
  if curl -fsS "http://127.0.0.1:${PUERTO:-5003}/api/health" >/dev/null 2>&1; then OK=1; break; fi
  sleep 1
done
if [ "${OK:-0}" = "1" ]; then
  echo "La aplicación responde en http://127.0.0.1:${PUERTO:-5003}"
else
  echo "La aplicación no respondió. Ver: journalctl -u $SERVICIO -n 50 --no-pager"; exit 1
fi

IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo
echo "Listo. Abrir http://${IP:-<ip-de-la-vm>}:${PUERTO:-5003} (habilitar ese puerto en el firewall / grupo de seguridad de la VM)."
if [ "$NUEVO_ENV" = "1" ] && [ -z "${DATOS:-}" ]; then
  echo "Usuario: admin   Contraseña: $ADMIN_PASSWORD   (guardala y cambiala al entrar)"
fi
[ -z "${DATOS:-}" ] || echo "Se cargaron los datos del paquete: se entra con el usuario y la contraseña de la base original."
grep -q 'definir-en-.env' "$APP_DIR/server/.env" && echo "Pendiente: poner un contacto real en GEO_USER_AGENT dentro de $APP_DIR/server/.env y reiniciar con 'systemctl restart $SERVICIO'."
echo "Por HTTP plano usuario y contraseña viajan sin cifrar: usar solo en red interna o poner HTTPS (deploy/Caddyfile, con HTTPS=1)."
echo "Comandos: systemctl status $SERVICIO | journalctl -u $SERVICIO -f | actualizar: cd $APP_DIR && git pull && sudo deploy/instalar-vm.sh"
