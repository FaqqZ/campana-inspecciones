const router = require('express').Router();
const { Edificio, DocumentoEdificio, Infraccion, Inspeccion, ESTADOS_INSPECCION } = require('../models');
const { protect, authorize, permitir, audit } = require('../middleware/auth');
const { campanaDe, filtroBase, aplicarInfracciones, escapar, tiposActivos, semaforosDe } = require('../services/edificios');
const { evaluarEdificio } = require('../services/semaforo');
const { normalizarCalle, parseNumero, claveDireccion, titulo } = require('../services/direcciones');
const { procesarPendientes } = require('../services/geocodificador');

router.use(protect);

const bad = (res, message) => res.status(400).json({ message });

// Puntos livianos para el mapa
router.get('/mapa', async (req, res) => {
  const campana = await campanaDe(req);
  const filtro = await aplicarInfracciones(filtroBase(campana, req.query), req.query);
  const todos = await Edificio.find(filtro).select('direccionOriginal lat lng geoEstado estadoInspeccion').lean();
  const sem = await semaforosDe(todos.map((e) => e._id));
  let lista = todos.map((e) => ({ ...e, semaforo: sem.get(String(e._id)) }));
  if (req.query.semaforo) lista = lista.filter((e) => e.semaforo === req.query.semaforo);
  const puntos = lista
    .filter((e) => e.lat !== null && e.lng !== null)
    .map((e) => ({ id: e._id, lat: e.lat, lng: e.lng, direccion: e.direccionOriginal, semaforo: e.semaforo, estadoInspeccion: e.estadoInspeccion, geoEstado: e.geoEstado }));
  res.json({ puntos, total: lista.length, sinUbicar: lista.length - puntos.length });
});

// Autocompletado de calles
router.get('/calles', async (req, res) => {
  const campana = await campanaDe(req);
  const match = { campana };
  if (req.query.q) match.calleNorm = new RegExp(escapar(normalizarCalle(req.query.q)));
  const calles = await Edificio.aggregate([
    { $match: match },
    { $group: { _id: '$calleNorm', calle: { $first: '$calle' }, cantidad: { $sum: 1 } } },
    { $sort: { _id: 1 } },
    { $limit: 50 },
  ]);
  res.json(calles.map((c) => ({ calleNorm: c._id, calle: c.calle, cantidad: c.cantidad })));
});

// Listado paginado (incluye pendientes de ubicación)
router.get('/', async (req, res) => {
  const campana = await campanaDe(req);
  const filtro = await aplicarInfracciones(filtroBase(campana, req.query), req.query);
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  const [items, total] = await Promise.all([
    Edificio.find(filtro).sort('calleNorm numero').skip((page - 1) * limit).limit(limit).lean(),
    Edificio.countDocuments(filtro),
  ]);
  const sem = await semaforosDe(items.map((e) => e._id));
  res.json({ total, page, items: items.map((e) => ({ ...e, semaforo: sem.get(String(e._id)) })) });
});

// KPIs
router.get('/resumen', async (req, res) => {
  const campana = await campanaDe(req);
  const todos = await Edificio.find({ campana }).select('geoEstado estadoInspeccion').lean();
  const sem = await semaforosDe(todos.map((e) => e._id));
  const cuenta = (fn) => todos.reduce((acc, e) => ((acc[fn(e)] = (acc[fn(e)] || 0) + 1), acc), {});
  const geo = cuenta((e) => e.geoEstado);
  res.json({
    total: todos.length,
    geolocalizados: todos.length - (geo.pendiente || 0) - (geo.fallido || 0),
    porGeo: geo,
    porInspeccion: cuenta((e) => e.estadoInspeccion),
    porSemaforo: cuenta((e) => sem.get(String(e._id))),
  });
});

