import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

let server, optimizeProductImage, photoFileSize;
before(async () => {
  server = await createServer({ server: { middlewareMode: true }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] }, logLevel: 'silent' });
  ({ optimizeProductImage, photoFileSize } = await server.ssrLoadModule('/src/lib/optimizeProductImage.ts'));
});
after(async () => await server.close());
const large = (type = 'image/jpeg', name = 'original.jpg', head = []) => new File([new Uint8Array(head), new Uint8Array(140 * 1024)], name, { type, lastModified: 1234 });
const output = (size = 20000, type = 'image/webp') => new File([new Uint8Array(size)], 'encoded', { type });
const png = (type) => {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  const chunk = [0, 0, 0, 0, ...Array.from(type, ch => ch.charCodeAt(0)), 0, 0, 0, 0];
  return large('image/png', 'animated.png', [...signature, ...chunk]);
};

test('optimisation locale : WebP plus léger, orientation, qualité et limites sans CDN', async () => {
  const original = large(); let options;
  const result = await optimizeProductImage(original, undefined, async (file, opts) => { assert.equal(file, original); options = opts; return output(); });
  assert.equal(result.status, 'optimized'); assert.equal(result.file.type, 'image/webp'); assert.equal(result.file.name, 'original.webp');
  assert.equal(result.file.size, 20000); assert.equal(result.file.lastModified, 1234); assert.equal(original.name, 'original.jpg');
  assert.equal(options.maxWidthOrHeight, 2048); assert.equal(options.initialQuality, 0.88);
  assert.equal(options.fileType, 'image/webp'); assert.equal(options.useWebWorker, false); assert.equal(options.preserveExif, false);
  assert.match(photoFileSize(original.size), /Ko/); assert.equal(photoFileSize(5 * 1024 * 1024), '5,00 Mo');
});

test('conserve le fichier si déjà léger, plus volumineux, non supporté ou en erreur', async () => {
  const small = new File(['abc'], 'petit.png', { type: 'image/png' });
  let called = false; const never = async () => { called = true; return output(); };
  assert.deepEqual(await optimizeProductImage(small, undefined, never), { file: small, status: 'unchanged' }); assert.equal(called, false);
  const original = large();
  assert.deepEqual(await optimizeProductImage(original, undefined, async () => output(original.size + 1)), { file: original, status: 'unchanged' });
  assert.deepEqual(await optimizeProductImage(original, undefined, async () => output(100, 'image/png')), { file: original, status: 'failed' });
  assert.deepEqual(await optimizeProductImage(original, undefined, async () => { throw new Error('canvas non disponible'); }), { file: original, status: 'failed' });
  const bad = large('image/png', 'invalid.png'); assert.deepEqual(await optimizeProductImage(bad, undefined, never), { file: bad, status: 'failed' }); assert.equal(called, false);
  const controller = new AbortController(); controller.abort(); await assert.rejects(optimizeProductImage(original, controller.signal, never), /annulée/);
});

test('images animées PNG et WebP conservées intégralement ; image fixe inspectée', async () => {
  const animatedPng = png('acTL');
  const animatedWebp = large('image/webp', 'animated.webp', [...Buffer.from('RIFF'), 0,0,0,0, ...Buffer.from('WEBPVP8X'), 10,0,0,0, 2]);
  const fixedPng = png('IDAT');
  let calls = 0; const encode = async () => { calls++; return output(); };
  assert.deepEqual(await optimizeProductImage(animatedPng, undefined, encode), { file: animatedPng, status: 'animated' });
  assert.deepEqual(await optimizeProductImage(animatedWebp, undefined, encode), { file: animatedWebp, status: 'animated' });
  assert.equal(calls, 0);
  assert.equal((await optimizeProductImage(fixedPng, undefined, encode)).status, 'optimized'); assert.equal(calls, 1);
});

test('annulation pendant l’encodage : aucun résultat tardif utilisé', async () => {
  const original = large(); const controller = new AbortController(); let finish;
  const pending = optimizeProductImage(original, controller.signal, () => new Promise(resolve => { finish = resolve; }));
  await new Promise(resolve => setTimeout(resolve, 0));
  controller.abort(); finish(output());
  await assert.rejects(pending, /annulée/);
});
