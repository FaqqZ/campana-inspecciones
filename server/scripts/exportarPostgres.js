// Exporta los datos de MongoDB a un script SQL para PostgreSQL (INSERT en orden de claves foráneas).
//   node scripts/exportarPostgres.js [archivo-de-salida]
// Por defecto escribe ../db/postgres/datos/002_datos.sql (carpeta fuera de git: trae hashes de contraseñas y datos reales).
// Requiere haber aplicado antes db/postgres/001_esquema.sql sobre una base vacía.
// Solo lee de MongoDB; no modifica nada.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const M = require('../models');

const SALIDA = process.argv[2] || path.join(__dirname, '..', '..', 'db', 'postgres', 'datos', '002_datos.sql');
const LOTE = 200; // filas por INSERT

// ---------- Literales SQL ----------
const texto = (s) => `'${String(s).replace(/\u0000/g, '').replace(/'/g, "''")}'`;
const dia = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);
const marca = (d) => (d ? new Date(d).toISOString() : null);
function lit(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  return texto(v);
}

// ---------- Identificadores: ObjectId de Mongo -> entero de PostgreSQL ----------
const ids = {};
const problemas = [];
function asignar(tabla, docs) {
  const m = new Map();
  docs.forEach((d, i) => m.set(String(d._id), i + 1));
  ids[tabla] = m;
}
/** Id entero del documento referenciado. Si no existe: null y, si era obligatorio, se anota el problema. */
function ref(tabla, oid, contexto, obligatorio = false) {
  if (oid === null || oid === undefined) {
    if (obligatorio) problemas.push(`${contexto}: falta la referencia a ${tabla}`);
    return null;
  }
  const id = ids[tabla]?.get(String(oid));
  if (!id) problemas.push(`${contexto}: ${tabla} ${oid} no existe${obligatorio ? '' : ' (queda en blanco)'}`);
  return id ?? null;
}

const salida = [];
const conteos = [];
function insertar(tabla, columnas, filas) {
  conteos.push([tabla, filas.length]);
  if (!filas.length) return;
  for (let i = 0; i < filas.length; i += LOTE) {
    const bloque = filas.slice(i, i + LOTE).map((f) => `(${f.map(lit).join(', ')})`);
    salida.push(`INSERT INTO ${tabla} (${columnas.join(', ')}) OVERRIDING SYSTEM VALUE VALUES\n${bloque.join(',\n')};`);
  }
}
const ts = (d) => [marca(d.createdAt), marca(d.updatedAt || d.createdAt)];

