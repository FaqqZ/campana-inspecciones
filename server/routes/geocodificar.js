const router = require('express').Router();
const { Edificio } = require('../models');
const { protect, authorize } = require('../middleware/auth');
const { campanaDe } = require('../services/edificios');
const { procesarPendientes, obtenerEstado } = require('../services/geocodificador');

router.use(protect);

// Inicia (o reanuda) la geocodificación de los pendientes de la campaña.
router.post('/', authorize('Carga'), async (req, res) => {
  const campana = await campanaDe(req);
  const iniciado = await procesarPendientes({ campana });
  res.status(iniciado ? 202 : 200).json({ iniciado, ...obtenerEstado() });
});

// Reintenta los fallidos poniéndolos otra vez en cola.
router.post('/reintentar-fallidos', authorize('Carga'), async (req, res) => {
  const campana = await campanaDe(req);
  const r = await Edificio.updateMany({ campana, geoEstado: 'fallido' }, { geoEstado: 'pendiente' });
  const iniciado = await procesarPendientes({ campana });
  res.json({ reencolados: r.modifiedCount, iniciado });
});

router.get('/progreso', async (req, res) => {
  const campana = await campanaDe(req);
  const filas = await Edificio.aggregate([{ $match: { campana } }, { $group: { _id: '$geoEstado', n: { $sum: 1 } } }]);
  const porEstado = Object.fromEntries(filas.map((f) => [f._id, f.n]));
  res.json({ ...obtenerEstado(), porEstado, pendientes: porEstado.pendiente || 0 });
});

module.exports = router;
