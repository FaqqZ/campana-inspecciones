const test = require('node:test');
const assert = require('node:assert');
const { validarDatos, validarPase, puedePasar, esEditable, esCerrada, numeroExpedienteAuto } = require('../services/infracciones');
const { tienePermiso } = require('../config/permisos');

const ok = { numeroActa: 'A-100', fechaInfraccion: '2026-10-01', inspectoresActuantes: ['i1'], motivosInfraccion: ['m1'], calle: 'Mate de Luna', numero: 10 };

test('validarDatos: alta válida y campos obligatorios', () => {
  assert.strictEqual(validarDatos(ok), null);
  assert.ok(validarDatos({ ...ok, numeroActa: 'A' }).includes('N° de acta'));
  assert.ok(validarDatos({ ...ok, fechaInfraccion: '' }).includes('fecha'));
  assert.ok(validarDatos({ ...ok, inspectoresActuantes: [] }).includes('inspector'));
  assert.ok(validarDatos({ ...ok, motivosInfraccion: [] }).includes('motivo'));
  assert.ok(validarDatos({ ...ok, calle: '' }).includes('edificio'));
  assert.strictEqual(validarDatos({ ...ok, calle: '', edificio: 'E1' }), null);
  assert.ok(validarDatos({ ...ok, observaciones: true, detalleObservaciones: ' ' }).includes('observaciones'));
});

test('validarDatos: la edición parcial no exige lo que no se envía', () => {
  assert.strictEqual(validarDatos({ infractor: 'ACME' }, { alta: false }), null);
  assert.ok(validarDatos({ inspectoresActuantes: [] }, { alta: false }).includes('inspector'));
});

test('validarPase: comentario obligatorio según el estado y cierre por expediente', () => {
  const inf = { eliminado: false, expediente: { numero: '' } };
  assert.strictEqual(validarPase(inf, { oficinaDestino: 'o2', estadoDestino: { nombre: 'Aprobado' } }), null);
  assert.ok(validarPase(inf, { oficinaDestino: 'o2', estadoDestino: { nombre: 'Observado', requiereComentario: true }, comentarios: '  ' }).includes('exige un comentario'));
  assert.strictEqual(validarPase(inf, { oficinaDestino: 'o2', estadoDestino: { nombre: 'Observado', requiereComentario: true }, comentarios: 'falta plano' }), null);
  assert.ok(validarPase(inf, {}).includes('oficina'));
  assert.ok(validarPase({ ...inf, expediente: { numero: '2026-00001' } }, { oficinaDestino: 'o2' }).includes('expediente'));
  assert.ok(validarPase({ ...inf, eliminado: true }, { oficinaDestino: 'o2' }).includes('eliminada'));
});

test('esEditable / esCerrada', () => {
  assert.strictEqual(esEditable({ eliminado: false, expediente: { numero: '' } }), true);
  assert.strictEqual(esEditable({ eliminado: false, expediente: { numero: '2026-00001' } }), false);
  assert.strictEqual(esCerrada({ expediente: { numero: 'X' } }), true);
  assert.strictEqual(esEditable({ eliminado: true, expediente: { numero: '' } }), false);
});

test('permisos por rol', () => {
  assert.strictEqual(tienePermiso('Administrador', 'usuarios'), true);
  assert.strictEqual(tienePermiso('Tecnico', 'editarInfracciones'), true);
  assert.strictEqual(tienePermiso('Consulta', 'editarInfracciones'), false);
  assert.strictEqual(tienePermiso('Consulta', 'editarEdificios'), false);
  assert.strictEqual(tienePermiso('MesaDeEntradas', 'expediente'), true);
  assert.strictEqual(tienePermiso('Tecnico', 'expediente'), false);
  assert.strictEqual(tienePermiso('Juridico', 'eliminarInfracciones'), false);
});

test('puedePasar: el Tecnico solo desde la oficina inicial', () => {
  assert.strictEqual(puedePasar('Juridico', { oficinaActual: 'o2' }, 'o1'), true);
  assert.strictEqual(puedePasar('Tecnico', { oficinaActual: 'o1' }, 'o1'), true);
  assert.strictEqual(puedePasar('Tecnico', { oficinaActual: 'o2' }, 'o1'), false);
  assert.strictEqual(puedePasar('Tecnico', { oficinaActual: { _id: 'o1' } }, 'o1'), true);
  assert.strictEqual(puedePasar('Consulta', { oficinaActual: 'o1' }, 'o1'), false);
  assert.strictEqual(puedePasar('MesaDeEntradas', { oficinaActual: 'o1' }, 'o1'), false);
});

test('numeroExpedienteAuto', () => {
  assert.strictEqual(numeroExpedienteAuto(2026, 7), '2026-00007');
});

// ---------- KPIs ----------
const { calcularKpis, lunesDe } = require('../services/kpis');

