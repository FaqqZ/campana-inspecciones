// Crea el administrador inicial y una campaña vacía. No borra datos existentes.
require('dotenv').config();
const mongoose = require('mongoose');
const crypto = require('crypto');
const { User, Campana, MotivoInfraccion } = require('./models');
const { asegurarMotivos } = require('./services/actas');
const { migrar } = require('./migrateInfracciones');

(async () => {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/campana-inspecciones');
  const username = (process.env.ADMIN_USERNAME || 'admin').toLowerCase();
  if (await User.exists({ username })) {
    console.log(`El usuario "${username}" ya existe. No se hicieron cambios.`);
  } else {
    const password = process.env.ADMIN_PASSWORD || crypto.randomBytes(9).toString('base64url');
    await User.create({ nombres: 'Administrador', apellidos: 'Sistema', username, password, role: 'Administrador' });
    console.log(`Usuario creado: ${username}`);
    if (!process.env.ADMIN_PASSWORD) console.log(`Contraseña generada (guardala y cambiala): ${password}`);
  }
  if (!(await Campana.exists({}))) {
    await Campana.create({ nombre: `Campaña ${new Date().getFullYear()}`, descripcion: 'Relevamiento general de edificios' });
    console.log('Campaña inicial creada.');
  }
  await asegurarMotivos(MotivoInfraccion);
  console.log('Motivos de infracción verificados.');
  await migrar();
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
