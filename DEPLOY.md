# Despliegue: qué incluye la aplicación y cómo publicarla

Documento de preparación. Resume lo implementado, lo que hay que tener para publicar y los pasos.
No contiene claves ni datos reales.

## 1. Qué hace la aplicación hoy

| Módulo | Qué incluye |
|---|---|
| **Mapa** | Edificios sobre OpenStreetMap con semáforo de documentación, aro de color según el plazo de notificación e ícono de fotos. Filtros: calle, documentación, inspección, infracciones, fotos y notificación. En celular los filtros quedan arriba y la ficha ocupa toda la pantalla. |
| **Edificios** | Listado, alta manual, ubicación automática (Nominatim con caché) y corrección a mano. |
| **Ficha del edificio** | Pestañas: Datos (con aviso de final de obra faltante según Catastro), Papeles, Infracciones, Visitas, Fotos y Notificación. |
| **Infracciones** | Alta manual o por lote, estados y oficinas con pases e historial, expediente que cierra la infracción, eliminación lógica con motivo. Motivos clasificados por normativa y por el texto del acta. |
| **Notificados** | Notificaciones con fecha, plazo y vencimiento (con prórrogas), boleta, razón social e inspector. Estados: En plazo, Por vencer (10 días o menos), Vencido, Presentó documentación, Pasó a acta y Sin plazo registrado. Página propia, pestaña en la ficha, filtro y aro en el mapa. |
| **Indicadores** | Edificios y Catastro (certificado final, final de obra, actas), edificios notificados e infracciones (con filtro de fechas). |
| **Importar** | Edificios, Infracciones, Cruce Catastro / Defensa Civil, Actas, Fotos (Word) y Notificados. Todos con previsualización y reversión por lote. |
| **Catálogos y usuarios** | Motivos, inspectores, estados, oficinas, tipos de documento y usuarios con roles (matriz en `server/config/permisos.js`). |
| **Estado de inspección** | Un edificio con actas figura como *inspeccionado* (se sincroniza al cargar, eliminar o revertir actas). |
| **Modo demostración** | Build sin login con datos ficticios, para mostrar la interfaz sin datos reales. |

Reglas que conviene conocer:
- Un edificio con actas nunca es "sin relevar": sin documentos cargados figura como "Falta certificado".
- Las importaciones **no crean edificios** salvo que se active "Crear los edificios que falten" (en Notificados viene apagado).
- Pila: Express + Mongoose, React 18 + TypeScript + MUI + react-leaflet, Vite. Node 20 o superior.

## 2. Qué se necesita

1. **MongoDB**: local o MongoDB Atlas (cluster gratuito alcanza). Hace falta la cadena de conexión.
2. **Un servidor Node con disco persistente** para el API. Las fotos se guardan en `server/uploads/` (hoy unos 11 MB) y la ubicación de direcciones corre en segundo plano. Por eso **no sirve un hosting serverless** (Vercel Functions) para el API.
   Opciones: Render, Railway, Fly.io o un VPS, con un volumen para `uploads`.
3. **El cliente**: puede servirlo el mismo servidor (`SERVE_CLIENT=true`) o publicarse aparte como sitio estático (Vercel, Netlify).
4. Un **contacto real** para `GEO_USER_AGENT` (lo exige la política de uso de Nominatim).

## 3. Variables de entorno

Servidor (`server/.env`, plantilla en `server/.env.example`):

| Variable | Notas |
|---|---|
| `PORT` | Por defecto 5003. |
| `MONGO_URI` | Cadena de Atlas o local. |
| `JWT_SECRET` | 32 caracteres o más; el servidor no arranca sin ella. |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | Solo para el primer `npm run seed`. Cambiar la clave después. |
| `GEO_USER_AGENT` | **Pendiente**: hoy tiene un valor de ejemplo. |
| `GEO_VIEWBOX` | Zona de búsqueda del geocodificador. |
| `CORS_ORIGIN` | Origen exacto del cliente si está en otro dominio (un solo valor). |
| `SERVE_CLIENT` | `true` para que el servidor sirva `client/dist`. |

Cliente (build; plantilla en `client/.env.example`): `VITE_API_URL` (solo si el API está en otro dominio) y `VITE_SIN_LOGIN` (**solo** para el modo demostración).

## 4. Pasos de publicación (todo en un servidor)

