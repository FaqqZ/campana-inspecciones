// Modo demostración (VITE_SIN_LOGIN=true): responde la API con datos ficticios generados en el navegador.
// No hay servidor ni base de datos; las altas, ediciones e importaciones no se guardan.
import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios';

const CALLES = ['Mendoza', 'Córdoba', 'San Juan', 'Santiago del Estero', 'Muñecas', 'Las Piedras', 'Av. Mate de Luna', '24 de Septiembre', 'Lavalle', 'Maipú'];
const USOS = ['Vivienda multifamiliar', 'Oficinas', 'Comercial', 'Mixto'];
const MOTIVOS = [
  ['m1', 'Faltan luces de emergencia'], ['m2', 'Falta de extintores'], ['m3', 'Extintor vencido'], ['m4', 'No permite la inspección'],
  ['m5', 'Incumplimiento de boleta de notificación'], ['m6', 'Red de incendio incompleta'], ['m7', 'Faltan balizas'],
].map(([_id, nombre]) => ({ _id, nombre, activo: true, descripcion: '' }));
const ESTADOS = ['Ingresado', 'En revisión', 'Observado', 'Pase externo', 'Aprobado', 'Rechazado', 'Finalizado'].map((nombre, i) => ({
  _id: `s${i}`, nombre, activo: true, esInicial: i === 0, requiereComentario: i === 2 || i === 5, esFinal: i === 6, orden: i, descripcion: '',
}));
const OFICINAS = ['Oficina Técnica', 'Mesa de Entradas', 'Jurídico', 'Dirección'].map((nombre, i) => ({ _id: `o${i}`, nombre, activo: true, esInicial: i === 0, orden: i, descripcion: '' }));
const INSPECTORES = ['Inspector Uno', 'Inspector Dos', 'Inspector Tres'].map((nombre, i) => ({ _id: `i${i}`, nombre, legajo: String(100 + i), activo: true }));
const TIPOS = [{ _id: 't1', nombre: 'Certificado final de inspección', activo: true, requerido: true, tieneVencimiento: false, motivoAsociado: null, orden: 1 }];

// generador determinista
let seed = 7;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];

const EDIFICIOS = Array.from({ length: 48 }, (_, i) => {
  const calle = CALLES[i % CALLES.length];
  const numero = 100 + Math.floor(rnd() * 1800);
  const semaforo = pick(['vigente', 'vigente', 'faltante', 'vencido', 'por_vencer', 'sin_relevar'] as const);
  return {
    _id: `e${i}`, direccionOriginal: `${calle} ${numero}`, calle, numero,
    lat: -26.8241 + (rnd() - 0.5) * 0.03, lng: -65.2226 + (rnd() - 0.5) * 0.03,
    geoEstado: 'ok', geoDisplayName: '', titular: `Consorcio de Propietarios ${calle} ${numero}`, uso: pick(USOS), observaciones: '',
    estadoInspeccion: pick(['pendiente', 'pendiente', 'inspeccionado', 'observado', 'regularizado'] as const), semaforo,
  };
});

const hoy = Date.now();
const INFRACCIONES = Array.from({ length: 70 }, (_, i) => {
  const e = EDIFICIOS[Math.floor(rnd() * 30)];
  const m = pick(MOTIVOS);
  const est = pick(ESTADOS.slice(0, 5));
  const cerrada = rnd() < 0.15;
  return {
    _id: `f${i}`, numeroActa: String(763000 + i * 7), edificio: { _id: e._id, direccionOriginal: e.direccionOriginal, calle: e.calle, lat: e.lat, lng: e.lng },
    infractor: e.titular, descripcion: `${m.nombre} (dato ficticio)`, normativa: 'Normativa de ejemplo',
    inspectoresActuantes: [], motivosInfraccion: [{ _id: m._id, nombre: m.nombre }],
    fechaInfraccion: new Date(hoy - Math.floor(rnd() * 60) * 86400000).toISOString(),
    estado: cerrada ? ESTADOS[6] : est, oficinaActual: pick(OFICINAS), asignadoA: null, observaciones: false, detalleObservaciones: '',
    expediente: cerrada ? { numero: `EXP-${i}` } : { numero: '' },
  };
});

