// Edificios notificados: listado con fecha de notificación y plazo (en días) para cumplir. Funciones puras.
const XLSX = require('xlsx');
const { norm, normalizarCalle } = require('./direcciones');
const actas = require('./actas');

const DIA = 86400000;
const DIAS_POR_VENCER_NOTIF = 10;
const ESTADOS_PLAZO = { en_plazo: 'En plazo', por_vencer: 'Por vencer', vencido: 'Vencido', presento: 'Presentó documentación', acta: 'Pasó a acta', sin_plazo: 'Sin plazo registrado' };

const limpiar = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

/** Fecha de vencimiento: la de notificación más los días del plazo (a las 12:00 UTC, como las demás fechas). */
function vencimiento(fecha, dias) {
  return new Date(new Date(fecha).getTime() + dias * DIA);
}

/** Días que faltan para el vencimiento (negativo si ya venció), contando por día calendario. */
function diasRestantes(fechaVencimiento, hoy = new Date()) {
  if (!fechaVencimiento) return null;
  const h = Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 12);
  const v = new Date(fechaVencimiento);
  return Math.round((Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate(), 12) - h) / DIA);
}

/**
 * en_plazo | por_vencer (faltan DIAS_POR_VENCER_NOTIF días o menos) | vencido (el día del vencimiento todavía está en plazo).
 * Si la notificación ya tuvo un resultado (resultado = 'presento' o 'acta'), ese resultado reemplaza al estado por fecha.
 */
function estadoPlazo(fechaVencimiento, hoy = new Date(), resultado = '') {
  if (resultado) return resultado;
  if (!fechaVencimiento) return 'sin_plazo';
  const d = diasRestantes(fechaVencimiento, hoy);
  if (d < 0) return 'vencido';
  return d <= DIAS_POR_VENCER_NOTIF ? 'por_vencer' : 'en_plazo';
}

/** "30", 30, "30 días corridos" -> 30; "72 hs" -> 3 (se redondea hacia arriba a días). null si no hay un entero positivo. */
function parsePlazo(v) {
  if (typeof v === 'number') return Number.isInteger(v) && v > 0 && v <= 3650 ? v : null;
  const m = limpiar(v).match(/^(\d{1,4})\s*(h(?:s|oras?)?\b)?/i);
  if (!m) return null;
  const n = m[2] ? Math.ceil(Number(m[1]) / 24) : Number(m[1]);
  return n > 0 && n <= 3650 ? n : null;
}

/** Resultado que informa la planilla: presentó documentación / pasó a acta ('' si sigue su curso). */
function resultadoDe(estado) {
  const t = norm(estado);
  if (/present\w* document/.test(t)) return 'presento';
  if (/paso a acta/.test(t)) return 'acta';
  return '';
}

/** Ubica la fila de encabezados (domicilio o calle + plazo) y devuelve las filas con su número real de fila. */
function filasDeNotificados(matriz) {
  const idx = matriz.findIndex((f) => {
    const n = f.map(norm);
    return n.some((c) => /domicilio|direccion|edificio|ubicacion|^calle/.test(c)) && n.some((c) => c.includes('plazo') || (c.includes('fecha') && c.includes('notific')));
  });
  if (idx < 0) return null;
  const cab = matriz[idx].map(norm);
  const col = (pred) => cab.findIndex(pred);
  const c = {
    domicilio: col((h) => /domicilio|direccion|edificio|ubicacion/.test(h)),
    calle: col((h) => h === 'calle'),
    numero: col((h) => /^(numero|nro|n°|altura)/.test(h)),
    fecha: col((h) => h.includes('fecha') && h.includes('notific')) >= 0 ? col((h) => h.includes('fecha') && h.includes('notific')) : col((h) => h.includes('fecha')),
    plazo: col((h) => h.includes('plazo')),
    observaciones: col((h) => /observ|nota|detalle|motivo|novedad/.test(h)),
    vigente: col((h) => /venc.*vigente/.test(h)),
    original: col((h) => /venc.*original/.test(h)),
    estado: col((h) => /^estado/.test(h)),
    boleta: col((h) => /boleta/.test(h)),
    razon: col((h) => /razon social|infractor|titular/.test(h)),
    inspector: col((h) => /inspector/.test(h)),
  };
  const g = (f, i) => (i >= 0 ? f[i] : '');
  return matriz
    .slice(idx + 1)
    .map((f, i) => ({
      _fila: idx + 2 + i,
      domicilio: c.domicilio >= 0 ? f[c.domicilio] : [f[c.calle], f[c.numero]].filter((x) => x !== undefined && x !== '').join(' '),
      fecha: f[c.fecha],
      plazo: g(f, c.plazo),
      observaciones: g(f, c.observaciones),
      vigente: g(f, c.vigente),
      original: g(f, c.original),
      estado: g(f, c.estado),
      boleta: g(f, c.boleta),
      razon: g(f, c.razon),
      inspector: g(f, c.inspector),
    }))
    .filter((r) => [r.domicilio, r.fecha, r.plazo].some((v) => limpiar(v) !== ''));
}

