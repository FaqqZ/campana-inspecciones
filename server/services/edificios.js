// Consultas compartidas sobre edificios.
const { Campana, TipoDocumento, DocumentoEdificio, Infraccion, Edificio, Inspeccion } = require('../models');
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
  const [tipos, docs, conActas] = await Promise.all([
    tiposActivos(),
    DocumentoEdificio.find({ edificio: { $in: ids } }).lean(),
    Infraccion.distinct('edificio', { edificio: { $in: ids }, eliminado: { $ne: true } }),
  ]);
  const actas = new Set(conActas.map(String));
  const porEdificio = new Map();
  docs.forEach((d) => {
    const k = String(d.edificio);
    if (!porEdificio.has(k)) porEdificio.set(k, []);
    porEdificio.get(k).push(d);
  });
  const hoy = new Date();
  return new Map(ids.map((id) => [String(id), evaluarEdificio(tipos, porEdificio.get(String(id)) || [], hoy, { conInfracciones: actas.has(String(id)) }).semaforo]));
}

/**
 * El estado de inspección acompaña a las infracciones: un edificio con actas está "inspeccionado" (fue visitado por Defensa Civil).
 * Pasa de pendiente a inspeccionado al tener su primera acta, y vuelve a pendiente si se queda sin actas ni visitas registradas.
 * Los estados observado / regularizado (puestos a mano) no se tocan. ids: lista de ids de edificio, o null para todos.
 */
async function sincronizarInspeccion(ids = null) {
  const filtro = ids ? { edificio: { $in: ids } } : {};
  const con = await Infraccion.distinct('edificio', { ...filtro, eliminado: { $ne: true } });
  const alcance = ids ? { _id: { $in: ids } } : {};
  const a = await Edificio.updateMany({ _id: { $in: con }, estadoInspeccion: 'pendiente' }, { estadoInspeccion: 'inspeccionado' });
  const conVisitas = await Inspeccion.distinct('edificio', ids ? { edificio: { $in: ids } } : {});
  const b = await Edificio.updateMany({ ...alcance, _id: { ...(alcance._id || {}), $nin: [...con, ...conVisitas] }, estadoInspeccion: 'inspeccionado' }, { estadoInspeccion: 'pendiente' });
  return { inspeccionados: a.modifiedCount, pendientes: b.modifiedCount };
}

module.exports = { sincronizarInspeccion, buscarOCrearEdificio, campanaDe, filtroBase, aplicarInfracciones, escapar, tiposActivos, semaforosDe };
