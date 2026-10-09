import axios from 'axios';

export type Rol = 'Administrador' | 'Tecnico' | 'Juridico' | 'Direccion' | 'MesaDeEntradas' | 'Consulta';
export interface Usuario {
  id: string;
  nombres: string;
  apellidos: string;
  username: string;
  role: Rol;
}

export type Semaforo = 'vigente' | 'por_vencer' | 'vencido' | 'faltante' | 'sin_relevar';
export type EstadoDoc = Exclude<Semaforo, 'sin_relevar'>;
export type GeoEstado = 'pendiente' | 'ok' | 'aproximado' | 'fallido' | 'manual';
export type EstadoInspeccion = 'pendiente' | 'inspeccionado' | 'observado' | 'regularizado';

export interface Catalogo {
  _id: string;
  nombre: string;
  activo: boolean;
}
export interface Motivo extends Catalogo {
  descripcion?: string;
}
export interface Inspector extends Catalogo {
  legajo?: string;
}
export interface TipoDocumento extends Catalogo {
  requerido: boolean;
  tieneVencimiento: boolean;
  motivoAsociado?: { _id: string; nombre: string } | string | null;
  orden: number;
}
export interface Campana {
  _id: string;
  nombre: string;
  activa: boolean;
}
export interface Edificio {
  _id: string;
  direccionOriginal: string;
  calle: string;
  numero: number | null;
  lat: number | null;
  lng: number | null;
  geoEstado: GeoEstado;
  geoDisplayName: string;
  titular: string;
  uso: string;
  observaciones: string;
  estadoInspeccion: EstadoInspeccion;
  semaforo?: Semaforo;
  padron?: string;
  estadoObra?: string;
  calleOrigen?: string;
  alturaOriginal?: string;
  esquina?: string;
  conclusionCruce?: string;
  mismaCalleOtraAltura?: boolean;
  enListadoSinCert?: boolean;
}
export interface PuntoMapa {
  id: string;
  lat: number;
  lng: number;
  direccion: string;
  semaforo: Semaforo;
  estadoInspeccion: EstadoInspeccion;
  geoEstado: GeoEstado;
}
export interface DocumentoEdificio {
  presente: boolean;
  fechaEmision?: string | null;
  fechaVencimiento?: string | null;
  nroReferencia?: string;
  observaciones?: string;
}
export interface FichaDocumento {
  tipo: TipoDocumento;
  doc: DocumentoEdificio | null;
  estado: EstadoDoc;
}
export interface Estado extends Catalogo {
  descripcion?: string;
  esInicial: boolean;
  requiereComentario: boolean;
  esFinal: boolean;
  orden: number;
}
export interface Oficina extends Catalogo {
  descripcion?: string;
  esInicial: boolean;
  orden: number;
}
export interface Asignable {
  id: string;
  nombres: string;
  apellidos: string;
  role: Rol;
}
export interface Movimiento {
  fecha: string;
  oficinaOrigen?: { _id: string; nombre: string } | null;
  oficinaDestino: { _id: string; nombre: string };
  estado?: { _id: string; nombre: string } | null;
  por: { nombres: string; apellidos: string; username: string };
  comentarios: string;
}
export interface Infraccion {
  _id: string;
  numeroActa: string;
  edificio: { _id: string; direccionOriginal: string; lat: number | null; lng: number | null };
  infractor: string;
  descripcion?: string;
  normativa?: string;
  inspectoresActuantes: { _id: string; nombre: string; legajo?: string }[];
  motivosInfraccion: { _id: string; nombre: string }[];
  fechaInfraccion: string;
  estado: { _id: string; nombre: string; requiereComentario: boolean; esFinal: boolean };
  oficinaActual: { _id: string; nombre: string };
  asignadoA?: { _id: string; nombres: string; apellidos: string } | null;
  observaciones: boolean;
  detalleObservaciones: string;
  historialMovimientos?: Movimiento[];
  expediente?: { numero: string; fecha?: string };
  edificioCreado?: boolean;
}
export interface InspeccionVisita {
  _id: string;
  fecha: string;
  inspector?: { _id: string; nombre: string } | null;
  resultado: Exclude<EstadoInspeccion, 'pendiente'>;
  observaciones: string;
}
export interface Ficha {
  edificio: Edificio;
  semaforo: Semaforo;
  documentos: FichaDocumento[];
  infraccionesPotenciales: { documento: string; estado: EstadoDoc; motivo: { _id: string; nombre: string } }[];
  infracciones: Infraccion[];
  inspecciones: InspeccionVisita[];
}

const TOKEN_KEY = 'campana_token';
export const getToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};
export const setToken = (t: string | null) => {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* sin storage */
  }
};

export const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api' });
api.interceptors.request.use((cfg) => {
  const t = getToken();
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});
api.interceptors.response.use(
  (r) => r,
  (e) => {
    if (e.response?.status === 401 && !e.config.url?.includes('/auth/login')) {
      setToken(null);
      window.location.assign('/login');
    }
    return Promise.reject(e);
  }
);

export const errMsg = (e: unknown): string =>
  (axios.isAxiosError(e) && e.response?.data?.message) || 'Ocurrió un error inesperado';

export const fmtFecha = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('es-AR', { timeZone: 'UTC' }) : '—';
export const isoDia = (iso?: string | null) => (iso ? iso.slice(0, 10) : '');
