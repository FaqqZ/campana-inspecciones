const router = require('express').Router();
const multer = require('multer');
const { CATEGORIAS, Campana, Edificio, DocumentoEdificio, FotoEdificio, Notificacion, Infraccion, Inspeccion, ESTADOS_INSPECCION } = require('../models');
const fotosStore = require('../services/fotosStore');
const { protect, authorize, permitir, audit } = require('../middleware/auth');
const { calcularKpisEdificios } = require('../services/kpis');
const { campanaDe, categoriasPedidas, campanasPorCategoria, filtroBase, aplicarInfracciones, escapar, tiposActivos, semaforosDe } = require('../services/edificios');
const { evaluarEdificio } = require('../services/semaforo');
const { vigentesPorEdificio, estadoPlazo, diasRestantes } = require('../services/notificaciones');
const { normalizarCalle, parseNumero, claveDireccion, titulo } = require('../services/direcciones');
const { procesarPendientes } = require('../services/geocodificador');

router.use(protect);

const MAX_FOTOS_POR_VEZ = 10;
const subirFotos = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: MAX_FOTOS_POR_VEZ } }).array('fotos', MAX_FOTOS_POR_VEZ);

const bad = (res, message) => res.status(400).json({ message });

// Puntos livianos para el mapa: junta las campañas de las categorías pedidas (categorias=EDIFICIOS,COLEGIOS,BOLICHES).
router.get('/mapa', async (req, res) => {
  const categoriaDe = await campanasPorCategoria(categoriasPedidas(req.query));
  const filtro = await aplicarInfracciones({ ...filtroBase(null, req.query), campana: { $in: [...categoriaDe.keys()] } }, req.query);
  const todos = await Edificio.find(filtro).select('campana direccionOriginal titular lat lng geoEstado estadoInspeccion').lean();
  const sem = await semaforosDe(todos.map((e) => e._id));
  const fotos = new Map((await FotoEdificio.aggregate([{ $group: { _id: '$edificio', n: { $sum: 1 } } }])).map((f) => [String(f._id), f.n]));
  const vigentes = vigentesPorEdificio(await Notificacion.find({ edificio: { $in: todos.map((e) => e._id) } }).lean());
  const plazoDe = (id) => (vigentes.has(String(id)) ? estadoPlazo(vigentes.get(String(id)).fechaVencimiento, new Date(), vigentes.get(String(id)).resultado) : null);
  let lista = todos.map((e) => ({ ...e, categoria: categoriaDe.get(String(e.campana)), semaforo: sem.get(String(e._id)), fotos: fotos.get(String(e._id)) || 0, plazo: plazoDe(e._id) }));
  if (req.query.notificado === 'si') lista = lista.filter((e) => e.plazo);
  else if (req.query.notificado) lista = lista.filter((e) => e.plazo === req.query.notificado);
  if (req.query.conFotos === 'si') lista = lista.filter((e) => e.fotos > 0);
  if (req.query.semaforo) lista = lista.filter((e) => e.semaforo === req.query.semaforo);
  const puntos = lista
    .filter((e) => e.lat !== null && e.lng !== null)
    .map((e) => ({ id: e._id, lat: e.lat, lng: e.lng, direccion: e.direccionOriginal, nombre: e.titular || undefined, categoria: e.categoria, semaforo: e.semaforo, estadoInspeccion: e.estadoInspeccion, geoEstado: e.geoEstado, fotos: e.fotos, plazo: e.plazo }));
  const conteos = Object.fromEntries(categoriasPedidas(req.query).map((c) => [c, lista.filter((e) => e.categoria === c).length]));
  res.json({ puntos, total: lista.length, sinUbicar: lista.length - puntos.length, conteos });
});

