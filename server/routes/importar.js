const router = require('express').Router();
const crypto = require('crypto');
const multer = require('multer');
const { Edificio, Infraccion, DocumentoEdificio, Inspeccion, Inspector, MotivoInfraccion, TipoDocumento, Estado, Oficina, norm } = require('../models');
const { protect, authorize, permitir, audit } = require('../middleware/auth');
const { generarPlantilla, leerHoja, leerCruce, leerActas, validarFilas } = require('../services/importador');
const { TIPO_CERT, MOTIVO_CERT } = require('../services/catastro');
const { campanaDe } = require('../services/edificios');
const { procesarPendientes } = require('../services/geocodificador');

const MAX_FILAS = 2000;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) =>
    /\.xlsx$/i.test(file.originalname) ? cb(null, true) : cb(new Error('Solo se aceptan archivos .xlsx')),
});

router.use(protect);

const tipoValido = (req, res, next) =>
  ['edificios', 'infracciones', 'cruce', 'actas'].includes(req.params.tipo) ? next() : res.status(404).json({ message: 'Tipo inexistente' });

router.get('/plantilla/:tipo', tipoValido, (req, res) => {
  if (['cruce', 'actas'].includes(req.params.tipo)) return res.status(404).json({ message: 'Este formato se carga con el archivo tal cual, sin plantilla' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="plantilla-${req.params.tipo}.xlsx"`);
  res.send(generarPlantilla(req.params.tipo));
});

const subir = (req, res, next) =>
  upload.single('archivo')(req, res, (err) => (err ? res.status(400).json({ message: err.message }) : next()));

const fallo = (message) => Object.assign(new Error(message), { status: 400 });

async function preparar(req) {
  if (!req.file) throw fallo('Adjuntá un archivo .xlsx');
  const campana = await campanaDe(req);
  if (!campana) throw fallo('No hay una campaña activa');
  let filas;
  try {
    filas = { cruce: leerCruce, actas: leerActas }[req.params.tipo]?.(req.file.buffer) ?? leerHoja(req.file.buffer);
  } catch (e) {
    throw fallo(/cruce|listado de actas/i.test(e.message) ? e.message : 'No se pudo leer el archivo Excel');
  }
  if (!filas.length) throw fallo('El archivo no tiene filas de datos');
  if (filas.length > MAX_FILAS) throw fallo(`El archivo supera el máximo de ${MAX_FILAS} filas`);

  const { tipo } = req.params;
  let ctx;
  if (tipo === 'edificios' || tipo === 'cruce') {
    const ex = await Edificio.find({ campana }, 'direccionNorm').lean();
    ctx = { existentes: new Set(ex.map((e) => e.direccionNorm)) };
  } else {
    const [edif, mot, insp, est, ofi, exist] = await Promise.all([
      Edificio.find({ campana }, 'direccionNorm').lean(),
      MotivoInfraccion.find({ activo: true }),
      Inspector.find({ activo: true }),
      Estado.find({ activo: true }),
      Oficina.find({ activo: true }),
      Infraccion.find({}, 'numeroActa').lean(),
    ]);
    const calles = new Map();
    if (tipo === 'actas') (await Edificio.find({ campana }, 'calleNorm').lean()).forEach((e) => calles.set(e.calleNorm, (calles.get(e.calleNorm) || 0) + 1));
    const mapa = (docs) => new Map(docs.map((d) => [d.nombreNorm, d._id]));
    ctx = {
      edificios: new Map(edif.map((e) => [e.direccionNorm, String(e._id)])),
      motivos: mapa(mot),
      inspectores: mapa(insp),
      estados: mapa(est),
      oficinas: mapa(ofi),
      existentes: new Set(exist.map((a) => a.numeroActa)),
      crearEdificios: req.body.crearEdificios === 'true',
      permitirNuevos: tipo === 'actas' || (req.user.role === 'Administrador' && req.body.crearCatalogos === 'true'),
      calles,
    };
  }
  return { campana, ctx, resultado: validarFilas(tipo, filas, ctx) };
}

const resumir = (r) => ({
  fila: r.fila,
  direccion: r.data?.direccionOriginal || '',
  numero: r.data?.numero,
  errores: r.errores,
  avisos: r.avisos || [],
  unida: Boolean(r.unida),
  nuevos: r.nuevos,
});

router.post('/:tipo/previsualizar', tipoValido, permitir('importar'), subir, async (req, res) => {
  try {
    const { resultado } = await preparar(req);
    const validas = resultado.filter((r) => !r.errores.length).length;
    const unidas = resultado.filter((r) => r.unida).length;
    res.json({
      total: resultado.length,
      validas,
      conErrores: resultado.length - validas,
      unidas,
      conAvisos: resultado.filter((r) => r.avisos?.length && !r.unida).length,
      certificados: resultado.filter((r) => r.data?.cert?.tiene).length,
      filas: resultado.map(resumir),
    });
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message });
  }
});

router.post('/:tipo/confirmar', tipoValido, permitir('importar'), subir, async (req, res) => {
  let prep;
  try {
    prep = await preparar(req);
  } catch (e) {
    return res.status(e.status || 500).json({ message: e.message });
  }
  const { campana, ctx, resultado } = prep;
  let validas = resultado.filter((r) => !r.errores.length);
  if (!validas.length) return res.status(400).json({ message: 'No hay filas válidas para importar' });

  const lote = crypto.randomUUID();
  const { tipo } = req.params;

  if (tipo === 'cruce') {
    // Catálogo del certificado final: se crea una sola vez y queda editable en Catálogos.
    const motivo = await MotivoInfraccion.findOneAndUpdate(
      { nombreNorm: norm(MOTIVO_CERT) },
      { $setOnInsert: { nombre: MOTIVO_CERT, nombreNorm: norm(MOTIVO_CERT), descripcion: 'Edificio sin certificado final de inspección de Defensa Civil' } },
      { upsert: true, new: true }
    );
    const tipoDoc = await TipoDocumento.findOneAndUpdate(
      { nombreNorm: norm(TIPO_CERT) },
      { $setOnInsert: { nombre: TIPO_CERT, nombreNorm: norm(TIPO_CERT), requerido: true, tieneVencimiento: false, motivoAsociado: motivo._id, orden: 1 } },
      { upsert: true, new: true }
    );
    const reales = validas.filter((r) => !r.unida);
    const docs = reales.map(({ data }) => {
      const { cert, ...resto } = data;
      return { ...resto, campana, origen: 'excel', lotImportacion: lote, creadoPor: req.user._id };
    });
    const creados = await Edificio.insertMany(docs, { ordered: false });
    const documentos = creados.map((e, i) => {
      const { cert } = reales[i].data;
      const partes = [cert.expediente && `Expte. ${cert.expediente}`, cert.anio && `año ${cert.anio}`, cert.tiene && 'Cargado desde el cruce Catastro / Defensa Civil'].filter(Boolean);
      return {
        edificio: e._id,
        tipo: tipoDoc._id,
        presente: cert.tiene,
        nroReferencia: cert.numero,
        observaciones: partes.join(' · '),
        lotImportacion: lote,
      };
    });
    await DocumentoEdificio.insertMany(documentos, { ordered: false });
    audit('importar', 'Edificio', lote, req.user, `${creados.length} edificios (cruce Catastro / Defensa Civil)`);
    procesarPendientes({ campana });
    return res.status(201).json({
      lote,
      importadas: creados.length,
      unidas: validas.length - reales.length,
      omitidas: resultado.length - validas.length,
      conCertificado: documentos.filter((d) => d.presente).length,
      geocodificando: true,
    });
  }

  if (tipo === 'edificios') {
    const docs = validas.map((r) => ({ ...r.data, campana, origen: 'excel', lotImportacion: lote, creadoPor: req.user._id }));
    await Edificio.insertMany(docs, { ordered: false });
    audit('importar', 'Edificio', lote, req.user, `${docs.length} edificios`);
    procesarPendientes({ campana }); // arranca la geocodificación en segundo plano
    return res.status(201).json({ lote, importadas: docs.length, omitidas: resultado.length - docs.length, geocodificando: true });
  }

  // infracciones / actas: las filas unidas ya están incluidas en su acta principal
  const unidas = validas.filter((r) => r.unida).length;
  validas = validas.filter((r) => !r.unida);
  const [estadoIni, oficinaIni] = await Promise.all([Estado.findOne({ esInicial: true }), Oficina.findOne({ esInicial: true })]);
  if (!estadoIni || !oficinaIni)
    return res.status(409).json({ message: 'Falta definir el estado y la oficina iniciales en Catálogos' });

  // catálogos nuevos (solo Administrador con crearCatalogos)
  const alta = async (Model, nombres, mapa) => {
    for (const nombre of [...new Set(nombres)]) {
      const d = await Model.findOneAndUpdate(
        { nombreNorm: norm(nombre) },
        { $setOnInsert: { nombre, nombreNorm: norm(nombre) }, $set: { activo: true } },
        { upsert: true, new: true }
      );
      mapa.set(norm(nombre), d._id);
    }
  };
  await alta(MotivoInfraccion, validas.flatMap((r) => r.nuevos.motivos), ctx.motivos);
  await alta(Inspector, validas.flatMap((r) => r.nuevos.inspectores), ctx.inspectores);

  // edificios que faltan (se ubican después con la geocodificación)
  const faltan = new Map();
  validas.forEach((r) => { if (r.data.crearEdificio) faltan.set(r.data.dir.direccionNorm, r.data.dir); });
  const creados = faltan.size
    ? await Edificio.insertMany([...faltan.values()].map((d) => ({ ...d, campana, origen: 'excel', lotImportacion: lote, creadoPor: req.user._id })), { ordered: false })
    : [];
  creados.forEach((e) => ctx.edificios.set(e.direccionNorm, String(e._id)));

  const docs = validas.map(({ data: d }) => {
    const estado = d.estado || estadoIni._id;
    const oficina = d.oficina || oficinaIni._id;
    return {
      numeroActa: d.numeroActa,
      edificio: d.edificio || ctx.edificios.get(d.dir.direccionNorm),
      infractor: d.infractor,
      descripcion: d.descripcion || '',
      normativa: d.normativa || '',
      inspectoresActuantes: d.inspectoresNombres.map((n) => ctx.inspectores.get(norm(n))),
      motivosInfraccion: d.motivosNombres.map((n) => ctx.motivos.get(norm(n))),
      fechaInfraccion: d.fechaInfraccion,
      estado,
      oficinaActual: oficina,
      observaciones: Boolean(d.observaciones),
      detalleObservaciones: d.observaciones,
      historialMovimientos: [{ oficinaDestino: oficina, estado, por: req.user._id, comentarios: 'Importada desde Excel' }],
      origen: 'excel',
      lotImportacion: lote,
      creadoPor: req.user._id,
    };
  });
  await Infraccion.insertMany(docs, { ordered: false });
  audit('importar', 'Infraccion', lote, req.user, `${docs.length} infracciones, ${creados.length} edificios nuevos`);
  if (creados.length) procesarPendientes({ campana });
  res.status(201).json({ lote, importadas: docs.length, edificiosCreados: creados.length, unidas, omitidas: resultado.length - docs.length - unidas, geocodificando: creados.length > 0 });
});

// Revertir un lote. Los edificios con datos cargados después no se pueden revertir.
router.delete('/:tipo/lote/:lote', tipoValido, authorize(), async (req, res) => {
  const { tipo, lote } = req.params;
  if (tipo === 'infracciones' || tipo === 'actas') {
    const r = await Infraccion.deleteMany({ lotImportacion: lote, 'historialMovimientos.1': { $exists: false }, 'expediente.numero': '' });
    const total = await Infraccion.countDocuments({ lotImportacion: lote });
    if (total) return res.status(409).json({ message: `${total} infracciones del lote ya tuvieron pases o expediente y no se revierten`, eliminadas: r.deletedCount });
    // edificios creados por este lote que quedaron sin datos
    const nuevos = await Edificio.find({ lotImportacion: lote }, '_id').lean();
    const ids = nuevos.map((e) => e._id);
    const usados = await Infraccion.distinct('edificio', { edificio: { $in: ids } });
    const libres = ids.filter((id) => !usados.some((u) => String(u) === String(id)));
    const e = await Edificio.deleteMany({ _id: { $in: libres }, lotImportacion: lote });
    audit('revertir-lote', 'Infraccion', lote, req.user, `${r.deletedCount} infracciones, ${e.deletedCount} edificios`);
    return res.json({ eliminadas: r.deletedCount, edificiosEliminados: e.deletedCount });
  }
  const ids = (await Edificio.find({ lotImportacion: lote }, '_id').lean()).map((e) => e._id);
  if (!ids.length) return res.status(404).json({ message: 'Lote inexistente' });
  const [docs, actas, insp] = await Promise.all([
    DocumentoEdificio.exists({ edificio: { $in: ids }, lotImportacion: { $ne: lote } }),
    Infraccion.exists({ edificio: { $in: ids } }),
    Inspeccion.exists({ edificio: { $in: ids } }),
  ]);
  if (docs || actas || insp)
    return res.status(409).json({ message: 'Hay edificios del lote con documentación, infracciones o inspecciones cargadas' });
  await DocumentoEdificio.deleteMany({ edificio: { $in: ids }, lotImportacion: lote });
  const r = await Edificio.deleteMany({ lotImportacion: lote });
  audit('revertir-lote', 'Edificio', lote, req.user, `${r.deletedCount} eliminados`);
  res.json({ eliminadas: r.deletedCount });
});

module.exports = router;
