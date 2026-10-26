const router = require('express').Router();
const { CATEGORIAS, Inspector, MotivoInfraccion, TipoDocumento, Estado, Oficina, Campana, DocumentoEdificio, Infraccion, Inspeccion, Edificio } = require('../models');
const { protect, authorize, permitir, audit } = require('../middleware/auth');

router.use(protect);

// Cada catálogo: modelo, campos editables y chequeo de uso antes de borrar.
const CATALOGOS = {
  inspectores: {
    Model: Inspector,
    campos: ['nombre', 'legajo', 'activo'],
    enUso: async (id) => (await Inspeccion.exists({ inspector: id })) || (await Infraccion.exists({ inspectoresActuantes: id })),
  },
  motivos: {
    Model: MotivoInfraccion,
    campos: ['nombre', 'descripcion', 'activo'],
    enUso: async (id) => (await Infraccion.exists({ motivosInfraccion: id })) || (await TipoDocumento.exists({ motivoAsociado: id })),
  },
  estados: {
    Model: Estado,
    campos: ['nombre', 'descripcion', 'esInicial', 'requiereComentario', 'esFinal', 'orden', 'activo'],
    enUso: (id) => Infraccion.exists({ estado: id }),
    unico: ['esInicial', 'esFinal'], // solo uno puede tener la bandera
  },
  oficinas: {
    Model: Oficina,
    campos: ['nombre', 'descripcion', 'esInicial', 'orden', 'activo'],
    enUso: async (id) => (await Infraccion.exists({ oficinaActual: id })) || (await Infraccion.exists({ 'historialMovimientos.oficinaDestino': id })),
    unico: ['esInicial'],
  },
  'tipos-documento': {
    Model: TipoDocumento,
    campos: ['nombre', 'requerido', 'tieneVencimiento', 'motivoAsociado', 'orden', 'activo'],
    enUso: (id) => DocumentoEdificio.exists({ tipo: id }),
  },
};

Object.entries(CATALOGOS).forEach(([ruta, { Model, campos, enUso, unico = [] }]) => {
  router.get(`/${ruta}`, async (req, res) => {
    const filtro = req.query.todos === 'true' ? {} : { activo: true };
    res.json(await Model.find(filtro).sort(['tipos-documento', 'estados', 'oficinas'].includes(ruta) ? 'orden nombre' : 'nombre'));
  });

  const aplicar = (doc, body) => {
    campos.forEach((k) => {
      if (body[k] !== undefined) doc[k] = body[k] === '' && k === 'motivoAsociado' ? null : body[k];
    });
    return doc;
  };

  const exclusivas = (doc) => Promise.all(unico.filter((k) => doc[k]).map((k) => Model.updateMany({ _id: { $ne: doc._id }, [k]: true }, { [k]: false })));

  router.post(`/${ruta}`, permitir('editarCatalogos'), async (req, res) => {
    if (!String(req.body.nombre || '').trim()) return res.status(400).json({ message: 'El nombre es obligatorio' });
    try {
      const doc = await aplicar(new Model(), req.body).save();
      await exclusivas(doc);
      audit('crear', Model.modelName, doc._id, req.user, doc.nombre);
      res.status(201).json(doc);
    } catch (e) {
      if (e.code === 11000) return res.status(409).json({ message: 'Ya existe un registro con ese nombre' });
      throw e;
    }
  });

  router.patch(`/${ruta}/:id`, permitir('editarCatalogos'), async (req, res) => {
    const doc = await Model.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'No encontrado' });
    try {
      await aplicar(doc, req.body).save();
      await exclusivas(doc);
      audit('editar', Model.modelName, doc._id, req.user, doc.nombre);
      res.json(doc);
    } catch (e) {
      if (e.code === 11000) return res.status(409).json({ message: 'Ya existe un registro con ese nombre' });
      throw e;
    }
  });

  router.delete(`/${ruta}/:id`, authorize(), async (req, res) => {
    if (await enUso(req.params.id))
      return res.status(409).json({ message: 'Está en uso; desactivalo en lugar de eliminarlo' });
    const doc = await Model.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ message: 'No encontrado' });
    audit('eliminar', Model.modelName, doc._id, req.user, doc.nombre);
    res.json({ ok: true });
  });
});

// ---- Campañas ----
router.get('/campanas', async (req, res) => res.json(await Campana.find().sort('-createdAt')));

router.post('/campanas', authorize(), async (req, res) => {
  if (!String(req.body.nombre || '').trim()) return res.status(400).json({ message: 'El nombre es obligatorio' });
  const { nombre, descripcion, fechaInicio, fechaFin, categoria } = req.body;
  if (categoria !== undefined && !CATEGORIAS.includes(categoria)) return res.status(400).json({ message: 'Categoría inválida' });
  const c = await Campana.create({ nombre, descripcion, fechaInicio, fechaFin, categoria });
  audit('crear', 'Campana', c._id, req.user, c.nombre);
  res.status(201).json(c);
});

router.patch('/campanas/:id', authorize(), async (req, res) => {
  const c = await Campana.findById(req.params.id);
  if (!c) return res.status(404).json({ message: 'No encontrada' });
  ['nombre', 'descripcion', 'fechaInicio', 'fechaFin', 'activa'].forEach((k) => {
    if (req.body[k] !== undefined) c[k] = req.body[k];
  });
  await c.save();
  audit('editar', 'Campana', c._id, req.user, c.nombre);
  res.json(c);
});

router.delete('/campanas/:id', authorize(), async (req, res) => {
  if (await Edificio.exists({ campana: req.params.id }))
    return res.status(409).json({ message: 'La campaña tiene edificios; desactivala en lugar de eliminarla' });
  await Campana.findByIdAndDelete(req.params.id);
  audit('eliminar', 'Campana', req.params.id, req.user);
  res.json({ ok: true });
});

module.exports = router;
