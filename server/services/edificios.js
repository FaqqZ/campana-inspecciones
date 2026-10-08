// Consultas compartidas sobre edificios.
const { Campana, TipoDocumento, DocumentoEdificio, Infraccion, Edificio } = require('../models');
const { evaluarEdificio } = require('./semaforo');
const { normalizarCalle, parseNumero, claveDireccion, titulo } = require('./direcciones');

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

/** Agrega al filtro "con / sin infracciones activas" (conInfraccion=si|no). */
async function aplicarInfracciones(filtro, q) {
  if (q.conInfraccion !== 'si' && q.conInfraccion !== 'no') return filtro;
  const ids = await Infraccion.distinct('edificio', { eliminado: false });
  return { ...filtro, _id: q.conInfraccion === 'si' ? { $in: ids } : { $nin: ids } };
}

/**
 * Busca el edificio por dirección o lo crea (pendiente de ubicar). Devuelve { edificio, creado } o { error }.
 */
async function buscarOCrearEdificio({ campana, calle, numero, usuario }) {
  const calleTxt = String(calle ?? '').trim();
  if (!calleTxt) return { error: 'La calle es obligatoria' };
  const n = parseNumero(numero);
  if (n === undefined) return { error: 'Número inválido' };
  const calleNorm = normalizarCalle(calleTxt);
  const direccionNorm = claveDireccion(calleNorm, n);
  const existente = await Edificio.findOne({ campana, direccionNorm });
  if (existente) return { edificio: existente, creado: false };
  const edificio = await Edificio.create({
    campana, calle: titulo(calleTxt), calleNorm, numero: n, direccionNorm,
    direccionOriginal: `${titulo(calleTxt)} ${n || 's/n'}`, origen: 'manual', creadoPor: usuario?._id,
  });
  return { edificio, creado: true };
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

module.exports = { buscarOCrearEdificio, campanaDe, filtroBase, aplicarInfracciones, escapar, tiposActivos, semaforosDe };
