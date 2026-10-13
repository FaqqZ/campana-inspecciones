#!/usr/bin/env node
// Exporta una copia de solo lectura de los datos (vía API) a client/public/snapshot.json (y las fotos a client/public/fotos/), para publicar una vista de
// avance sin backend (build del cliente con VITE_SNAPSHOT=true y VITE_SIN_LOGIN=true). El archivo contiene datos reales:
// está en .gitignore y el sitio que lo sirva debe tener acceso restringido.
//   node deploy/exportar-snapshot.js            (usa server/.env; el servidor debe estar corriendo)
const fs = require('fs');
const path = require('path');
require(path.join(__dirname, '..', 'server', 'node_modules', 'dotenv')).config({ path: path.join(__dirname, '..', 'server', '.env') });

const BASE = process.env.API || `http://127.0.0.1:${process.env.PORT || 5003}/api`;
let token = '';
const get = async (url, params = {}) => {
  const qs = new URLSearchParams(params).toString();
  const r = await fetch(`${BASE}${url}${qs ? `?${qs}` : ''}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  return r.json();
};
const paginar = async (url, limit, params = {}) => {
  const out = [];
  for (let page = 1; ; page++) {
    const r = await get(url, { ...params, page, limit });
    out.push(...r.items);
    if (out.length >= r.total || !r.items.length) return out;
  }
};

(async () => {
  const login = await fetch(`${BASE}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: process.env.ADMIN_USERNAME, password: process.env.ADMIN_PASSWORD }),
  });
  if (!login.ok) throw new Error(`login ${login.status}`);
  token = (await login.json()).token;

  const edificios = await paginar('/edificios', 200);
  const infracciones = await paginar('/infracciones', 100);
  const notificaciones = await paginar('/notificaciones', 200, { todas: 'si' });
  const mapa = (await get('/edificios/mapa')).puntos;
  const fichas = {};
  const dirFotos = path.join(__dirname, '..', 'client', 'public', 'fotos');
  fs.rmSync(dirFotos, { recursive: true, force: true });
  fs.mkdirSync(dirFotos, { recursive: true });
  let nFotos = 0;
  for (const e of edificios) {
    fichas[e._id] = await get(`/edificios/${e._id}`);
    for (const f of fichas[e._id].fotos || []) {
      const r = await fetch(`${BASE}/edificios/${e._id}/fotos/${f._id}`, { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) { fs.writeFileSync(path.join(dirFotos, f._id), Buffer.from(await r.arrayBuffer())); nFotos++; }
    }
  }
  const infDetalle = {};
  for (const i of infracciones) infDetalle[i._id] = await get(`/infracciones/${i._id}`);
  const cat = {};
  for (const c of ['motivos', 'estados', 'oficinas', 'inspectores', 'tipos-documento', 'campanas']) cat[c] = await get(`/catalogos/${c}`, { todos: 'true' });

  const snap = {
    generado: new Date().toISOString(),
    edificios, infracciones, notificaciones, mapa, fichas, infDetalle, cat,
    resumen: await get('/edificios/resumen'),
    kpisEdificios: await get('/edificios/kpis'),
    kpisNotificaciones: await get('/notificaciones/kpis'),
    kpisInfracciones: await get('/infracciones/kpis'),
    kpisDefensaCivil: await get('/infracciones/kpis-dc'),
  };
  const destino = path.join(__dirname, '..', 'client', 'public', 'snapshot.json');
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, JSON.stringify(snap));
  console.log(`snapshot.json: ${edificios.length} edificios, ${infracciones.length} infracciones, ${notificaciones.length} notificaciones, ${nFotos} fotos, ${(fs.statSync(destino).size / 1e6).toFixed(1)} MB`);
})().catch((e) => { console.error(e.message); process.exit(1); });
