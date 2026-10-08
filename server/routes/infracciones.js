const router = require('express').Router();
const { Infraccion, Inspector, MotivoInfraccion, Estado, Oficina, Edificio } = require('../models');
const { protect, permitir, audit } = require('../middleware/auth');
const { campanaDe, buscarOCrearEdificio, escapar } = require('../services/edificios');
const { normalizarCalle } = require('../services/direcciones');
const { validarDatos, validarPase, puedePasar, esEditable, esCerrada, numeroExpedienteAuto } = require('../services/infracciones');
const { procesarPendientes } = require('../services/geocodificador');

router.use(protect);

const bad = (res, message, status = 400) => res.status(status).json({ message });
const POPULAR = [
  ['edificio', 'direccionOriginal calle numero lat lng geoEstado'],
  ['inspectoresActuantes', 'nombre legajo'],
  ['motivosInfraccion', 'nombre'],
  ['estado', 'nombre requiereComentario esFinal'],
  ['oficinaActual', 'nombre'],
  ['asignadoA', 'nombres apellidos username'],
];
const conRelaciones = (q) => POPULAR.reduce((acc, [path, select]) => acc.populate(path, select), q);

const inicial = async () => {
  const [estado, oficina] = await Promise.all([Estado.findOne({ esInicial: true, activo: true }), Oficina.findOne({ esInicial: true, activo: true })]);
  return { estado, oficina };
};

// Verifica que los ids existan en los catálogos (activos al crear)
async function idsValidos(b) {
  const ins = [...new Set(b.inspectoresActuantes.map(String))];
  const mot = [...new Set(b.motivosInfraccion.map(String))];
  const [i, m] = await Promise.all([Inspector.countDocuments({ _id: { $in: ins } }), MotivoInfraccion.countDocuments({ _id: { $in: mot } })]);
  if (i !== ins.length) return 'Algún inspector elegido no existe';
  if (m !== mot.length) return 'Algún motivo elegido no existe';
  return null;
}

// ---- Listado con filtros y paginación en servidor ----
router.get('/', async (req, res) => {
  const q = req.query;
  const f = { eliminado: false };
  if (q.estado) f.estado = q.estado;
  if (q.oficina) f.oficinaActual = q.oficina;
  if (q.asignadoA) f.asignadoA = q.asignadoA === 'sin-asignar' ? null : q.asignadoA;
  if (q.inspector) f.inspectoresActuantes = q.inspector;
  if (q.motivo) f.motivosInfraccion = q.motivo;
  if (q.edificio) f.edificio = q.edificio;
  if (q.fechaDesde || q.fechaHasta) {
    f.fechaInfraccion = {};
    if (q.fechaDesde) f.fechaInfraccion.$gte = new Date(`${q.fechaDesde}T00:00:00.000Z`);
    if (q.fechaHasta) f.fechaInfraccion.$lte = new Date(`${q.fechaHasta}T23:59:59.999Z`);
  }
  const and = [];
  if (q.calle) {
    const campana = await campanaDe(req);
    const ids = await Edificio.find({ campana, calleNorm: new RegExp(escapar(normalizarCalle(q.calle))) }).distinct('_id');
    and.push({ edificio: { $in: ids } });
  }
  if (q.search) {
    const rx = new RegExp(escapar(String(q.search).trim()), 'i');
    const eds = await Edificio.find({ direccionOriginal: rx }).distinct('_id');
    and.push({ $or: [{ numeroActa: rx }, { infractor: rx }, { edificio: { $in: eds } }] });
  }
  if (and.length) f.$and = and;

  const page = Math.max(1, Number(q.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(q.limit) || 25));
  const [items, total] = await Promise.all([
    conRelaciones(Infraccion.find(f).sort('-fechaInfraccion -createdAt').skip((page - 1) * limit).limit(limit)).lean(),
    Infraccion.countDocuments(f),
  ]);
  res.json({ total, page, items });
});

router.get('/:id', async (req, res) => {
  const inf = await conRelaciones(Infraccion.findById(req.params.id))
    .populate('historialMovimientos.oficinaOrigen historialMovimientos.oficinaDestino', 'nombre')
    .populate('historialMovimientos.estado', 'nombre')
    .populate('historialMovimientos.por', 'nombres apellidos username')
    .lean();
  if (!inf || inf.eliminado) return bad(res, 'No encontrada', 404);
  res.json(inf);
});