// Edificios notificados (ficticios): fechas repartidas para ver los tres estados de plazo.
const estadoPlazoDe = (dias: number) => (dias < 0 ? 'vencido' : dias <= 10 ? 'por_vencer' : 'en_plazo') as 'vencido' | 'por_vencer' | 'en_plazo';
const NOTIFICACIONES = Array.from({ length: 16 }, (_, i) => {
  const e = EDIFICIOS[i * 2];
  const plazoDias = pick([15, 30, 30, 45, 60]);
  const antes = Math.floor(rnd() * (plazoDias + 20));
  const fechaNotificacion = new Date(hoy - antes * 86400000);
  const fechaVencimiento = new Date(fechaNotificacion.getTime() + plazoDias * 86400000);
  const diasRestantes = plazoDias - antes;
  return {
    _id: `n${i}`, edificio: { _id: e._id, direccionOriginal: e.direccionOriginal, calle: e.calle }, fechaNotificacion: fechaNotificacion.toISOString(), plazoDias,
    fechaVencimiento: fechaVencimiento.toISOString(), observaciones: pick(['Presentar documentación técnica', 'Regularizar el final de obra', '']),
    estadoPlazo: (i === 3 ? 'presento' : i === 7 || i === 11 ? 'acta' : estadoPlazoDe(diasRestantes)) as ReturnType<typeof estadoPlazoDe> | 'presento' | 'acta', diasRestantes, vigente: true,
    boleta: String(69300 + i * 13), razonSocial: e.titular, inspector: pick(['MEDINA', 'CAMILETTI', 'MARQUEZ']), prorroga: i % 5 === 0,
  };
}).sort((a, b) => a.fechaVencimiento.localeCompare(b.fechaVencimiento));
const plazoEdificio = (id: string) => NOTIFICACIONES.find((n) => n.edificio._id === id)?.estadoPlazo ?? null;

const contar = (xs: string[]) => Object.values(xs.reduce<Record<string, number>>((a, k) => ((a[k] = (a[k] || 0) + 1), a), {}));
const agrupar = (xs: string[], tope?: number) => {
  const m = new Map<string, number>();
  xs.forEach((k) => m.set(k, (m.get(k) || 0) + 1));
  const l = [...m.entries()].map(([nombre, cantidad]) => ({ nombre, cantidad })).sort((a, b) => b.cantidad - a.cantidad);
  return tope ? l.slice(0, tope) : l;
};

function kpis() {
  const total = INFRACCIONES.length;
  const abiertas = INFRACCIONES.filter((i) => !i.expediente.numero);
  const eds = agrupar(INFRACCIONES.map((i) => i.edificio.direccionOriginal));
  const edad = (i: (typeof INFRACCIONES)[number]) => Math.floor((hoy - new Date(i.fechaInfraccion).getTime()) / 86400000);
  const edades = abiertas.map(edad);
  const tramo = (a: number, b: number) => edades.filter((e) => e >= a && e <= b).length;
  const semanas = new Map<string, number>();
  INFRACCIONES.forEach((i) => {
    const d = new Date(i.fechaInfraccion);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    const k = d.toISOString().slice(0, 10);
    semanas.set(k, (semanas.get(k) || 0) + 1);
  });
  return {
    resumen: {
      total, abiertas: abiertas.length, conExpediente: total - abiertas.length, pctExpediente: Math.round(((total - abiertas.length) / total) * 100),
      edificiosConActas: eds.length, totalEdificios: EDIFICIOS.length, pctCobertura: Math.round((eds.length / EDIFICIOS.length) * 100),
      promedioPorEdificio: Math.round((total / eds.length) * 10) / 10, reincidentes: eds.filter((e) => e.cantidad >= 2).length,
      sinAsignar: abiertas.length, antiguedadPromedio: Math.round(edades.reduce((a, b) => a + b, 0) / edades.length), antiguedadMaxima: Math.max(...edades),
    },
    porMotivo: agrupar(INFRACCIONES.map((i) => i.motivosInfraccion[0].nombre)),
    porEstado: agrupar(INFRACCIONES.map((i) => i.estado.nombre)),
    porOficina: agrupar(abiertas.map((i) => i.oficinaActual.nombre)),
    porCalle: agrupar(INFRACCIONES.map((i) => i.edificio.calle), 8),
    topEdificios: eds.slice(0, 8),
    antiguedad: [
      { nombre: '0 a 15 días', cantidad: tramo(0, 15) }, { nombre: '16 a 30 días', cantidad: tramo(16, 30) },
      { nombre: '31 a 60 días', cantidad: tramo(31, 60) }, { nombre: 'Más de 60 días', cantidad: tramo(61, 9999) },
    ],
    porSemana: [...semanas.entries()].sort().map(([semana, cantidad]) => ({ semana, cantidad })),
  };
}

