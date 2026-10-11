const test = require('node:test');
const assert = require('node:assert');
const JSZip = require('jszip');
const { extraerGrupos, resolverGrupos } = require('../services/fotosWord');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const parrafo = (t) => `<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`;
const imagen = (rid) => `<w:p><w:r><w:drawing><a:blip r:embed="${rid}"/></w:drawing></w:r></w:p>`;

async function docx(cuerpo, imagenes) {
  const z = new JSZip();
  z.file('word/document.xml', `<w:document><w:body>${cuerpo}</w:body></w:document>`);
  z.file('word/_rels/document.xml.rels', `<Relationships>${Object.keys(imagenes).map((id) => `<Relationship Id="${id}" Type="image" Target="media/${imagenes[id]}"/>`).join('')}</Relationships>`);
  Object.values(imagenes).forEach((n) => z.file(`word/media/${n}`, PNG));
  return z.generateAsync({ type: 'nodebuffer' });
}

const CALLES = new Set(['mendoza', 'san martin', 'cordoba']);

test('fotosWord: las imágenes se asignan a la dirección que las precede', async () => {
  const buf = await docx(
    parrafo('Mendoza N°490') + imagen('rId1') + imagen('rId2') + parrafo('Foto de la fachada') + parrafo('Dirección: San Martin N° 573/75') + imagen('rId3'),
    { rId1: 'a.png', rId2: 'b.jpg', rId3: 'c.png' }
  );
  const { grupos, sinDireccion } = await extraerGrupos(buf, { callesConocidas: CALLES });
  assert.strictEqual(grupos.length, 2);
  assert.strictEqual(grupos[0].dom.numero, 490);
  assert.strictEqual(grupos[0].fotos.length, 2);
  assert.strictEqual(grupos[1].dom.numero, 573);
  assert.strictEqual(grupos[1].fotos.length, 1);
  assert.strictEqual(sinDireccion, 0);
});

test('fotosWord: textos que no son direcciones conocidas y formatos no soportados se ignoran', async () => {
  const buf = await docx(
    imagen('rId9') + parrafo('Foto 2') + parrafo('Mendoza 100') + imagen('rId1') + imagen('rId2'),
    { rId9: 'suelta.png', rId1: 'a.png', rId2: 'b.emf' }
  );
  const { grupos, sinDireccion, ignoradas } = await extraerGrupos(buf, { callesConocidas: CALLES });
  assert.strictEqual(grupos.length, 1);
  assert.strictEqual(sinDireccion, 1); // imagen antes de la primera dirección
  assert.strictEqual(ignoradas, 1); // .emf
  assert.strictEqual(grupos[0].fotos.length, 1);
});

test('fotosWord: un archivo que no es Word da error claro', async () => {
  await assert.rejects(() => extraerGrupos(Buffer.from('no es un zip')), /Word/);
});

test('fotosWord: cruza con los edificios, corrige tipeos y junta direcciones repetidas', async () => {
  const buf = await docx(
    parrafo('Mendoza N°490') + imagen('rId1') + parrafo('Cordoba N°10') + imagen('rId2') + parrafo('Mendoza N°490') + imagen('rId3') + parrafo('San Matin N°5') + imagen('rId1'),
    { rId1: 'a.png', rId2: 'b.png', rId3: 'c.png' }
  );
  const { grupos } = await extraerGrupos(buf, { callesConocidas: CALLES });
  const r = resolverGrupos(grupos, { edificios: new Map([['mendoza 490', 'E1'], ['san martin 5', 'E2']]), calles: new Map([['mendoza', 3], ['san martin', 4], ['cordoba', 2]]), crearEdificios: false });
  assert.strictEqual(r.length, 3);
  assert.strictEqual(r[0].edificio, 'E1');
  assert.strictEqual(r[0].fotos.length, 2); // las dos apariciones de Mendoza 490
  assert.ok(r[1].errores[0].includes('No existe un edificio')); // Córdoba 10
  assert.strictEqual(r[2].edificio, 'E2');
  assert.ok(r[2].avisos.some((a) => a.includes('corregida')));
  const c = resolverGrupos(grupos, { edificios: new Map(), calles: new Map(), crearEdificios: true });
  assert.ok(c.every((x) => x.crearEdificio && !x.errores.length));
});

test('fotosWord: con permitirNuevas acepta calles desconocidas pero no rótulos como "Foto 2"', async () => {
  const buf = await docx(parrafo('Calle Nueva N°12') + imagen('rId1') + parrafo('Foto 2') + imagen('rId2'), { rId1: 'a.png', rId2: 'b.png' });
  const sin = await extraerGrupos(buf, { callesConocidas: CALLES });
  assert.strictEqual(sin.grupos.length, 0);
  const con = await extraerGrupos(buf, { callesConocidas: CALLES, permitirNuevas: true });
  assert.strictEqual(con.grupos.length, 1);
  assert.strictEqual(con.grupos[0].fotos.length, 2); // "Foto 2" es un rótulo, no abre otra dirección
});

test('fotosWord: el texto que sigue a la dirección queda como informe del edificio', async () => {
  const buf = await docx(parrafo('Mendoza N°490') + parrafo('“Inmueble con medidor de obra.”') + parrafo('Sin gas natural.') + imagen('rId1') + parrafo('Foto 3'), { rId1: 'a.png' });
  const { grupos } = await extraerGrupos(buf, { callesConocidas: CALLES });
  assert.deepStrictEqual(grupos[0].informe, ['Inmueble con medidor de obra.', 'Sin gas natural.']);
  const r = resolverGrupos(grupos, { edificios: new Map([['mendoza 490', 'E1']]), calles: new Map([['mendoza', 2]]), crearEdificios: false });
  assert.strictEqual(r[0].informe, 'Inmueble con medidor de obra.\n\nSin gas natural.');
});
