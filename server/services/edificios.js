// Consultas compartidas sobre edificios.
const { Campana, TipoDocumento, DocumentoEdificio } = require('../models');
const { evaluarEdificio } = require('./semaforo');
const { normalizarCalle } = require('./direcciones');

const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function campanaDe(req) {
  const id = req.query.campana || req.body?.campana;
  if (id) return id;
  const c = await Campana.findOne({ activa: true }).sort('-createdAt');
  return c?._id || null;
}

function filtroBase(campana, q) {
  const f = { campana };
  if (q.calle) f.calleNorm = new RegExp(escapar(normalizarCalle(q.calle)));
  if (q.estadoInspeccion) f.estadoInspeccion = q.estadoInspeccion;
  if (q.geoEstado) f.geoEstado = q.geoEstado;
  return f;
}

const tiposActivos = () => TipoDocumento.find({ activo: true }).sort('orden nombre').populate('motivoAsociado', 'nombre').lean();

/** Map(edificioId -> semaforo) calculado con una sola consulta de documentos. */
async function semaforosDe(ids) {
  const [tipos, docs] = await Promise.all([tiposActivos(), DocumentoEdificio.find({ edificio: { $in: ids } }).lean()]);
  const porEdificio = new Map();
  docs.forEach((d) => {
    const k = String(d.edificio);
    if (!porEdificio.has(k)) porEdificio.set(k, []);
    porEdificio.get(k).push(d);
  });
  const hoy = new Date();
  return new Map(ids.map((id) => [String(id), evaluarEdificio(tipos, porEdificio.get(String(id)) || [], hoy).semaforo]));
}

module.exports = { campanaDe, filtroBase, escapar, tiposActivos, semaforosDe };
