// Matriz de permisos por acción. Tiene un espejo en client/src/utils/permisos.ts: si cambia uno, cambiar el otro.
const ROLES = ['Administrador', 'Tecnico', 'Juridico', 'Direccion', 'MesaDeEntradas', 'Consulta'];

const PERMISOS = {
  editarInfracciones: ['Administrador', 'Tecnico'], // crear y editar
  pase: ['Administrador', 'Juridico', 'Direccion'], // Tecnico solo si la infracción sigue en la oficina inicial
  expediente: ['Administrador', 'MesaDeEntradas'],
  eliminarInfracciones: ['Administrador'],
  editarEdificios: ['Administrador', 'Tecnico'],
  editarCatalogos: ['Administrador', 'Tecnico'],
  importar: ['Administrador', 'Tecnico'],
  usuarios: ['Administrador'],
};

const tienePermiso = (rol, accion) => rol === 'Administrador' || (PERMISOS[accion] || []).includes(rol);

module.exports = { ROLES, PERMISOS, tienePermiso };
