// Migración no destructiva e idempotente al módulo de infracciones:
//  1. siembra estados y oficinas si no hay ninguno (editables luego en Catálogos),
//  2. renombra el rol "Carga" a "Tecnico",
//  3. pasa las actas vinculadas viejas (colección actavinculadas) a Infraccion.
// Se ejecuta con `npm run migrate:infracciones` y también desde el seeder.
require('dotenv').config();
const mongoose = require('mongoose');
const { Estado, Oficina, Infraccion, User, Inspector, norm } = require('./models');

const ESTADOS = [
  { nombre: 'Ingresado', esInicial: true, orden: 1 },
  { nombre: 'En revisión', orden: 2 },
  { nombre: 'Observado', requiereComentario: true, orden: 3 },
  { nombre: 'Pase externo', requiereComentario: true, orden: 4 },
  { nombre: 'Aprobado', orden: 5 },
  { nombre: 'Rechazado', orden: 6 },
  { nombre: 'Finalizado', esFinal: true, orden: 7 },
];
const OFICINAS = [
  { nombre: 'Oficina Técnica', esInicial: true, orden: 1 },
  { nombre: 'Mesa de Entradas', orden: 2 },
  { nombre: 'Jurídico', orden: 3 },
  { nombre: 'Dirección', orden: 4 },
];

async function migrar(log = console.log) {
  if ((await Estado.countDocuments()) === 0) {
    for (const e of ESTADOS) await Estado.create(e);
    log(`Estados creados: ${ESTADOS.length}`);
  }
  if ((await Oficina.countDocuments()) === 0) {
    for (const o of OFICINAS) await Oficina.create(o);
    log(`Oficinas creadas: ${OFICINAS.length}`);
  }
  const roles = await User.collection.updateMany({ role: 'Carga' }, { $set: { role: 'Tecnico' } });
  if (roles.modifiedCount) log(`Usuarios con rol Carga pasados a Tecnico: ${roles.modifiedCount}`);

  const viejas = await mongoose.connection.collection('actavinculadas').find({}).toArray().catch(() => []);
  if (viejas.length) {
    const estado = await Estado.findOne({ esInicial: true });
    const oficina = await Oficina.findOne({ esInicial: true });
    const admin = await User.findOne({ role: 'Administrador' });
    const inspSd = await Inspector.findOneAndUpdate({ nombreNorm: norm('Sin especificar') }, { $setOnInsert: { nombre: 'Sin especificar', nombreNorm: norm('Sin especificar') } }, { upsert: true, new: true });
    let n = 0;
    for (const a of viejas) {
      if (await Infraccion.exists({ numeroActa: a.numero })) continue;
      await Infraccion.create({
        numeroActa: a.numero, edificio: a.edificio, fechaInfraccion: a.fecha || a.createdAt,
        inspectoresActuantes: [inspSd._id], motivosInfraccion: a.motivos || [], estado: estado._id, oficinaActual: oficina._id,
        observaciones: Boolean(a.observaciones), detalleObservaciones: a.observaciones || '',
        historialMovimientos: [{ oficinaDestino: oficina._id, estado: estado._id, por: admin._id, comentarios: 'Migrada desde actas vinculadas' }],
        expediente: a.tipo === 'expediente' ? { numero: a.numero, fecha: a.fecha } : undefined,
        origen: a.origen || 'manual', lotImportacion: a.lotImportacion,
      });
      n += 1;
    }
    log(`Actas vinculadas migradas: ${n}`);
  }
}

module.exports = { migrar, ESTADOS, OFICINAS };

if (require.main === module) {
  mongoose
    .connect(process.env.MONGO_URI || 'mongodb://localhost:27017/campana-inspecciones')
    .then(() => migrar())
    .then(() => mongoose.disconnect())
    .then(() => console.log('Migración lista.'))
    .catch((e) => { console.error(e); process.exit(1); });
}
