const test = require('node:test');
const assert = require('node:assert');
const N = require('../services/notificaciones');

const dia = (s) => new Date(`${s}T12:00:00Z`);
const hoy = new Date(2026, 9, 9, 15); // 9/10/2026 hora local

test('vencimiento y estado de plazo, con sus bordes', () => {
  assert.strictEqual(N.vencimiento(dia('2026-09-09'), 30).toISOString().slice(0, 10), '2026-10-09');
  assert.strictEqual(N.diasRestantes(dia('2026-10-09'), hoy), 0);
  assert.strictEqual(N.estadoPlazo(dia('2026-10-09'), hoy), 'por_vencer'); // vence hoy: todavía en plazo
  assert.strictEqual(N.estadoPlazo(dia('2026-10-08'), hoy), 'vencido');
  assert.strictEqual(N.estadoPlazo(dia('2026-10-19'), hoy), 'por_vencer'); // faltan 10
  assert.strictEqual(N.estadoPlazo(dia('2026-10-20'), hoy), 'en_plazo'); // faltan 11
});

test('parsePlazo acepta números y textos con días', () => {
  assert.strictEqual(N.parsePlazo(30), 30);
  assert.strictEqual(N.parsePlazo('45 días corridos'), 45);
  assert.strictEqual(N.parsePlazo('60'), 60);
  assert.strictEqual(N.parsePlazo(0), null);
  assert.strictEqual(N.parsePlazo(-5), null);
  assert.strictEqual(N.parsePlazo('sin plazo'), null);
  assert.strictEqual(N.parsePlazo(2.5), null);
});

test('filasDeNotificados ubica el encabezado y las columnas por nombre', () => {
  const m = [
    ['Edificios notificados', '', '', ''],
    ['Domicilio', 'Fecha de notificación', 'Plazo (días)', 'Observaciones'],
    ['Salta N° 660', 46000, 30, 'Presentar planos'],
    ['', '', '', ''],
    ['Las Heras 242', '01/09/2026', '15 días', ''],
  ];
  const f = N.filasDeNotificados(m);
  assert.strictEqual(f.length, 2);
  assert.strictEqual(f[0]._fila, 3);
  assert.strictEqual(f[0].observaciones, 'Presentar planos');
  assert.strictEqual(f[1]._fila, 5);
  assert.strictEqual(N.filasDeNotificados([['a', 'b'], [1, 2]]), null);
});

test('filasDeNotificados arma el domicilio con calle y número separados', () => {
  const f = N.filasDeNotificados([['Calle', 'Número', 'Fecha', 'Plazo'], ['Salta', 660, 46000, 30]]);
  assert.strictEqual(f[0].domicilio, 'Salta 660');
});

const ctx = (extra = {}) => ({
  edificios: new Map([['salta 660', 'e1'], ['las heras 242', 'e2']]),
  calles: new Map([['salta', 5], ['las heras', 4]]),
  existentes: new Map(),
  ...extra,
});
const fila = (o) => ({ _fila: 2, domicilio: 'Salta 660', fecha: '01/09/2026', plazo: 30, observaciones: '', ...o });

test('validarNotificados: fila válida calcula el vencimiento', () => {
  const [r] = N.validarNotificados([fila()], ctx());
  assert.deepStrictEqual(r.errores, []);
  assert.strictEqual(r.data.edificio, 'e1');
  assert.strictEqual(r.data.fechaVencimiento.toISOString().slice(0, 10), '2026-10-01');
});

test('validarNotificados: errores de dirección, fecha y plazo', () => {
  const r = N.validarNotificados([
    fila({ domicilio: 'Salta 661' }),
    fila({ fecha: '' }),
    fila({ fecha: '31/02/2026' }),
    fila({ plazo: 0 }),
    fila({ plazo: 'abc' }),
    fila({ domicilio: '' }),
  ], ctx());
  assert.match(r[0].errores[0], /No existe un edificio en Salta 661/);
  assert.match(r[1].errores.join(), /Fecha de notificación es obligatoria/);
  assert.match(r[2].errores.join(), /inválida/);
  assert.match(r[3].errores.join(), /plazo/i);
  assert.match(r[4].errores.join(), /plazo/i);
  assert.ok(r[5].errores.length);
});