function leerNotificados(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  if (!wb.SheetNames.length) throw new Error('El archivo no tiene hojas');
  // Si el libro trae varias hojas (p. ej. "Con plazo vigente" y "Cruce completo") se usa la que tiene más filas de datos.
  let mejor = null;
  for (const nombre of wb.SheetNames) {
    const filas = filasDeNotificados(XLSX.utils.sheet_to_json(wb.Sheets[nombre], { header: 1, defval: '', raw: true }));
    if (filas && (!mejor || filas.length > mejor.length)) mejor = filas;
  }
  if (!mejor) throw new Error('No parece un listado de notificados: no se encontró la fila con Domicilio y Plazo');
  return mejor;
}

const claveDia = (d) => new Date(d).toISOString().slice(0, 10);

/**
 * Valida el listado. ctx: { edificios:Map(direccionNorm -> id), calles:Map(calleNorm -> cantidad), existentes:Map("edificioId|aaaa-mm-dd" -> { id, tienePlazo }), crearEdificios }
 * Devuelve [{ fila, data:{ edificio, dir, fechaNotificacion, plazoDias, fechaVencimiento, observaciones, direccionOriginal }, errores, avisos, unida }].
 */
function validarNotificados(filas, ctx) {
  const conteo = new Map(ctx.calles || []);
  const doms = filas.map((raw) => {
    const dom = actas.parseDomicilio(raw.domicilio);
    if (!dom.error) {
      dom.calleNorm = normalizarCalle(actas.CALLES[normalizarCalle(dom.calle)] || dom.calle);
      conteo.set(dom.calleNorm, (conteo.get(dom.calleNorm) || 0) + 1);
    }
    return dom;
  });
  const vistos = new Map();
  return filas.map((raw, i) => {
    const errores = [];
    const avisos = [];
    const fila = raw._fila;
    const dom = doms[i];

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
      if (!dom.numero) avisos.push(`Sin número, esquina ${dir.esquina}: se busca como esquina`);
      edificio = ctx.edificios.get(dir.direccionNorm) || null;
      if (!edificio) {
        if (ctx.crearEdificios) {
          crearEdificio = true;
          dir.titular = limpiar(raw.razon);
          avisos.push(`Se creará el edificio ${dir.direccionOriginal}`);
        } else errores.push(`No existe un edificio en ${dir.direccionOriginal}`);
      }
    }

    const fecha = actas.fechaDeActa(raw.fecha);
    if (fecha === null) errores.push('Fecha de notificación es obligatoria');
    else if (fecha === undefined) errores.push('Fecha de notificación inválida');
    // El listado puede traer el vencimiento vigente (con prórrogas) y el original; si no, el plazo en días.
    const vigente = limpiar(raw.vigente) ? actas.fechaDeActa(raw.vigente) : null;
    const original = limpiar(raw.original) ? actas.fechaDeActa(raw.original) : null;
    if (vigente === undefined) errores.push('Vencimiento vigente inválido');
    if (original === undefined) errores.push('Vencimiento original inválido');
    const sinPlazo = !limpiar(raw.plazo) && !limpiar(raw.vigente) && !limpiar(raw.original); // notificado, plazo todavía sin cargar
    let plazoDias = fecha && original ? Math.round((original - fecha) / DIA) : parsePlazo(raw.plazo);
    if (!(plazoDias > 0) && fecha && vigente) plazoDias = Math.round((vigente - fecha) / DIA);
    if (sinPlazo) plazoDias = null;
    else if (!(plazoDias > 0)) errores.push('El plazo debe ser una cantidad de días mayor a 0');
    const fechaVencimiento = sinPlazo ? null : vigente || (fecha && plazoDias > 0 ? vencimiento(fecha, plazoDias) : null);
    if (fecha && fechaVencimiento && fechaVencimiento < fecha) errores.push('El vencimiento es anterior a la fecha de notificación');
    const resultado = resultadoDe(raw.estado);

    const direccionOriginal = dir?.direccionOriginal || limpiar(raw.domicilio);
    const clave = fecha && dir ? `${edificio || `nuevo:${dir.direccionNorm}`}|${claveDia(fecha)}` : '';
    let actualiza = null;
    if (!errores.length) {
      const previa = ctx.existentes?.get(clave);
      if (vistos.has(clave)) {
        const base = vistos.get(clave);
        avisos.push(`Unida con la fila ${base.fila}: misma dirección y fecha`);
        if (base.data.plazoDias !== plazoDias) base.avisos.push(`La fila ${fila} repite la notificación con otro plazo (${plazoDias ?? 'sin plazo'}): se conservó el de la fila ${base.fila}`);
        return { fila, data: null, errores: [], avisos, unida: true };
      }
      if (previa && !previa.tienePlazo && !sinPlazo) {
        actualiza = previa.id; // la notificación ya estaba cargada sin plazo: se completa con este listado
        avisos.push('Ya estaba cargada sin plazo: se completa con el plazo de este listado');
      } else if (previa) errores.push(`Ya hay una notificación de ${direccionOriginal} con fecha ${claveDia(fecha)}`);
    }
    const data = {
      edificio, crearEdificio, actualiza, dir, fechaNotificacion: fecha || null, plazoDias, direccionOriginal, fechaVencimiento,
      vencimientoOriginal: original || null,
      prorroga: Boolean(original && fechaVencimiento && claveDia(original) !== claveDia(fechaVencimiento)) || /prorroga/.test(norm(raw.estado)),
      resultado,
      plazoOriginal: limpiar(raw.plazo),
      boleta: limpiar(raw.boleta),
      razonSocial: limpiar(raw.razon),
      inspector: limpiar(raw.inspector),
      observaciones: limpiar(raw.observaciones).replace(/^[—–-]$/, ''),
    };
    const r = { fila, data, errores, avisos };
    if (!errores.length) vistos.set(clave, r);
    return r;
  });
}