```bash
# 1. Código
git clone <repositorio> && cd campana-inspecciones

# 2. Cliente
cd client && npm ci && npm run build && cd ..

# 3. Servidor
cd server && npm ci
cp .env.example .env        # completar MONGO_URI, JWT_SECRET, ADMIN_PASSWORD, GEO_USER_AGENT
npm run seed                # crea el administrador, la campaña y los estados/oficinas de ejemplo (no pisa datos)
SERVE_CLIENT=true npm start
```

Detrás de un proxy con HTTPS (Nginx, Caddy o el que ofrezca el hosting). Verificar entrando a la página e iniciando sesión.

Si el cliente va aparte (Vercel): configurar `VITE_API_URL=https://<api>/api` en el build, `CORS_ORIGIN=https://<cliente>` en el servidor, y dejar `client/vercel.json` (ya tiene la reescritura a `index.html`).

## 4 bis. Servicio, HTTPS y respaldos en una VM

Plantillas en `deploy/`:
- `campana-inspecciones.service`: unidad de systemd (reinicio automático, `SERVE_CLIENT=true`, `TRUST_PROXY=1`).
  `sudo cp deploy/campana-inspecciones.service /etc/systemd/system/ && sudo systemctl enable --now campana-inspecciones`.
- `Caddyfile`: proxy inverso con HTTPS automático hacia `127.0.0.1:5003`.
- `backup.sh`: `mongodump` + `uploads/` con retención de 14 días (cron).

`GET /api/health` devuelve 200 con MongoDB conectado y 503 si no, para monitoreo. Con proxy, definir `TRUST_PROXY=1`
(si no, el límite de intentos de login ve la IP del proxy para todos).

## 5. Llevar los datos actuales a la nube

Hoy los datos reales están en MongoDB local (base `campana-inspecciones`) y las fotos en `server/uploads/`.

```bash
mongodump --db campana-inspecciones --out respaldo
mongorestore --uri "<MONGO_URI de Atlas>" --nsInclude "campana-inspecciones.*" respaldo
rsync -av server/uploads/ <servidor>:<ruta>/server/uploads/     # las fotos
```

Después del restore no correr `seed` con otra clave de administrador: ya existe. Probar el login y abrir una ficha con fotos.
Alternativa: volver a importar los Excel y el Word desde la pantalla Importar.

## 5 bis. PostgreSQL (opcional, preparado)

La aplicación sigue usando MongoDB. Para tener los mismos datos en PostgreSQL (consultas, reportes, respaldo en SQL o un cambio futuro)
están listos `db/postgres/001_esquema.sql` y los scripts `npm run pg:exportar` / `npm run pg:cargar`. Detalles en `db/postgres/README.md`.
El archivo de datos que se genera trae hashes de contraseñas: no se versiona y debe tratarse como dato sensible.

## 6. Verificación antes de publicar

- [ ] `cd server && npm test` (63 pruebas) y `cd client && npm run build` sin errores.
- [ ] Login con el administrador; crear un usuario de rol Consulta y comprobar que no puede editar.
- [ ] Mapa con puntos, ficha con la pestaña Fotos (las fotos se piden con sesión y se muestran como `blob:`, ya permitido en la política de seguridad del servidor).
- [ ] Importar un Excel pequeño, ver la previsualización y revertir el lote.
- [ ] Indicadores y página Notificados cargan sin errores; revisar en ancho de celular.
- [ ] Copia de seguridad programada de MongoDB y de `server/uploads/`.
- [ ] `VITE_SIN_LOGIN` **no** está definido en el build con datos reales.

## 7. Pendientes antes de poner datos reales en la nube

1. Decidir el hosting del API (ver punto 2) y crear el cluster de Atlas.
2. Definir `GEO_USER_AGENT` con un contacto real.
3. Revisar con quien corresponda qué datos suben (el repositorio es privado; `server/uploads` y `.env` están fuera de git).
4. Datos por resolver: 33 edificios notificados cuya dirección no existe en la base (hay que decidir si son el mismo edificio con otra altura) y los 60 edificios que se crearon al importar las actas.
5. Commit y push de los cambios locales, que hoy no están en git (ver `git status`).
6. Redeploy del modo demostración (sitio estático aparte) con los datos ficticios nuevos, si se quiere mostrar.