// Alta manual
router.post('/', permitir('editarEdificios'), async (req, res) => {
  const campana = await campanaDe(req);
  if (!campana) return bad(res, 'No hay una campaña activa');
  const calleTxt = String(req.body.calle || '').trim();
  if (!calleTxt) return bad(res, 'La calle es obligatoria');
  const numero = parseNumero(req.body.numero);
  if (numero === undefined) return bad(res, 'Número inválido');
  const calleNorm = normalizarCalle(calleTxt);
  try {
    const e = await Edificio.create({
      campana,
      calle: titulo(calleTxt),
      calleNorm,
      numero,
      direccionNorm: claveDireccion(calleNorm, numero),
      direccionOriginal: `${titulo(calleTxt)} ${numero || 's/n'}`,
      titular: req.body.titular,
      uso: req.body.uso,
      observaciones: req.body.observaciones,
      origen: 'manual',
      creadoPor: req.user._id,
    });
    audit('crear', 'Edificio', e._id, req.user, e.direccionOriginal);
    procesarPendientes({ _id: e._id });
    res.status(201).json(e);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: 'Ya existe un edificio en esa dirección' });
    throw err;
  }
});

// Ficha completa
router.get('/:id', async (req, res) => {
  const e = await Edificio.findById(req.params.id).lean();
  if (!e) return res.status(404).json({ message: 'No encontrado' });
  const [tipos, documentos, infracciones, inspecciones] = await Promise.all([
    tiposActivos(),
    DocumentoEdificio.find({ edificio: e._id }).lean(),
    Infraccion.find({ edificio: e._id, eliminado: false })
      .sort('-fechaInfraccion')
      .populate('inspectoresActuantes', 'nombre')
      .populate('motivosInfraccion', 'nombre')
      .populate('estado', 'nombre')
      .populate('oficinaActual', 'nombre')
      .lean(),
    Inspeccion.find({ edificio: e._id }).sort('-fecha').populate('inspector', 'nombre').lean(),
  ]);
  const ev = evaluarEdificio(tipos, documentos);
  res.json({
    edificio: e,
    semaforo: ev.semaforo,
    documentos: ev.detalle.map(({ tipo, doc, estado }) => ({ tipo, doc, estado })),
    infraccionesPotenciales: ev.infraccionesPotenciales,
    infracciones,
    inspecciones,
  });
});

// Datos del edificio
router.patch('/:id', permitir('editarEdificios'), async (req, res) => {
  const e = await Edificio.findById(req.params.id);
  if (!e) return res.status(404).json({ message: 'No encontrado' });
  ['titular', 'uso', 'observaciones'].forEach((k) => {
    if (req.body[k] !== undefined) e[k] = String(req.body[k]).trim();
  });
  if (req.body.estadoInspeccion !== undefined) {
    if (!ESTADOS_INSPECCION.includes(req.body.estadoInspeccion)) return bad(res, 'Estado de inspección inválido');
    e.estadoInspeccion = req.body.estadoInspeccion;
  }
  if (req.body.calle !== undefined || req.body.numero !== undefined) {
    const calleTxt = String(req.body.calle ?? e.calle).trim();
    const numero = parseNumero(req.body.numero ?? e.numero);
    if (!calleTxt || numero === undefined) return bad(res, 'Dirección inválida');
    const calleNorm = normalizarCalle(calleTxt);
    Object.assign(e, {
      calle: titulo(calleTxt),
      calleNorm,
      numero,
      direccionNorm: claveDireccion(calleNorm, numero),
      direccionOriginal: `${titulo(calleTxt)} ${numero || 's/n'}`,
      lat: null,
      lng: null,
      geoEstado: 'pendiente',
      geoDisplayName: '',
    });
  }
  try {
    await e.save();
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: 'Ya existe un edificio en esa dirección' });
    throw err;
  }
  audit('editar', 'Edificio', e._id, req.user, e.direccionOriginal);
  if (e.geoEstado === 'pendiente') procesarPendientes({ _id: e._id });
  res.json(e);
});

