// Vista de avance (VITE_SNAPSHOT=true): responde la API con una copia de solo lectura de los datos reales
// (public/snapshot.json, generada con deploy/exportar-snapshot.js). No hay servidor; los cambios no se guardan.
import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios';

/* eslint-disable @typescript-eslint/no-explicit-any */
type P = Record<string, any>;
let cargado: Promise<any> | null = null;
const datos = () => (cargado ??= fetch('/snapshot.json').then((r) => { if (!r.ok) throw new Error('snapshot'); return r.json(); }));

const norm = (s: string) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const pagina = (xs: any[], p: P, def: number, tope: number) => {
  const page = Math.max(1, Number(p.page) || 1), limit = Math.min(tope, Math.max(1, Number(p.limit) || def));
  return { total: xs.length, page, limit, items: xs.slice((page - 1) * limit, page * limit) };
};

function responder(d: any, url: string, p: P): unknown {
  const u = url.replace(/^\/api/, '');
  const conInfraccion = new Set<string>(d.infracciones.map((i: any) => String(i.edificio?._id ?? i.edificio)));
  const edificiosFiltrados = () => d.edificios.filter((e: any) =>
    (!p.calle || (e.calleNorm || norm(e.calle)).includes(norm(p.calle))) && (!p.geoEstado || e.geoEstado === p.geoEstado) &&
    (p.conInfraccion !== 'si' || conInfraccion.has(e._id)) && (p.conInfraccion !== 'no' || !conInfraccion.has(e._id)));

  if (u === '/auth/me') return { id: 'avance', nombres: 'Vista', apellidos: 'de avance', username: 'avance', role: 'Administrador' };
  if (u === '/edificios/mapa') {
    const ids = new Set(edificiosFiltrados().map((e: any) => e._id));
    const lista = d.mapa.filter((x: any) => ids.has(x.id) && (!p.semaforo || x.semaforo === p.semaforo) &&
      (!p.notificado || (p.notificado === 'si' ? x.plazo : x.plazo === p.notificado)));
    const sinUbicar = edificiosFiltrados().filter((e: any) => e.lat == null || e.lng == null).length;
    return { puntos: lista.map((x: any) => ({ ...x, fotos: 0 })), total: lista.length + sinUbicar, sinUbicar };
  }
  if (u === '/edificios/calles') {
    const m = new Map<string, { calleNorm: string; calle: string; cantidad: number }>();
    d.edificios.forEach((e: any) => {
      const k = e.calleNorm || norm(e.calle);
      if (p.q && !k.includes(norm(p.q))) return;
      m.set(k, { calleNorm: k, calle: e.calle, cantidad: (m.get(k)?.cantidad || 0) + 1 });
    });
    return [...m.values()].sort((a, b) => a.calleNorm.localeCompare(b.calleNorm)).slice(0, 50);
  }
  if (u === '/edificios/resumen') return d.resumen;
  if (u === '/edificios/kpis') return d.kpisEdificios;
  if (u === '/edificios') { const r = pagina(edificiosFiltrados(), p, 50, 200); return { total: r.total, page: r.page, items: r.items }; }
  const ed = u.match(/^\/edificios\/([^/]+)$/);
  if (ed) return d.fichas[ed[1]] ? { ...d.fichas[ed[1]], fotos: [] } : { demo: true };
  if (u === '/notificaciones/kpis') return d.kpisNotificaciones;
  if (u === '/notificaciones') {
    const l = d.notificaciones.filter((n: any) => (p.todas === 'si' || n.vigente) && (!p.estadoPlazo || n.estadoPlazo === p.estadoPlazo) &&
      (!p.search || norm(`${n.edificio?.direccionOriginal} ${n.observaciones}`).includes(norm(p.search))));
    return pagina(l, p, 25, 200);
  }
  if (u === '/infracciones/kpis') return d.kpisInfracciones;
  if (u === '/infracciones') {
    const l = d.infracciones.filter((i: any) =>
      (!p.estado || (i.estado?._id ?? i.estado) === p.estado) && (!p.oficina || (i.oficinaActual?._id ?? i.oficinaActual) === p.oficina) &&
      (!p.edificio || (i.edificio?._id ?? i.edificio) === p.edificio) && (!p.motivo || i.motivosInfraccion?.some((m: any) => (m._id ?? m) === p.motivo)) &&
      (!p.inspector || i.inspectoresActuantes?.some((x: any) => (x._id ?? x) === p.inspector)) &&
      (!p.asignadoA || (p.asignadoA === 'sin-asignar' ? !i.asignadoA : (i.asignadoA?._id ?? i.asignadoA) === p.asignadoA)) &&
      (!p.fechaDesde || String(i.fechaInfraccion).slice(0, 10) >= p.fechaDesde) && (!p.fechaHasta || String(i.fechaInfraccion).slice(0, 10) <= p.fechaHasta) &&
      (!p.calle || norm(i.edificio?.calle || '').includes(norm(p.calle))) &&
      (!p.search || norm(`${i.numeroActa} ${i.infractor} ${i.edificio?.direccionOriginal}`).includes(norm(p.search))));
    return pagina(l, p, 25, 100);
  }
  const inf = u.match(/^\/infracciones\/([^/]+)$/);
  if (inf) return d.infDetalle[inf[1]] ?? { historialMovimientos: [] };
  const cat = u.match(/^\/catalogos\/(.+)$/);
  if (cat) return d.cat[cat[1]] ?? [];
  if (u === '/geocodificar/progreso') return { corriendo: false, pendientes: 0, porEstado: {}, ultimoError: '' };
  if (u === '/users/asignables' || u === '/users') return [];
  return { demo: true };
}

export const snapshotAdapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
  if ((config.method || 'get').toLowerCase() !== 'get')
    return Promise.reject(Object.assign(new Error('solo lectura'), { isAxiosError: true, config, response: { status: 400, data: { message: 'Vista de avance: solo lectura, no se guardan cambios' }, config } }));
  const data = responder(await datos(), config.url || '', config.params || {});
  return { data, status: 200, statusText: 'OK', headers: {}, config };
};
