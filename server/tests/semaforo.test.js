const test = require('node:test');
const assert = require('node:assert');
const { estadoDocumento, evaluarEdificio } = require('../services/semaforo');

const hoy = new Date('2026-10-08T12:00:00Z');
const dias = (n) => new Date(hoy.getTime() + n * 86400000);

test('estadoDocumento', () => {
  const conVenc = { tieneVencimiento: true };
  assert.strictEqual(estadoDocumento(null, conVenc, hoy), 'faltante');
  assert.strictEqual(estadoDocumento({ presente: false }, conVenc, hoy), 'faltante');
  assert.strictEqual(estadoDocumento({ presente: true, fechaVencimiento: dias(-1) }, conVenc, hoy), 'vencido');
  assert.strictEqual(estadoDocumento({ presente: true, fechaVencimiento: dias(30) }, conVenc, hoy), 'por_vencer');
  assert.strictEqual(estadoDocumento({ presente: true, fechaVencimiento: dias(200) }, conVenc, hoy), 'vigente');
  assert.strictEqual(estadoDocumento({ presente: true, fechaVencimiento: dias(-50) }, { tieneVencimiento: false }, hoy), 'vigente');
});

const tipos = [
  { _id: 'a', nombre: 'Certificado A', requerido: true, tieneVencimiento: true, motivoAsociado: 'm1' },
  { _id: 'b', nombre: 'Plano B', requerido: true, tieneVencimiento: false, motivoAsociado: 'm2' },
  { _id: 'c', nombre: 'Extra C', requerido: false, tieneVencimiento: false, motivoAsociado: 'm3' },
];

test('sin documentos cargados = sin_relevar', () => {
  assert.strictEqual(evaluarEdificio(tipos, [], hoy).semaforo, 'sin_relevar');
});

test('falta un requerido: semáforo faltante y posible infracción', () => {
  const r = evaluarEdificio(tipos, [{ tipo: 'a', presente: true, fechaVencimiento: dias(100) }], hoy);
  assert.strictEqual(r.semaforo, 'faltante');
  assert.deepStrictEqual(r.infraccionesPotenciales.map((i) => i.motivo), ['m2']);
});

test('requeridos al día; el no requerido faltante no afecta', () => {
  const r = evaluarEdificio(tipos, [
    { tipo: 'a', presente: true, fechaVencimiento: dias(100) },
    { tipo: 'b', presente: true },
  ], hoy);
  assert.strictEqual(r.semaforo, 'vigente');
  assert.strictEqual(r.infraccionesPotenciales.length, 0);
});

test('vencido y por vencer', () => {
  const venc = evaluarEdificio(tipos, [
    { tipo: 'a', presente: true, fechaVencimiento: dias(-5) },
    { tipo: 'b', presente: true },
  ], hoy);
  assert.strictEqual(venc.semaforo, 'vencido');
  assert.strictEqual(venc.infraccionesPotenciales[0].motivo, 'm1');
  const pv = evaluarEdificio(tipos, [
    { tipo: 'a', presente: true, fechaVencimiento: dias(20) },
    { tipo: 'b', presente: true },
  ], hoy);
  assert.strictEqual(pv.semaforo, 'por_vencer');
});
