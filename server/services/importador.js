const XLSX = require('xlsx');
const { norm, normalizarCalle, parseNumero, separarDireccion, claveDireccion, titulo } = require('./direcciones');
const { calleComun, primeraAltura, esSi, filasDelCruce } = require('./catastro');
const actas = require('./actas');

// Definición única de columnas: alimenta la plantilla y el parser.
// alias: otros encabezados aceptados (se comparan normalizados, sin tildes).
const COLUMNAS = {
  edificios: [
    { key: 'calle', header: 'Calle', required: true, ejemplo: 'Mate de Luna', alias: ['direccion calle'] },
    { key: 'numero', header: 'Número', ejemplo: '1234', alias: ['numero', 'nro', 'n°', 'altura'] },
    { key: 'direccion', header: 'Dirección completa', ejemplo: '', alias: ['direccion', 'domicilio', 'domicilio normalizado'] },
    // Solo colegios y boliches (soloOtras): no aparecen en la plantilla de edificios.
    { key: 'codigo', header: 'ID', ejemplo: 'BAR-001', soloOtras: true, alias: ['codigo', 'id edificio', 'id colegio', 'id-colegio', 'id boliche', 'id-boliche'] },
    { key: 'nombre', header: 'Nombre', ejemplo: '', soloOtras: true, alias: ['razon social', 'titular', 'institucion', 'establecimiento', 'colegio', 'escuela', 'boliche', 'local', 'escuela / colegio', 'escuela/colegio', 'colegio / escuela', 'colegio/escuela', 'colegio/escuela/instituto', 'colegio / escuela / instituto', 'boliches/pub/penas', 'boliches / pub / penas', 'boliche/pub/pena', 'bar', 'nombre del colegio', 'nombre del boliche'] },
    { key: 'latitud', header: 'Latitud', ejemplo: '-26.8241', soloOtras: true, alias: ['lat'] },
    { key: 'longitud', header: 'Longitud', ejemplo: '-65.2226', soloOtras: true, alias: ['lng', 'lon', 'long'] },
    { key: 'observaciones', header: 'Observaciones', ejemplo: '', alias: ['observacion', 'obs'] },
  ],
  infracciones: [
    { key: 'numeroActa', header: 'N° Acta', required: true, ejemplo: 'A-0001', alias: ['numero acta', 'acta', 'n acta', 'numero'] },
    { key: 'fecha', header: 'Fecha infracción', required: true, ejemplo: '15/09/2026', alias: ['fecha'] },
    { key: 'calle', header: 'Calle', required: true, ejemplo: 'Mate de Luna', alias: [] },
    { key: 'altura', header: 'Número', ejemplo: '1234', alias: ['numero', 'nro', 'altura'] },
    { key: 'infractor', header: 'Infractor', ejemplo: 'Razón social o nombre', alias: ['razon social', 'nombre'] },
    { key: 'inspectores', header: 'Inspectores', required: true, ejemplo: 'Pérez Juan; Gómez Ana', alias: ['inspector'] },
    { key: 'motivos', header: 'Motivos', required: true, ejemplo: 'Falta de habilitación; Salida de emergencia', alias: ['motivo'] },
    { key: 'estado', header: 'Estado', ejemplo: 'Ingresado (vacío = estado inicial)', alias: [] },
    { key: 'oficina', header: 'Oficina', ejemplo: 'Oficina Técnica (vacío = oficina inicial)', alias: [] },
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

/** Cruce Catastro / Defensa Civil: se lee tal cual, ubicando los encabezados dentro de la hoja. */
function leerCruce(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error('El archivo no tiene hojas');
  const filas = filasDelCruce(XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true }));
  if (!filas) throw new Error('No parece un cruce de Catastro: no se encontró la fila con PADRÓN y CALLE');
  return filas;
}

