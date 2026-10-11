// Estado documental. Funciones puras.
const DIAS_POR_VENCER = 60;
const SEVERIDAD = { vigente: 0, por_vencer: 1, vencido: 2, faltante: 3 };

/**
 * Estado de un documento: vigente | por_vencer | vencido | faltante.
 * doc: { presente, fechaVencimiento } ; tipo: { tieneVencimiento }
 */
function estadoDocumento(doc, tipo, hoy = new Date()) {
  if (!doc || !doc.presente) return 'faltante';
  if (!tipo.tieneVencimiento || !doc.fechaVencimiento) return 'vigente';
  const venc = new Date(doc.fechaVencimiento);
  if (venc < hoy) return 'vencido';
  const limite = new Date(hoy.getTime() + DIAS_POR_VENCER * 86400000);
  return venc <= limite ? 'por_vencer' : 'vigente';
}

/**
 * Evalúa todos los tipos activos de un edificio.
 * Devuelve { semaforo, detalle:[{tipo, estado, doc}], infraccionesPotenciales:[...] }
 * semaforo: sin_relevar | faltante | vencido | por_vencer | vigente
 * conInfracciones: el edificio tiene actas, por lo que nunca es sin_relevar.
 * Los tipos no requeridos que faltan no empeoran el semáforo.
 */
function evaluarEdificio(tipos, documentos, hoy = new Date(), { conInfracciones = false } = {}) {
  const porTipo = new Map(documentos.map((d) => [String(d.tipo), d]));
  const detalle = tipos.map((tipo) => {
    const doc = porTipo.get(String(tipo._id)) || null;
    return { tipo, doc, estado: estadoDocumento(doc, tipo, hoy) };
  });

  // Un edificio con actas ya fue relevado por Defensa Civil: sin documentos cargados no está "sin relevar", le faltan los papeles.
  if (!documentos.length && !conInfracciones) return { semaforo: 'sin_relevar', detalle, infraccionesPotenciales: [] };

  let peor = 'vigente';
  const infraccionesPotenciales = [];
  detalle.forEach(({ tipo, estado }) => {
    if (!tipo.requerido) {
      if (estado === 'vencido' && SEVERIDAD[peor] < SEVERIDAD.por_vencer) peor = 'por_vencer';
      return;
    }
    if (SEVERIDAD[estado] > SEVERIDAD[peor]) peor = estado;
    if ((estado === 'faltante' || estado === 'vencido') && tipo.motivoAsociado) {
      infraccionesPotenciales.push({ documento: tipo.nombre, estado, motivo: tipo.motivoAsociado });
    }
  });
  return { semaforo: peor, detalle, infraccionesPotenciales };
}

module.exports = { DIAS_POR_VENCER, estadoDocumento, evaluarEdificio };
