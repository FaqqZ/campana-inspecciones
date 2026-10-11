// Listado de actas de infracción de Defensa Civil ("Campaña de Edificios de la Ciudad de San Miguel de Tucumán").
// Funciones puras: ubican la tabla dentro de la hoja, interpretan el domicilio y clasifican el motivo.
const XLSX = require('xlsx');
const { norm, normalizarCalle, titulo } = require('./direcciones');

/** Calles escritas de forma abreviada en el listado -> nombre completo (clave: normalizarCalle). */
const CALLES = { santiago: 'Santiago del Estero' };
const ESQUINAS = { aya: 'Ayacucho', cha: 'Chacabuco' };

/** Ubica la fila de encabezados (Domicilio + Acta) y devuelve las filas de datos con su número de fila real. */
function filasDeActas(matriz) {
  const idx = matriz.findIndex((f) => {
    const n = f.map(norm);
    return n.includes('domicilio') && n.some((c) => c.includes('acta'));
  });
  if (idx < 0) return null;
  const cab = matriz[idx].map(norm);
  const col = (pred) => cab.findIndex(pred);
  const c = {
    fecha: col((h) => h === 'fecha'),
    domicilio: col((h) => h === 'domicilio'),
    razon: col((h) => h.includes('razon social') || h.includes('infractor')),
    acta: col((h) => h.includes('acta')),
    motivo: col((h) => h === 'motivo'),
    normativa: col((h) => h.includes('normativa')),
  };
  return matriz
    .slice(idx + 1)
    .map((f, i) => ({
      _fila: idx + 2 + i,
      fecha: f[c.fecha],
      domicilio: f[c.domicilio],
      razon: f[c.razon],
      acta: f[c.acta],
      motivo: f[c.motivo],
      normativa: f[c.normativa],
    }))
    .filter((r) => [r.domicilio, r.acta, r.motivo].some((v) => String(v ?? '').trim() !== ''));
}

function leerActas(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error('El archivo no tiene hojas');
  const filas = filasDeActas(XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true }));
  if (!filas) throw new Error('No parece un listado de actas: no se encontró la fila con Domicilio y N° de Acta');
  return filas;
}

/** Fecha de la celda: serial de Excel o texto dd/mm/aaaa. null si falta, undefined si es inválida. Se guarda a las 12:00 UTC. */
function fechaDeActa(v) {
  if (v === '' || v === undefined || v === null) return null;
  if (typeof v === 'number') {
    const p = XLSX.SSF.parse_date_code(v);
    return p ? new Date(Date.UTC(p.y, p.m - 1, p.d, 12)) : undefined;
  }
  const m = String(v).trim().match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (!m) return undefined;
  const [, d, mo, y] = m.map(Number);
  const date = new Date(Date.UTC(y, mo - 1, d, 12));
  return date.getUTCMonth() === mo - 1 && date.getUTCDate() === d ? date : undefined;
}

const limpiar = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

/**
 * "Av. Mate de Luna N:2098", "San Martin N° 573/75", "24 de SeptiembreEsq Aya".
 * Devuelve { calle, numero, esquina, texto } o { error }.
 */
function parseDomicilio(texto) {
  const s = limpiar(texto).replace(/\.(?=\S)/g, '. ');
  if (!s) return { error: 'Domicilio es obligatorio' };
  let m = s.match(/^(.*?)(?:^|\s)N\s*[°º:.]*\s*(\d{1,6})(?:\s*(?:\/|-|al)\s*\d+)?\s*$/i);
  if (m && m[1]) return { calle: m[1].trim(), numero: Number(m[2]), esquina: '', texto: s };
  m = s.match(/^(.*?)\s*\besq(?:uina)?\b\.?\s*(\S.*)$/i) || s.match(/^(.*?)esq\.?\s*(\S.*)$/i);
  if (m && m[1]) return { calle: m[1].trim(), numero: null, esquina: limpiar(m[2]), texto: s };
  m = s.match(/^(.*?)\s+(\d{1,6})(?:\s*\/\s*\d+)?$/);
  if (m && m[1]) return { calle: m[1].trim(), numero: Number(m[2]), esquina: '', texto: s };
  return { error: `No se pudo interpretar el domicilio: "${s}"` };
}