// ---- Alta: acepta un edificio existente o calle + número (lo crea si no existe) ----
router.post('/', permitir('editarInfracciones'), async (req, res) => {
  const b = req.body;
  const err = validarDatos(b);
  if (err) return bad(res, err);
  const errIds = await idsValidos(b);
  if (errIds) return bad(res, errIds);
  const { estado, oficina } = await inicial();
  if (!estado || !oficina)
    return bad(res, 'Falta definir el estado y la oficina iniciales en Catálogos (Estados / Oficinas)', 409);
  if (await Infraccion.exists({ numeroActa: String(b.numeroActa).trim() })) return bad(res, 'Ya existe una infracción con ese N° de acta', 409);

  let edificio;
  let creado = false;
  if (b.edificio) {
    edificio = await Edificio.findById(b.edificio);
    if (!edificio) return bad(res, 'El edificio elegido no existe');
  } else {
    const campana = await campanaDe(req);
    if (!campana) return bad(res, 'No hay una campaña activa');
    const r = await buscarOCrearEdificio({ campana, calle: b.calle, numero: b.numero, usuario: req.user });
    if (r.error) return bad(res, r.error);
    ({ edificio, creado } = r);
  }

  const inf = await Infraccion.create({
    numeroActa: String(b.numeroActa).trim(),
    edificio: edificio._id,
    infractor: String(b.infractor ?? '').trim(),
    inspectoresActuantes: b.inspectoresActuantes,
    motivosInfraccion: b.motivosInfraccion,
    fechaInfraccion: b.fechaInfraccion,
    estado: estado._id,
    oficinaActual: oficina._id,
    asignadoA: b.asignadoA || null,
    observaciones: Boolean(b.observaciones),
    detalleObservaciones: b.observaciones ? String(b.detalleObservaciones).trim() : '',
    historialMovimientos: [{ oficinaOrigen: null, oficinaDestino: oficina._id, estado: estado._id, por: req.user._id, comentarios: `Infracción registrada en ${oficina.nombre}` }],
    origen: 'manual',
    creadoPor: req.user._id,
  });
  audit('crear', 'Infraccion', inf._id, req.user, `${inf.numeroActa} · ${edificio.direccionOriginal}`);
  if (creado) {
    audit('crear', 'Edificio', edificio._id, req.user, `${edificio.direccionOriginal} (desde infracción)`);
    procesarPendientes({ _id: edificio._id });
  }
  res.status(201).json({ ...(await conRelaciones(Infraccion.findById(inf._id)).lean()), edificioCreado: creado });
});

// ---- Edición (estado y oficina cambian con un pase) ----
router.put('/:id', permitir('editarInfracciones'), async (req, res) => {
  const inf = await Infraccion.findById(req.params.id);
  if (!inf || inf.eliminado) return bad(res, 'No encontrada', 404);
  if (!esEditable(inf)) return bad(res, 'La infracción ya generó expediente y no se puede editar', 409);
  const b = req.body;
  const err = validarDatos(b, { alta: false });
  if (err) return bad(res, err);
  if (b.inspectoresActuantes || b.motivosInfraccion) {
    const errIds = await idsValidos({ inspectoresActuantes: b.inspectoresActuantes ?? inf.inspectoresActuantes, motivosInfraccion: b.motivosInfraccion ?? inf.motivosInfraccion });
    if (errIds) return bad(res, errIds);
  }
  if (b.numeroActa !== undefined && String(b.numeroActa).trim() !== inf.numeroActa) {
    if (await Infraccion.exists({ numeroActa: String(b.numeroActa).trim(), _id: { $ne: inf._id } })) return bad(res, 'Ya existe una infracción con ese N° de acta', 409);
    inf.numeroActa = String(b.numeroActa).trim();
  }
  if (b.edificio && String(b.edificio) !== String(inf.edificio)) {
    if (!(await Edificio.exists({ _id: b.edificio }))) return bad(res, 'El edificio elegido no existe');
    inf.edificio = b.edificio;
  }
  ['infractor', 'inspectoresActuantes', 'motivosInfraccion', 'fechaInfraccion'].forEach((k) => {
    if (b[k] !== undefined) inf[k] = b[k];
  });
  if (b.asignadoA !== undefined) inf.asignadoA = b.asignadoA || null;
  if (b.observaciones !== undefined) {
    inf.observaciones = Boolean(b.observaciones);
    inf.detalleObservaciones = inf.observaciones ? String(b.detalleObservaciones ?? '').trim() : '';
  }
  await inf.save();
  audit('editar', 'Infraccion', inf._id, req.user, inf.numeroActa);
  res.json(await conRelaciones(Infraccion.findById(inf._id)).lean());
});