test('kpis: totales, cobertura, antigüedad y agrupaciones', () => {
  const ed = (id, calle) => ({ _id: id, direccionOriginal: `${calle} 1`, calle });
  const inf = (fecha, edificio, motivo, extra = {}) => ({
    fechaInfraccion: new Date(`${fecha}T12:00:00Z`), edificio, estado: { nombre: 'Ingresado' }, oficinaActual: { nombre: 'Oficina Técnica' },
    motivosInfraccion: [{ nombre: motivo }], expediente: { numero: '' }, asignadoA: null, ...extra,
  });
  const k = calcularKpis([
    inf('2026-09-01', ed('a', 'Mendoza'), 'Falta de extintores'),
    inf('2026-09-02', ed('a', 'Mendoza'), 'Falta de extintores', { expediente: { numero: 'E-1' } }),
    inf('2026-09-20', ed('b', 'Córdoba'), 'Faltan luces de emergencia', { asignadoA: 'u1' }),
  ], { totalEdificios: 4, hoy: new Date('2026-10-01T12:00:00Z') });
  assert.strictEqual(k.resumen.total, 3);
  assert.strictEqual(k.resumen.abiertas, 2);
  assert.strictEqual(k.resumen.pctExpediente, 33);
  assert.strictEqual(k.resumen.edificiosConActas, 2);
  assert.strictEqual(k.resumen.pctCobertura, 50);
  assert.strictEqual(k.resumen.promedioPorEdificio, 1.5);
  assert.strictEqual(k.resumen.reincidentes, 1);
  assert.strictEqual(k.resumen.sinAsignar, 1);
  assert.strictEqual(k.resumen.antiguedadMaxima, 30);
  assert.deepStrictEqual(k.porMotivo[0], { nombre: 'Falta de extintores', cantidad: 2 });
  assert.strictEqual(k.antiguedad[1].cantidad, 1);
  assert.ok(k.porSemana.length >= 3 && k.porSemana.every((s) => s.cantidad >= 0));
  assert.strictEqual(lunesDe(new Date('2026-09-02T12:00:00Z')), '2026-08-31');
  assert.deepStrictEqual(calcularKpis([]).porSemana, []);
});

test('kpis de edificios: certificado, final de obra de Catastro', () => {
  const { calcularKpisEdificios, sinFinalDeObra } = require('../services/kpis');
  const ed = (id, extra = {}) => ({ _id: id, calle: 'Mendoza', padron: 'P', estadoObra: '', conclusionCruce: '', geoEstado: 'ok', estadoInspeccion: 'pendiente', ...extra });
  const edificios = [
    ed('a', { estadoObra: 'CON PERMISO SIN FINAL A VERIFICAR CONSTRUCCION' }),
    ed('b', { conclusionCruce: 'Tiene certificado ... pero figura SIN final de obra en CATASTRO.' }),
    ed('c', { estadoObra: 'TERMINADO' }),
    ed('d', { padron: '', geoEstado: 'fallido' }),
  ];
  assert.strictEqual(sinFinalDeObra(edificios[0]), true);
  assert.strictEqual(sinFinalDeObra(edificios[2]), false);
  const k = calcularKpisEdificios(edificios, {
    conCertificado: new Set(['b']),
    semaforos: new Map([['a', 'faltante'], ['b', 'vigente'], ['c', 'faltante'], ['d', 'sin_relevar']]),
    actasAbiertas: new Map([['a', 2]]), actasTotales: new Map([['a', 2]]),
  });
  assert.strictEqual(k.resumen.total, 4);
  assert.strictEqual(k.resumen.delCruce, 3);
  assert.strictEqual(k.resumen.conCertificado, 1);
  assert.strictEqual(k.resumen.sinFinalCatastro, 2);
  assert.strictEqual(k.resumen.sinCertConActasAbiertas, 1);
  assert.strictEqual(k.resumen.sinRelevar, 1);
  assert.strictEqual(k.resumen.sinUbicar, 1);
});

test('situación según Catastro: denegada > conforme inconcluso > terminado y habitado', () => {
  const { situacionCatastro, SITUACIONES } = require('../services/kpis');
  const s = (estadoObra) => situacionCatastro({ estadoObra });
  assert.equal(s('TERMINADO HABITADO CONFORME A OBRA DENEGADO'), SITUACIONES.denegada);
  assert.equal(s('DENEGADO POR RES N° 007 DCyE DEL 12/01/2011 - TERMINADO HABITADO'), SITUACIONES.denegada);
  assert.equal(s('CONFORME A OBRA INCONCLUSO'), SITUACIONES.conformeInconclusa);
  assert.equal(s('TERMINADO HABITADO CONFORME A OBRA INCONCLUSO'), SITUACIONES.conformeInconclusa);
  assert.equal(s('TERMINADO HABITADO'), SITUACIONES.terminado);
  assert.equal(s('CON PERMISO SIN FINAL A VERIFICAR CONSTRUCCION'), SITUACIONES.otras);
  assert.equal(s(''), SITUACIONES.sinDato);
});
