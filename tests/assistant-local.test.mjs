import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { seedCatalog } from './helpers/catalog.mjs';

let server, catalog, assistant, contact;
const memory = () => ({ ...assistant.EMPTY_MEMORY, lastIds: [] });
const ask = (q, m = memory()) => assistant.respond(q, m);
const product = (id, categoryId, extra = {}) => ({ id, name: `Essai ${id}`, brandId: 'test-new-brand', categoryId, productTypeId: categoryId === 'motos' ? 'test-ville' : categoryId, description: '', images: [], specifications: [], status: 'PUBLISHED', isNewArrival: false, ...extra });
let snapshots;
before(async () => {
  server = await createServer({ server: { middlewareMode: true }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
  catalog = await server.ssrLoadModule('/src/catalog/index.ts');
  await seedCatalog(server);
  assistant = await server.ssrLoadModule('/src/lib/assistant.ts');
  contact = await server.ssrLoadModule('/src/catalog/contact.ts');
  snapshots = Object.fromEntries(['products', 'brands', 'productTypes', 'families'].map((k) => [k, [...catalog[k]]]));
  catalog.products.splice(0); catalog.brands.splice(0); catalog.productTypes.splice(0); catalog.families.splice(0);
  catalog.brands.push({ id: 'test-new-brand', name: 'Zebra', isPublished: true, isEquipmentBrand: true }, { id: 'invisible', name: 'Invisible', isPublished: false, isEquipmentBrand: false });
  catalog.families.push({ id: 'test-ville', name: 'Urbain', categoryId: 'motos' });
  catalog.productTypes.push({ id: 'test-ville', name: 'Urbain', categoryId: 'motos', familyId: 'test-ville' }, { id: 'casques', name: 'Casque', categoryId: 'casques' }, { id: 'equipements', name: 'Gants', categoryId: 'equipements' }, { id: 'pieces-detachees', name: 'Freinage', categoryId: 'pieces-detachees' });
});
after(async () => { for (const [k, v] of Object.entries(snapshots ?? {})) catalog[k].splice(0, catalog[k].length, ...v); await server?.close(); });

test('recherche dynamique : nouveaux produits, quatre catégories et données administrées', () => {
  const moto = product('Nova', 'motos', { description: 'Moto pratique pour la ville', specifications: [{ key: 'Cylindrée', value: '125 cc' }] });
  const helmet = product('Vision', 'casques'); const glove = product('Thermo', 'equipements', { description: 'Membrane étanche' }); const part = product('Disque', 'pieces-detachees');
  catalog.products.push(moto, helmet, glove, part);
  for (const [q, p] of [['moto Zebra Nova', moto], ['casque Vision', helmet], ['gants Thermo', glove], ['pièce Disque', part], ['étanche', glove], ['Zebra 125', moto]]) assert.ok(assistant.searchProducts(q).some((x) => x.id === p.id), q);
  assert.equal(catalog.productDetailPage(moto), 'product'); assert.equal(catalog.productDetailPage(helmet), 'accessory'); assert.equal(catalog.productDetailPage(part), 'accessory');
  moto.name = 'Essai Modifié'; assert.equal(assistant.searchProducts('Nova').length, 0); assert.equal(assistant.searchProducts('Modifié')[0]?.id, moto.id);
  moto.status = 'DRAFT'; glove.status = 'ARCHIVED'; catalog.brands[0].isPublished = false;
  assert.equal(assistant.searchProducts('Vision').length, 0); assert.equal(assistant.searchProducts('Disque').length, 0);
  catalog.brands[0].isPublished = true; catalog.products.splice(0);
});

test('nouveautés exhaustives et pagination, sans brouillons ni marques cachées', () => {
  catalog.products.push(...Array.from({ length: 7 }, (_, i) => product(`N${i}`, i % 2 ? 'casques' : 'motos', { isNewArrival: true })), product('Brouillon', 'motos', { isNewArrival: true, status: 'DRAFT' }), product('Cache', 'motos', { isNewArrival: true, brandId: 'invisible' }));
  const a = ask('Les nouveautés'); const b = ask('Voir la suite', a.memory);
  assert.equal(a.reply.productIds.length, 4); assert.equal(b.reply.productIds.length, 3);
  assert.equal(new Set([...a.reply.productIds, ...b.reply.productIds]).size, 7);
  assert.ok(a.reply.quick.includes('Voir la suite')); assert.ok(!b.reply.quick.includes('Voir la suite'));
  assert.equal(ask('nouveautés casques').reply.productIds.length, 3);
  assert.equal(ask('nouveautés Zebra').reply.productIds.length, 4);
  assert.match(ask('nouveautés marqueinconnue').reply.text, /Aucune nouveauté/);
  catalog.products.splice(0);
});

test('prix, stock et caractéristiques : aucun renseignement inventé, suivi et ambiguïté', () => {
  catalog.products.push(product('A', 'casques', { name: 'Casque A', price: '100 Ar', specifications: [{ key: 'Poids', value: '1200 g' }] }), product('B', 'casques', { name: 'Casque B' }));
  assert.match(ask('prix Casque A').reply.text, /100 Ar/);
  assert.match(ask('prix Casque B').reply.text, /pas renseigné/);
  assert.match(ask('stock Casque A').reply.text, /ne peux pas confirmer/);
  assert.match(ask('poids Casque A').reply.text, /1200 g/);
  assert.match(ask('poids Casque B').reply.text, /pas renseignée/);
  assert.match(ask('prix Casque ZZZ').reply.text, /certitude/);
  const multi = ask('prix des casques'); assert.equal(multi.reply.productIds.length, 2);
  assert.match(ask('le premier', multi.memory).reply.text, /100 Ar/);
  assert.match(ask('son prix', multi.memory).reply.text, /certitude/);
  catalog.products.splice(0);
});

test('recommandations fondées sur les champs d’usage, clarification et comparaison', () => {
  catalog.products.push(product('Falcon', 'motos', { name: 'Falcon', specifications: [{ key: 'Puissance', value: '5 kW' }] }), product('Raven', 'motos', { name: 'Raven', specifications: [{ key: 'Poids', value: '90 kg' }] }), product('Secret', 'motos', { productTypeId: 'autre', description: 'idéal débutant' }));
  const reply = ask('Quelle moto pour la ville ?').reply;
  assert.deepEqual(reply.productIds, ['Falcon', 'Raven']); assert.match(reply.reasons.Falcon, /Urbain/);
  const clarification = ask('Je débute, quelle moto ?'); assert.match(clarification.reply.text, /usage principal/);
  assert.equal(ask('ville', clarification.memory).reply.productIds.length, 2);
  assert.ok(!ask('quel casque pour moto cross', clarification.memory).reply.productIds?.includes('Falcon'));
  assert.deepEqual(ask('quelles motos pour la ville').reply.productIds, ['Falcon', 'Raven']);
  assert.match(ask('quelle moto ville 999').reply.text, /usage principal/);
  assert.match(ask('Quelle moto pour la neige ?').reply.text, /usage principal/);
  assert.match(ask('quelle moto pour la ville avec un budget de 100').reply.text, /budget/);
  const constrained = ask('quelle moto Zebra 999 pour débutant');
  assert.match(ask('ville', constrained.memory).reply.text, /pas assez de données/);
  const compare = ask('compare Falcon et Raven').reply;
  assert.deepEqual(compare.compare, ['Falcon', 'Raven']);
  assert.match(ask('compare Falcon et Faux').reply.text, /noms précis/);
  const listing = ask('motos Zebra'); assert.deepEqual(ask('compare les deux', listing.memory).reply.compare, ['Falcon', 'Raven']);
  catalog.products.splice(0);
});

test('compatibilité limitée aux marques déclarées et coordonnées dynamiques', () => {
  catalog.products.push(product('Disque', 'pieces-detachees', { compatibleBrandIds: ['test-new-brand'] }));
  const result = ask('pièces compatibles Zebra').reply;
  assert.deepEqual(result.productIds, ['Disque']); assert.match(result.text, /modèle, l’année et les dimensions restent à confirmer/);
  catalog.products[0].compatibleBrandIds = [];
  assert.match(ask('pièces compatibles Zebra').reply.text, /ne peux pas confirmer/);
  contact.setContactInfo({ email: 'team@example.test', phone: '123456', phoneHref: 'tel:123456', address: 'Adresse test', hours: 'Sur rendez-vous' });
  assert.match(ask('horaires du showroom').reply.text, /Sur rendez-vous/);
  assert.match(ask('contacter').reply.text, /team@example.test/);
  assert.doesNotMatch(ask('revendeurs').reply.text, /Démonstration/);
  catalog.products.splice(0);
});

test('le chargement annulé ne remplace pas le catalogue', async () => {
  const { loadServerData } = await server.ssrLoadModule('/src/catalog/loadServerData.ts');
  const oldFetch = globalThis.fetch;
  const original = catalog.brands.length;
  const controller = new AbortController(); controller.abort();
  globalThis.fetch = async (url) => {
    const path = String(url);
    if (path.includes('contacts.php')) return { ok: true, json: async () => ({ contact: { email: '', phone: '', phoneHref: '', address: '', hours: '' } }) };
    const key = path.includes('brands.php') ? 'brands' : path.includes('categories.php') ? 'categories' : path.includes('families.php') ? 'families' : path.includes('product-types.php') ? 'productTypes' : path.includes('models.php') ? 'models' : path.includes('dealers.php') ? 'dealers' : 'data';
    return { ok: true, json: async () => ({ [key]: [] }) };
  };
  try { await assert.rejects(loadServerData(controller.signal)); assert.equal(catalog.brands.length, original); } finally { globalThis.fetch = oldFetch; }
});
