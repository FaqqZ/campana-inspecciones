const test = require('node:test');
const assert = require('node:assert');
const { armarParams, interpretarRespuesta } = require('../services/geocodificador');

test('armarParams con número y viewbox', () => {
  const p = armarParams({ calle: 'Mate de Luna', numero: 1234 }, { viewbox: '-65.33,-26.75,-65.12,-26.93' });
  assert.strictEqual(p.get('street'), '1234 Mate de Luna');
  assert.strictEqual(p.get('city'), 'San Miguel de Tucumán');
  assert.strictEqual(p.get('bounded'), '1');
  assert.strictEqual(p.get('countrycodes'), 'ar');
});

test('armarParams sin número usa solo la calle', () => {
  const p = armarParams({ calle: 'Mate de Luna', numero: 1234 }, { conNumero: false });
  assert.strictEqual(p.get('street'), 'Mate de Luna');
  assert.strictEqual(p.get('bounded'), null);
});

test('interpretarRespuesta distingue exacto de aproximado', () => {
  const casa = [{ lat: '-26.83', lon: '-65.2', display_name: 'x', address: { house_number: '1234' } }];
  assert.strictEqual(interpretarRespuesta(casa, true).precision, 'ok');
  const calle = [{ lat: '-26.83', lon: '-65.2', display_name: 'x', address: { road: 'Mate de Luna' } }];
  assert.strictEqual(interpretarRespuesta(calle, true).precision, 'aproximado');
  assert.strictEqual(interpretarRespuesta(casa, false).precision, 'aproximado');
  assert.strictEqual(interpretarRespuesta([], true), null);
  assert.strictEqual(interpretarRespuesta([{ lat: 'x', lon: 'y' }], true), null);
});
