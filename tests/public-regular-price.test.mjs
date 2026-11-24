import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

let server, catalog, loader, BikeCard, PartCard, AccessoryDetail, Product, assistant, oldFetch, fixtures;
const files = {
  'brands.php': ['brands.json', 'brands'], 'categories.php': ['categories.json', 'categories'],
  'families.php': ['families.json', 'families'], 'product-types.php': ['product-types.json', 'productTypes'],
  'models.php': ['models.json', 'models'], 'dealers.php': ['dealers.json', 'dealers'], 'contacts.php': ['contacts.json', 'contact'],
  'products/motorcycles.php': ['products/motorcycles.json', 'products'], 'products/helmets.php': ['products/helmets.json', 'products'],
  'products/riding-gear.php': ['products/riding-gear.json', 'products'], 'products/spare-parts.php': ['products/spare-parts.json', 'products'],
};
before(async () => {
  server = await createServer({ server: { middlewareMode: true }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] }, logLevel: 'silent' });
  catalog = await server.ssrLoadModule('/src/catalog/index.ts');
  loader = await server.ssrLoadModule('/src/catalog/loadServerData.ts');
  ({ BikeCard, PartCard } = await server.ssrLoadModule('/src/components/Cards.tsx'));
  ({ default: AccessoryDetail } = await server.ssrLoadModule('/src/pages/AccessoryDetail.tsx'));
  ({ default: Product } = await server.ssrLoadModule('/src/pages/Product.tsx'));
  assistant = await server.ssrLoadModule('/src/lib/assistant.ts');
  fixtures = Object.fromEntries(Object.entries(files).map(([path, [file, key]]) => [path, JSON.parse(readFileSync(`server/storage/data/${file}`, 'utf8'))[key]]));
  for (const path of Object.keys(files).filter(p => p.startsWith('products/'))) fixtures[path] = fixtures[path].filter(p => p.status === 'PUBLISHED');
  fixtures['products/motorcycles.php'][0].price = '  150 000 Ar  ';
  fixtures['products/riding-gear.php'][0].price = '150 000 Ar';
  fixtures['products/riding-gear.php'][0].name = 'Gants Prixunique';
  fixtures['products/helmets.php'][0].price = 'Sur demande';
  fixtures['products/spare-parts.php'][0].price = '   ';
  oldFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    const path = String(url).replace('/server/api/', '');
    const entry = files[path];
    if (!entry) return { ok: false, status: 404 };
    return { ok: true, json: async () => ({ [path.startsWith('products/') ? 'data' : entry[1]]: structuredClone(fixtures[path]) }) };
  };
});
after(async () => { globalThis.fetch = oldFetch; await server.close(); });

function html(element) { return renderToStaticMarkup(element); }

test('le chargement initial et complémentaire conserve les prix ou mentions des quatre catégories', async () => {
  const initial = await loader.loadInitialCatalog('/');
  assert.equal(catalog.motorcycles[0].price, '150 000 Ar');
  await loader.loadServerData(undefined, undefined, false, initial);
  assert.equal(catalog.motorcycles[0].price, '150 000 Ar');
  assert.equal(catalog.ridingGear[0].price, '150 000 Ar');
  assert.equal(catalog.helmets[0].price, 'Sur demande');
  assert.equal(catalog.spareParts[0].price, 'Sur devis');
  assert.equal(fixtures['products/motorcycles.php'][0].price, '  150 000 Ar  ', 'pas de modification de la réponse source');
});

test('prix visible sur les cartes et les fiches moto, équipement, casque et pièce', () => {
  const go = () => {}, back = () => {};
  const moto = catalog.motorcycles[0];
  assert.match(html(React.createElement(BikeCard, { bike: moto, go })), /150 000 Ar/);
  const motoDoc = new JSDOM(html(React.createElement(Product, { id: moto.id, go, back }))).window.document;
  assert.match(motoDoc.querySelector('section[aria-label="Prix et contact"]').textContent, /150 000 Ar/);
  for (const [part, price] of [[catalog.ridingGear[0], '150 000 Ar'], [catalog.helmets[0], 'Sur demande'], [catalog.spareParts[0], 'Sur devis']]) {
    assert.ok(html(React.createElement(PartCard, { part, go })).includes(price));
    const detail = new JSDOM(html(React.createElement(AccessoryDetail, { id: part.id, categoryId: part.categoryId, go, back, canGoBack: false, backLabel: '' }))).window.document;
    assert.ok(detail.querySelector('section[aria-label="Prix et contact"]').textContent.includes(price));
  }
});

test('l’assistant peut lire le même prix enregistré sans inventer un montant', () => {
  const answer = assistant.respond('prix Gants Prixunique', { ...assistant.EMPTY_MEMORY, lastIds: [] });
  assert.match(answer.reply.text, /150 000 Ar/);
});
