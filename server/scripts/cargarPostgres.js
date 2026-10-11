// Aplica los scripts SQL de db/postgres/ sobre una base PostgreSQL vacía.
//   DATABASE_URL=postgres://usuario:clave@host:5432/base node scripts/cargarPostgres.js [--solo-esquema]
// Equivale a: psql "$DATABASE_URL" -f db/postgres/001_esquema.sql -f db/postgres/datos/002_datos.sql
// Cada archivo corre en una sola transacción: si algo falla (incluida la verificación de conteos), no queda nada a medias.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const DIR = path.join(__dirname, '..', '..', 'db', 'postgres');
const soloEsquema = process.argv.includes('--solo-esquema');

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('Definí DATABASE_URL (postgres://usuario:clave@host:5432/base).');
    process.exit(1);
  }
  const archivos = [['esquema', path.join(DIR, '001_esquema.sql')]];
  if (!soloEsquema) archivos.push(['datos', path.join(DIR, 'datos', '002_datos.sql')]);
  for (const [nombre, f] of archivos) {
    if (!fs.existsSync(f)) {
      console.error(`Falta ${f}${nombre === 'datos' ? ' (generalo con: npm run pg:exportar)' : ''}`);
      process.exit(1);
    }
  }

  const cliente = new Client({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined });
  await cliente.connect();
  try {
    const { rows } = await cliente.query("SELECT to_regclass('public.edificios') AS t");
    if (rows[0].t) {
      console.error('La base ya tiene tablas de la aplicación (edificios). Usá una base vacía.');
      process.exit(1);
    }
    for (const [nombre, f] of archivos) {
      process.stdout.write(`Aplicando ${nombre}… `);
      await cliente.query(fs.readFileSync(f, 'utf8'));
      console.log('listo');
    }
    const { rows: c } = await cliente.query(
      "SELECT (SELECT count(*) FROM edificios)::int AS edificios, (SELECT count(*) FROM infracciones)::int AS infracciones, (SELECT count(*) FROM notificaciones)::int AS notificaciones, (SELECT count(*) FROM fotos_edificio)::int AS fotos"
    );
    console.table(c);
  } catch (e) {
    console.error(`Falló: ${e.message}${e.position ? ` (posición ${e.position})` : ''}`);
    process.exitCode = 1;
  } finally {
    await cliente.end();
  }
}
main();
