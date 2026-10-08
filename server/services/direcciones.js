// Normalización de direcciones. Funciones puras.
const norm = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

const ABREVIATURAS = {
  av: 'avenida', avda: 'avenida', avd: 'avenida',
  gral: 'general', cnel: 'coronel', pje: 'pasaje', psje: 'pasaje',
  dr: 'doctor', dra: 'doctora', pres: 'presidente', tte: 'teniente',
  sgto: 'sargento', cap: 'capitan', ing: 'ingeniero', bv: 'boulevard', bvd: 'boulevard',
  hno: 'hermano', alm: 'almirante', brig: 'brigadier', mons: 'monsenor', fray: 'fray',
};

/** "Av. Gral. Paz" -> "avenida general paz". Quita "calle" inicial y puntuación. */
function normalizarCalle(s) {
  const base = norm(s).replace(/[.,;]/g, ' ').replace(/\s+/g, ' ').trim();
  const tokens = base.split(' ').filter(Boolean);
  if (tokens[0] === 'calle') tokens.shift();
  return tokens.map((t) => ABREVIATURAS[t] || t).join(' ');
}

/** Devuelve un entero > 0, o null si es vacío / "s/n" / sin número. undefined si es inválido. */
function parseNumero(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim().toLowerCase();
  if (s === '' || s === 's/n' || s === 'sn' || s === 's.n.' || s === 'sin numero' || s === 'sin número') return null;
  const m = s.match(/^(\d{1,6})(?:\s*(?:bis|[a-z]))?$/);
  if (!m) return undefined;
  const n = Number(m[1]);
  return n > 0 ? n : undefined;
}

/** "Mate de Luna 1234" -> { calle: "Mate de Luna", numero: "1234" }. */
function separarDireccion(texto) {
  const s = String(texto || '').trim();
  const m = s.match(/^(.*?)[\s,]+(?:n[°ºo.]*\s*)?(\d{1,6})$/i);
  if (m && m[1].trim()) return { calle: m[1].trim(), numero: m[2] };
  return { calle: s, numero: '' };
}

const claveDireccion = (calleNorm, numero) => `${calleNorm} ${numero || 's/n'}`;

const MINUSCULAS = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y']);
const titulo = (s) =>
  String(s || '')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) => (i > 0 && MINUSCULAS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');

module.exports = { norm, normalizarCalle, parseNumero, separarDireccion, claveDireccion, titulo };