// ---- Pase: cambia oficina, estado y/o asignado, con historial ----
router.post('/:id/pase', async (req, res) => {
  const inf = await Infraccion.findById(req.params.id);
  if (!inf || inf.eliminado) return bad(res, 'No encontrada', 404);
  const ofIni = await Oficina.findOne({ esInicial: true });
  if (!puedePasar(req.user.role, inf, ofIni?._id)) return bad(res, 'Usted no tiene permisos para realizar esta acción', 403);

  const { oficinaDestino, estado, asignadoA, comentarios } = req.body;
  const oficina = oficinaDestino ? await Oficina.findById(oficinaDestino) : null;
  if (oficinaDestino && !oficina) return bad(res, 'La oficina de destino no existe');
  const estadoDestino = estado ? await Estado.findById(estado) : null;
  if (estado && !estadoDestino) return bad(res, 'El estado elegido no existe');
  const err = validarPase(inf, { oficinaDestino, estadoDestino, comentarios });
  if (err) return bad(res, err, esCerrada(inf) ? 409 : 400);

  inf.historialMovimientos.push({
    oficinaOrigen: inf.oficinaActual,
    oficinaDestino: oficina._id,
    estado: estadoDestino?._id ?? inf.estado,
    por: req.user._id,
    comentarios: String(comentarios ?? '').trim(),
  });
  inf.oficinaActual = oficina._id;
  if (estadoDestino) inf.estado = estadoDestino._id;
  inf.asignadoA = asignadoA || null;
  await inf.save();
  audit('pase', 'Infraccion', inf._id, req.user, `${inf.numeroActa} → ${oficina.nombre}`);
  res.json(await conRelaciones(Infraccion.findById(inf._id)).lean());
});

// ---- Expediente: cierra la infracción ----
router.post('/:id/expediente', permitir('expediente'), async (req, res) => {
  const inf = await Infraccion.findById(req.params.id);
  if (!inf || inf.eliminado) return bad(res, 'No encontrada', 404);
  if (esCerrada(inf)) return bad(res, 'La infracción ya generó expediente', 409);
  const final = await Estado.findOne({ esFinal: true, activo: true });
  let numero = String(req.body.numero ?? '').trim();
  if (!numero) {
    const anio = new Date().getFullYear();
    const n = await Infraccion.countDocuments({ 'expediente.numero': new RegExp(`^${anio}-`) });
    numero = numeroExpedienteAuto(anio, n + 1);
  }
  if (await Infraccion.exists({ 'expediente.numero': numero })) return bad(res, 'Ya existe un expediente con ese número', 409);
  inf.expediente = { numero, fecha: new Date(), generadoPor: req.user._id };
  if (final) inf.estado = final._id;
  inf.historialMovimientos.push({ oficinaOrigen: inf.oficinaActual, oficinaDestino: inf.oficinaActual, estado: inf.estado, por: req.user._id, comentarios: `Expediente generado N° ${numero}` });
  await inf.save();
  audit('expediente', 'Infraccion', inf._id, req.user, `${inf.numeroActa} → expediente ${numero}`);
  res.json(await conRelaciones(Infraccion.findById(inf._id)).lean());
});

// ---- Eliminación lógica con motivo ----
router.delete('/:id', permitir('eliminarInfracciones'), async (req, res) => {
  const motivo = String(req.body?.motivoEliminacion ?? '').trim();
  if (motivo.length < 3) return bad(res, 'Indicá el motivo de la eliminación');
  const inf = await Infraccion.findById(req.params.id);
  if (!inf || inf.eliminado) return bad(res, 'No encontrada', 404);
  if (esCerrada(inf)) return bad(res, 'La infracción ya generó expediente y no se puede eliminar', 409);
  inf.eliminado = true;
  inf.motivoEliminacion = motivo;
  inf.eliminadoPor = req.user._id;
  await inf.save();
  audit('eliminar', 'Infraccion', inf._id, req.user, `${inf.numeroActa}: ${motivo}`);
  res.json({ ok: true });
});

module.exports = router;
