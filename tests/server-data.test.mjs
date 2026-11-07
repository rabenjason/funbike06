import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
let server, data, loadServerData, originalFetch, initialProducts;
before(async () => {
  server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  data = await server.ssrLoadModule('/src/data/index.ts');
  ({ loadServerData } = await server.ssrLoadModule('/src/data/loadServerData.ts'));
  initialProducts = Object.fromEntries(["motorcycles", "helmets", "ridingGear", "spareParts"].map((key) => [key, structuredClone(data[key])]));
  originalFetch = globalThis.fetch;
});
after(async () => { globalThis.fetch = originalFetch; await server?.close(); });

test('le site charge les données publiques du serveur et ne conserve pas les brouillons', async () => {
  const brand = { id: 'essai', name: 'Essai', logo: '/server/uploads/brands/essai/logo.png', isEquipmentBrand: true };
  const bike = { ...data.motorcycles[0], id: 'moto-serveur', brandId: 'essai', status: 'PUBLISHED' };
  const draft = { ...bike, id: 'brouillon', status: 'DRAFT' };
  const values = {
    'brands.php': { brands: [brand] }, 'categories.php': { categories: [{ id: 'motos', name: 'Motos' }] },
    'families.php': { families: [{ id: 'urbain', name: 'Urbain', categoryId: 'motos' }] },
    'product-types.php': { productTypes: [{ id: 'urbain', name: 'Urbain', categoryId: 'motos', familyId: 'urbain' }] },
    'models.php': { models: [] }, 'products/motorcycles.php': { data: [bike, draft] }, 'products/helmets.php': { data: [] },
    'products/riding-gear.php': { data: [] }, 'products/spare-parts.php': { data: [] },
    'dealers.php': { dealers: [] }, 'contacts.php': { contact: { email: 'contact@example.test', phone: '123', phoneHref: 'tel:123', address: 'Test', hours: 'Test' } },
  };
  const calls = [];
  globalThis.fetch = async (url) => { calls.push(url); const value = values[url.replace('/server/api/', '')]; return { ok: !!value, status: value ? 200 : 404, json: async () => value }; };
  await loadServerData();
  assert.equal(calls.length, 11);
  assert.deepEqual(data.brands, [brand]);
  assert.deepEqual(data.motorcycles.map((p) => p.id), ['moto-serveur']);
  assert.deepEqual(data.products.map((p) => p.id), ['moto-serveur']);
  assert.equal(data.getProductFamily(data.motorcycles[0]).name, 'Urbain');
  assert.equal(data.brands[0].logo, '/server/uploads/brands/essai/logo.png');
  const beforeFailure = data.motorcycles.map((p) => p.id);
  globalThis.fetch = async () => ({ ok: false, status: 503 });
  await assert.rejects(loadServerData());
  assert.deepEqual(data.motorcycles.map((p) => p.id), beforeFailure, 'aucune mise à jour partielle en cas de panne');
});

test('les données initiales du serveur conservent les sélections et caractéristiques choisies sur le site', async () => {
  const { readFile } = await import('node:fs/promises');
  for (const [list, filename] of [['motorcycles', 'motorcycles'], ['helmets', 'helmets'], ['ridingGear', 'riding-gear'], ['spareParts', 'spare-parts']]) {
    const front = initialProducts[list];
    const back = JSON.parse(await readFile(`server/storage/data/products/${filename}.json`, 'utf8')).products;
    for (const product of front) {
      const stored = back.find((p) => p.id === product.id);
      assert.ok(stored, product.id);
      for (const field of ['isNewArrival', 'isHomepageHero', 'isMotoAccueil', 'isEquipementAccueil']) assert.equal(!!stored[field], !!product[field], `${product.id}: ${field}`);
      assert.deepEqual(stored.specifications, product.specifications, `${product.id}: caractéristiques`);
    }
  }
});

test('un catalogue ou une liste de revendeurs vides ne provoque pas de plantage', async () => {
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { default: Dealers } = await server.ssrLoadModule('/src/pages/Dealers.tsx');
  const { default: Product } = await server.ssrLoadModule('/src/pages/Product.tsx');
  const { default: AccessoryDetail } = await server.ssrLoadModule('/src/pages/AccessoryDetail.tsx');
  const emptyDealers = renderToStaticMarkup(React.createElement(Dealers, { go() {} }));
  assert.match(emptyDealers, /Aucun revendeur/);
  const motoPage = renderToStaticMarkup(React.createElement(Product, { id: 'inconnu', go() {}, back() {} }));
  const partPage = renderToStaticMarkup(React.createElement(AccessoryDetail, { id: 'inconnu', go() {}, back() {}, canGoBack: false, backLabel: '' }));
  assert.match(motoPage, /Produit indisponible/);
  assert.match(partPage, /Produit indisponible/);
});
