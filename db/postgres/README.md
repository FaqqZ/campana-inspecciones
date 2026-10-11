# Base de datos PostgreSQL

Esquema y datos de la aplicación para PostgreSQL 14 o superior. **La aplicación sigue funcionando con MongoDB**:
estos scripts dejan la base lista para cuando se decida el cambio, y sirven mientras tanto para consultas, reportes y respaldo en SQL.

## Archivos
| Archivo | Qué hace |
|---|---|
| `001_esquema.sql` | Crea tablas, claves, restricciones, índices, triggers y vistas. Se aplica sobre una base vacía. |
| `datos/002_datos.sql` | **Se genera**, no se versiona (trae hashes de contraseñas y datos reales). `INSERT` de todo lo que hay en MongoDB, con conteos de verificación al final. |
| `../../server/scripts/exportarPostgres.js` | Genera `002_datos.sql` leyendo MongoDB (solo lectura). |
| `../../server/scripts/cargarPostgres.js` | Aplica los dos archivos con `pg`. Se niega a correr si la base ya tiene tablas. |

## Uso
```bash
# 1. Generar el script de datos desde MongoDB (local o Atlas, según MONGO_URI)
cd server && npm run pg:exportar

# 2a. Inyectarlo con el cargador (crea esquema y datos en una base vacía)
createdb campana                                   # o crear la base en Supabase / Neon / Render
DATABASE_URL=postgres://usuario:clave@host:5432/campana npm run pg:cargar
#     (PGSSL=true si el proveedor exige SSL)

# 2b. O con psql
psql "$DATABASE_URL" -f ../db/postgres/001_esquema.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f ../db/postgres/datos/002_datos.sql
```
Cada archivo corre en una transacción: si algo falla, incluida la verificación de conteos, no queda nada a medias.
Solo esquema: `npm run pg:cargar -- --solo-esquema`.

## Tablas
`usuarios`, `campanas` · catálogos: `inspectores`, `motivos_infraccion`, `estados`, `oficinas`, `tipos_documento` ·
`edificios`, `documentos_edificio`, `fotos_edificio`, `inspecciones` (visitas) ·
`infracciones`, `infraccion_inspectores`, `infraccion_motivos`, `infraccion_movimientos` (pases) ·
`notificaciones` · `geo_cache`, `auditoria`.
Vistas: `v_notificacion_vigente` (estado de plazo de la última notificación de cada edificio, con la misma regla que la aplicación)
y `v_edificios_resumen` (conteos de actas, fotos, notificaciones y documentos por edificio).

## Qué cambia respecto de MongoDB
- **Claves**: enteros (`identity`) en lugar de ObjectId. El `_id` anterior de cada edificio queda en `edificios.id_origen`.
- **Arreglos incrustados** pasan a tablas: inspectores y motivos de cada acta (tablas puente) e historial de pases (`infraccion_movimientos`, con `orden`).
- **Fechas de negocio** (acta, notificación, vencimientos, emisión, visitas) son `DATE`; las marcas de creación son `TIMESTAMPTZ`.
- **Fotos**: los archivos siguen en disco. `fotos_edificio.ruta` guarda la ruta relativa a `server/uploads/` (`edificios/<id_origen>/<archivo>`),
  por lo que la carpeta `uploads` se copia tal cual.
- **Restricciones nuevas** que MongoDB no aplicaba: un solo estado inicial y uno final activos, una sola oficina inicial activa,
  latitud y longitud siempre juntas, vencimiento no anterior a la notificación, baja lógica con motivo de al menos 3 caracteres.
  Si el exportador encuentra datos que las violan, el script falla y avisa en qué tabla.
- Referencias rotas: las opcionales quedan en blanco y se listan; las obligatorias impiden generar el archivo.

## Consultas útiles
```sql
-- Notificados por estado de plazo
SELECT estado_plazo, count(*) FROM v_notificacion_vigente GROUP BY 1;

-- Edificios con actas y sin certificado cargado
SELECT direccion_original, actas FROM v_edificios_resumen WHERE actas > 0 AND documentos_presentes = 0 ORDER BY actas DESC;

-- Actas por motivo
SELECT m.nombre, count(*) FROM infraccion_motivos im JOIN motivos_infraccion m ON m.id = im.motivo_id GROUP BY 1 ORDER BY 2 DESC;
```

## Para migrar la aplicación a PostgreSQL (no hecho)
Hoy el servidor usa Mongoose en todas las rutas, importaciones, indicadores y pruebas. El cambio implica reescribir esa capa con `pg`
(consultas en `server/services/` y `server/routes/`), mantener las funciones puras (validaciones, clasificación de motivos, plazos)
y adaptar las 63 pruebas. Las reglas de negocio no dependen de MongoDB.
