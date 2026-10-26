import { create } from 'zustand';

export interface Filtros {
  calle: string;
  geoEstado: string;
  conInfraccion: string;
  conFotos: string;
  notificado: string;
  categorias: string; // lista separada por comas; vacío = sin filtro (se ven todas)
}
const VACIOS: Filtros = { calle: '', geoEstado: '', conInfraccion: '', conFotos: '', notificado: '', categorias: '' };

interface Estado {
  filtros: Filtros;
  seleccionado: string | null;
  moviendo: boolean; // modo "corregir ubicación" del edificio seleccionado
  version: number; // se incrementa para forzar recarga del mapa
  setFiltro: (k: keyof Filtros, v: string) => void;
  limpiar: () => void;
  seleccionar: (id: string | null, mover?: boolean) => void;
  setMoviendo: (v: boolean) => void;
  refrescar: () => void;
}

export const useMapa = create<Estado>((set) => ({
  filtros: VACIOS,
  seleccionado: null,
  moviendo: false,
  version: 0,
  setFiltro: (k, v) => set((s) => ({ filtros: { ...s.filtros, [k]: v } })),
  limpiar: () => set({ filtros: VACIOS }),
  seleccionar: (id, mover = false) => set({ seleccionado: id, moviendo: mover && id !== null }),
  setMoviendo: (v) => set({ moviendo: v }),
  refrescar: () => set((s) => ({ version: s.version + 1 })),
}));