// Indicadores de edificios y del cruce Catastro / Defensa Civil
router.get('/kpis', async (req, res) => {
  const campana = await campanaDe(req);
  const edificios = await Edificio.find({ campana }).select('calle padron estadoObra conclusionCruce enListadoSinCert mismaCalleOtraAltura geoEstado estadoInspeccion').lean();
  const ids = edificios.map((e) => e._id);
  const [sem, presentes, actas] = await Promise.all([
    semaforosDe(ids),
    DocumentoEdificio.find({ edificio: { $in: ids }, presente: true }).select('edificio').lean(),
    Infraccion.find({ edificio: { $in: ids }, eliminado: false }).select('edificio expediente.numero').lean(),
  ]);
  const abiertas = new Map();
  const totales = new Map();
  actas.forEach((a) => {
    const k = String(a.edificio);
    totales.set(k, (totales.get(k) || 0) + 1);
    if (!a.expediente?.numero) abiertas.set(k, (abiertas.get(k) || 0) + 1);
  });
  res.json(calcularKpisEdificios(edificios, {
    conCertificado: new Set(presentes.map((d) => String(d.edificio))),
    semaforos: sem,
    actasAbiertas: abiertas,
    actasTotales: totales,
  }));
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

// Ocultar / mostrar edificios que no se pudieron ubicar (no aparecen en mapa, listados ni indicadores; sus datos se conservan)
router.get('/ocultos', async (req, res) => {
  const campana = await campanaDe(req);
  res.json(await Edificio.find({ campana, oculto: true }).select('direccionOriginal ocultoMotivo').sort('direccionOriginal').lean());
});
router.post('/ocultar-no-encontrados', permitir('editarEdificios'), async (req, res) => {
  const campana = await campanaDe(req);
  const r = await Edificio.updateMany({ campana, geoEstado: 'fallido', oculto: { $ne: true } }, { oculto: true, ocultoMotivo: 'No se pudo ubicar en el mapa' });
  audit('ocultar', 'Edificio', null, req.user, `${r.modifiedCount} edificios no encontrados`);
  res.json({ ocultados: r.modifiedCount });
});
router.post('/mostrar-ocultos', permitir('editarEdificios'), async (req, res) => {
  const campana = await campanaDe(req);
  const r = await Edificio.updateMany({ campana, oculto: true }, { oculto: false, ocultoMotivo: '' });
  audit('mostrar', 'Edificio', null, req.user, `${r.modifiedCount} edificios`);
  res.json({ mostrados: r.modifiedCount });
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
  const [tipos, documentos, infracciones, inspecciones, fotos, notificaciones] = await Promise.all([
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
    FotoEdificio.find({ edificio: e._id }).sort('orden createdAt').select('nombreOriginal descripcion tipo').lean(),
    Notificacion.find({ edificio: e._id }).sort('-fechaNotificacion').lean(),
  ]);
  const ev = evaluarEdificio(tipos, documentos, new Date());
  const camp = await Campana.findById(e.campana).select('categoria').lean();
  res.json({
    edificio: e,
    categoria: camp?.categoria || 'EDIFICIOS',
    semaforo: ev.semaforo,
    documentos: ev.detalle.map(({ tipo, doc, estado }) => ({ tipo, doc, estado })),
    infraccionesPotenciales: ev.infraccionesPotenciales,
    infracciones,
    inspecciones,
    fotos,
    notificaciones: notificaciones.map((n) => ({ ...n, estadoPlazo: estadoPlazo(n.fechaVencimiento, new Date(), n.resultado), diasRestantes: diasRestantes(n.fechaVencimiento) })),
  });
});

// Archivo de una foto (solo con sesión iniciada)
router.get('/:id/fotos/:fotoId', async (req, res) => {
  const f = await FotoEdificio.findOne({ _id: req.params.fotoId, edificio: req.params.id }).lean();
  const p = f && fotosStore.ruta(f.edificio, f.archivo);
  if (!p) return res.status(404).json({ message: 'No encontrada' });
  res.type(f.tipo);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.sendFile(p, (err) => { if (err && !res.headersSent) res.status(404).json({ message: 'No encontrada' }); });
});

// Adjuntar fotos a un local (hasta 10 por vez, 10 MB cada una; PNG, JPG, GIF o WebP)
router.post('/:id/fotos', permitir('editarEdificios'), (req, res, next) =>
  subirFotos(req, res, (err) => (err ? bad(res, err.code === 'LIMIT_FILE_SIZE' ? 'Cada foto puede pesar hasta 10 MB' : err.code === 'LIMIT_UNEXPECTED_FILE' || err.code === 'LIMIT_FILE_COUNT' ? `Hasta ${MAX_FOTOS_POR_VEZ} fotos por vez` : 'No se pudieron leer las fotos') : next())),
async (req, res) => {
  const e = await Edificio.findById(req.params.id).select('_id');
  if (!e) return res.status(404).json({ message: 'No encontrado' });
  if (!req.files?.length) return bad(res, 'Elegí al menos una foto');
  const existentes = await FotoEdificio.countDocuments({ edificio: e._id });
  const docs = [];
  const rechazadas = [];
  for (const f of req.files) {
    const img = fotosStore.detectarImagen(f.buffer);
    if (!img) { rechazadas.push(f.originalname); continue; }
    const archivo = await fotosStore.guardar(e._id, f.buffer, img.ext);
    docs.push({ edificio: e._id, archivo, nombreOriginal: Buffer.from(f.originalname, 'latin1').toString('utf8').slice(0, 200), tipo: img.tipo, tamano: f.buffer.length, orden: existentes + docs.length, creadoPor: req.user._id });
  }
  if (!docs.length) return bad(res, 'Ningún archivo es una imagen válida (PNG, JPG, GIF o WebP)');
  await FotoEdificio.insertMany(docs);
  audit('subir-fotos', 'Edificio', e._id, req.user, `${docs.length} foto(s)`);
  res.status(201).json({ subidas: docs.length, rechazadas });
});

router.delete('/:id/fotos/:fotoId', permitir('editarEdificios'), async (req, res) => {
  const f = await FotoEdificio.findOneAndDelete({ _id: req.params.fotoId, edificio: req.params.id });
  if (!f) return res.status(404).json({ message: 'No encontrada' });
  await fotosStore.borrar(f.edificio, f.archivo);
  audit('eliminar-foto', 'Edificio', req.params.id, req.user, f.nombreOriginal);
  res.json({ ok: true });
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
    Notificacion.deleteMany({ edificio: e._id }),
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
