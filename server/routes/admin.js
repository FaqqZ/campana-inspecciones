const router = require('express').Router();
const XLSX = require('xlsx');
const { CATEGORIAS, Campana, Edificio, DocumentoEdificio, Infraccion, Notificacion, FotoEdificio, Inspeccion, AuditLog } = require('../models');
const { protect, authorize } = require('../middleware/auth');
const { campanaDe, filtroCategoria, tiposActivos, sincronizarInspeccion } = require('../services/edificios');
const fotosStore = require('../services/fotosStore');
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
    const ev = evaluarEdificio(tipos, docsDe.get(String(e._id)) || [], new Date());
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

// ---- Eliminar lo cargado (solo Administrador). Los catálogos, usuarios, campaña y auditoría no se tocan. ----
const ALCANCES = ['todo', 'infracciones', 'notificaciones', 'fotos'];

// Alcance de la eliminación: una categoría (EDIFICIOS / COLEGIOS / BOLICHES) o TODAS. Cada categoría es una campaña propia.
// Devuelve null para TODAS (sin filtro) o el filtro por edificio de las campañas de esa categoría.
async function alcanceDe(categoria) {
  if (!categoria || categoria === 'TODAS') return { filtroEdificio: {}, filtroHijos: {}, todas: true };
  if (!CATEGORIAS.includes(categoria)) return null;
  const campanas = await Campana.find(filtroCategoria(categoria)).distinct('_id');
  const ids = await Edificio.find({ campana: { $in: campanas } }).setOptions({ incluirOcultos: true }).distinct('_id');
  return { filtroEdificio: { campana: { $in: campanas } }, filtroHijos: { edificio: { $in: ids } }, todas: false };
}

router.get('/datos', async (req, res) => {
  const a = await alcanceDe(req.query.categoria);
  if (!a) return res.status(400).json({ message: 'Categoría inválida' });
  const [edificios, infracciones, notificaciones, fotos] = await Promise.all([
    Edificio.countDocuments(a.filtroEdificio).setOptions({ incluirOcultos: true }),
    Infraccion.countDocuments(a.filtroHijos),
    Notificacion.countDocuments(a.filtroHijos),
    FotoEdificio.countDocuments(a.filtroHijos),
  ]);
  res.json({ edificios, infracciones, notificaciones, fotos });
});

router.delete('/datos', async (req, res) => {
  const { alcance, confirmar, categoria } = req.body || {};
  if (!ALCANCES.includes(alcance)) return res.status(400).json({ message: 'Alcance inválido' });
  if (confirmar !== 'ELIMINAR') return res.status(400).json({ message: 'Escribí ELIMINAR para confirmar' });
  const a = await alcanceDe(categoria);
  if (!a) return res.status(400).json({ message: 'Categoría inválida' });
  const borrados = {};
  if (alcance === 'todo' || alcance === 'infracciones') {
    borrados.infracciones = (await Infraccion.deleteMany(a.filtroHijos)).deletedCount;
  }
  if (alcance === 'todo' || alcance === 'notificaciones') {
    borrados.notificaciones = (await Notificacion.deleteMany(a.filtroHijos)).deletedCount;
  }
  if (alcance === 'todo' || alcance === 'fotos') {
    if (a.todas) {
      borrados.fotos = (await FotoEdificio.deleteMany({})).deletedCount;
      await fotosStore.borrarTodo();
    } else {
      const fotos = await FotoEdificio.find(a.filtroHijos).lean();
      for (const f of fotos) await fotosStore.borrar(f.edificio, f.archivo);
      borrados.fotos = (await FotoEdificio.deleteMany(a.filtroHijos)).deletedCount;
    }
  }
  if (alcance === 'todo') {
    borrados.documentos = (await DocumentoEdificio.deleteMany(a.filtroHijos)).deletedCount;
    borrados.inspecciones = (await Inspeccion.deleteMany(a.filtroHijos)).deletedCount;
    borrados.edificios = (await Edificio.deleteMany(a.filtroEdificio).setOptions({ incluirOcultos: true })).deletedCount;
  } else if (alcance === 'infracciones') {
    await sincronizarInspeccion();
  }
  await AuditLog.create({ accion: 'eliminar-datos', entidad: 'Campana', entidadId: `${alcance}:${categoria || 'TODAS'}`, usuario: req.user._id, detalle: JSON.stringify(borrados) });
  res.json({ borrados });
});

router.get('/auditoria', async (req, res) => {
  res.json(await AuditLog.find().sort('-createdAt').limit(200).populate('usuario', 'username'));
});

module.exports = router;