function responder(url: string, params: Record<string, string> = {}): unknown {
  const u = url.replace(/^\/api/, '');
  if (u === '/auth/me') return { id: 'prueba', nombres: 'Demo', apellidos: 'Sin login', username: 'demo', role: 'Administrador' };
  if (u === '/edificios/mapa') {
    const puntos = EDIFICIOS.map((e) => ({ id: e._id, lat: e.lat, lng: e.lng, direccion: e.direccionOriginal, semaforo: e.semaforo, estadoInspeccion: e.estadoInspeccion, geoEstado: e.geoEstado, fotos: 0, plazo: plazoEdificio(e._id) }))
      .filter((p) => !params?.notificado || (params.notificado === 'si' ? p.plazo : p.plazo === params.notificado));
    return { puntos, total: puntos.length, sinUbicar: 0 };
  }
  if (u === '/edificios/calles') return agrupar(EDIFICIOS.map((e) => e.calle)).map((c) => ({ calleNorm: c.nombre.toLowerCase(), calle: c.nombre, cantidad: c.cantidad }));
  if (u === '/edificios/resumen')
    return {
      total: EDIFICIOS.length, geolocalizados: EDIFICIOS.length, porGeo: { ok: EDIFICIOS.length },
      porInspeccion: Object.fromEntries(agrupar(EDIFICIOS.map((e) => e.estadoInspeccion)).map((c) => [c.nombre, c.cantidad])),
      porSemaforo: Object.fromEntries(agrupar(EDIFICIOS.map((e) => e.semaforo)).map((c) => [c.nombre, c.cantidad])),
    };
  if (u === '/edificios') {
    const page = Number(params.page) || 1, limit = Number(params.limit) || 50;
    return { total: EDIFICIOS.length, page, items: EDIFICIOS.slice((page - 1) * limit, page * limit) };
  }
  const ed = u.match(/^\/edificios\/(e\d+)$/);
  if (ed) {
    const e = EDIFICIOS.find((x) => x._id === ed[1])!;
    return {
      edificio: e, semaforo: e.semaforo, inspecciones: [], infraccionesPotenciales: [],
      fotos: [], notificaciones: NOTIFICACIONES.filter((n) => n.edificio._id === e._id), documentos: [{ tipo: TIPOS[0], doc: null, estado: 'sin_relevar' }], infracciones: INFRACCIONES.filter((i) => i.edificio._id === e._id),
    };
  }
  if (u === '/edificios/kpis') {
    const sin = EDIFICIOS.filter((e) => e.semaforo !== 'vigente');
    const g = (xs: string[]) => agrupar(xs);
    return {
      resumen: { total: EDIFICIOS.length, delCruce: 36, creadosDesdeActas: 12, conCertificado: EDIFICIOS.length - sin.length, pctCertificado: Math.round(((EDIFICIOS.length - sin.length) / EDIFICIOS.length) * 100),
        sinCertificado: sin.length, sinRelevar: 8, sinFinalCatastro: 20, pctSinFinalCatastro: 42, sinCertConActasAbiertas: 5, sinCertSinActas: 22, conActas: 30, sinUbicar: 2 },
      porSituacion: [
        { nombre: 'Resolución denegada', cantidad: 3 },
        { nombre: 'Conforme a obra presentado, documentación sin terminar', cantidad: 9 },
        { nombre: 'Terminado y habitado', cantidad: 17 },
        { nombre: 'Otras situaciones (sin final, a verificar, en construcción…)', cantidad: 19 },
        { nombre: 'Sin dato de Catastro', cantidad: 8 },
      ],
      porEstadoObra: [{ nombre: 'CON PERMISO SIN FINAL A VERIFICAR CONSTRUCCION', cantidad: 19 }, { nombre: 'TERMINADO HABITADO', cantidad: 11 }, { nombre: 'Sin dato de Catastro', cantidad: 8 }, { nombre: 'TERMINADO', cantidad: 6 }, { nombre: 'CONFORME A OBRA INCONCLUSO', cantidad: 4 }],
      porSemaforo: g(EDIFICIOS.map((e) => ({ vigente: 'Al día', faltante: 'Falta certificado', sin_relevar: 'Sin relevar', vencido: 'Vencido', por_vencer: 'Por vencer' })[e.semaforo])),
      porInspeccion: g(EDIFICIOS.map((e) => e.estadoInspeccion)), porGeo: [{ nombre: 'Ubicado', cantidad: EDIFICIOS.length - 2 }, { nombre: 'No se pudo ubicar', cantidad: 2 }],
      sinCertPorCalle: agrupar(sin.map((e) => e.calle), 8),
    };
  }
  if (u === '/notificaciones/kpis') {
    const cuenta = (x: string) => NOTIFICACIONES.filter((n) => n.estadoPlazo === x).length;
    return {
      resumen: {
        notificados: NOTIFICACIONES.length, notificaciones: NOTIFICACIONES.length, enPlazo: cuenta('en_plazo'), porVencer: cuenta('por_vencer'), vencidos: cuenta('vencido'), presentaron: cuenta('presento'), pasaronAActa: cuenta('acta'), sinPlazo: 0, conProrroga: NOTIFICACIONES.filter((n) => n.prorroga).length,
        vencenEn7: NOTIFICACIONES.filter((n) => n.diasRestantes >= 0 && n.diasRestantes <= 7).length, vencenEn30: NOTIFICACIONES.filter((n) => n.diasRestantes >= 0 && n.diasRestantes <= 30).length,
        plazoPromedio: Math.round(NOTIFICACIONES.reduce((a, n) => a + n.plazoDias, 0) / NOTIFICACIONES.length),
      },
      porEstado: [{ nombre: 'En plazo', cantidad: cuenta('en_plazo') }, { nombre: 'Por vencer', cantidad: cuenta('por_vencer') }, { nombre: 'Vencido', cantidad: cuenta('vencido') }, { nombre: 'Presentó documentación', cantidad: cuenta('presento') }, { nombre: 'Pasó a acta', cantidad: cuenta('acta') }],
      porCalle: agrupar(NOTIFICACIONES.map((n) => n.edificio.calle), 8),
      porMesVencimiento: agrupar(NOTIFICACIONES.filter((n) => n.estadoPlazo !== 'vencido').map((n) => n.fechaVencimiento.slice(5, 7) + '/' + n.fechaVencimiento.slice(0, 4))),
    };
  }
  if (u === '/notificaciones') {
    const page = Number(params.page) || 1, limit = Number(params.limit) || 25;
    const l = NOTIFICACIONES.filter((n) => (!params.estadoPlazo || n.estadoPlazo === params.estadoPlazo) && (!params.search || n.edificio.direccionOriginal.toLowerCase().includes(String(params.search).toLowerCase())));
    return { total: l.length, page, limit, items: l.slice((page - 1) * limit, page * limit) };
  }
  if (u === '/infracciones/kpis') return kpis();
  if (u === '/infracciones') {
    const page = Number(params.page) || 1, limit = Number(params.limit) || 25;
    return { total: INFRACCIONES.length, page, items: INFRACCIONES.slice((page - 1) * limit, page * limit) };
  }
  const inf = u.match(/^\/infracciones\/(f\d+)$/);
  if (inf) return { ...INFRACCIONES.find((i) => i._id === inf[1])!, historialMovimientos: [] };
  if (u === '/catalogos/motivos') return MOTIVOS;
  if (u === '/catalogos/estados') return ESTADOS;
  if (u === '/catalogos/oficinas') return OFICINAS;
  if (u === '/catalogos/inspectores') return INSPECTORES;
  if (u === '/catalogos/tipos-documento') return TIPOS;
  if (u === '/catalogos/campanas') return [{ _id: 'c1', nombre: 'Campaña de demostración', activa: true }];
  if (u === '/geocodificar/progreso') return { corriendo: false, pendientes: 0, porEstado: { ok: EDIFICIOS.length }, ultimoError: '' };
  if (u === '/users/asignables' || u === '/users') return [];
  return { demo: true };
}

export const demoAdapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
  const metodo = (config.method || 'get').toLowerCase();
  const data = metodo === 'get' ? responder(config.url || '', config.params) : { demo: true, message: 'Modo demostración: los cambios no se guardan' };
  if (metodo !== 'get') return Promise.reject(Object.assign(new Error('demo'), { isAxiosError: true, response: { status: 400, data: { message: 'Modo demostración: no se guardan cambios' }, config }, config }));
  return { data, status: 200, statusText: 'OK', headers: {}, config };
};
