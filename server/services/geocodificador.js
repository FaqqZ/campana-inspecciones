const { Edificio, GeoCache } = require('../models');

const NOMINATIM = process.env.GEO_URL || 'https://nominatim.openstreetmap.org/search';
const INTERVALO_MS = 1100; // política de uso de Nominatim: máx. 1 consulta por segundo
const CIUDAD = 'San Miguel de Tucumán';
const PROVINCIA = 'Tucumán';

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/** Parámetros de búsqueda estructurada. Función pura. */
function armarParams({ calle, numero }, { conNumero = true, viewbox } = {}) {
  const p = new URLSearchParams({
    format: 'jsonv2',
    addressdetails: '1',
    limit: '1',
    countrycodes: 'ar',
    street: conNumero && numero ? `${numero} ${calle}` : calle,
    city: CIUDAD,
    state: PROVINCIA,
    country: 'Argentina',
  });
  if (viewbox) {
    p.set('viewbox', viewbox);
    p.set('bounded', '1');
  }
  return p;
}

/** Interpreta la primera respuesta de Nominatim. Función pura. Devuelve null si no hay resultado. */
function interpretarRespuesta(resultados, conNumero) {
  const r = Array.isArray(resultados) ? resultados[0] : null;
  if (!r) return null;
  const lat = Number(r.lat);
  const lng = Number(r.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const exacto = conNumero && Boolean(r.address?.house_number);
  return { lat, lng, displayName: r.display_name || '', precision: exacto ? 'ok' : 'aproximado' };
}

async function consultar(params) {
  const res = await fetch(`${NOMINATIM}?${params}`, {
    headers: { 'User-Agent': process.env.GEO_USER_AGENT || 'campana-inspecciones/1.0', 'Accept-Language': 'es' },
  });
  if (!res.ok) throw new Error(`Nominatim respondió ${res.status}`);
  return res.json();
}

/**
 * Geocodifica una dirección usando caché → Nominatim con número → Nominatim solo calle.
 * Devuelve { resultado, huboRed } ; huboRed indica si se consultó la red (para respetar el ritmo).
 */
async function geocodificar(edificio) {
  const viewbox = process.env.GEO_VIEWBOX;
  const claveNum = `${edificio.direccionNorm}`;
  const claveCalle = `calle:${edificio.calleNorm}`;

  const cacheado = await GeoCache.findOne({ queryNorm: claveNum });
  if (cacheado) return { resultado: cacheado.toObject(), huboRed: false };

  let huboRed = false;
  let resultado = null;
  if (edificio.numero) {
    huboRed = true;
    resultado = interpretarRespuesta(await consultar(armarParams(edificio, { conNumero: true, viewbox })), true);
  }
  if (!resultado || resultado.precision !== 'ok') {
    const cacheCalle = await GeoCache.findOne({ queryNorm: claveCalle });
    if (cacheCalle && cacheCalle.precision !== 'fallido') {
      resultado = resultado || { lat: cacheCalle.lat, lng: cacheCalle.lng, displayName: cacheCalle.displayName, precision: 'aproximado' };
    } else if (!resultado) {
      if (huboRed) await dormir(INTERVALO_MS);
      huboRed = true;
      resultado = interpretarRespuesta(await consultar(armarParams(edificio, { conNumero: false, viewbox })), false);
      await GeoCache.updateOne(
        { queryNorm: claveCalle },
        { $set: resultado ? { ...resultado } : { precision: 'fallido' } },
        { upsert: true }
      );
    }
  }
  const final = resultado || { precision: 'fallido' };
  await GeoCache.updateOne({ queryNorm: claveNum }, { $set: final }, { upsert: true });
  return { resultado: final, huboRed };
}

// ---------- Cola en memoria; el estado real vive en Mongo (geoEstado) ----------
const estado = { corriendo: false, procesados: 0, errores: 0, ultimoError: '', iniciado: null };

async function aplicar(edificio, r) {
  if (r.precision === 'fallido') {
    await Edificio.updateOne({ _id: edificio._id }, { geoEstado: 'fallido' });
  } else {
    await Edificio.updateOne(
      { _id: edificio._id },
      { lat: r.lat, lng: r.lng, geoEstado: r.precision, geoDisplayName: r.displayName || '' }
    );
  }
}

/** Procesa pendientes de una campaña (o de un lote) de a uno. Reanudable: se puede volver a llamar. */
async function procesarPendientes(filtro) {
  if (estado.corriendo) return false;
  Object.assign(estado, { corriendo: true, procesados: 0, errores: 0, ultimoError: '', iniciado: new Date() });
  (async () => {
    try {
      for (;;) {
        const e = await Edificio.findOne({ ...filtro, geoEstado: 'pendiente' }).sort('createdAt');
        if (!e) break;
        try {
          const { resultado, huboRed } = await geocodificar(e);
          await aplicar(e, resultado);
          estado.procesados += 1;
          if (huboRed) await dormir(INTERVALO_MS);
        } catch (err) {
          estado.errores += 1;
          estado.ultimoError = err.message;
          // Error de red/servicio: no marcar fallido; se corta para reintentar luego.
          if (estado.errores >= 3) break;
          await dormir(5000);
        }
      }
    } finally {
      estado.corriendo = false;
    }
  })();
  return true;
}

const obtenerEstado = () => ({ ...estado });

module.exports = { armarParams, interpretarRespuesta, geocodificar, procesarPendientes, obtenerEstado };
