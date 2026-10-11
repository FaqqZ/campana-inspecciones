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
  const sinCert = edificios.filter((e) => !cert(e) && (semaforos.get(id(e)) || '') !== 'sin_relevar');
  return {
    resumen: {
      total,
      delCruce: delCruce.length,
      creadosDesdeActas: total - delCruce.length,
      conCertificado: edificios.filter(cert).length,
      pctCertificado: pct(edificios.filter(cert).length),
      sinCertificado: sinCert.length,
      sinRelevar: edificios.filter((e) => (semaforos.get(id(e)) || '') === 'sin_relevar').length,
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
    porEstadoObra: contar(edificios, (e) => (e.estadoObra ? e.estadoObra.replace(/\s+/g, ' ').trim() : 'Sin dato de Catastro'), 10),
    porSemaforo: contar(edificios, (e) => ({ vigente: 'Al día', por_vencer: 'Por vencer', vencido: 'Vencido', faltante: 'Falta certificado', sin_relevar: 'Sin relevar' })[semaforos.get(id(e))] || 'Sin relevar'),
    porInspeccion: contar(edificios, (e) => ({ pendiente: 'Pendiente', inspeccionado: 'Inspeccionado', observado: 'Observado', regularizado: 'Regularizado' })[e.estadoInspeccion] || e.estadoInspeccion),
    porGeo: contar(edificios, (e) => ({ ok: 'Ubicado', aproximado: 'Aproximado', manual: 'Manual', pendiente: 'Pendiente', fallido: 'No se pudo ubicar' })[e.geoEstado] || e.geoEstado),
    sinCertPorCalle: contar(sinCert, (e) => e.calle, 8),
  };
}

module.exports = { calcularKpis, calcularKpisEdificios, sinFinalDeObra, situacionCatastro, SITUACIONES, lunesDe };
