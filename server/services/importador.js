const XLSX = require('xlsx');
const { norm, normalizarCalle, parseNumero, separarDireccion, claveDireccion, titulo } = require('./direcciones');

// Definición única de columnas: alimenta la plantilla y el parser.
// alias: otros encabezados aceptados (se comparan normalizados, sin tildes).
const COLUMNAS = {
  edificios: [
    { key: 'calle', header: 'Calle', required: true, ejemplo: 'Mate de Luna', alias: ['direccion calle'] },
    { key: 'numero', header: 'Número', ejemplo: '1234', alias: ['numero', 'nro', 'n°', 'altura'] },
    { key: 'direccion', header: 'Dirección completa', ejemplo: '', alias: ['direccion', 'domicilio'] },
    { key: 'observaciones', header: 'Observaciones', ejemplo: '' },
  ],
  actas: [
    { key: 'numero', header: 'N° Acta', required: true, ejemplo: 'A-0001', alias: ['numero acta', 'acta', 'n acta'] },
    { key: 'tipo', header: 'Tipo', ejemplo: 'acta', alias: [] },
    { key: 'fecha', header: 'Fecha', ejemplo: '15/09/2026', alias: [] },
    { key: 'calle', header: 'Calle', required: true, ejemplo: 'Mate de Luna', alias: [] },
    { key: 'altura', header: 'Número', ejemplo: '1234', alias: ['numero', 'nro', 'altura'] },
    { key: 'motivos', header: 'Motivos', ejemplo: 'Falta de habilitación; Salida de emergencia', alias: ['motivo'] },
    { key: 'estado', header: 'Estado', ejemplo: '', alias: [] },
    { key: 'observaciones', header: 'Observaciones', ejemplo: '' },
  ],
};

function parseFecha(v) {
  if (v === undefined || v === null || v === '') return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? undefined : v;
  const s = String(v).trim();
  const isoDia = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDia) return parseFecha(`${isoDia[3]}/${isoDia[2]}/${isoDia[1]}`);
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) {
    const [, d, mo, y] = m.map(Number);
    const date = new Date(Date.UTC(y, mo - 1, d, 12));
    if (date.getUTCMonth() === mo - 1 && date.getUTCDate() === d) return date;
    return undefined;
  }
  return undefined;
}

const splitLista = (v) =>
  String(v || '')
    .split(/[;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);

function leerHoja(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error('El archivo no tiene hojas');
  return XLSX.utils.sheet_to_json(ws, { defval: '', raw: true });
}

function generarPlantilla(tipo) {
  const cols = COLUMNAS[tipo];
  const ws = XLSX.utils.aoa_to_sheet([cols.map((c) => c.header), cols.map((c) => c.ejemplo)]);
  ws['!cols'] = cols.map((c) => ({ wch: Math.max(c.header.length, String(c.ejemplo).length) + 4 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, tipo === 'edificios' ? 'Edificios' : 'Actas');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

/** Lee una fila cruda tolerando mayúsculas, tildes y alias en los encabezados. */
function valoresDeFila(raw, cols) {
  const porNorm = new Map(Object.entries(raw).map(([k, val]) => [norm(k), val]));
  const v = {};
  cols.forEach((c) => {
    const claves = [c.header, ...(c.alias || [])].map(norm);
    const hit = claves.find((k) => porNorm.has(k) && porNorm.get(k) !== '');
    v[c.key] = hit === undefined ? '' : porNorm.get(hit);
  });
  return v;
}

/** Resuelve calle + número desde las columnas separadas o la dirección completa. */
function resolverDireccion(calleRaw, numeroRaw, direccionRaw, errores) {
  let calle = String(calleRaw || '').trim();
  let numeroTxt = numeroRaw === undefined ? '' : numeroRaw;
  if (!calle && direccionRaw) {
    const sep = separarDireccion(direccionRaw);
    calle = sep.calle;
    if (numeroTxt === '' || numeroTxt === null) numeroTxt = sep.numero;
  }
  if (!calle) {
    errores.push('Calle es obligatoria');
    return null;
  }
  const numero = parseNumero(numeroTxt);
  if (numero === undefined) {
    errores.push(`Número inválido: "${numeroTxt}"`);
    return null;
  }
  const calleNorm = normalizarCalle(calle);
  return {
    calle: titulo(calle),
    calleNorm,
    numero,
    direccionNorm: claveDireccion(calleNorm, numero),
    direccionOriginal: numero ? `${titulo(calle)} ${numero}` : `${titulo(calle)} s/n`,
  };
}

/**
 * Valida filas leídas. Función pura.
 * edificios: ctx { existentes:Set(direccionNorm) }
 * actas:     ctx { edificios:Map(direccionNorm->id), motivos:Map(norm->id),
 *                  existentes:Set("edificioId|tipo|numero"), permitirNuevos }
 * Devuelve [{ fila, data, errores[], nuevos:{motivos[]} }]
 */
function validarFilas(tipo, filas, ctx) {
  const cols = COLUMNAS[tipo];
  const vistos = new Set();
  return filas.map((raw, i) => {
    const fila = i + 2; // fila 1 = encabezados
    const errores = [];
    const nuevos = { motivos: [] };
    const v = valoresDeFila(raw, cols);
    const obs = String(v.observaciones).trim();

    if (tipo === 'edificios') {
      const dir = resolverDireccion(v.calle, v.numero, v.direccion, errores);
      if (dir) {
        if (ctx.existentes.has(dir.direccionNorm)) errores.push(`${dir.direccionOriginal} ya existe en la campaña`);
        else if (vistos.has(dir.direccionNorm)) errores.push(`${dir.direccionOriginal} repetida en el archivo`);
        vistos.add(dir.direccionNorm);
      }
      return { fila, data: dir ? { ...dir, observaciones: obs } : null, errores, nuevos };
    }

    // actas
    const numero = String(v.numero).trim();
    if (!numero) errores.push('N° Acta es obligatorio');
    const t = norm(v.tipo) || 'acta';
    if (!['acta', 'expediente'].includes(t)) errores.push('Tipo debe ser "acta" o "expediente"');
    const fecha = parseFecha(v.fecha);
    if (fecha === undefined) errores.push('Fecha inválida (usar dd/mm/aaaa)');

    const dir = resolverDireccion(v.calle, v.altura, '', errores);
    let edificio = null;
    if (dir) {
      edificio = ctx.edificios.get(dir.direccionNorm) || null;
      if (!edificio) errores.push(`No existe un edificio en ${dir.direccionOriginal}`);
    }
    if (numero && edificio) {
      const clave = `${edificio}|${t}|${numero}`;
      if (ctx.existentes.has(clave)) errores.push(`${t} ${numero} ya está cargada en ese edificio`);
      else if (vistos.has(clave)) errores.push(`${t} ${numero} repetida en el archivo`);
      vistos.add(clave);
    }

    const motivosNombres = splitLista(v.motivos);
    const motivos = motivosNombres.map((n) => {
      const id = ctx.motivos.get(norm(n));
      if (id) return id;
      if (ctx.permitirNuevos) {
        nuevos.motivos.push(n);
        return null;
      }
      errores.push(`Motivo inexistente: ${n}`);
      return null;
    });

    return {
      fila,
      data: { numero, tipo: t, fecha: fecha || null, edificio, motivos, motivosNombres, estado: String(v.estado).trim(), observaciones: obs, direccion: dir?.direccionOriginal },
      errores,
      nuevos,
    };
  });
}

module.exports = { COLUMNAS, parseFecha, splitLista, leerHoja, generarPlantilla, validarFilas };
