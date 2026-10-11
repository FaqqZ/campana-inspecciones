// Archivos de fotos de edificios en disco (server/uploads/edificios/<edificioId>/). No se versionan.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RAIZ = path.join(__dirname, '..', 'uploads', 'edificios');

const carpeta = (edificioId) => path.join(RAIZ, String(edificioId));

/** Guarda el buffer y devuelve el nombre de archivo generado. */
async function guardar(edificioId, buffer, ext) {
  const dir = carpeta(edificioId);
  await fs.promises.mkdir(dir, { recursive: true });
  const archivo = `${crypto.randomUUID()}${ext}`;
  await fs.promises.writeFile(path.join(dir, archivo), buffer);
  return archivo;
}

/** Ruta absoluta de un archivo guardado, validando que no se salga de la carpeta del edificio. */
function ruta(edificioId, archivo) {
  const dir = carpeta(edificioId);
  const p = path.join(dir, path.basename(archivo));
  return p.startsWith(dir + path.sep) ? p : null;
}

async function borrar(edificioId, archivo) {
  const p = ruta(edificioId, archivo);
  if (p) await fs.promises.rm(p, { force: true });
  await fs.promises.rmdir(carpeta(edificioId)).catch(() => {}); // si quedó vacía
}

module.exports = { guardar, ruta, borrar };
