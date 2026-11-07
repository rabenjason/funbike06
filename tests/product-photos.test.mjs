import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
let server, prepareProductPhotos, SmartImage;
before(async () => {
  server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  ({ prepareProductPhotos } = await server.ssrLoadModule('/src/lib/productPhotos.ts'));
  SmartImage = (await server.ssrLoadModule('/src/components/SmartImage.tsx')).default;
});
after(async () => { await server?.close(); });
const saved = (key, url, isMain, position) => ({ key, preview: url, image: { id: key, url, isMain, position, altText: key } });
const fresh = (key) => ({ key, preview: 'blob:' + key, file: { name: key + '.png' } });

test('une ancienne image de galerie peut devenir principale sans supprimer les autres', () => {
  const photos = [saved('a', '/a.jpg', true, 0), saved('b', '/b.jpg', false, 1), fresh('c')];
  const value = prepareProductPhotos(photos, 'b');
  assert.deepEqual(value.images.map((p) => [p.url, p.isMain, p.position]), [['/b.jpg', true, 0], ['/a.jpg', false, 1]]);
  assert.equal(value.mainImage, undefined); assert.deepEqual(value.gallery, [photos[2].file]);
});

test('une nouvelle image peut devenir principale et conserver l’ancienne dans la galerie', () => {
  const photos = [saved('a', '/a.jpg', true, 0), fresh('b'), fresh('c')];
  const value = prepareProductPhotos(photos, 'c');
  assert.deepEqual(value.images.map((p) => [p.url, p.isMain, p.position]), [['/a.jpg', false, 1]]);
  assert.equal(value.mainImage, photos[2].file); assert.deepEqual(value.gallery, [photos[1].file]);
});

test('choix obligatoire après retrait de la principale sauf si aucune photo ne reste', () => {
  assert.throws(() => prepareProductPhotos([fresh('a')], null), /photo principale/);
  assert.deepEqual(prepareProductPhotos([], null), { images: [], mainImage: undefined, gallery: [] });
  const photos = [fresh('a'), fresh('b')];
  const value = prepareProductPhotos(photos, 'b');
  assert.equal(value.mainImage, photos[1].file); assert.deepEqual(value.gallery, [photos[0].file]);
});

test('un conteneur image absolu reste absolu et conserve la photo entière', () => {
  const html = renderToStaticMarkup(React.createElement(SmartImage, { src: '/photo.png', alt: 'Moto', className: 'absolute inset-0', imgClassName: 'object-contain p-3' }));
  assert.match(html, /class="overflow-hidden absolute inset-0"/);
  assert.match(html, /object-contain p-3/);
  assert.doesNotMatch(html, /relative overflow-hidden absolute/);
});
