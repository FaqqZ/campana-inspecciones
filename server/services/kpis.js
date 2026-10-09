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

module.exports = { calcularKpis, lunesDe };