/** Distancia de edición (Levenshtein). */
function distancia(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

/** Si la calle no es conocida y hay una muy parecida y más usada (error de tipeo), la devuelve. */
function corregirCalle(calleNorm, conteo) {
  const propio = conteo.get(calleNorm) || 0;
  if (calleNorm.length < 6) return null;
  let mejor = null;
  for (const [otra, n] of conteo) {
    if (otra === calleNorm || n <= propio || distancia(otra, calleNorm) > 1) continue;
    if (!mejor || n > mejor.n) mejor = { calleNorm: otra, n };
  }
  return mejor && mejor.calleNorm;
}

/** Motivos del catálogo (nombre + normativa que los respalda). Los clasifica clasificarMotivos. */
const MOTIVOS = {
  documentacion: 'No presentar documentación técnica',
  venc: 'Extintor vencido',
  extintores: 'Falta de extintores',
  luces: 'Faltan luces de emergencia',
  noPermite: 'No permite la inspección',
  balizas: 'Faltan balizas',
  boleta: 'Incumplimiento de boleta de notificación',
  red: 'Red de incendio incompleta (mangueras, lanzas, picos, nichos, bocas)',
  otros: 'Otros motivos',
};
const DESCRIPCIONES = {
  [MOTIVOS.documentacion]: 'Ord. 251/74 - Art. 3',
  [MOTIVOS.venc]: 'Dto. 756/97 - Art. 3',
  [MOTIVOS.extintores]: 'Ord. 251/74',
  [MOTIVOS.luces]: 'Ord. 2119/93 - Art. 3',
  [MOTIVOS.noPermite]: 'Ord. 229/77 - Art. 27',
  [MOTIVOS.balizas]: 'Ord. 539/80 - Art. 1',
  [MOTIVOS.boleta]: 'Ord. 250/74 - Art. 2 y 3',
  [MOTIVOS.red]: 'Ord. 251/74 - Art. 6',
};

/**
 * Motivos que corresponden al acta, según su normativa y el texto (puede ser más de uno).
 * Las normativas que identifican un único motivo lo fijan; en las ambiguas (Dto. 756/97, Ord. 251/74 Art. 6,
 * a veces mal tipeadas) manda el texto y la normativa solo sirve si el texto no alcanza.
 */
function clasificarMotivos(texto, normativa = '') {
  const t = norm(texto);
  const n = norm(normativa).replace(/\s+/g, '');
  const out = new Set();
  const art = (ley, num) => new RegExp(`${ley}[^/]*?-?art\\.?(n°|n)?${num}\\b`).test(n);

  // por normativa (inequívoca)
  if (/250\/74/.test(n)) out.add(MOTIVOS.boleta);
  if (/2[29]9\/77/.test(n)) out.add(MOTIVOS.noPermite);
  if (/2119\/93/.test(n)) out.add(MOTIVOS.luces);
  if (/539\/80/.test(n)) out.add(MOTIVOS.balizas);
  if (/251\/74/.test(n) && art('251\\/74', 3)) out.add(MOTIVOS.documentacion);

  // por texto
  if (/no permit/.test(t)) out.add(MOTIVOS.noPermite);
  if (/cumpli|cumplie/.test(t)) out.add(MOTIVOS.boleta);
  if (/document/.test(t)) out.add(MOTIVOS.documentacion);
  const extintor = /extint|extinotres|\babc\b|\bbc\b|abcx|bcx/.test(t);
  if (/\bluz\b|luces/.test(t)) out.add(MOTIVOS.luces);
  if (/baliza/.test(t)) out.add(MOTIVOS.balizas);
  if (extintor && /venc/.test(t)) out.add(MOTIVOS.venc);
  else if (extintor) out.add(MOTIVOS.extintores);
  if (/mangu|magueras|lanza|\bpico|boquilla|nicho|\bboca|gabinete/.test(t)) out.add(MOTIVOS.red);

  // normativa ambigua: solo si el texto no dijo nada
  if (!out.size) {
    if (/756\/97/.test(n)) out.add(MOTIVOS.venc);
    else if (/251\/74/.test(n) && art('251\\/74', 6)) out.add(MOTIVOS.red);
  }
  return out.size ? [...out] : [MOTIVOS.otros];
}

/** Crea los motivos que falten (por nombre) y completa la normativa en los que no la tienen. */
async function asegurarMotivos(Model) {
  for (const nombre of Object.values(MOTIVOS)) {
    const descripcion = DESCRIPCIONES[nombre] || '';
    const d = await Model.findOneAndUpdate({ nombreNorm: norm(nombre) }, { $setOnInsert: { nombre, nombreNorm: norm(nombre), descripcion, activo: true } }, { upsert: true, new: true });
    if (descripcion && !d.descripcion) await Model.updateOne({ _id: d._id }, { descripcion });
  }
}

/** Dirección del edificio a partir del domicilio ya interpretado. */
function direccionDeActa(dom, calleFinal) {
  const base = CALLES[normalizarCalle(calleFinal)] || calleFinal;
  const calleNorm = normalizarCalle(base);
  const calle = base === base.toLowerCase() ? titulo(base) : limpiar(base);
  if (dom.numero) {
    return { calle, calleNorm, numero: dom.numero, direccionNorm: `${calleNorm} ${dom.numero}`, direccionOriginal: `${calle} ${dom.numero}` };
  }
  const esq = ESQUINAS[norm(dom.esquina)] || limpiar(dom.esquina);
  return { calle, calleNorm, numero: null, direccionNorm: `${calleNorm} esq ${normalizarCalle(esq)}`, direccionOriginal: `${calle} esq. ${esq}`, esquina: esq };
}

module.exports = { filasDeActas, leerActas, fechaDeActa, parseDomicilio, corregirCalle, clasificarMotivos, direccionDeActa, asegurarMotivos, MOTIVOS, CALLES };
