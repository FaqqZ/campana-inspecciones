// Adaptación del cruce Catastro / Defensa Civil. Funciones puras.
const { norm, titulo } = require('./direcciones');
const { ALIAS } = require('../data/callesCatastro');

const FRASES = /\b(provincia de|republica de|batalla de|combate de)\b/g;

/**
 * Limpia un nombre de calle de Catastro y devuelve { clave, esquina }.
 * clave: "av:avellaneda", "pje:tagle bernardo", "bolivar simon", ...
 */
function claveCalle(raw) {
  let s = norm(raw).replace(/\(.*?\)/g, ' ');
  let esquina = '';
  const esq = s.match(/\besq\b\.?\s*(.*)$/);
  if (esq) {
    const original = String(raw).match(/\besq\b\.?\s*(.*)$/i);
    esquina = titulo(String(original ? original[1] : esq[1]).replace(/\(.*?\)/g, ' ').replace(/\s+ang\b.*$/i, '')).trim();
    s = s.slice(0, esq.index);
  }
  s = s.replace(/\s-\s.*$/, ' ').replace(/[.,;]/g, ' ').replace(FRASES, ' ');
  s = s.replace(/\s+de\s+1[0-9]{3}\s*$/, ' ').replace(/\s+/g, ' ').trim();
  let tokens = s.split(' ').filter(Boolean);
  if (tokens[0] === 'calle') tokens = tokens.slice(1);
  let prefijo = '';
  if (tokens[0] === 'av') { prefijo = 'av'; tokens = tokens.slice(1); }
  else if (tokens[0] === 'pje') { prefijo = 'pje'; tokens = tokens.slice(1); }
  if (tokens.at(-1) === 'pasaje') { prefijo = 'pje'; tokens = tokens.slice(0, -1); }
  return { clave: (prefijo ? `${prefijo}:` : '') + tokens.join(' '), esquina };
}

/** Nombre común de la calle. conAlias=false si no está en la tabla (se carga tal cual). */
function calleComun(raw) {
  const { clave, esquina } = claveCalle(raw);
  const alias = ALIAS.get(clave);
  if (alias) return { calle: alias, esquina, conAlias: true };
  const plano = clave.replace(/^(av|pje):/, '');
  return { calle: titulo(plano), esquina, conAlias: false };
}

/** Primera altura de "153/59", "730 //730/36", 1729. Devuelve { numero|null, texto }. */
function primeraAltura(v) {
  const texto = String(v ?? '').trim();
  const m = texto.match(/\d+/);
  const numero = m ? Number(m[0]) : null;
  return { numero: numero && numero > 0 ? numero : null, texto };
}

const esSi = (v) => norm(v).startsWith('si');

/**
 * Lee la hoja del cruce tal cual: ubica la fila de encabezados (la que tiene PADRÓN y CALLE),
 * ignora resumen y notas, y devuelve filas con claves canónicas y su número de fila de Excel.
 */
const ENCABEZADOS = [
  ['nro', (h) => h === 'n°' || h === 'n'],
  ['padron', (h) => h.startsWith('padron')],
  ['calleOrigen', (h) => h.startsWith('calle')],
  ['altura', (h) => h.startsWith('altura') || h === 'numero'],
  ['propietario', (h) => h.startsWith('propietario')],
  ['estadoObra', (h) => h.startsWith('estado de obra') || h === 'comentario'],
  ['tieneCert', (h) => h.startsWith('¿tiene cert')],
  ['certNumero', (h) => h.startsWith('n° cert')],
  ['certExpediente', (h) => h.startsWith('expediente')],
  ['certAnio', (h) => h.startsWith('ano cert')],
  ['enListadoSinCert', (h) => h.startsWith('¿en listado')],
  ['antecedente', (h) => h.startsWith('antecedente')],
  ['mismaCalle', (h) => h.startsWith('¿misma calle')],
  ['conclusion', (h) => h.startsWith('conclusion')],
];

function filasDelCruce(matriz) {
  const idx = matriz.findIndex((r) => {
    const hs = r.map((c) => norm(c));
    return hs.some((h) => h.startsWith('padron')) && hs.some((h) => h.startsWith('calle'));
  });
  if (idx < 0) return null;
  const cols = {};
  matriz[idx].forEach((c, i) => {
    const h = norm(c);
    const hit = ENCABEZADOS.find(([k, fn]) => cols[k] === undefined && fn(h));
    if (hit) cols[hit[0]] = i;
  });
  if (cols.calleOrigen === undefined || cols.altura === undefined) return null;
  const filas = [];
  matriz.slice(idx + 1).forEach((r, j) => {
    const f = { _fila: idx + 2 + j };
    Object.entries(cols).forEach(([k, i]) => { f[k] = r[i] === undefined ? '' : r[i]; });
    if (String(f.calleOrigen).trim() && String(f.altura).trim() !== '') filas.push(f);
  });
  return filas;
}

const TIPO_CERT = 'Certificado final de inspección (Defensa Civil)';
const MOTIVO_CERT = 'Falta de certificado final de inspección';

module.exports = { claveCalle, calleComun, primeraAltura, esSi, filasDelCruce, TIPO_CERT, MOTIVO_CERT };
