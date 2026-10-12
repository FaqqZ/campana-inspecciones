# Campaña de Inspecciones

Seguimiento de una campaña de inspecciones sobre un relevamiento de edificios: carga de direcciones por Excel,
ubicación automática en el mapa (OpenStreetMap), filtro por calle, estado documental con vencimientos,
actas/expedientes vinculados e infracciones potenciales.

## Instalación en cualquier PC (Docker)
Requiere solo [Docker](https://www.docker.com/products/docker-desktop/) (Windows, macOS o Linux). No hace falta instalar Node ni MongoDB.

```bash
git clone https://github.com/FaqqZ/campana-inspecciones.git && cd campana-inspecciones
docker compose up -d --build        # la primera vez tarda unos minutos
docker compose logs app | grep -i contraseña   # usuario "admin" y su contraseña generada (solo en el primer arranque)
```
Abrir **http://localhost:5003** (o `http://<ip-de-la-pc>:5003` desde otra máquina de la red; abrir ese puerto en el firewall).
Todo tiene valores por defecto; para cambiarlos (puerto, contraseña del admin, contacto de Nominatim) copiar `.env.example` a `.env`.

**Llevar los datos de otra instalación** (base + fotos):
```bash
# en la máquina que tiene los datos (Mac/Linux, con mongodump)
deploy/exportar-datos.sh               # genera ~/campana-respaldo/campana-datos-<fecha>.tar.gz
# en la PC nueva, con la aplicación levantada
deploy/importar-datos.sh campana-datos-<fecha>.tar.gz
```
En Windows, desde Git Bash o WSL funcionan los mismos scripts. El archivo exportado trae datos reales: no se sube a git ni se comparte por canales abiertos.

Comandos útiles: `docker compose ps` (estado), `docker compose logs -f app`, `docker compose down` (apaga; los datos quedan en volúmenes), `git pull && docker compose up -d --build` (actualiza).
Por HTTP plano, usuario y contraseña viajan sin cifrar: usarlo solo en red interna, o poner HTTPS (`deploy/Caddyfile`, con `INSECURE_HTTP=false` y `TRUST_PROXY=1`).

## Instalación en una VM Debian (sin Docker)
```bash
git clone https://github.com/FaqqZ/campana-inspecciones.git && cd campana-inspecciones
sudo deploy/instalar-vm.sh                                    # Node 22 + MongoDB 8 + servicio systemd + respaldo diario
sudo DATOS=campana-datos-<fecha>.tar.gz deploy/instalar-vm.sh # opcional: carga el paquete de deploy/exportar-datos.sh
```
Al terminar muestra la URL (`http://<ip>:5003`) y, si es la primera vez, la contraseña de `admin`. Hay que habilitar ese puerto en el firewall de la VM.
Variables opcionales (`PORT`, `GEO_USER_AGENT`, `HTTPS=1`, `MONGO_URI`, `APP_DIR`) y detalles en la cabecera del script. Para actualizar: `cd /opt/campana-inspecciones && git pull && sudo deploy/instalar-vm.sh`.

## Puesta en marcha (sin Docker, a mano)
1. MongoDB corriendo. `cd server && cp .env.example .env` y definí `JWT_SECRET` (32+ caracteres), `ADMIN_PASSWORD`
   y **`GEO_USER_AGENT` con un contacto real** (lo exige la política de uso de Nominatim).
2. `npm install && npm run seed && npm run dev` (API en :5003).
3. `cd client && npm install && npm run dev` (http://localhost:5175).
4. Producción: `npm run build` en `client` y `SERVE_CLIENT=true npm start` en `server`. Guía completa en [DEPLOY.md](DEPLOY.md).

## Flujo de trabajo
1. **Catálogos**: cargar motivos de infracción, inspectores, estados y oficinas (marcando cuál es el inicial y cuál el final) y
   los tipos de documento (cuáles son requeridos, cuáles vencen y qué motivo sugiere cada uno si falta o está vencido).
   `npm run seed` deja estados y oficinas de ejemplo, editables.
2. **Importar > Edificios**: plantilla con Calle y Número. Se previsualizan errores por fila; al confirmar, las
   direcciones se ubican solas a 1 por segundo (Nominatim) con caché.
   **Importar > Cruce Catastro / Defensa Civil**: acepta el Excel del cruce tal cual.
3. **Mapa**: filtrar por calle, documentación, infracciones, inspección, notificación o fotos. Las ubicaciones
   "aproximadas" o "no encontradas" se corrigen a mano (clic o arrastrar el marcador).
4. **Infracciones**: carga, listado con filtros (texto, estado, oficina, asignado, inspector, motivo, fechas), pases entre
   oficinas con historial, expediente (cierra la infracción) y eliminación lógica con motivo. Se pueden cargar desde esta
   pantalla o desde la ficha del edificio. Si la dirección no existe, se crea el edificio y se ubica en el mapa.
5. **Importar > Infracciones**: carga en lote; resuelve el edificio por Calle + Número y puede crear los edificios,
   inspectores y motivos que falten.
6. **Ficha del edificio**: papeles con vencimiento, infracciones, posibles infracciones y visitas.
7. **Fotos y notificados**: *Importar > Fotos (Word)* asocia las imágenes de un .docx a cada dirección; *Importar > Edificios notificados* carga el listado de notificaciones con sus plazos (o sin ellos) y se sigue en la página **Notificados**, en la ficha y en el mapa.
8. **Indicadores**: edificios y Catastro, edificios notificados e infracciones.
9. **Usuarios** (solo Administrador): alta, rol, activación y cambio de contraseña.

## Orden de carga de los Excel (base vacía)
Para llegar al mismo estado en cualquier instalación, cargar con **Administración > Importar** en este orden:
1. **Cruce Catastro / Defensa Civil**: el Excel del cruce tal cual (crea los edificios del cruce).
2. **Actas** (infracciones): el listado de actas, con "Crear los edificios que falten" activado.
3. **Edificios notificados**: primero el listado con domicilio y fecha y después el listado **con plazos** (hojas "Con plazo vigente" / "Cruce completo"): las notificaciones cargadas sin plazo se completan con el segundo. Dejar apagado "Crear los edificios que falten": si no, se crea un edificio por cada domicilio desconocido.
4. **Cruce Catastro verificado** (modo actualizar): actualiza padrón, estado de obra y certificado de los edificios existentes sin pisar con vacíos; los nuevos se crean.
5. **Fotos (Word)**.
6. En **Notificados**: botón *Pasar N vencidas a acta* (las notificaciones vencidas pasan a "Pasó a acta").
7. En **Edificios**: botón *Ocultar no encontradas* (los edificios que no se pudieron ubicar dejan de verse; *Mostrar ocultos* los devuelve).

## Roles
Administrador (todo), Técnico (carga y edita infracciones, edificios y catálogos), Jurídico y Dirección (cursan pases),
Mesa de Entradas (genera expedientes) y Consulta (solo lectura). Matriz en `server/config/permisos.js`
(espejo en `client/src/utils/permisos.ts`). El Técnico solo puede cursar un pase mientras la infracción siga en la oficina inicial.

## Notas
- Las "posibles infracciones" se calculan (papel requerido faltante o vencido) y no son actas labradas.
- Migración desde la versión anterior (actas vinculadas, rol Carga): `npm run migrate:infracciones` (también corre con `npm run seed`).
- Pruebas: `cd server && npm test`.
