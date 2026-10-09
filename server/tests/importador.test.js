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

// ---------- actas de Defensa Civil ----------
const { filasDeActas, parseDomicilio, clasificarMotivos, fechaDeActa } = require('../services/actas');

test('actas: domicilios con N:, N°, rangos, esquinas y calles con números', () => {
  assert.deepStrictEqual(parseDomicilio('Av. Mate de Luna N:2098').numero, 2098);
  assert.strictEqual(parseDomicilio('Av.Mate de Luna N°2158').calle, 'Av. Mate de Luna');
  assert.strictEqual(parseDomicilio('San Martin N° 573/75').numero, 573);
  assert.strictEqual(parseDomicilio('24 de Septiembre N°1021').calle, '24 de Septiembre');
  const esq = parseDomicilio('24 de SeptiembreEsq Aya');
  assert.deepStrictEqual([esq.calle, esq.numero, esq.esquina], ['24 de Septiembre', null, 'Aya']);
  assert.ok(parseDomicilio('').error);
});

test('actas: clasificación de motivos', () => {
  assert.deepStrictEqual(clasificarMotivos('No permite la inspección.'), ['No permite la inspección']);
  assert.deepStrictEqual(clasificarMotivos('Por no dar cumplimiento Boleta N°69736'), ['Incumplimiento de boleta de notificación']);
  assert.deepStrictEqual(clasificarMotivos('Faltante de 3 Extintores y picos').length, 2);
  assert.deepStrictEqual(clasificarMotivos('Posee 14 (catorce) extintores vencidos.'), ['Extintor vencido']);
  assert.deepStrictEqual(clasificarMotivos('Sin planos', 'Ord. 251/74 - Art. 3'), ['No presentar documentación técnica']);
  assert.deepStrictEqual(clasificarMotivos('Faltan 2 extintores', 'Ord.251/74- Art 6.'), ['Falta de extintores']);
  // la normativa clasifica aunque el texto sea pobre
  assert.deepStrictEqual(clasificarMotivos('Por no dar cumplimiento boletaN°69641', 'Ord.250/74 - Art 2.'), ['Incumplimiento de boleta de notificación']);
  assert.deepStrictEqual(clasificarMotivos('Faltante', 'Ord.2119/93 - Art 3.'), ['Faltan luces de emergencia']);
  assert.deepStrictEqual(clasificarMotivos('x', 'Ord. 229/77'), ['No permite la inspección']);
  // normativa ambigua mal tipeada: manda el texto
  assert.deepStrictEqual(clasificarMotivos('Por poseer 8 nichos incompletos', 'Ord.756/97- Art N° 3'), ['Red de incendio incompleta (mangueras, lanzas, picos, nichos, bocas)']);
  assert.deepStrictEqual(clasificarMotivos('Algo sin clasificar', 'Dto. 756/97 - Art. 3'), ['Extintor vencido']);
  assert.deepStrictEqual(clasificarMotivos('algo raro'), ['Otros motivos']);
});

test('actas: fecha desde serial de Excel y ubicación de la tabla', () => {
  assert.strictEqual(fechaDeActa(46253).toISOString().slice(0, 10), '2026-08-19');
  const filas = filasDeActas([['Título'], [], ['Fecha', 'Domicilio', 'Razón Social', 'N° de Acta de Infracción', 'Motivo', 'Normativa Infringida'], [46253, 'Mendoza N°490', 'X', 1234, 'm', 'n'], ['', '', '', '', '', '']]);
  assert.strictEqual(filas.length, 1);
  assert.strictEqual(filas[0]._fila, 4);
  assert.strictEqual(filasDeActas([['nada']]), null);
});

const ctxA = (extra = {}) => ({ edificios: new Map([['mendoza 490', 'E1']]), motivos: new Map(), calles: new Map(), existentes: new Set(['999']), crearEdificios: false, ...extra });
const filaA = (extra = {}) => ({ _fila: 10, fecha: 46253, domicilio: 'Mendoza N°490', razon: 'Consorcio', acta: '763370', motivo: 'Faltante de 17 Luces de Emergencias', normativa: 'Ord.2119/93', ...extra });

test('actas: se vincula al edificio y propone el motivo del catálogo', () => {
  const [r] = validarFilas('actas', [filaA()], ctxA());
  assert.deepStrictEqual(r.errores, []);
  assert.strictEqual(r.data.edificio, 'E1');
  assert.deepStrictEqual(r.data.motivosNombres, ['Faltan luces de emergencia']);
  assert.deepStrictEqual(r.nuevos.motivos, ['Faltan luces de emergencia']);
});

test('actas: edificio inexistente, acta existente y creación de edificios', () => {
  const r = validarFilas('actas', [filaA({ domicilio: 'Salta N°10' }), filaA({ acta: '999' })], ctxA());
  assert.ok(r[0].errores[0].includes('No existe un edificio'));
  assert.ok(r[1].errores[0].includes('ya existe'));
  const [c] = validarFilas('actas', [filaA({ domicilio: 'Salta N°10' })], ctxA({ crearEdificios: true }));
  assert.strictEqual(c.data.crearEdificio, true);
  assert.strictEqual(c.data.dir.titular, 'Consorcio');
});

test('actas: la misma acta repetida en el mismo edificio se une; en otro domicilio es error', () => {
  const r = validarFilas('actas', [
    filaA(),
    filaA({ _fila: 11, motivo: 'Falta 1 extintor' }),
    filaA({ _fila: 12, domicilio: 'Salta N°10' }),
  ], ctxA({ crearEdificios: true }));
  assert.strictEqual(r[1].unida, true);
  assert.deepStrictEqual(r[0].data.motivosNombres.length, 2);
  assert.ok(r[0].avisos.some((a) => a.includes('se repite')));
  assert.ok(r[2].errores[0].includes('otro domicilio'));
});

test('actas: corrige un error de tipeo en la calle y avisa de actas con distinta cantidad de dígitos', () => {
  const filas = [
    filaA({ domicilio: 'San Martin N°1', acta: '111111' }), filaA({ domicilio: 'San Martin N°2', acta: '222222' }),
    filaA({ domicilio: 'San Matin N°3', acta: '33333' }),
  ];
  const r = validarFilas('actas', filas, ctxA({ crearEdificios: true }));
  assert.strictEqual(r[2].data.dir.direccionNorm, 'san martin 3');
  assert.ok(r[2].avisos.some((a) => a.includes('corregida')));
  assert.ok(r[2].avisos.some((a) => a.includes('5 dígitos')));
});