async function main() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/campana-inspecciones');
  const L = async (Modelo, orden = { _id: 1 }, extra) => {
    let q = Modelo.find().sort(orden);
    if (extra) q = q.select(extra);
    return q.lean();
  };
  const [usuarios, campanas, inspectores, motivos, estados, oficinas, tipos, edificios, documentos, fotos, inspecciones, infracciones, notificaciones, geo, auditoria] = await Promise.all([
    L(M.User, undefined, '+password'), L(M.Campana), L(M.Inspector), L(M.MotivoInfraccion), L(M.Estado), L(M.Oficina), L(M.TipoDocumento),
    L(M.Edificio), L(M.DocumentoEdificio), L(M.FotoEdificio), L(M.Inspeccion), L(M.Infraccion), L(M.Notificacion), L(M.GeoCache), L(M.AuditLog),
  ]);
  [['usuarios', usuarios], ['campanas', campanas], ['inspectores', inspectores], ['motivos_infraccion', motivos], ['estados', estados], ['oficinas', oficinas],
    ['tipos_documento', tipos], ['edificios', edificios], ['infracciones', infracciones]].forEach(([t, d]) => asignar(t, d));

  salida.push('-- Datos exportados de MongoDB. Aplicar después de 001_esquema.sql sobre una base vacía.', 'BEGIN;', '');

  insertar('usuarios', ['id', 'nombres', 'apellidos', 'username', 'password_hash', 'rol', 'activo', 'creado_en', 'actualizado_en'],
    usuarios.map((u) => [ids.usuarios.get(String(u._id)), u.nombres, u.apellidos, u.username, u.password, u.role, u.activo !== false, ...ts(u)]));

  insertar('campanas', ['id', 'nombre', 'descripcion', 'fecha_inicio', 'fecha_fin', 'activa', 'creado_en', 'actualizado_en'],
    campanas.map((c, i) => [i + 1, c.nombre, c.descripcion || '', dia(c.fechaInicio), dia(c.fechaFin), c.activa !== false, ...ts(c)]));
  asignar('campanas', campanas);

  insertar('inspectores', ['id', 'nombre', 'nombre_norm', 'legajo', 'activo', 'creado_en', 'actualizado_en'],
    inspectores.map((x, i) => [i + 1, x.nombre, x.nombreNorm, x.legajo || '', x.activo !== false, ...ts(x)]));
  insertar('motivos_infraccion', ['id', 'nombre', 'nombre_norm', 'descripcion', 'activo', 'creado_en', 'actualizado_en'],
    motivos.map((x, i) => [i + 1, x.nombre, x.nombreNorm, x.descripcion || '', x.activo !== false, ...ts(x)]));
  insertar('estados', ['id', 'nombre', 'nombre_norm', 'descripcion', 'es_inicial', 'requiere_comentario', 'es_final', 'orden', 'activo', 'creado_en', 'actualizado_en'],
    estados.map((x, i) => [i + 1, x.nombre, x.nombreNorm, x.descripcion || '', !!x.esInicial, !!x.requiereComentario, !!x.esFinal, x.orden || 0, x.activo !== false, ...ts(x)]));
  insertar('oficinas', ['id', 'nombre', 'nombre_norm', 'descripcion', 'es_inicial', 'orden', 'activo', 'creado_en', 'actualizado_en'],
    oficinas.map((x, i) => [i + 1, x.nombre, x.nombreNorm, x.descripcion || '', !!x.esInicial, x.orden || 0, x.activo !== false, ...ts(x)]));
  insertar('tipos_documento', ['id', 'nombre', 'nombre_norm', 'requerido', 'tiene_vencimiento', 'motivo_asociado_id', 'orden', 'activo', 'creado_en', 'actualizado_en'],
    tipos.map((x, i) => [i + 1, x.nombre, x.nombreNorm, x.requerido !== false, !!x.tieneVencimiento, ref('motivos_infraccion', x.motivoAsociado, `Tipo de documento "${x.nombre}"`), x.orden || 0, x.activo !== false, ...ts(x)]));

  const camp = (e) => ref('campanas', e.campana, `Edificio ${e.direccionOriginal}`, true);
  insertar('edificios', [
    'id', 'campana_id', 'direccion_original', 'calle', 'calle_norm', 'numero', 'direccion_norm', 'lat', 'lng', 'geo_estado', 'geo_display_name', 'titular', 'uso', 'observaciones',
    'estado_inspeccion', 'padron', 'estado_obra', 'calle_origen', 'altura_original', 'esquina', 'conclusion_cruce', 'misma_calle_otra_altura', 'en_listado_sin_cert',
    'informe', 'informe_lote', 'origen', 'lote_importacion', 'creado_por', 'id_origen', 'creado_en', 'actualizado_en',
  ], edificios.map((e, i) => {
    const sinPunto = e.lat === null || e.lat === undefined || e.lng === null || e.lng === undefined;
    return [
      i + 1, camp(e), e.direccionOriginal, e.calle, e.calleNorm, e.numero ?? null, e.direccionNorm, sinPunto ? null : e.lat, sinPunto ? null : e.lng, e.geoEstado || 'pendiente',
      e.geoDisplayName || '', e.titular || '', e.uso || '', e.observaciones || '', e.estadoInspeccion || 'pendiente', e.padron || '', e.estadoObra || '', e.calleOrigen || '',
      e.alturaOriginal || '', e.esquina || '', e.conclusionCruce || '', !!e.mismaCalleOtraAltura, !!e.enListadoSinCert, e.informe || '', e.informeLote || '', e.origen || 'manual',
      e.lotImportacion || null, ref('usuarios', e.creadoPor, `Edificio ${e.direccionOriginal}`), String(e._id), ...ts(e),
    ];
  }));

  const ed = (x, c) => ref('edificios', x.edificio, c, true);
  insertar('documentos_edificio', ['id', 'edificio_id', 'tipo_id', 'presente', 'fecha_emision', 'fecha_vencimiento', 'nro_referencia', 'observaciones', 'lote_importacion', 'creado_en', 'actualizado_en'],
    documentos.map((d, i) => [i + 1, ed(d, `Documento ${d._id}`), ref('tipos_documento', d.tipo, `Documento ${d._id}`, true), !!d.presente, dia(d.fechaEmision), dia(d.fechaVencimiento),
      d.nroReferencia || '', d.observaciones || '', d.lotImportacion || null, ...ts(d)]));

  insertar('fotos_edificio', ['id', 'edificio_id', 'archivo', 'ruta', 'nombre_original', 'tipo', 'tamano', 'orden', 'descripcion', 'lote_importacion', 'creado_por', 'creado_en', 'actualizado_en'],
    fotos.map((f, i) => [i + 1, ed(f, `Foto ${f._id}`), f.archivo, `edificios/${f.edificio}/${f.archivo}`, f.nombreOriginal || '', f.tipo || 'image/jpeg', f.tamano || 0, f.orden || 0,
      f.descripcion || '', f.lotImportacion || null, ref('usuarios', f.creadoPor, `Foto ${f._id}`), ...ts(f)]));

  insertar('inspecciones', ['id', 'edificio_id', 'fecha', 'inspector_id', 'resultado', 'observaciones', 'creado_por', 'creado_en', 'actualizado_en'],
    inspecciones.map((x, i) => [i + 1, ed(x, `Visita ${x._id}`), dia(x.fecha), ref('inspectores', x.inspector, `Visita ${x._id}`), x.resultado, x.observaciones || '',
      ref('usuarios', x.creadoPor, `Visita ${x._id}`), ...ts(x)]));

  const ctxI = (x) => `Acta ${x.numeroActa}`;
  insertar('infracciones', [
    'id', 'numero_acta', 'edificio_id', 'infractor', 'descripcion', 'normativa', 'fecha_infraccion', 'estado_id', 'oficina_actual_id', 'asignado_a', 'observaciones', 'detalle_observaciones',
    'expediente_numero', 'expediente_fecha', 'expediente_generado_por', 'eliminado', 'motivo_eliminacion', 'eliminado_por', 'origen', 'lote_importacion', 'creado_por', 'creado_en', 'actualizado_en',
  ], infracciones.map((x, i) => [
    i + 1, x.numeroActa, ed(x, ctxI(x)), x.infractor || '', x.descripcion || '', x.normativa || '', dia(x.fechaInfraccion), ref('estados', x.estado, ctxI(x), true),
    ref('oficinas', x.oficinaActual, ctxI(x), true), ref('usuarios', x.asignadoA, ctxI(x)), !!x.observaciones, x.detalleObservaciones || '', x.expediente?.numero || '', dia(x.expediente?.fecha),
    ref('usuarios', x.expediente?.generadoPor, ctxI(x)), !!x.eliminado, x.motivoEliminacion || '', ref('usuarios', x.eliminadoPor, ctxI(x)), x.origen || 'manual', x.lotImportacion || null,
    ref('usuarios', x.creadoPor, ctxI(x)), ...ts(x),
  ]));

  const unicos = (xs) => [...new Set(xs.map(String))];
  const pares = (campo, tabla) => infracciones.flatMap((x) => unicos(x[campo] || []).map((o) => [ids.infracciones.get(String(x._id)), ref(tabla, o, ctxI(x), true)])).filter((p) => p[1]);
  insertar('infraccion_inspectores', ['infraccion_id', 'inspector_id'], pares('inspectoresActuantes', 'inspectores'));
  insertar('infraccion_motivos', ['infraccion_id', 'motivo_id'], pares('motivosInfraccion', 'motivos_infraccion'));

  let n = 0;
  insertar('infraccion_movimientos', ['id', 'infraccion_id', 'orden', 'fecha', 'oficina_origen_id', 'oficina_destino_id', 'estado_id', 'por_usuario_id', 'comentarios'],
    infracciones.flatMap((x) => (x.historialMovimientos || []).map((m, orden) => [
      ++n, ids.infracciones.get(String(x._id)), orden + 1, marca(m.fecha), ref('oficinas', m.oficinaOrigen, ctxI(x)), ref('oficinas', m.oficinaDestino, ctxI(x), true),
      ref('estados', m.estado, ctxI(x)), ref('usuarios', m.por, ctxI(x), true), m.comentarios || '',
    ])));

  insertar('notificaciones', [
    'id', 'edificio_id', 'fecha_notificacion', 'plazo_dias', 'fecha_vencimiento', 'vencimiento_original', 'plazo_original', 'prorroga', 'resultado', 'boleta', 'razon_social', 'inspector',
    'observaciones', 'origen', 'lote_importacion', 'creado_por', 'creado_en', 'actualizado_en',
  ], notificaciones.map((x, i) => [
    i + 1, ed(x, `Notificación ${x._id}`), dia(x.fechaNotificacion), x.plazoDias ?? null, dia(x.fechaVencimiento), dia(x.vencimientoOriginal), x.plazoOriginal || '', !!x.prorroga,
    x.resultado || '', x.boleta || '', x.razonSocial || '', x.inspector || '', x.observaciones || '', x.origen || 'manual', x.lotImportacion || null,
    ref('usuarios', x.creadoPor, `Notificación ${x._id}`), ...ts(x),
  ]));

  insertar('geo_cache', ['id', 'query_norm', 'lat', 'lng', 'display_name', 'precision', 'creado_en', 'actualizado_en'],
    geo.map((g, i) => [i + 1, g.queryNorm, g.lat ?? null, g.lng ?? null, g.displayName ?? null, g.precision, ...ts(g)]));

  insertar('auditoria', ['id', 'accion', 'entidad', 'entidad_id', 'usuario_id', 'detalle', 'creado_en'],
    auditoria.map((a, i) => [i + 1, a.accion, a.entidad, a.entidadId ?? null, ref('usuarios', a.usuario, `Auditoría ${a._id}`), a.detalle || '', marca(a.createdAt)]));

  if (problemas.length) {
    // Las referencias opcionales rotas se dejan en blanco; las obligatorias impiden generar el script.
    const graves = problemas.filter((p) => !/queda en blanco/.test(p));
    console.error(`${problemas.length} referencias sin resolver:`);
    problemas.slice(0, 30).forEach((p) => console.error(`  - ${p}`));
    if (graves.length) {
      console.error('Hay referencias obligatorias rotas: no se generó el archivo.');
      process.exitCode = 2;
      await mongoose.disconnect();
      return;
    }
  }

  // Las claves se insertaron con valor explícito: se alinean las secuencias para que los próximos alta no choquen.
  salida.push('', '-- Secuencias');
  conteos.filter(([t]) => !['infraccion_inspectores', 'infraccion_motivos'].includes(t)).forEach(([t]) => {
    salida.push(`SELECT setval(pg_get_serial_sequence('${t}', 'id'), COALESCE((SELECT max(id) FROM ${t}), 1), (SELECT max(id) IS NOT NULL FROM ${t}));`);
  });

  // La carga se verifica sola: si algún conteo no coincide, se revierte todo.
  salida.push('', '-- Verificación de conteos');
  conteos.forEach(([t, c]) => {
    salida.push(`DO $$ BEGIN IF (SELECT count(*) FROM ${t}) <> ${c} THEN RAISE EXCEPTION 'Conteo inesperado en ${t}: esperado ${c}'; END IF; END $$;`);
  });
  salida.push('', 'COMMIT;', '');

  fs.mkdirSync(path.dirname(SALIDA), { recursive: true });
  fs.writeFileSync(SALIDA, salida.join('\n'), 'utf8');
  console.log(`Archivo generado: ${SALIDA} (${(fs.statSync(SALIDA).size / 1024).toFixed(0)} KB)`);
  console.table(conteos.map(([tabla, filas]) => ({ tabla, filas })));
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
