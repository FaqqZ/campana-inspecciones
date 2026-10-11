const test = require('node:test');
const assert = require('node:assert');
const { calleComun, primeraAltura, filasDelCruce } = require('../services/catastro');
const { validarFilas } = require('../services/importador');

test('calleComun traduce los nombres de Catastro', () => {
  assert.strictEqual(calleComun('SAN JUAN PROVINCIA DE').calle, 'San Juan');
  assert.strictEqual(calleComun('AV. MATE DE LUNA, FERNANDO DE MENDOZA').calle, 'Avenida Mate de Luna');
  assert.strictEqual(calleComun('PAZ GENERAL JOSE MARIA').calle, 'General Paz');
  assert.strictEqual(calleComun('9 DE JULIO DE 1816 ').calle, '9 de Julio');
  assert.strictEqual(calleComun('IRIGOYEN BERNARDO DE PASAJE').calle, 'Pasaje Bernardo de Irigoyen');
  assert.strictEqual(calleComun('AV.EJERCITO DEL NORTE').calle, 'Avenida Ejército del Norte');
});

test('calleComun separa la esquina y avisa si no hay alias', () => {
  const g = calleComun('GROUSSAC PAUL ESQ MATE DE LUNA 1752/56 ');
  assert.strictEqual(g.calle, 'Paul Groussac');
  assert.strictEqual(g.esquina, 'Mate de Luna 1752/56');
  assert.strictEqual(calleComun('AV SARMIENTO DOMINGO FAUSTINO ESQ MUÑECAS ANG NE').esquina, 'Muñecas');
  const rara = calleComun('CALLE RARA ZZZ');
  assert.strictEqual(rara.conAlias, false);
  assert.strictEqual(rara.calle, 'Rara Zzz');
});

test('primeraAltura toma el primer número', () => {
  assert.deepStrictEqual(primeraAltura('730 //730/36'), { numero: 730, texto: '730 //730/36' });
  assert.strictEqual(primeraAltura('153/59').numero, 153);
  assert.strictEqual(primeraAltura(1729).numero, 1729);
  assert.strictEqual(primeraAltura('s/n').numero, null);
});

const ENC = ['N°', 'PADRÓN', 'CALLE (origen)', 'ALTURA', 'PROPIETARIO', 'ESTADO DE OBRA (catastro, col. G)', 'DIRECCIÓN NORMALIZADA (calle @ altura)', '¿TIENE CERT. FINAL DEFENSA CIVIL?', 'DIRECCIÓN EN FINALES D.C.', 'N° CERT. FINAL D.C.', 'EXPEDIENTE D.C.', 'AÑO CERT. D.C.', '¿EN LISTADO SIN CERT. D.C.?', 'DIRECCIÓN (listado s/cert. D.C.)', 'ANTECEDENTE D.C. (N° DC)', '¿MISMA CALLE C/CERT. D.C. (otra altura)?', 'CONCLUSIÓN'];
const fila = (n, padron, calle, altura, prop, cert = ['NO', '', '', '', 'NO']) =>
  [n, padron, calle, altura, prop, 'TERMINADO', 'x', cert[0], '', cert[1], cert[2], cert[3], cert[4], '', '', 'NO', 'conclusión'];

test('filasDelCruce ubica los encabezados y descarta resumen y notas', () => {
  const m = [
    ['CRUCE — título'], [''], ['RESUMEN'], ['Total', '', '', '', '', '', 237], [],
    ENC,
    fila(1, '100', 'SAN JUAN PROVINCIA DE', '153/59', 'ACME SRL'),
    ['Cruce por dirección normalizada...'],
  ];
  const f = filasDelCruce(m);
  assert.strictEqual(f.length, 1);
  assert.strictEqual(f[0]._fila, 7);
  assert.strictEqual(f[0].padron, '100');
  assert.strictEqual(f[0].calleOrigen, 'SAN JUAN PROVINCIA DE');
  assert.strictEqual(filasDelCruce([['nada']]), null);
});

test('cruce: edificio, certificado, repetidas unidas y existentes se actualizan', () => {
  const m = [ENC,
    fila(1, '100', 'BOLIVAR SIMON', 958, 'A', ['SÍ', '225/23', '100797/23', '2023', 'NO']),
    fila(2, '200', 'BOLIVAR, SIMON', '958', 'B'),
    fila(3, '300', 'SAN JUAN PROVINCIA DE', 'sin numero', 'C'),
    fila(4, '400', 'SALTA PROVINCIA DE', 10, 'D'),
  ];
  const r = validarFilas('cruce', filasDelCruce(m), { existentes: new Set(['salta 10']) });
  assert.strictEqual(r[0].data.direccionNorm, 'bolivar 958');
  assert.strictEqual(r[0].data.cert.tiene, true);
  assert.strictEqual(r[0].data.cert.numero, '225/23');
  assert.strictEqual(r[0].data.padron, '100 / 200');
  assert.strictEqual(r[0].data.titular, 'A // B');
  assert.strictEqual(r[1].unida, true);
  assert.ok(r[2].errores[0].includes('Altura sin número'));
  assert.deepStrictEqual(r[3].errores, []);
  assert.strictEqual(r[3].data.actualiza, true);
});

const existente = (extra = {}) => ({ _id: 'e1', padron: '400', estadoObra: 'TERMINADO', titular: 'D', calleOrigen: 'SALTA PROVINCIA DE', alturaOriginal: '10', esquina: '', conclusionCruce: 'conclusión', mismaCalleOtraAltura: false, enListadoSinCert: false, certificado: null, ...extra });
const cruceExistente = (filas, actual) => validarFilas('cruce', filasDelCruce([ENC, ...filas]), { existentes: new Map([['salta 10', actual]]) });

test('cruce: un edificio existente se actualiza y detecta qué cambia', () => {
  const [r] = cruceExistente([fila(1, '999', 'SALTA PROVINCIA DE', 10, 'D', ['SÍ', '5/24', '1', '2024', 'NO'])], existente());
  assert.strictEqual(r.data.actualiza, 'e1');
  assert.deepStrictEqual(r.errores, []);
  assert.ok(r.cambios.includes('Padrón'));
  assert.ok(r.cambios.includes('Certificado final'));
  assert.ok(!r.cambios.includes('Titular'));
});

test('cruce: un edificio existente con los mismos datos queda sin cambios', () => {
  const [r] = cruceExistente([fila(1, '400', 'SALTA PROVINCIA DE', 10, 'D')], existente({ certificado: { presente: false, nroReferencia: '' } }));
  assert.deepStrictEqual(r.cambios, []);
});

test('cruce: lo vacío del archivo no pisa lo ya cargado', () => {
  const [r] = cruceExistente([fila(1, '', 'SALTA PROVINCIA DE', 10, '')], existente());
  assert.ok(!r.cambios.includes('Padrón'));
  assert.ok(!r.cambios.includes('Titular'));
});

test('cruce: la misma dirección repetida en el archivo se une también si el edificio ya existe', () => {
  const r = cruceExistente([fila(1, '1', 'SALTA PROVINCIA DE', 10, 'D'), fila(2, '2', 'SALTA PROVINCIA DE', 10, 'E')], existente());
  assert.strictEqual(r[1].unida, true);
  assert.strictEqual(r[0].data.padron, '1 / 2');
});

