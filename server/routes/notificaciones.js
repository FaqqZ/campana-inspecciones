const router = require('express').Router();
const { Notificacion, Edificio } = require('../models');
const { protect, permitir, audit } = require('../middleware/auth');
const { campanaDe, escapar } = require('../services/edificios');
const { vencimiento, estadoPlazo, diasRestantes, parsePlazo, vigentesPorEdificio, calcularKpisNotificaciones } = require('../services/notificaciones');

router.use(protect);

const bad = (res, message, status = 400) => res.status(status).json({ message });
const POPULAR = [['edificio', 'direccionOriginal calle numero lat lng']];

/** Agrega el estado de plazo y marca la notificación vigente (la más reciente) de cada edificio. */
function enriquecer(lista, hoy = new Date()) {
  const vigentes = vigentesPorEdificio(lista);
  return lista.map((n) => ({
    ...n,
    estadoPlazo: estadoPlazo(n.fechaVencimiento, hoy, n.resultado),
    diasRestantes: diasRestantes(n.fechaVencimiento, hoy),
    vigente: vigentes.get(String(n.edificio?._id || n.edificio)) === n,
  }));
}

function leerCuerpo(b) {
  const fecha = new Date(b.fechaNotificacion);
  if (!b.fechaNotificacion || Number.isNaN(fecha.getTime())) return { error: 'Fecha de notificación inválida' };
  fecha.setUTCHours(12, 0, 0, 0);
  const plazoDias = parsePlazo(Number(b.plazoDias));
  if (!plazoDias) return { error: 'El plazo debe ser una cantidad de días mayor a 0' };
  return { fechaNotificacion: fecha, plazoDias, fechaVencimiento: vencimiento(fecha, plazoDias), observaciones: String(b.observaciones ?? '').trim().slice(0, 500) };
}

// Indicadores (antes que /:id)
router.get('/kpis', async (req, res) => {
  const campana = await campanaDe(req);
  const ids = (await Edificio.find({ campana }, '_id').lean()).map((e) => e._id);
  const lista = await Notificacion.find({ edificio: { $in: ids } }).populate(POPULAR[0][0], 'calle').lean();
  res.json(calcularKpisNotificaciones(lista));
});

// Listado: por defecto la notificación vigente de cada edificio; con todas=si, el historial completo
router.get('/', async (req, res) => {
  const campana = await campanaDe(req);
  const edificios = await Edificio.find({ campana }, '_id').lean();
  const q = req.query;
  const filtro = { edificio: { $in: edificios.map((e) => e._id) } };
  const todas = await Notificacion.find(filtro).populate(...POPULAR[0]).sort('fechaVencimiento').lean();
  let lista = enriquecer(todas);
  if (q.todas !== 'si') lista = lista.filter((n) => n.vigente);
  if (q.estadoPlazo) lista = lista.filter((n) => n.estadoPlazo === q.estadoPlazo);
  if (q.search) {
    const re = new RegExp(escapar(String(q.search)), 'i');
    lista = lista.filter((n) => re.test(n.edificio?.direccionOriginal || '') || re.test(n.observaciones));
  }
  const limit = Math.min(Number(q.limit) || 25, 200);
  const page = Math.max(Number(q.page) || 1, 1);
  res.json({ items: lista.slice((page - 1) * limit, page * limit), total: lista.length, page, limit });
});

router.post('/', permitir('editarEdificios'), async (req, res) => {
  const edificio = await Edificio.findById(req.body.edificio);
  if (!edificio) return bad(res, 'El edificio no existe');
  const d = leerCuerpo(req.body);
  if (d.error) return bad(res, d.error);
  const n = await Notificacion.create({ ...d, edificio: edificio._id, origen: 'manual', creadoPor: req.user._id });
  audit('crear', 'Notificacion', n._id, req.user, `${edificio.direccionOriginal}: ${d.plazoDias} días`);
  res.status(201).json(n);
});

router.patch('/:id', permitir('editarEdificios'), async (req, res) => {
  const n = await Notificacion.findById(req.params.id);
  if (!n) return bad(res, 'No encontrada', 404);
  const d = leerCuerpo({ fechaNotificacion: n.fechaNotificacion, plazoDias: n.plazoDias, observaciones: n.observaciones, ...req.body });
  if (d.error) return bad(res, d.error);
  Object.assign(n, d);
  await n.save();
  audit('editar', 'Notificacion', n._id, req.user, `${d.plazoDias} días`);
  res.json(n);
});

router.delete('/:id', permitir('editarEdificios'), async (req, res) => {
  const n = await Notificacion.findByIdAndDelete(req.params.id);
  if (!n) return bad(res, 'No encontrada', 404);
  audit('eliminar', 'Notificacion', n._id, req.user);
  res.json({ ok: true });
});

module.exports = router;