// Corrección manual de ubicación (arrastrar marcador)
router.patch('/:id/ubicacion', permitir('editarEdificios'), async (req, res) => {
  const lat = Number(req.body.lat);
  const lng = Number(req.body.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)
    return bad(res, 'Coordenadas inválidas');
  const e = await Edificio.findByIdAndUpdate(req.params.id, { lat, lng, geoEstado: 'manual' }, { new: true });
  if (!e) return res.status(404).json({ message: 'No encontrado' });
  audit('ubicacion', 'Edificio', e._id, req.user, `${lat.toFixed(6)}, ${lng.toFixed(6)}`);
  res.json(e);
});

router.delete('/:id', authorize(), async (req, res) => {
  if (await Infraccion.exists({ edificio: req.params.id, eliminado: false }))
    return res.status(409).json({ message: 'El edificio tiene infracciones cargadas; eliminalas primero' });
  const e = await Edificio.findByIdAndDelete(req.params.id);
  if (!e) return res.status(404).json({ message: 'No encontrado' });
  await Promise.all([
    DocumentoEdificio.deleteMany({ edificio: e._id }),
    Infraccion.deleteMany({ edificio: e._id }),
    Inspeccion.deleteMany({ edificio: e._id }),
  ]);
  audit('eliminar', 'Edificio', e._id, req.user, e.direccionOriginal);
  res.json({ ok: true });
});

// ---- Documentación ----
router.put('/:id/documentos/:tipoId', permitir('editarEdificios'), async (req, res) => {
  const { presente, fechaEmision, fechaVencimiento, nroReferencia, observaciones } = req.body;
  const fecha = (v) => (v ? new Date(v) : null);
  const emision = fecha(fechaEmision);
  const venc = fecha(fechaVencimiento);
  if ((emision && Number.isNaN(emision.getTime())) || (venc && Number.isNaN(venc.getTime()))) return bad(res, 'Fecha inválida');
  if (emision && venc && venc < emision) return bad(res, 'El vencimiento es anterior a la emisión');
  const doc = await DocumentoEdificio.findOneAndUpdate(
    { edificio: req.params.id, tipo: req.params.tipoId },
    { presente: Boolean(presente), fechaEmision: emision, fechaVencimiento: venc, nroReferencia: nroReferencia || '', observaciones: observaciones || '' },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  audit('documento', 'Edificio', req.params.id, req.user, `${req.params.tipoId} presente=${Boolean(presente)}`);
  res.json(doc);
});

// ---- Inspecciones (visitas) ----
router.post('/:id/inspecciones', permitir('editarEdificios'), async (req, res) => {
  const { fecha, inspector, resultado, observaciones } = req.body;
  if (!fecha || Number.isNaN(new Date(fecha).getTime())) return bad(res, 'Fecha inválida');
  if (!ESTADOS_INSPECCION.slice(1).includes(resultado)) return bad(res, 'Resultado inválido');
  const e = await Edificio.findById(req.params.id);
  if (!e) return res.status(404).json({ message: 'No encontrado' });
  const i = await Inspeccion.create({ edificio: e._id, fecha, inspector: inspector || undefined, resultado, observaciones, creadoPor: req.user._id });
  e.estadoInspeccion = resultado;
  await e.save();
  audit('crear', 'Inspeccion', i._id, req.user, `${e.direccionOriginal}: ${resultado}`);
  res.status(201).json(i);
});

router.delete('/:id/inspecciones/:inspId', permitir('editarEdificios'), async (req, res) => {
  const i = await Inspeccion.findOneAndDelete({ _id: req.params.inspId, edificio: req.params.id });
  if (!i) return res.status(404).json({ message: 'No encontrada' });
  const ultima = await Inspeccion.findOne({ edificio: req.params.id }).sort('-fecha');
  await Edificio.updateOne({ _id: req.params.id }, { estadoInspeccion: ultima ? ultima.resultado : 'pendiente' });
  audit('eliminar', 'Inspeccion', i._id, req.user);
  res.json({ ok: true });
});

module.exports = router;
