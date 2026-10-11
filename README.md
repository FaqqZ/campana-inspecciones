# Campaña de Inspecciones

Seguimiento de una campaña de inspecciones sobre un relevamiento de edificios: carga de direcciones por Excel,
ubicación automática en el mapa (OpenStreetMap), filtro por calle, estado documental con vencimientos,
actas/expedientes vinculados e infracciones potenciales.

## Puesta en marcha
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

## Roles
Administrador (todo), Técnico (carga y edita infracciones, edificios y catálogos), Jurídico y Dirección (cursan pases),
Mesa de Entradas (genera expedientes) y Consulta (solo lectura). Matriz en `server/config/permisos.js`
(espejo en `client/src/utils/permisos.ts`). El Técnico solo puede cursar un pase mientras la infracción siga en la oficina inicial.

## Notas
- Las "posibles infracciones" se calculan (papel requerido faltante o vencido) y no son actas labradas.
- Migración desde la versión anterior (actas vinculadas, rol Carga): `npm run migrate:infracciones` (también corre con `npm run seed`).
- Pruebas: `cd server && npm test`.