test('validarNotificados: duplicados en el archivo se unen y los ya cargados se rechazan', () => {
  const r = N.validarNotificados([fila({ _fila: 2 }), fila({ _fila: 3 }), fila({ _fila: 4, fecha: '02/09/2026' })], ctx());
  assert.strictEqual(r[1].unida, true);
  assert.strictEqual(r[1].data, null);
  assert.deepStrictEqual(r[2].errores, []);
  const ya = N.validarNotificados([fila()], ctx({ existentes: new Map([['e1|2026-09-01', { id: 'n1', tienePlazo: true }]]) }));
  assert.match(ya[0].errores[0], /Ya hay una notificación/);
});

test('validarNotificados: corrige errores de tipeo en la calle', () => {
  const [r] = N.validarNotificados([fila({ domicilio: 'Saltaa 660' })], ctx({ calles: new Map([['salta', 9]]) }));
  assert.ok(r.avisos.some((a) => /corregida/.test(a)));
  assert.deepStrictEqual(r.errores, []);
});

test('la notificación vigente es la más reciente y alimenta los indicadores', () => {
  const lista = [
    { edificio: { _id: 'a', calle: 'Salta' }, fechaNotificacion: dia('2026-06-01'), plazoDias: 30, fechaVencimiento: dia('2026-07-01') },
    { edificio: { _id: 'a', calle: 'Salta' }, fechaNotificacion: dia('2026-09-20'), plazoDias: 30, fechaVencimiento: dia('2026-10-20') },
    { edificio: { _id: 'b', calle: 'Salta' }, fechaNotificacion: dia('2026-09-01'), plazoDias: 30, fechaVencimiento: dia('2026-10-01') },
    { edificio: { _id: 'c', calle: 'Jujuy' }, fechaNotificacion: dia('2026-10-01'), plazoDias: 14, fechaVencimiento: dia('2026-10-15') },
  ];
  const k = N.calcularKpisNotificaciones(lista, hoy);
  assert.strictEqual(k.resumen.notificados, 3);
  assert.strictEqual(k.resumen.notificaciones, 4);
  assert.strictEqual(k.resumen.enPlazo, 1); // a (vence 20/10, faltan 11)
  assert.strictEqual(k.resumen.vencidos, 1); // b
  assert.strictEqual(k.resumen.porVencer, 1); // c (faltan 6)
  assert.strictEqual(k.resumen.vencenEn7, 1);
  assert.strictEqual(k.resumen.vencenEn30, 2);
  assert.strictEqual(k.resumen.plazoPromedio, 25);
  assert.deepStrictEqual(k.porEstado.map((x) => x.cantidad), [1, 1, 1, 0, 0, 0]);
  assert.strictEqual(k.porCalle[0].nombre, 'Salta');
});

test('plazos en horas, resultado y prórroga del listado de la campaña', () => {
  assert.strictEqual(N.parsePlazo('72 hs vence 9/10/26'), 3);
  assert.strictEqual(N.parsePlazo('48hs'), 2);
  assert.strictEqual(N.parsePlazo('48 HS vence 28/9/26'), 2);
  assert.strictEqual(N.resultadoDe('Presentó documentación'), 'presento');
  assert.strictEqual(N.resultadoDe('Plazo vencido – pasó a acta'), 'acta');
  assert.strictEqual(N.resultadoDe('Con plazo (prórroga)'), '');
  assert.strictEqual(N.estadoPlazo(dia('2020-01-01'), hoy, 'presento'), 'presento'); // el resultado manda sobre la fecha
});

