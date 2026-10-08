import { Rol } from '../api';

// Espejo de server/config/permisos.js: si cambia uno, cambiar el otro.
export const ROLES: Rol[] = ['Administrador', 'Tecnico', 'Juridico', 'Direccion', 'MesaDeEntradas', 'Consulta'];

export const ROL_LABEL: Record<Rol, string> = {
  Administrador: 'Administrador',
  Tecnico: 'Técnico (carga)',
  Juridico: 'Jurídico',
  Direccion: 'Dirección',
  MesaDeEntradas: 'Mesa de Entradas',
  Consulta: 'Consulta (solo lectura)',
};

const PERMISOS = {
  editarInfracciones: ['Administrador', 'Tecnico'],
  pase: ['Administrador', 'Juridico', 'Direccion'],
  expediente: ['Administrador', 'MesaDeEntradas'],
  eliminarInfracciones: ['Administrador'],
  editarEdificios: ['Administrador', 'Tecnico'],
  editarCatalogos: ['Administrador', 'Tecnico'],
  importar: ['Administrador', 'Tecnico'],
  usuarios: ['Administrador'],
} as const;

export type Accion = keyof typeof PERMISOS;

export const can = (rol: Rol | undefined, accion: Accion): boolean =>
  !!rol && (rol === 'Administrador' || (PERMISOS[accion] as readonly string[]).includes(rol));

/** El Técnico puede pasar una infracción solo mientras siga en la oficina inicial. */
export const puedePasar = (rol: Rol | undefined, oficinaActualId: string, oficinaInicialId?: string): boolean =>
  can(rol, 'pase') || (rol === 'Tecnico' && !!oficinaInicialId && oficinaActualId === oficinaInicialId);
