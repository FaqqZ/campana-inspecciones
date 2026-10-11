// Fotos de edificios desde un Word (.docx): cada dirección del documento reúne las imágenes que la siguen.
const JSZip = require('jszip');
const path = require('path');
const { norm, normalizarCalle } = require('./direcciones');
const { parseDomicilio, corregirCalle, direccionDeActa, CALLES } = require('./actas');

const EXT_VALIDAS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);
const TIPOS = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' };
const MAX_LARGO_DIRECCION = 90;

const decodificar = (s) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/** Texto de un párrafo: une los <w:t> y respeta saltos/tabulaciones como espacio. */
function textoDe(parrafo) {
  const partes = [];
  const re = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br\/>/g;
  let m;
  while ((m = re.exec(parrafo))) partes.push(m[1] !== undefined ? decodificar(m[1]) : ' ');
  return partes.join('').replace(/\s+/g, ' ').trim();
}

/** Quita numeración y rótulos ("1.", "- ", "Dirección:") antes de interpretar una dirección. */
const limpiarDireccion = (t) => t.replace(/^(\d+\s*[.)-]\s+|[-–•*]\s*)/, '').replace(/^(direcci[oó]n|domicilio|ubicaci[oó]n)\s*:?\s*/i, '').trim();

/** ¿La calle de este texto es una calle conocida (o casi, por un error de tipeo)? */
function calleConocida(calleNorm, conocidas) {
  if (!conocidas) return true;
  const c = normalizarCalle(CALLES[calleNorm] || calleNorm);
  if (conocidas.has(c)) return true;
  return c.length >= 6 && Boolean(corregirCalle(c, new Map([...conocidas].map((k) => [k, 99]))));
}

const ROTULOS = /^(foto|fotograf[ií]a|imagen|img|fig|figura|vista|captura|p[aá]g)\b/i;

/**
 * Interpreta un párrafo como dirección, o devuelve null si es otro tipo de texto.
 * Con permitirNuevas, también acepta calles que no están en la base (para crear el edificio), pero solo si el
 * texto no es un rótulo ("Foto 2") y tiene el aspecto de una dirección ("Calle N°123" o "Calle 123").
 */
function comoDireccion(texto, conocidas, { permitirNuevas = false } = {}) {
  const t = limpiarDireccion(texto);
  if (!t || t.length > MAX_LARGO_DIRECCION) return null;
  const dom = parseDomicilio(t);
  if (dom.error) return null;
  const calleNorm = normalizarCalle(dom.calle);
  if (!calleNorm || !/[a-z]/.test(calleNorm)) return null;
  if (!calleConocida(calleNorm, conocidas) && !(permitirNuevas && !ROTULOS.test(t) && calleNorm.length >= 3)) return null;
  return dom;
}

/**
 * Recorre el documento en orden y agrupa las imágenes bajo la última dirección leída.
 * callesConocidas: Set de calleNorm de la base; si se pasa, solo cuentan como dirección los textos con una calle conocida.
 * Devuelve { grupos:[{ texto, dom, fotos:[{ nombre, ext, tipo, buffer }] }], sinDireccion, ignoradas }
 */
