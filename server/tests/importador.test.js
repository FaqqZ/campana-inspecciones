const test = require('node:test');
const assert = require('node:assert');
const { parseFecha, validarFilas } = require('../services/importador');

test('parseFecha', () => {
  assert.ok(parseFecha('15/09/2026') instanceof Date);
  assert.strictEqual(parseFecha('31/02/2026'), undefined);
  assert.strictEqual(parseFecha(''), null);
});

const ctxE = (extra = {}) => ({ existentes: new Set(), ...extra });

test('edificios: fila válida con columnas separadas y alias', () => {
  const [r] = validarFilas('edificios', [{ calle: 'Av. Mate de Luna', Número: 1234 }], ctxE());
  assert.deepStrictEqual(r.errores, []);
  assert.strictEqual(r.data.direccionNorm, 'avenida mate de luna 1234');
  assert.strictEqual(r.data.calle, 'Av. Mate de Luna');
});

test('edificios: dirección completa en una sola columna', () => {
  const [r] = validarFilas('edificios', [{ 'Dirección': 'Mate de Luna 567' }], ctxE());
  assert.deepStrictEqual(r.errores, []);
  assert.strictEqual(r.data.numero, 567);
});

test('edificios: errores de calle, número, existente y repetida', () => {
  const filas = [
    { Calle: '', 'Número': 1 },
    { Calle: 'Mate de Luna', 'Número': 'xx' },
    { Calle: 'Mate de Luna', 'Número': 10 },
    { Calle: 'mate de luna', 'Número': 10 },
    { Calle: 'Córdoba', 'Número': 5 },
  ];
  const r = validarFilas('edificios', filas, ctxE({ existentes: new Set(['cordoba 5']) }));
  assert.ok(r[0].errores[0].includes('Calle'));
  assert.ok(r[1].errores[0].includes('Número inválido'));
  assert.deepStrictEqual(r[2].errores, []);
  assert.ok(r[3].errores[0].includes('repetida'));
  assert.ok(r[4].errores[0].includes('ya existe'));
  assert.strictEqual(r[0].fila, 2);
});

test('actas: se vincula por dirección normalizada y valida motivos', () => {
  const ctx = {
    edificios: new Map([['mate de luna 10', 'E1']]),
    motivos: new Map([['falta de habilitacion', 'M1']]),
    existentes: new Set(),
    permitirNuevos: false,
  };
  const ok = validarFilas('actas', [{ 'N° Acta': 'A-1', Calle: 'Mate de Luna', 'Número': 10, Motivos: 'Falta de habilitación', Fecha: '01/10/2026' }], ctx);
  assert.deepStrictEqual(ok[0].errores, []);
  assert.strictEqual(ok[0].data.edificio, 'E1');
  const mal = validarFilas('actas', [{ 'N° Acta': 'A-2', Calle: 'Otra', 'Número': 1, Motivos: 'Inventado' }], ctx);
  assert.ok(mal[0].errores.some((e) => e.includes('No existe un edificio')));
  assert.ok(mal[0].errores.some((e) => e.includes('Motivo inexistente')));
});
