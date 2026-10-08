# Campaña de Inspecciones

Seguimiento de una campaña de inspecciones sobre un relevamiento de edificios: carga de direcciones por Excel,
ubicación automática en el mapa (OpenStreetMap), filtro por calle, estado documental con vencimientos,
actas/expedientes vinculados e infracciones potenciales.

## Puesta en marcha
1. MongoDB corriendo. `cd server && cp .env.example .env` y definí `JWT_SECRET` (32+ caracteres), `ADMIN_PASSWORD`
   y **`GEO_USER_AGENT` con un contacto real** (lo exige la política de uso de Nominatim).
2. `npm install && npm run seed && npm run dev` (API en :5003).
3. `cd client && npm install && npm run dev` (http://localhost:5175).
4. Producción: `npm run build` en `client` y `SERVE_CLIENT=true npm start` en `server`.

## Flujo de trabajo
1. **Catálogos**: cargar tipos de documento (cuáles son requeridos, cuáles vencen y qué motivo de infracción sugiere
   cada uno si falta o está vencido) y motivos de infracción.
2. **Importar > Edificios**: plantilla con Calle y Número. Se previsualizan errores por fila; al confirmar, las
   direcciones se ubican solas a 1 por segundo (Nominatim) con caché.
3. **Mapa**: filtrar por calle, documentación, inspección o calidad de ubicación. Las ubicaciones "aproximadas" o
   "no encontradas" se corrigen a mano (clic o arrastrar el marcador).
4. **Ficha del edificio**: papeles con vencimiento, actas/expedientes, posibles infracciones y visitas.
5. **Importar > Actas**: vincula actas existentes por Calle + Número (los edificios deben estar cargados).

## Notas
- Las "posibles infracciones" se calculan (papel requerido faltante o vencido) y no son actas labradas.
- Roles: Administrador, Carga (edita) y Consulta (solo lectura).
- Pruebas: `cd server && npm test`.
