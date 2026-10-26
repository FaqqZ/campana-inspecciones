const test = require('node:test');
const assert = require('node:assert');
const { categoriasPedidas } = require('../services/edificios');

test('categoriasPedidas: sin parámetro devuelve todas', () => {
  assert.deepStrictEqual(categoriasPedidas({}), ['EDIFICIOS', 'COLEGIOS', 'BOLICHES']);
});

test('categoriasPedidas: ignora inválidas y repetidas, y acepta minúsculas', () => {
  assert.deepStrictEqual(categoriasPedidas({ categorias: 'colegios, COLEGIOS ,x' }), ['COLEGIOS']);
});

test('categoriasPedidas: si ninguna es válida vuelve a todas', () => {
  assert.strictEqual(categoriasPedidas({ categorias: 'nada' }).length, 3);
});
