// Reglas de negocio de las infracciones. Funciones puras (sin base de datos) para poder probarlas.
const { tienePermiso } = require('../config/permisos');

const esCerrada = (inf) => Boolean(inf.expediente?.numero);
const esEditable = (inf) => !inf.eliminado && !esCerrada(inf);

/** Valida los datos de alta/edición. Devuelve un mensaje de error o null. */
function validarDatos(b, { alta = true } = {}) {
  const numero = String(b.numeroActa ?? '').trim();
  if (alta || b.numeroActa !== undefined) {
    if (numero.length < 3 || numero.length > 50) return 'El N° de acta debe tener entre 3 y 50 caracteres';
  }
  if (b.infractor !== undefined && String(b.infractor).trim().length > 100) return 'El infractor admite hasta 100 caracteres';
  if (alta || b.fechaInfraccion !== undefined) {
    if (!b.fechaInfraccion || Number.isNaN(new Date(b.fechaInfraccion).getTime())) return 'La fecha de infracción es obligatoria';
  }
  if (alta || b.inspectoresActuantes !== undefined) {
    if (!Array.isArray(b.inspectoresActuantes) || !b.inspectoresActuantes.length) return 'Elegí al menos un inspector actuante';
  }
  if (alta || b.motivosInfraccion !== undefined) {
    if (!Array.isArray(b.motivosInfraccion) || !b.motivosInfraccion.length) return 'Elegí al menos un motivo de infracción';
  }
  if (alta && !b.edificio && !String(b.calle ?? '').trim()) return 'Indicá el edificio o la calle y el número';
  if (b.observaciones && !String(b.detalleObservaciones ?? '').trim()) return 'Detallá las observaciones';
  return null;
}

/** Valida un pase. estadoDestino: documento Estado (o null si no cambia). Devuelve error o null. */
function validarPase(inf, { oficinaDestino, estadoDestino, comentarios }) {
  if (inf.eliminado) return 'La infracción está eliminada';
  if (esCerrada(inf)) return 'La infracción ya generó expediente y no admite más pases';
  if (!oficinaDestino) return 'La oficina de destino es obligatoria';
  if (estadoDestino?.requiereComentario && !String(comentarios ?? '').trim())
    return `El estado "${estadoDestino.nombre}" exige un comentario`;
  return null;
}

/** El rol Tecnico puede pasar una infracción solo mientras siga en la oficina inicial. */
function puedePasar(rol, inf, oficinaInicialId) {
  if (tienePermiso(rol, 'pase')) return true;
  return rol === 'Tecnico' && Boolean(oficinaInicialId) && String(inf.oficinaActual?._id ?? inf.oficinaActual) === String(oficinaInicialId);
}

/** Número de expediente automático: AAAA-NNNNN. */
const numeroExpedienteAuto = (anio, secuencia) => `${anio}-${String(secuencia).padStart(5, '0')}`;

module.exports = { esCerrada, esEditable, validarDatos, validarPase, puedePasar, numeroExpedienteAuto };