test('validarNotificados usa el vencimiento vigente y detecta la prórroga', () => {
  const [r] = N.validarNotificados([{
    _fila: 5, domicilio: 'Salta 660', fecha: 46260, plazo: '48 hs vence 28/8/26', original: 46262, vigente: 46313,
    estado: 'Con plazo (prórroga)', boleta: 69665, razon: 'EDIFICIO EN ALTURA', inspector: 'MEDINA', observaciones: 'Se otorgo prorroga',
  }], ctx());
  assert.deepStrictEqual(r.errores, []);
  assert.strictEqual(r.data.plazoDias, 2); // el plazo original
  assert.strictEqual(r.data.fechaVencimiento.toISOString().slice(0, 10), new Date(Date.UTC(1899, 11, 30) + 46313 * 86400000).toISOString().slice(0, 10));
  assert.strictEqual(r.data.prorroga, true);
  assert.strictEqual(r.data.boleta, '69665');
  assert.strictEqual(r.data.plazoOriginal, '48 hs vence 28/8/26');
  const [v] = N.validarNotificados([{ _fila: 6, domicilio: 'Salta 660', fecha: 46260, plazo: '48 hs', original: 46262, vigente: 46262, estado: 'Presentó documentación', observaciones: '—' }], ctx());
  assert.strictEqual(v.data.resultado, 'presento');
  assert.strictEqual(v.data.prorroga, false);
  assert.strictEqual(v.data.observaciones, '');
});

test('filasDeNotificados lee las columnas del listado de la campaña', () => {
  const m = [
    ['Notificaciones 2026'], [''],
    ['Domicilio', 'Razón social', 'N° boleta', 'Inspector', 'Fecha notif.', 'Fila planilla', 'Plazo original (planilla)', 'Venc. original', 'Última novedad (planilla)', 'Venc. vigente', 'Estado al 09/10/2026', 'Días restantes'],
    ['SANTIAGO 716', 'BLANCA', 69783, 'CAMILETTI', 46301, 875, '72 hs vence 9/10/26', 46304, '—', 46304, 'Con plazo', 0],
  ];
  const [f] = N.filasDeNotificados(m);
  assert.strictEqual(f.domicilio, 'SANTIAGO 716');
  assert.strictEqual(f.fecha, 46301);
  assert.strictEqual(f.original, 46304);
  assert.strictEqual(f.vigente, 46304);
  assert.strictEqual(f.boleta, 69783);
  assert.strictEqual(f.razon, 'BLANCA');
  assert.strictEqual(f.inspector, 'CAMILETTI');
  assert.strictEqual(f.estado, 'Con plazo');
});

test('notificado sin plazo (BD de la campaña): se carga sin vencimiento y su estado es sin_plazo', () => {
  const m = [['DOMICILIO', 'RAZON SOCIAL', 'NRO DE BOLETA', 'INSPECTOR', 'FECHA DE NOTIFICACIÓN', 'ESTADO DE NOTIFICACIÓN', 'OBSERVACIONES DE SEGUIMIENTO DE NOTIFICACIÓN'], ['SALTA 660', 'CONSORCIO', 69729, 'CORREA', 46260, '', '']];
  const [f] = N.filasDeNotificados(m);
  assert.strictEqual(f.domicilio, 'SALTA 660');
  assert.strictEqual(f.boleta, 69729);
  const [r] = N.validarNotificados([f], ctx());
  assert.deepStrictEqual(r.errores, []);
  assert.strictEqual(r.data.plazoDias, null);
  assert.strictEqual(r.data.fechaVencimiento, null);
  assert.strictEqual(N.estadoPlazo(null, hoy), 'sin_plazo');
  assert.strictEqual(N.diasRestantes(null, hoy), null);
});

test('edificios que no existen: con crearEdificios se crean una sola vez y las filas repetidas se unen', () => {
  const rs = N.validarNotificados([fila({ domicilio: 'Mendoza 14', _fila: 2 }), fila({ domicilio: 'Mendoza 14', _fila: 3 })], ctx({ crearEdificios: true, calles: new Map([['mendoza', 8]]) }));
  assert.strictEqual(rs[0].data.crearEdificio, true);
  assert.strictEqual(rs[0].data.edificio, null);
  assert.strictEqual(rs[1].unida, true);
});

test('una notificación cargada sin plazo se completa con el listado de plazos', () => {
  const ex = new Map([['e1|2026-09-01', { id: 'n9', tienePlazo: false }]]);
  const [r] = N.validarNotificados([fila()], ctx({ existentes: ex }));
  assert.deepStrictEqual(r.errores, []);
  assert.strictEqual(r.data.actualiza, 'n9');
  const [s] = N.validarNotificados([fila({ plazo: '', fecha: '01/09/2026' })], ctx({ existentes: ex }));
  assert.match(s.errores.join(), /Ya hay una notificación/);
});