/** La notificación vigente de cada edificio es la más reciente. Map(edificioId -> notificación). */
function vigentesPorEdificio(notificaciones) {
  const m = new Map();
  [...notificaciones]
    .sort((a, b) => new Date(a.fechaNotificacion) - new Date(b.fechaNotificacion))
    .forEach((n) => m.set(String(n.edificio?._id || n.edificio), n));
  return m;
}

/**
 * Indicadores de los edificios notificados (según su notificación vigente).
 * notificaciones: [{ edificio:{ _id, calle } | id, fechaNotificacion, plazoDias, fechaVencimiento }]
 */
function calcularKpisNotificaciones(notificaciones, hoy = new Date()) {
  const vigentes = [...vigentesPorEdificio(notificaciones).values()];
  const con = vigentes.map((n) => ({ n, estado: estadoPlazo(n.fechaVencimiento, hoy, n.resultado), dias: diasRestantes(n.fechaVencimiento, hoy) }));
  const cuenta = (e) => con.filter((x) => x.estado === e).length;
  const contar = (clave, limite) => {
    const m = new Map();
    con.forEach((x) => { const k = clave(x); if (k) m.set(k, (m.get(k) || 0) + 1); });
    const l = [...m].map(([nombre, cantidad]) => ({ nombre, cantidad })).sort((a, b) => b.cantidad - a.cantidad || a.nombre.localeCompare(b.nombre));
    return limite ? l.slice(0, limite) : l;
  };
  const mes = (d) => { const f = new Date(d); return `${String(f.getUTCMonth() + 1).padStart(2, '0')}/${f.getUTCFullYear()}`; };
  return {
    resumen: {
      notificados: con.length,
      notificaciones: notificaciones.length,
      enPlazo: cuenta('en_plazo'),
      porVencer: cuenta('por_vencer'),
      vencidos: cuenta('vencido'),
      presentaron: cuenta('presento'),
      pasaronAActa: cuenta('acta'),
      sinPlazo: cuenta('sin_plazo'),
      conProrroga: con.filter((x) => x.n.prorroga).length,
      vencenEn7: con.filter((x) => !x.n.resultado && x.dias !== null && x.dias >= 0 && x.dias <= 7).length,
      vencenEn30: con.filter((x) => !x.n.resultado && x.dias !== null && x.dias >= 0 && x.dias <= 30).length,
      plazoPromedio: con.filter((x) => x.n.plazoDias).length ? Math.round(con.reduce((a, x) => a + (x.n.plazoDias || 0), 0) / con.filter((x) => x.n.plazoDias).length) : 0,
    },
    porEstado: [
      { nombre: ESTADOS_PLAZO.en_plazo, cantidad: cuenta('en_plazo') },
      { nombre: ESTADOS_PLAZO.por_vencer, cantidad: cuenta('por_vencer') },
      { nombre: ESTADOS_PLAZO.vencido, cantidad: cuenta('vencido') },
      { nombre: ESTADOS_PLAZO.presento, cantidad: cuenta('presento') },
      { nombre: ESTADOS_PLAZO.acta, cantidad: cuenta('acta') },
      { nombre: ESTADOS_PLAZO.sin_plazo, cantidad: cuenta('sin_plazo') },
    ],
    porCalle: contar((x) => x.n.edificio?.calle, 8),
    porMesVencimiento: contar((x) => (x.estado !== 'en_plazo' && x.estado !== 'por_vencer' ? null : mes(x.n.fechaVencimiento))).sort((a, b) => a.nombre.slice(3).localeCompare(b.nombre.slice(3)) || a.nombre.localeCompare(b.nombre)),
  };
}

module.exports = {
  resultadoDe, DIAS_POR_VENCER_NOTIF, ESTADOS_PLAZO, vencimiento, diasRestantes, estadoPlazo, parsePlazo,
  filasDeNotificados, leerNotificados, validarNotificados, vigentesPorEdificio, calcularKpisNotificaciones,
};
