import { EstadoInspeccion, GeoEstado, Semaforo } from './api';

// Colores con contraste suficiente sobre el mapa claro. Siempre van acompañados de texto.
export const SEMAFORO: Record<Semaforo, { label: string; color: string }> = {
  vigente: { label: 'Al día', color: '#2e7d32' },
  por_vencer: { label: 'Por vencer', color: '#f9a825' },
  vencido: { label: 'Vencido', color: '#e65100' },
  faltante: { label: 'Falta documentación', color: '#c62828' },
  sin_relevar: { label: 'Sin relevar', color: '#78909c' },
};

export const GEO_LABEL: Record<GeoEstado, string> = {
  pendiente: 'En cola',
  ok: 'Exacta',
  aproximado: 'Aproximada',
  fallido: 'No encontrada',
  manual: 'Ajustada a mano',
};

export const INSPECCION_LABEL: Record<EstadoInspeccion, string> = {
  pendiente: 'Pendiente',
  inspeccionado: 'Inspeccionado',
  observado: 'Observado',
  regularizado: 'Regularizado',
};