async function extraerGrupos(buffer, { callesConocidas, permitirNuevas = false } = {}) {
  let zip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new Error('No se pudo leer el archivo Word (¿es un .docx?)');
  }
  const docXml = await zip.file('word/document.xml')?.async('string');
  if (!docXml) throw new Error('El archivo no parece un documento Word (.docx)');
  const relsXml = (await zip.file('word/_rels/document.xml.rels')?.async('string')) || '';
  const destinos = new Map();
  for (const m of relsXml.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = m[0].match(/\bId="([^"]+)"/)?.[1];
    const target = m[0].match(/\bTarget="([^"]+)"/)?.[1];
    if (id && target) destinos.set(id, target.replace(/^\/?(word\/)?/, 'word/'));
  }

  const grupos = [];
  let actual = null;
  let sinDireccion = 0;
  let ignoradas = 0;
  const usadas = new Set();

  for (const p of docXml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || []) {
    const texto = textoDe(p);
    const dom = texto ? comoDireccion(texto, callesConocidas, { permitirNuevas }) : null;
    if (dom) {
      actual = { texto, dom, fotos: [], informe: [] };
      grupos.push(actual);
    }
    else if (texto && actual && !ROTULOS.test(texto)) actual.informe.push(texto.replace(/^["“”'‘’]+|["“”'‘’]+$/g, '').trim());
    const ids = [...p.matchAll(/<(?:a:blip|v:imagedata)\b[^>]*?\b(?:r:embed|r:id)="([^"]+)"/g)].map((m) => m[1]);
    for (const id of ids) {
      const ruta = destinos.get(id);
      const ext = ruta ? path.extname(ruta).toLowerCase() : '';
      if (!ruta || !EXT_VALIDAS.has(ext)) { ignoradas++; continue; }
      const archivo = zip.file(ruta);
      if (!archivo) { ignoradas++; continue; }
      if (!actual) { sinDireccion++; continue; }
      const clave = `${grupos.length}:${ruta}`;
      if (usadas.has(clave)) continue; // la misma imagen repetida bajo la misma dirección
      usadas.add(clave);
      actual.fotos.push({ nombre: path.basename(ruta), ext, tipo: TIPOS[ext], buffer: await archivo.async('nodebuffer') });
    }
  }
  return { grupos, sinDireccion, ignoradas };
}

/**
 * Cruza los grupos con los edificios. Función pura.
 * ctx: { edificios:Map(direccionNorm -> id), porCalle:Map(calleNorm -> [{id,numero}]), calles:Map(calleNorm -> cantidad), crearEdificios }
 * Devuelve [{ fila, direccion, edificio, crearEdificio, dir, fotos, errores, avisos }] (una por dirección distinta).
 */
function resolverGrupos(grupos, ctx) {
  const conteo = new Map(ctx.calles || []);
  const porDireccion = new Map();
  const salida = [];
  grupos.forEach((g, i) => {
    const errores = [];
    const avisos = [];
    const calleNorm = normalizarCalle(CALLES[normalizarCalle(g.dom.calle)] || g.dom.calle);
    let calle = g.dom.calle;
    const corr = corregirCalle(calleNorm, conteo);
    if (corr) {
      avisos.push(`Calle "${g.dom.calle}" corregida a "${corr}"`);
      calle = corr;
    }
    const dir = direccionDeActa(g.dom, calle);
    const previo = porDireccion.get(dir.direccionNorm);
    if (previo) {
      previo.fotos.push(...g.fotos);
      if (g.informe.length) previo.informe = [previo.informe, g.informe.join('\n\n')].filter(Boolean).join('\n\n');
      previo.avisos.push(`La dirección aparece de nuevo en el documento (grupo ${i + 1}): se sumaron sus fotos`);
      return;
    }
    let edificio = ctx.edificios.get(dir.direccionNorm) || null;
    let crearEdificio = false;
    if (!edificio) {
      if (ctx.crearEdificios) {
        crearEdificio = true;
        avisos.push(`Se creará el edificio ${dir.direccionOriginal}`);
      } else errores.push(`No existe un edificio en ${dir.direccionOriginal}`);
    }
    if (!g.fotos.length) errores.push('No tiene imágenes debajo de la dirección');
    const r = { fila: i + 1, direccion: dir.direccionOriginal, edificio, crearEdificio, dir, fotos: [...g.fotos], informe: g.informe.join('\n\n'), errores, avisos };
    porDireccion.set(dir.direccionNorm, r);
    salida.push(r);
  });
  return salida;
}

module.exports = { extraerGrupos, resolverGrupos, comoDireccion, textoDe, EXT_VALIDAS };
