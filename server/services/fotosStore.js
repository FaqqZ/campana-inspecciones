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

/** Borra todas las fotos de todos los edificios. */
async function borrarTodo() {
  await fs.promises.rm(RAIZ, { recursive: true, force: true });
}

/** Reconoce PNG / JPEG / GIF / WebP por su contenido (no por el nombre ni el tipo que declara el navegador). */
function detectarImagen(b) {
  if (!Buffer.isBuffer(b) || b.length < 12) return null;
  if (b[0] === 0x89 && b.toString('latin1', 1, 4) === 'PNG') return { ext: '.png', tipo: 'image/png' };
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: '.jpg', tipo: 'image/jpeg' };
  if (b.toString('latin1', 0, 3) === 'GIF') return { ext: '.gif', tipo: 'image/gif' };
  if (b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return { ext: '.webp', tipo: 'image/webp' };
  return null;
}

module.exports = { detectarImagen, guardar, ruta, borrar, borrarTodo };
