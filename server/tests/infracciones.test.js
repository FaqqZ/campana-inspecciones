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
