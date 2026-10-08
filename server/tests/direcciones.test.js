const test = require('node:test');
const assert = require('node:assert');
const { normalizarCalle, parseNumero, separarDireccion, claveDireccion } = require('../services/direcciones');

test('normalizarCalle expande abreviaturas y saca tildes', () => {
  assert.strictEqual(normalizarCalle('Av. Gral. Paz'), 'avenida general paz');
  assert.strictEqual(normalizarCalle('  CALLE   Mate de Luna '), 'mate de luna');
  assert.strictEqual(normalizarCalle('25 de Mayo'), '25 de mayo');
  assert.strictEqual(normalizarCalle('Córdoba'), 'cordoba');
});

test('parseNumero', () => {
  assert.strictEqual(parseNumero('1234'), 1234);
  assert.strictEqual(parseNumero(1234), 1234);
  assert.strictEqual(parseNumero('12 bis'), 12);
  assert.strictEqual(parseNumero(''), null);
  assert.strictEqual(parseNumero('S/N'), null);
  assert.strictEqual(parseNumero('abc'), undefined);
  assert.strictEqual(parseNumero('0'), undefined);
});

test('separarDireccion toma el número del final', () => {
  assert.deepStrictEqual(separarDireccion('Mate de Luna 1234'), { calle: 'Mate de Luna', numero: '1234' });
  assert.deepStrictEqual(separarDireccion('25 de Mayo, 567'), { calle: '25 de Mayo', numero: '567' });
  assert.deepStrictEqual(separarDireccion('Mate de Luna'), { calle: 'Mate de Luna', numero: '' });
});

test('claveDireccion', () => {
  assert.strictEqual(claveDireccion('mate de luna', 12), 'mate de luna 12');
  assert.strictEqual(claveDireccion('mate de luna', null), 'mate de luna s/n');
});
