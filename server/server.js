require('express-async-errors');
require('dotenv').config();
const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const helmet = require('helmet');
const cors = require('cors');

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 || /poner-una-clave/i.test(process.env.JWT_SECRET)) {
  console.error('JWT_SECRET debe definirse en .env con al menos 32 caracteres.');
  process.exit(1);
}

const { auth, users } = require('./routes/auth');

const app = express();
// Detrás de Caddy/Nginx: toma la IP real del cliente (necesario para el límite de intentos de login).
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
app.get('/api/health', (req, res) => {
  const ok = mongoose.connection.readyState === 1;
  res.status(ok ? 200 : 503).json({ ok });
});
// INSECURE_HTTP=true: acceso por HTTP plano (red interna, sin proxy con HTTPS). Sin esto helmet obliga a cargar los
// recursos por HTTPS y HSTS fija HTTPS en el navegador, y la página no abre en una IP que no sea localhost.
const sinHttps = process.env.INSECURE_HTTP === 'true';
app.use(
  helmet({
    hsts: !sinHttps,
    // OSM rechaza los mosaicos sin Referer (helmet por defecto manda no-referrer)
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        ...(sinHttps && { 'upgrade-insecure-requests': null }),
        'img-src': ["'self'", 'data:', 'blob:', 'https://tile.openstreetmap.org', 'https://*.tile.openstreetmap.org'], // blob: para las fotos de los edificios (se piden con sesión)
      },
    },
  })
);
app.use(cors({ origin: process.env.CORS_ORIGIN || false }));
app.use(express.json({ limit: '100kb' }));

app.use('/api/auth', auth);
app.use('/api/users', users);
app.use('/api/catalogos', require('./routes/catalogos'));
app.use('/api/edificios', require('./routes/edificios'));
app.use('/api/infracciones', require('./routes/infracciones'));
app.use('/api/notificaciones', require('./routes/notificaciones'));
app.use('/api/importar', require('./routes/importar'));
app.use('/api/geocodificar', require('./routes/geocodificar'));
app.use('/api/admin', require('./routes/admin'));

if (process.env.SERVE_CLIENT === 'true') {
  const dist = path.join(__dirname, '..', 'client', 'dist');
  app.use(express.static(dist));
  app.get(/^\/(?!api).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ message: err.status ? err.message : 'Error interno del servidor' });
});
process.on('unhandledRejection', (e) => console.error('unhandledRejection', e));

const PORT = process.env.PORT || 5003;
mongoose
  .connect(process.env.MONGO_URI || 'mongodb://localhost:27017/campana-inspecciones')
  .then(() => app.listen(PORT, () => console.log(`API escuchando en :${PORT}`)))
  .catch((e) => {
    console.error('No se pudo conectar a MongoDB', e.message);
    process.exit(1);
  });
