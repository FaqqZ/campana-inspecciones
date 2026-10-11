import { EstadoInspeccion, EstadoPlazo, GeoEstado, Semaforo } from './api';

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

// Plazo de los edificios notificados. Cada estado va con texto (y ícono donde se muestra), no solo color.
export const PLAZO: Record<EstadoPlazo, { label: string; color: string }> = {
  en_plazo: { label: 'En plazo', color: '#2e7d32' },
  por_vencer: { label: 'Por vencer', color: '#f9a825' },
  vencido: { label: 'Vencido', color: '#c62828' },
  presento: { label: 'Presentó documentación', color: '#1565c0' },
  acta: { label: 'Pasó a acta', color: '#6a1b9a' },
  sin_plazo: { label: 'Sin plazo registrado', color: '#546e7a' },
};
