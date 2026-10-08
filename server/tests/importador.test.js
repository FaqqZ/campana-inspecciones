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

const ctxI = (extra = {}) => ({
  edificios: new Map([['mate de luna 10', 'E1']]),
  motivos: new Map([['falta de habilitacion', 'M1']]),
  inspectores: new Map([['perez juan', 'I1']]),
  estados: new Map([['observado', 'S2']]),
  oficinas: new Map([['juridico', 'O2']]),
  existentes: new Set(['A-9']),
  crearEdificios: false,
  permitirNuevos: false,
  ...extra,
});
const filaI = (extra = {}) => ({ 'N° Acta': 'A-100', 'Fecha infracción': '01/10/2026', Calle: 'Mate de Luna', 'Número': 10, Inspectores: 'Pérez Juan', Motivos: 'Falta de habilitación', ...extra });

test('infracciones: fila válida se vincula al edificio por dirección normalizada', () => {
  const [r] = validarFilas('infracciones', [filaI()], ctxI());
  assert.deepStrictEqual(r.errores, []);
  assert.strictEqual(r.data.edificio, 'E1');
  assert.deepStrictEqual(r.data.inspectores, ['I1']);
  assert.deepStrictEqual(r.data.motivos, ['M1']);
  assert.strictEqual(r.data.estado, null); // vacío = estado inicial
});

test('infracciones: errores de edificio, inspector, motivo, estado y acta repetida', () => {
  const filas = [
    filaI({ 'N° Acta': 'A-101', Calle: 'Otra', 'Número': 1, Inspectores: 'Nadie', Motivos: 'Inventado', Estado: 'Raro' }),
    filaI({ 'N° Acta': 'A-9' }),
    filaI({ 'N° Acta': 'A-102' }),
    filaI({ 'N° Acta': 'A-102' }),
    filaI({ 'N° Acta': 'AB', 'Fecha infracción': '' }),
  ];
  const r = validarFilas('infracciones', filas, ctxI());
  const t = r[0].errores.join('|');
  assert.ok(t.includes('No existe un edificio') && t.includes('Inspector inexistente') && t.includes('Motivo inexistente') && t.includes('Estado inexistente'));
  assert.ok(r[1].errores[0].includes('ya existe'));
  assert.deepStrictEqual(r[2].errores, []);
  assert.ok(r[3].errores[0].includes('repetida'));
  assert.ok(r[4].errores.some((e) => e.includes('N° Acta')) && r[4].errores.some((e) => e.includes('Fecha')));
});

test('infracciones: puede crear edificios y catálogos faltantes si se habilita', () => {
  const ctx = ctxI({ crearEdificios: true, permitirNuevos: true });
  const [r] = validarFilas('infracciones', [filaI({ Calle: 'Nueva', 'Número': 5, Inspectores: 'Gómez Ana', Motivos: 'Otro motivo' })], ctx);
  assert.deepStrictEqual(r.errores, []);
  assert.strictEqual(r.data.crearEdificio, true);
  assert.deepStrictEqual(r.nuevos.inspectores, ['Gómez Ana']);
  assert.deepStrictEqual(r.nuevos.motivos, ['Otro motivo']);
  assert.ok(r.avisos[0].includes('Se creará el edificio'));
});