function generarPlantilla(tipo, categoria = 'EDIFICIOS') {
  const cols = COLUMNAS[tipo].filter((c) => !c.soloOtras || categoria !== 'EDIFICIOS');
  const ws = XLSX.utils.aoa_to_sheet([cols.map((c) => c.header), cols.map((c) => c.ejemplo)]);
  ws['!cols'] = cols.map((c) => ({ wch: Math.max(c.header.length, String(c.ejemplo).length) + 4 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, tipo === 'edificios' ? 'Edificios' : 'Infracciones');
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

/** Coordenada decimal: null si viene vacía, undefined si no es un número. Acepta coma decimal. */
function parseCoord(v) {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).trim().replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
}

/** Resuelve calle + número desde las columnas separadas o la dirección completa. */
/** "Corrientes N° 570/590" -> "Corrientes N° 570" (se toma el primer número); "24 de Septiembre Esq. Aya" -> "24 de Septiembre y Aya". */
const limpiarDomicilio = (t) => String(t || '').replace(/(\d{1,6})\s*\/\s*\d{1,6}\b/g, '$1').replace(/\s+esq\.?\s+/i, ' y ').trim();

function resolverDireccion(calleRaw, numeroRaw, direccionRaw, errores) {
  direccionRaw = limpiarDomicilio(direccionRaw);
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

const limpiar = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

/** Valida las filas del cruce. Une las repetidas (misma calle y altura) y avisa de calles sin alias. */
function validarCruce(filas, ctx) {
  const vistos = new Map(); // direccionNorm -> resultado de la primera fila
  const resultados = [];
  filas.forEach((raw) => {
    const errores = [];
    const avisos = [];
    const nuevos = { motivos: [] };
    const fila = raw._fila;
    const { calle, esquina, conAlias } = calleComun(raw.calleOrigen);
    const alt = primeraAltura(raw.altura);
    if (!alt.numero) errores.push(`Altura sin número: "${alt.texto}"`);
    if (!conAlias) avisos.push(`Calle sin nombre común asignado, se carga tal cual: ${limpiar(raw.calleOrigen)}`);

    const calleNorm = normalizarCalle(calle);
    const direccionNorm = claveDireccion(calleNorm, alt.numero);
    const direccionOriginal = alt.numero ? `${calle} ${alt.numero}` : calle;
    const tiene = esSi(raw.tieneCert);
    const sinFinalEnCatastro = !limpiar(raw.estadoObra) ? '' : limpiar(raw.estadoObra);

    const data = {
      calle, calleNorm, numero: alt.numero, direccionNorm, direccionOriginal,
      titular: limpiar(raw.propietario),
      padron: limpiar(raw.padron),
      estadoObra: sinFinalEnCatastro,
      calleOrigen: limpiar(raw.calleOrigen),
      alturaOriginal: alt.texto,
      esquina,
      conclusionCruce: limpiar(raw.conclusion),
      mismaCalleOtraAltura: esSi(raw.mismaCalle),
      enListadoSinCert: esSi(raw.enListadoSinCert),
      observaciones: '',
      cert: {
        tiene,
        numero: limpiar(raw.certNumero),
        expediente: limpiar(raw.certExpediente),
        anio: limpiar(raw.certAnio),
      },
    };

    // Qué columnas vinieron con valor: las vacías no pisan lo que ya está cargado al actualizar.
    data.presentes = {
      mismaCalle: limpiar(raw.mismaCalle) !== '',
      enListado: limpiar(raw.enListadoSinCert) !== '',
      cert: limpiar(raw.tieneCert) !== '' || data.cert.numero !== '' || data.cert.expediente !== '' || data.cert.anio !== '',
      certTiene: limpiar(raw.tieneCert) !== '',
    };

    if (alt.numero && vistos.has(direccionNorm) && !errores.length) {
      const base = vistos.get(direccionNorm);
      // misma dirección: se suma al edificio ya leído (otro padrón o propietario)
      if (data.padron && !base.data.padron.split(' / ').includes(data.padron)) base.data.padron += ` / ${data.padron}`;
      if (data.titular && !base.data.titular.split(' // ').includes(data.titular)) base.data.titular += ` // ${data.titular}`;
      base.avisos.push(`Se unió la fila ${fila} (mismo edificio, padrón ${data.padron || '—'})`);
      resultados.push({ fila, data: null, errores: [], avisos: [`Unida con la fila ${base.fila}: es la misma dirección`], nuevos, unida: true });
      return;
    }
    const r = { fila, data, errores, avisos, nuevos };
    if (alt.numero && !errores.length) vistos.set(direccionNorm, r);
    resultados.push(r);
  });
  // Direcciones que ya están en la campaña: se actualizan los datos de Catastro (no se rechazan).
  resultados.forEach((r) => {
    if (!r.data || r.errores.length || !ctx.existentes.has(r.data.direccionNorm)) return;
    const actual = ctx.existentes.get?.(r.data.direccionNorm) || null; // con un Set solo se sabe que existe
    r.data.actualiza = actual ? actual._id : true;
    r.cambios = actual ? diferenciasCatastro(actual, r.data) : [];
  });
  return resultados;
}

const CAMPOS_TEXTO_CATASTRO = [
  ['padron', 'Padrón'], ['estadoObra', 'Estado de obra'], ['titular', 'Titular'], ['calleOrigen', 'Calle (Catastro)'],
  ['alturaOriginal', 'Altura (Catastro)'], ['esquina', 'Esquina'], ['conclusionCruce', 'Conclusión'],
];

/** ¿El certificado queda presente? Si el archivo no dice "tiene", se conserva lo cargado (o se infiere del N° de certificado). */
function presenteCert(data, doc) {
  if (data.presentes.certTiene) return data.cert.tiene;
  return data.cert.numero ? true : Boolean(doc?.presente);
}

/** Campos de catastro que se pisarían en un edificio existente (los vacíos del archivo no cuentan). */
function diferenciasCatastro(actual, data) {
  const dif = CAMPOS_TEXTO_CATASTRO.filter(([k]) => data[k] && data[k] !== (actual[k] || '')).map(([, etiqueta]) => etiqueta);
  if (data.presentes.mismaCalle && data.mismaCalleOtraAltura !== Boolean(actual.mismaCalleOtraAltura)) dif.push('Misma calle con certificado');
  if (data.presentes.enListado && data.enListadoSinCert !== Boolean(actual.enListadoSinCert)) dif.push('En listado sin certificado');
  if (data.presentes.cert) {
    const d = actual.certificado;
    if (!d || d.presente !== presenteCert(data, d) || (data.cert.numero && data.cert.numero !== (d.nroReferencia || ''))) dif.push('Certificado final');
  }
  return dif;
}

/**
 * Listado de actas de Defensa Civil. Cada fila es un acta; una misma acta repetida en el archivo
 * (mismo edificio) se une en una sola con todos sus motivos.
 * ctx: { edificios:Map(direccionNorm->id), motivos:Map, calles:Map(calleNorm->cantidad), existentes:Set(numeroActa), crearEdificios }
 */
function validarActas(filas, ctx) {
  // pasada 1: domicilios y frecuencia de calles (para corregir errores de tipeo como "San Matin")
  const conteo = new Map(ctx.calles || []);
  const doms = filas.map((raw) => {
    const dom = actas.parseDomicilio(raw.domicilio);
    if (!dom.error) {
      dom.calleNorm = normalizarCalle(actas.CALLES[normalizarCalle(dom.calle)] || dom.calle);
      conteo.set(dom.calleNorm, (conteo.get(dom.calleNorm) || 0) + 1);
    }
    return dom;
  });
  const largos = new Map();
  filas.forEach((raw) => { const n = limpiar(raw.acta).length; if (n) largos.set(n, (largos.get(n) || 0) + 1); });
  const largoComun = [...largos.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

  const vistos = new Map(); // numeroActa -> resultado de la primera fila
  const resultados = [];
  filas.forEach((raw, i) => {
    const errores = [];
    const avisos = [];
    const nuevos = { motivos: [], inspectores: [] };
    const fila = raw._fila;
    const dom = doms[i];

    const numeroActa = limpiar(raw.acta);
    if (numeroActa.length < 3 || numeroActa.length > 50) errores.push('N° de acta debe tener entre 3 y 50 caracteres');
    else if (ctx.existentes.has(numeroActa)) errores.push(`El acta ${numeroActa} ya existe`);
    else if (largoComun && numeroActa.length !== largoComun) avisos.push(`El acta ${numeroActa} tiene ${numeroActa.length} dígitos (las demás ${largoComun}): revisar si falta uno`);

    const fecha = actas.fechaDeActa(raw.fecha);
    if (fecha === null) errores.push('Fecha es obligatoria');
    else if (fecha === undefined) errores.push('Fecha inválida');

    let dir = null;
    let edificio = null;
    let crearEdificio = false;
    if (dom.error) errores.push(dom.error);
    else {
      let calle = dom.calle;
      const corr = actas.corregirCalle(dom.calleNorm, conteo);
      if (corr) {
        avisos.push(`Calle "${limpiar(dom.calle)}" corregida a "${corr}"`);
        calle = corr;
      }
      dir = actas.direccionDeActa(dom, calle);
      if (!dom.numero) avisos.push(`Sin número, esquina ${dir.esquina}: se carga como esquina`);
      edificio = ctx.edificios.get(dir.direccionNorm) || null;
      if (!edificio) {
        if (ctx.crearEdificios) {
          crearEdificio = true;
          dir.titular = limpiar(raw.razon);
          avisos.push(`Se creará el edificio ${dir.direccionOriginal}`);
        } else errores.push(`No existe un edificio en ${dir.direccionOriginal}`);
      }
    }

    const descripcion = limpiar(raw.motivo);
    if (!descripcion) errores.push('Motivo es obligatorio');

    const normativa = limpiar(raw.normativa);
    const infractor = limpiar(raw.razon);
    const motivosNombres = descripcion ? actas.clasificarMotivos(descripcion, normativa) : [];
    motivosNombres.forEach((n) => { if (!ctx.motivos.has(norm(n))) nuevos.motivos.push(n); });
    if (motivosNombres.includes(actas.MOTIVOS.otros)) avisos.push('Motivo sin clasificar, queda como "Otros motivos"');

    if (numeroActa && !errores.length) {
      const base = vistos.get(numeroActa);
      if (base) {
        if (base.data.dir && dir && base.data.dir.direccionNorm !== dir.direccionNorm) {
          errores.push(`El acta ${numeroActa} ya figura en otro domicilio (fila ${base.fila}: ${base.data.direccionOriginal})`);
        } else {
          motivosNombres.forEach((n) => { if (!base.data.motivosNombres.includes(n)) base.data.motivosNombres.push(n); });
          if (descripcion && norm(descripcion) !== norm(base.data.descripcion)) {
            base.data.descripcion += ` | ${descripcion}`;
            base.avisos.push(`El acta ${numeroActa} se repite con otra descripción (fila ${fila}): revisar`);
          }
          if (normativa && !base.data.normativa.split(' | ').map(norm).includes(norm(normativa))) base.data.normativa += ` | ${normativa}`;
          if (infractor && norm(infractor) !== norm(base.data.infractor)) base.avisos.push(`El acta ${numeroActa} figura también a nombre de "${infractor}" (fila ${fila})`);
          resultados.push({ fila, data: null, errores: [], avisos: [`Unida con la fila ${base.fila}: misma acta ${numeroActa}`], nuevos: { motivos: [], inspectores: [] }, unida: true });
          return;
        }
      }
    }

    const r = {
      fila,
      data: {
        numeroActa, fechaInfraccion: fecha || null, edificio, crearEdificio, dir,
        infractor, descripcion, normativa,
        inspectoresNombres: [], motivosNombres, inspectores: [], motivos: [],
        estado: null, oficina: null, observaciones: '', direccionOriginal: dir?.direccionOriginal || limpiar(raw.domicilio),
      },
      errores, avisos, nuevos,
    };
    if (numeroActa && !errores.length) vistos.set(numeroActa, r);
    resultados.push(r);
  });
  return resultados;
}

/**
 * Valida filas leídas. Función pura.
 * edificios: ctx { existentes:Set(direccionNorm) }
 * infracciones: ctx { edificios:Map(direccionNorm->id), inspectores/motivos/estados/oficinas:Map(norm->id),
 *                  existentes:Set(numeroActa), crearEdificios, permitirNuevos }
 * Devuelve [{ fila, data, errores[], nuevos:{motivos[]} }]
 */
function validarFilas(tipo, filas, ctx) {
  if (tipo === 'cruce') return validarCruce(filas, ctx);
  if (tipo === 'actas') return validarActas(filas, ctx);
  const cols = COLUMNAS[tipo];
  const vistos = new Set();
  return filas.map((raw, i) => {
    const fila = i + 2; // fila 1 = encabezados
    const errores = [];
    const avisos = [];
    const nuevos = { motivos: [], inspectores: [] };
    const v = valoresDeFila(raw, cols);
    const obs = String(v.observaciones).trim();

    if (tipo === 'edificios') {
      const dir = resolverDireccion(v.calle, v.numero, v.direccion, errores);
      const nombre = String(v.nombre || '').trim();
      const codigo = String(v.codigo ?? '').trim();
      const lat = parseCoord(v.latitud);
      const lng = parseCoord(v.longitud);
      if (lat === undefined || lng === undefined || (lat === null) !== (lng === null)) errores.push('Latitud y Longitud deben venir juntas y ser números válidos');
      else if (lat !== null && (Math.abs(lat) > 90 || Math.abs(lng) > 180)) errores.push('Coordenadas fuera de rango');
      else if (lat !== null && (lat > -26.7 || lat < -26.95 || lng > -65.05 || lng < -65.4)) avisos.push('Las coordenadas quedan fuera de San Miguel de Tucumán: revisarlas');
      if (dir) {
        // Colegios y boliches: dos locales pueden compartir dirección, así que el nombre forma parte de la clave.
        const clave = ctx.porNombre && nombre ? `${dir.direccionNorm}|${norm(nombre)}` : dir.direccionNorm;
        const existe = ctx.existentes.has(clave) || (ctx.porNombre && ctx.existentes.has(dir.direccionNorm));
        const previo = !ctx.porNombre && typeof ctx.existentes.get === 'function' ? ctx.existentes.get(clave) : null;
        if (existe && previo && (codigo || nombre || lat != null) && !errores.length && !vistos.has(clave)) {
          // Ya está cargado: solo se completan los datos que le faltan (no pisa nada).
          const set = {};
          const cambios = [];
          if (codigo && !previo.codigo) { set.codigo = codigo; cambios.push('ID'); }
          if (nombre && !previo.titular) { set.titular = nombre; cambios.push('titular'); }
          if (lat != null && lng != null && (previo.lat == null || previo.lng == null)) { Object.assign(set, { lat, lng, geoEstado: 'ok', geoDisplayName: 'Coordenadas del Excel' }); cambios.push('coordenadas'); }
          vistos.add(clave);
          return { fila, data: { ...dir, actualiza: previo._id, set }, cambios, errores, avisos, nuevos };
        }
        if (existe) errores.push(`${nombre || dir.direccionOriginal} ya existe en la campaña`);
        else if (vistos.has(clave)) errores.push(nombre ? `${nombre} repetido en el archivo` : `${dir.direccionOriginal} repetida en el archivo`);
        vistos.add(clave);
        dir.direccionNorm = clave;
      }
      const extra = {
        ...(nombre && { titular: nombre }),
        ...(codigo && { codigo }),
        ...(lat !== null && lat !== undefined && lng !== undefined && { lat, lng, geoEstado: 'ok', geoDisplayName: 'Coordenadas del Excel' }),
      };
      return { fila, data: dir ? { ...dir, observaciones: obs, ...extra } : null, errores, avisos, nuevos };
    }

    // infracciones
    const numeroActa = String(v.numeroActa).trim();
    if (numeroActa.length < 3 || numeroActa.length > 50) errores.push('N° Acta debe tener entre 3 y 50 caracteres');
    else if (ctx.existentes.has(numeroActa)) errores.push(`El acta ${numeroActa} ya existe`);
    else if (vistos.has(numeroActa)) errores.push(`El acta ${numeroActa} está repetida en el archivo`);
    vistos.add(numeroActa);

    const fecha = parseFecha(v.fecha);
    if (fecha === null) errores.push('Fecha infracción es obligatoria');
    else if (fecha === undefined) errores.push('Fecha infracción inválida (usar dd/mm/aaaa)');

    const dir = resolverDireccion(v.calle, v.altura, '', errores);
    let edificio = null;
    let crearEdificio = false;
    if (dir) {
      edificio = ctx.edificios.get(dir.direccionNorm) || null;
      if (!edificio) {
        if (ctx.crearEdificios) {
          crearEdificio = true;
          avisos.push(`Se creará el edificio ${dir.direccionOriginal}`);
        } else errores.push(`No existe un edificio en ${dir.direccionOriginal}`);
      }
    }

    const resolver = (texto, mapa, etiqueta, destino, vacioMsg) => {
      const nombres = splitLista(texto);
      if (!nombres.length) errores.push(vacioMsg);
      return nombres.map((n) => {
        const id = mapa.get(norm(n));
        if (id) return id;
        if (ctx.permitirNuevos) {
          destino.push(n);
          return null;
        }
        errores.push(`${etiqueta} inexistente: ${n}`);
        return null;
      });
    };
    const inspectores = resolver(v.inspectores, ctx.inspectores, 'Inspector', nuevos.inspectores, 'Inspectores es obligatorio');
    const motivos = resolver(v.motivos, ctx.motivos, 'Motivo', nuevos.motivos, 'Motivos es obligatorio');

    const buscar = (texto, mapa, etiqueta) => {
      const t = String(texto || '').trim();
      if (!t) return null;
      const id = mapa.get(norm(t));
      if (!id) errores.push(`${etiqueta} inexistente: ${t}`);
      return id || null;
    };
    const estado = buscar(v.estado, ctx.estados, 'Estado');
    const oficina = buscar(v.oficina, ctx.oficinas, 'Oficina');

    return {
      fila,
      data: {
        numeroActa, fechaInfraccion: fecha || null, edificio, crearEdificio, dir,
        infractor: String(v.infractor).trim(),
        inspectoresNombres: splitLista(v.inspectores), motivosNombres: splitLista(v.motivos), inspectores, motivos,
        estado, oficina, observaciones: obs, direccionOriginal: dir?.direccionOriginal,
      },
      errores,
      avisos,
      nuevos,
    };
  });
}

module.exports = { CAMPOS_TEXTO_CATASTRO, diferenciasCatastro, presenteCert, COLUMNAS, parseFecha, splitLista, leerHoja, leerCruce, leerActas: actas.leerActas, generarPlantilla, validarFilas };
