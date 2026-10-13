// Indicadores sobre las infracciones cargadas. Función pura: recibe documentos ya leídos.
const DIA = 86400000;

const contar = (items, clave, tope) => {
  const m = new Map();
  items.forEach((it) => [].concat(clave(it)).forEach((k) => k && m.set(k, (m.get(k) || 0) + 1)));
  const lista = [...m.entries()].map(([nombre, cantidad]) => ({ nombre, cantidad })).sort((a, b) => b.cantidad - a.cantidad || a.nombre.localeCompare(b.nombre));
  return tope ? lista.slice(0, tope) : lista;
};

/** Lunes (UTC) de la semana de una fecha, como YYYY-MM-DD. */
function lunesDe(fecha) {
  const d = new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/**
 * infracciones: [{ fechaInfraccion, estado:{nombre}, oficinaActual:{nombre}, motivosInfraccion:[{nombre}],
 *                  edificio:{_id,direccionOriginal,calle}, expediente:{numero}, asignadoA }]
 */
function calcularKpis(infracciones, { totalEdificios = 0, hoy = new Date() } = {}) {
  const total = infracciones.length;
  const cerrada = (i) => Boolean(i.expediente?.numero);
  const abiertas = infracciones.filter((i) => !cerrada(i));
  const edificios = new Map();
  infracciones.forEach((i) => {
    const id = String(i.edificio?._id ?? i.edificio);
    if (!edificios.has(id)) edificios.set(id, { direccion: i.edificio?.direccionOriginal || '—', cantidad: 0 });
    edificios.get(id).cantidad++;
  });
  const edificiosConActas = edificios.size;
  const edad = (i) => Math.max(0, Math.floor((hoy - new Date(i.fechaInfraccion)) / DIA));
  const edades = abiertas.map(edad);
  const tramo = (min, max) => edades.filter((e) => e >= min && e <= max).length;

  const semanas = new Map();
  infracciones.forEach((i) => { const k = lunesDe(new Date(i.fechaInfraccion)); semanas.set(k, (semanas.get(k) || 0) + 1); });
  const claves = [...semanas.keys()].sort();
  const porSemana = [];
  if (claves.length) {
    for (let d = new Date(`${claves[0]}T00:00:00Z`); d <= new Date(`${claves[claves.length - 1]}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 7)) {
      const k = d.toISOString().slice(0, 10);
      porSemana.push({ semana: k, cantidad: semanas.get(k) || 0 });
    }
  }

  return {
    resumen: {
      total,
      abiertas: abiertas.length,
      conExpediente: total - abiertas.length,
      pctExpediente: total ? Math.round(((total - abiertas.length) / total) * 100) : 0,
      edificiosConActas,
      totalEdificios,
      pctCobertura: totalEdificios ? Math.round((edificiosConActas / totalEdificios) * 100) : 0,
      promedioPorEdificio: edificiosConActas ? Math.round((total / edificiosConActas) * 10) / 10 : 0,
      reincidentes: [...edificios.values()].filter((e) => e.cantidad >= 2).length,
      sinAsignar: abiertas.filter((i) => !i.asignadoA).length,
      antiguedadPromedio: edades.length ? Math.round(edades.reduce((a, b) => a + b, 0) / edades.length) : 0,
      antiguedadMaxima: edades.length ? Math.max(...edades) : 0,
    },
    porMotivo: contar(infracciones, (i) => (i.motivosInfraccion || []).map((m) => m.nombre)),
    porEstado: contar(infracciones, (i) => i.estado?.nombre),
    porOficina: contar(abiertas, (i) => i.oficinaActual?.nombre),
    porCalle: contar(infracciones, (i) => i.edificio?.calle, 8),
    topEdificios: [...edificios.values()].map((e) => ({ nombre: e.direccion, cantidad: e.cantidad })).sort((a, b) => b.cantidad - a.cantidad || a.nombre.localeCompare(b.nombre)).slice(0, 8),
    antiguedad: [
      { nombre: '0 a 15 días', cantidad: tramo(0, 15) },
      { nombre: '16 a 30 días', cantidad: tramo(16, 30) },
      { nombre: '31 a 60 días', cantidad: tramo(31, 60) },
      { nombre: 'Más de 60 días', cantidad: tramo(61, Infinity) },
    ],
    porSemana,
  };
}

const quitarTildes = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** Final de obra faltante según Catastro: el estado de obra o la conclusión del cruce lo dicen. */
const sinFinalDeObra = (e) => /sin final/i.test(quitarTildes(e.estadoObra)) || /sin final de obra/i.test(quitarTildes(e.conclusionCruce));

/**
 * Situación del edificio según el estado de obra de Catastro (excluyente, en este orden de prioridad):
 * resolución denegada > presentó conforme a obra sin terminar la documentación > terminado y habitado > otras.
 */
const SITUACIONES = {
  denegada: 'Resolución denegada',
  conformeInconclusa: 'Conforme a obra presentado, documentación sin terminar',
  terminado: 'Terminado y habitado',
  otras: 'Otras situaciones (sin final, a verificar, en construcción…)',
  sinDato: 'Sin dato de Catastro',
};
function situacionCatastro(e) {
  const t = quitarTildes(e.estadoObra).toLowerCase();
  if (!t.trim()) return SITUACIONES.sinDato;
  if (/denegad/.test(t)) return SITUACIONES.denegada;
  if (/conforme a obra/.test(t) && /inconclu/.test(t)) return SITUACIONES.conformeInconclusa;
  if (/terminad/.test(t)) return SITUACIONES.terminado;
  return SITUACIONES.otras;
}

/**
 * Desglose completo de la situación según Catastro (excluyente: cada edificio en una sola categoría, sin "otras").
 * Prioridad: denegada > conforme a obra sin terminar > terminado y habitado > el resto, por lo que dice el estado de obra.
 */
const SITUACIONES_DETALLE = [
  'Terminados y habitados',
  'Resolución denegatoria de permiso',
  'Conforme a obra, sin terminar la tramitación',
  'Con permiso, sin final de obra',
  'Obra construida',
  'Paralizada o en construcción',
  'No construida, desistida o reemplazada',
  'A verificar o sin dato',
];
function situacionDetalle(e) {
  const t = quitarTildes(e.estadoObra).toLowerCase();
  if (/denegad/.test(t)) return SITUACIONES_DETALLE[1];
  if (/conforme a obra/.test(t) && /inconclu/.test(t)) return SITUACIONES_DETALLE[2];
  if (/terminad/.test(t)) return SITUACIONES_DETALLE[0];
  if (/con permiso (sin final|a terminar|reinicio)/.test(t)) return SITUACIONES_DETALLE[3];
  if (/obra construida/.test(t)) return SITUACIONES_DETALLE[4];
  if (/paralizad|en construccion/.test(t)) return SITUACIONES_DETALLE[5];
  if (/no se construyo|no iniciada|desistid|reemplazad/.test(t)) return SITUACIONES_DETALLE[6];
  return SITUACIONES_DETALLE[7];
}

/**
 * Indicadores de los edificios y del cruce Catastro / Defensa Civil (no dependen del período de las infracciones).
 * edificios: [{ _id, calle, padron, estadoObra, conclusionCruce, enListadoSinCert, mismaCalleOtraAltura, geoEstado, estadoInspeccion }]
 * ctx: { conCertificado:Set(id), semaforos:Map(id->semaforo), actasAbiertas:Map(id->cantidad), actasTotales:Map(id->cantidad) }
 */
function calcularKpisEdificios(edificios, { conCertificado = new Set(), semaforos = new Map(), actasAbiertas = new Map(), actasTotales = new Map() } = {}) {
  const total = edificios.length;
  const id = (e) => String(e._id);
  const cert = (e) => conCertificado.has(id(e));
  const delCruce = edificios.filter((e) => e.padron);
  const sinFinal = edificios.filter(sinFinalDeObra);
  const pct = (n, d = total) => (d ? Math.round((n / d) * 100) : 0);
  const sinCert = edificios.filter((e) => !cert(e));
  return {
    resumen: {
      total,
      delCruce: delCruce.length,
      creadosDesdeActas: total - delCruce.length,
      conCertificado: edificios.filter(cert).length,
      pctCertificado: pct(edificios.filter(cert).length),
      sinCertificado: sinCert.length,
      sinFinalCatastro: sinFinal.length,
      pctSinFinalCatastro: pct(sinFinal.length),
      sinCertConActasAbiertas: sinCert.filter((e) => (actasAbiertas.get(id(e)) || 0) > 0).length,
      sinCertSinActas: sinCert.filter((e) => !(actasTotales.get(id(e)) || 0)).length,
      conActas: edificios.filter((e) => (actasTotales.get(id(e)) || 0) > 0).length,
      sinUbicar: edificios.filter((e) => e.geoEstado === 'fallido' || e.geoEstado === 'pendiente').length,
    },
    porSituacion: Object.values(SITUACIONES).map((nombre) => {
      const del = edificios.filter((e) => situacionCatastro(e) === nombre);
      return { nombre, cantidad: del.length };
    }),
    // Estados de obra tal como los informa Catastro (un renglón por estado, en orden alfabético), solo edificios del cruce
    porEstadoCatastro: (() => {
      const m = new Map();
      delCruce.forEach((e) => {
        const nombre = String(e.estadoObra || '').replace(/\s+/g, ' ').trim() || 'Sin dato de Catastro';
        const k = quitarTildes(nombre).toUpperCase();
        if (!m.has(k)) m.set(k, { nombre, cantidad: 0 });
        m.get(k).cantidad++;
      });
      return [...m.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    })(),
    porSituacionDetalle: SITUACIONES_DETALLE.map((nombre) => {
      const del = delCruce.filter((e) => situacionDetalle(e) === nombre);
      return { nombre, cantidad: del.length, conCertificado: del.filter(cert).length };
    }),
    porEstadoObra: contar(edificios, (e) => (e.estadoObra ? e.estadoObra.replace(/\s+/g, ' ').trim() : 'Sin dato de Catastro'), 10),
    porSemaforo: contar(edificios, (e) => ({ vigente: 'Al día', por_vencer: 'Por vencer', vencido: 'Vencido', faltante: 'Falta certificado' })[semaforos.get(id(e))] || 'Falta certificado'),
    porInspeccion: contar(edificios, (e) => ({ pendiente: 'Pendiente', inspeccionado: 'Inspeccionado', observado: 'Observado', regularizado: 'Regularizado' })[e.estadoInspeccion] || e.estadoInspeccion),
    porGeo: contar(edificios, (e) => ({ ok: 'Ubicado', aproximado: 'Aproximado', manual: 'Manual', pendiente: 'Pendiente', fallido: 'No se pudo ubicar' })[e.geoEstado] || e.geoEstado),
    sinCertPorCalle: contar(sinCert, (e) => e.calle, 8),
  };
}

const { MOTIVOS } = require('./actas');

const TIPOLOGIA_MULTIPLE = 'Elementos de seguridad contra incendios – múltiples';
const TIPOLOGIA_POR_MOTIVO = {
  [MOTIVOS.venc]: 'Extintores',
  [MOTIVOS.extintores]: 'Extintores',
  [MOTIVOS.red]: 'Red contra incendios (nichos/mangueras/lanzas/picos/bocas)',
  [MOTIVOS.luces]: 'Luces de emergencia',
  [MOTIVOS.balizas]: 'Balizas / señalización',
  [MOTIVOS.noPermite]: 'Impedimento de inspección',
  [MOTIVOS.boleta]: 'Incumplimiento de intimación previa',
  [MOTIVOS.documentacion]: 'Documentación técnica',
  [MOTIVOS.otros]: 'Otros motivos',
};

/** Tipología (excluyente) de un acta según sus motivos: si reúne más de una, es "múltiples". */
function tipologiaDeActa(motivos = []) {
  const t = [...new Set(motivos.map((m) => TIPOLOGIA_POR_MOTIVO[m?.nombre ?? m]).filter(Boolean))];
  if (!t.length) return TIPOLOGIA_POR_MOTIVO[MOTIVOS.otros];
  return t.length > 1 ? TIPOLOGIA_MULTIPLE : t[0];
}

/**
 * Normativas que se citan en las actas, con la obligación a la que refiere cada una. Un mismo texto puede venir escrito de
 * varias formas ("Ord.756/97- Art N° 3", "Dto. 756/97 - Art 3."): se unifican en una sola entrada.
 */
const NORMATIVAS = {
  '756/97|3': { nombre: 'Dto. 756/97 - Art. 3', detalle: 'Extintores vencidos' },
  '251/74|3': { nombre: 'Ord. 251/74 - Art. 3', detalle: 'No presentar la documentación técnica' },
  '251/74|4': { nombre: 'Ord. 251/74 - Art. 4', detalle: 'Falta de extintores' },
  '251/74|6': { nombre: 'Ord. 251/74 - Art. 6', detalle: 'Red contra incendios incompleta (nichos, mangueras, lanzas, picos y bocas)' },
  '2119/93|3': { nombre: 'Ord. 2119/93 - Art. 3', detalle: 'Falta de luces de emergencia' },
  '250/74|2': { nombre: 'Ord. 250/74 - Arts. 2 y 3', detalle: 'Incumplimiento de la boleta de notificación (intimación previa)' },
  '250/74|3': { nombre: 'Ord. 250/74 - Arts. 2 y 3', detalle: 'Incumplimiento de la boleta de notificación (intimación previa)' },
  '539/80|1': { nombre: 'Ord. 539/80 - Art. 1', detalle: 'Falta de balizas y señalización' },
  '229/77|27': { nombre: 'Ord. 229/77 - Art. 27', detalle: 'Impedimento de la inspección' },
  '229/77|': { nombre: 'Ord. 229/77 - Art. 27', detalle: 'Impedimento de la inspección' },
};

/** Normativas citadas en el texto de un acta (varias separadas por "|"), sin repetir. Devuelve [{ nombre, detalle }]. */
function normativasDeActa(texto) {
  const out = new Map();
  String(texto || '').split('|').forEach((parte) => {
    const m = parte.match(/(ord|dto|decreto|ordenanza)[a-z]*\.?\s*(?:n[°º]?\s*)?(\d+\/\d+)(?:[^0-9]*?art[a-z]*\.?\s*(?:n[°º]?\s*)?(\d+))?/i);
    if (!m) { const t = parte.replace(/\s+/g, ' ').trim(); if (t) out.set(t, { nombre: t, detalle: '' }); return; }
    const conocida = NORMATIVAS[`${m[2]}|${m[3] || ''}`];
    const nombre = `${/^d/i.test(m[1]) ? 'Dto.' : 'Ord.'} ${m[2]}${m[3] ? ` - Art. ${m[3]}` : ''}`;
    const n = conocida || { nombre, detalle: '' };
    out.set(n.nombre, n);
  });
  return [...out.values()];
}

/** Cuenta las actas por normativa, con el detalle de cada una. */
function contarNormativas(infracciones) {
  const m = new Map();
  infracciones.forEach((i) => normativasDeActa(i.normativa).forEach((n) => {
    if (!m.has(n.nombre)) m.set(n.nombre, { ...n, cantidad: 0 });
    m.get(n.nombre).cantidad++;
  }));
  return [...m.values()].sort((x, y) => y.cantidad - x.cantidad || x.nombre.localeCompare(y.nombre));
}

// Orden de las categorías en las láminas del Excel de la campaña (se muestran todas, aun con cantidad 0).
const ORDEN_TIPOLOGIA_INFRACCIONES = ['Extintores', 'Red contra incendios (nichos/mangueras/lanzas/picos/bocas)', 'Luces de emergencia', 'Incumplimiento de intimación previa', 'Balizas / señalización', 'Impedimento de inspección', TIPOLOGIA_MULTIPLE];
const ORDEN_TIPOLOGIA_EDIFICIOS = ['Red contra incendios (nichos/mangueras/lanzas/picos/bocas)', 'Luces de emergencia', 'Extintores', 'Incumplimiento de intimación previa', 'Balizas / señalización', 'Impedimento de inspección', TIPOLOGIA_MULTIPLE];
/** Ordena según el orden dado; lo que no esté en la lista va al final por cantidad. */
const enOrden = (items, orden) => [...orden.map((nombre) => items.find((i) => i.nombre === nombre) || { nombre, cantidad: 0 }), ...items.filter((i) => !orden.includes(i.nombre))];

const ESTADOS_PLANILLA = ['Para infracción', 'Notificado', 'Plazo', 'Dio cumplimiento'];

/**
 * Indicadores de Defensa Civil. Edificios alcanzados = edificios con notificación o con acta; las actuaciones son notificaciones + actas.
 * infracciones: [{ edificio:{_id}, motivosInfraccion:[{nombre}], normativa }]
 * notificaciones: [{ edificio:{_id}|id, estadoPlanilla, resultado, fechaVencimiento }]
 */
function calcularKpisDefensaCivil(infracciones, notificaciones = [], { hoy = new Date() } = {}) {
  const idDe = (x) => String(x.edificio?._id ?? x.edificio);
  const conActa = new Set(infracciones.map(idDe));
  const conNotif = new Set(notificaciones.map(idDe));
  const alcanzados = new Set([...conActa, ...conNotif]);
  const soloActa = [...conActa].filter((id) => !conNotif.has(id)).length;
  const soloNotif = [...conNotif].filter((id) => !conActa.has(id)).length;
  const ambos = [...conActa].filter((id) => conNotif.has(id)).length;
  const dePorcentaje = (n, d) => (d ? Math.round((n / d) * 100) : 0);

  const tipologias = infracciones.map((i) => ({ id: idDe(i), tipologia: tipologiaDeActa(i.motivosInfraccion) }));
  const edificiosPorTipologia = new Map();
  tipologias.forEach(({ id, tipologia }) => {
    if (!edificiosPorTipologia.has(tipologia)) edificiosPorTipologia.set(tipologia, new Set());
    edificiosPorTipologia.get(tipologia).add(id);
  });
  const porEdificio = new Map();
  infracciones.forEach((i) => porEdificio.set(idDe(i), (porEdificio.get(idDe(i)) || 0) + 1));
  const cantidades = [...porEdificio.values()];
  const conCantidad = (min, max) => cantidades.filter((c) => c >= min && c <= max).length;

  const estadoDeNotificacion = (n) => {
    if (n.estadoPlanilla) return n.estadoPlanilla;
    if (n.resultado === 'acta') return 'Para infracción';
    if (n.resultado === 'presento') return 'Dio cumplimiento';
    return n.fechaVencimiento && new Date(n.fechaVencimiento) >= hoy ? 'Plazo' : 'Notificado';
  };

  return {
    resumen: {
      edificiosAlcanzados: alcanzados.size,
      actuaciones: notificaciones.length + infracciones.length,
      notificaciones: notificaciones.length,
      infracciones: infracciones.length,
      edificiosConInfracciones: conActa.size,
      edificiosNotificados: conNotif.size,
      edificiosConAmbas: ambos,
      soloInfraccion: soloActa,
      soloNotificacion: soloNotif,
    },
    // Universo: edificios alcanzados = edificios de la tabla maestra (con notificación, con acta o con ambas)
    porTipoActuacion: [
      { nombre: 'Infracciones', cantidad: soloActa, porcentaje: dePorcentaje(soloActa, alcanzados.size) },
      { nombre: 'Notificaciones', cantidad: soloNotif, porcentaje: dePorcentaje(soloNotif, alcanzados.size) },
      { nombre: 'Notificaciones + Infracciones', cantidad: ambos, porcentaje: dePorcentaje(ambos, alcanzados.size) },
    ],
    estadoNotificaciones: ESTADOS_PLANILLA.map((nombre) => ({ nombre, cantidad: notificaciones.filter((n) => estadoDeNotificacion(n) === nombre).length })),
    porTipologia: enOrden(contar(tipologias, (t) => t.tipologia), ORDEN_TIPOLOGIA_INFRACCIONES),
    edificiosPorTipologia: enOrden([...edificiosPorTipologia].map(([nombre, ids]) => ({ nombre, cantidad: ids.size })), ORDEN_TIPOLOGIA_EDIFICIOS),
    porNormativa: contarNormativas(infracciones),
    edificiosPorCantidad: [
      { nombre: '1 infracción', cantidad: conCantidad(1, 1) },
      { nombre: '2 infracciones', cantidad: conCantidad(2, 2) },
      { nombre: '3 infracciones', cantidad: conCantidad(3, 3) },
      { nombre: '4 o más infracciones', cantidad: conCantidad(4, Infinity) },
    ],
  };
}

module.exports = { calcularKpisDefensaCivil, tipologiaDeActa, normativasDeActa, calcularKpis, calcularKpisEdificios, sinFinalDeObra, situacionCatastro, situacionDetalle, SITUACIONES_DETALLE, SITUACIONES, lunesDe };
