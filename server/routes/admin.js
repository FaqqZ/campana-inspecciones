const router = require('express').Router();
const XLSX = require('xlsx');
const { Edificio, DocumentoEdificio, Infraccion, AuditLog } = require('../models');
const { protect, authorize } = require('../middleware/auth');
const { campanaDe, tiposActivos } = require('../services/edificios');
const { evaluarEdificio } = require('../services/semaforo');

router.use(protect, authorize());

const dia = (d) => (d ? new Date(d).toISOString().slice(0, 10).split('-').reverse().join('/') : '');

// Exportación completa de la campaña (una fila por edificio)
router.get('/respaldo', async (req, res) => {
  const campana = await campanaDe(req);
  const [edificios, tipos] = await Promise.all([Edificio.find({ campana }).sort('calleNorm numero').lean(), tiposActivos()]);
  const ids = edificios.map((e) => e._id);
  const [docs, actas] = await Promise.all([
    DocumentoEdificio.find({ edificio: { $in: ids } }).lean(),
    Infraccion.find({ edificio: { $in: ids }, eliminado: false }).lean(),
  ]);
  const docsDe = new Map();
  docs.forEach((d) => docsDe.set(String(d.edificio), [...(docsDe.get(String(d.edificio)) || []), d]));
  const actasDe = new Map();
  actas.forEach((a) => actasDe.set(String(a.edificio), [...(actasDe.get(String(a.edificio)) || []), a]));

  const filas = edificios.map((e) => {
    const ev = evaluarEdificio(tipos, docsDe.get(String(e._id)) || []);
    const fila = {
      Calle: e.calle,
      Número: e.numero || '',
      Latitud: e.lat ?? '',
      Longitud: e.lng ?? '',
      Ubicación: e.geoEstado,
      Titular: e.titular,
      Uso: e.uso,
      Inspección: e.estadoInspeccion,
      Semáforo: ev.semaforo,
    };
    ev.detalle.forEach(({ tipo, doc, estado }) => {
      fila[tipo.nombre] = estado;
      if (tipo.tieneVencimiento) fila[`${tipo.nombre} (vence)`] = dia(doc?.fechaVencimiento);
    });
    fila['Posibles infracciones'] = ev.infraccionesPotenciales.map((i) => i.motivo?.nombre).filter(Boolean).join('; ');
    fila.Infracciones = (actasDe.get(String(e._id)) || []).map((a) => a.numeroActa).join('; ');
    fila.Observaciones = e.observaciones;
    return fila;
  });
  const ws = XLSX.utils.json_to_sheet(filas);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Edificios');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="campana-respaldo.xlsx"');
  res.send(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
});

router.get('/auditoria', async (req, res) => {
  res.json(await AuditLog.find().sort('-createdAt').limit(200).populate('usuario', 'username'));
});

module.exports = router;
