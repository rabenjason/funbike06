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
  assert.match(ask('quelle moto ville 999').reply.text, /ne trouve pas de fiche/);
  assert.match(ask('Quelle moto pour la neige ?').reply.text, /ne peux pas interpréter/);
  assert.match(ask('quelle moto pour la ville avec un budget de 100').reply.text, /budget/);
  const constrained = ask('quelle moto Zebra 999 pour débutant');
  assert.match(ask('ville', constrained.memory).reply.text, /ne trouve pas de fiche/);
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

test('cross et motocross : précision de catégorie et respect des fiches', () => {
  catalog.productTypes.push({ id: 'cross-type', name: 'Cross', categoryId: 'motos' });
  const cross = product('CrossMoto', 'motos', { name: 'Zebra Cross One', productTypeId: 'cross-type', specifications: [{ key: 'Cylindrée', value: '125 cc' }] });
  const gear = product('CrossGear', 'equipements', { name: 'Gants cross' });
  const part = product('CrossPart', 'pieces-detachees', { name: 'Chaîne cross' });
  const draft = product('DraftCross', 'motos', { productTypeId: 'cross-type', status: 'DRAFT' });
  const excluded = product('excluded', 'motos', { productTypeId: 'unclassified', specifications: [{ key: 'Usage', value: 'Pas pour le cross' }] });
  catalog.products.push(cross, gear, part, draft, excluded);
  try {
    for (const q of ['cross', 'motocross', 'je cherche une cross']) {
      const choice = ask(q); assert.match(choice.reply.text, /moto, un équipement ou une pièce/); assert.deepEqual(choice.reply.quick, ['Moto', 'Équipement', 'Pièces']);
      const bike = ask('Moto', choice.memory).reply;
      assert.deepEqual(bike.productIds, [cross.id]); assert.match(bike.reasons[cross.id], /Cross/);
      assert.deepEqual(ask('Équipement', choice.memory).reply.productIds, [gear.id]);
      assert.deepEqual(ask('Pièces', choice.memory).reply.productIds, [part.id]);
    }
    assert.deepEqual(ask('je veux une moto motocross').reply.productIds, [cross.id]);
    assert.deepEqual(ask('gants motocross').reply.productIds, [gear.id]);
    assert.match(ask('je veux une moto pas pour le cross').reply.text, /exclusion/);
    assert.match(ask('moto cross Yamaha').reply.text, /ne pas ignorer vos critères/);
    assert.match(ask('moto ville et cross Yamaha').reply.text, /ne pas ignorer vos critères/);
    assert.match(ask('quelle moto pour ville et cross').reply.text, /usage principal/);
    const brand = ask('cross Zebra 125'); assert.deepEqual(ask('Moto', brand.memory).reply.productIds, [cross.id]);
    cross.status = 'ARCHIVED';
    assert.equal(ask('moto cross').reply.productIds, undefined);
    cross.status = 'PUBLISHED';
    cross.specifications[0].value = '150 cc';
    assert.equal(ask('moto cross 125 cc').reply.productIds, undefined);
    catalog.brands[0].isPublished = false;
    assert.equal(ask('moto cross').reply.productIds, undefined);
  } finally { catalog.brands[0].isPublished = true; catalog.products.splice(0); catalog.productTypes.pop(); }
});

test('conversation progressive : usage, cylindrée documentée, changement de besoin et niveau non supposé', () => {
  catalog.productTypes.push({ id: 'transport', name: '3 roues', categoryId: 'motos' });
  const city125 = product('ville125', 'motos', { name: 'City 125', specifications: [{ key: 'Cylindrée', value: '125 cc' }] });
  const city150 = product('ville150', 'motos', { name: 'City 150', specifications: [{ key: 'Cylindrée', value: '150 cc' }] });
  const unknownCC = product('ville125sansfiche', 'motos', { name: 'Ville 125', specifications: [] });
  const transport = product('troisroues', 'motos', { productTypeId: 'transport', specifications: [{ key: 'Usage', value: 'Transport urbain' }] });
  const glove = product('gant', 'equipements', { name: 'Gant Thermo' });
  catalog.products.push(city125, city150, unknownCC, transport, glove);
  try {
    const start = ask('je cherche une moto'); assert.match(start.reply.text, /usage principal/);
    const city = ask('ville', start.memory); assert.deepEqual(city.reply.productIds, [city125.id, city150.id, unknownCC.id]);
    assert.ok(city.reply.quick.includes('125 cc'));
    const refined = ask('125 cc', city.memory); assert.deepEqual(refined.reply.productIds, [city125.id]);
    assert.match(refined.reply.text, /ne peux pas confirmer/);
    const novice = ask('je débute', refined.memory); assert.match(novice.reply.text, /convient à un débutant/); assert.match(ask('prix du premier', novice.memory).reply.text, /pas renseigné/);
    assert.match(ask('combien de cc pour le premier', refined.memory).reply.text, /125 cc/);
    assert.deepEqual(ask('moto pour aller au travail').reply.productIds, [city125.id, city150.id, unknownCC.id]);
    const other = ask('autre usage', refined.memory); assert.match(other.reply.text, /quel usage/); assert.match(ask('cross', other.memory).reply.text, /ne trouve pas de fiche/);
    const switchCategory = ask('gants Thermo', refined.memory); assert.ok(switchCategory.reply.productIds.includes(glove.id));
    assert.equal(switchCategory.memory.lastUsage, undefined);
    assert.match(ask('moto ville avec budget 5 millions').reply.text, /budget/);
    assert.match(ask('moto ville saison pluie').reply.text, /ne pas ignorer vos critères/);
  } finally { catalog.products.splice(0); catalog.productTypes.pop(); }
});

test('une description explicite peut étayer une piste sans transformer une négation en recommandation', () => {
  const documented = product('route', 'motos', { productTypeId: 'autre', description: 'Polyvalence route et piste, pour partir loin.' });
  const negative = product('route-non', 'motos', { productTypeId: 'autre', description: 'Cette moto n’est pas adaptée pour la route.' });
  const vague = product('vague', 'motos', { productTypeId: 'autre', description: 'Une moto pour toutes les aventures.' });
  catalog.products.push(documented, negative, vague);
  try {
    const reply = ask('une moto pour la route').reply;
    assert.deepEqual(reply.productIds, [documented.id]);
    assert.match(reply.reasons[documented.id], /Description.*Polyvalence route et piste/);
  } finally { catalog.products.splice(0); }
});

test('revendeurs : noms, ville, suivi et ambiguïtés à partir des fiches actuelles', async () => {
  const { DEALERS } = await server.ssrLoadModule('/src/catalog/dealers.ts');
  const original = [...DEALERS];
  const row = (key, name, city, extra = {}) => ({ key, name, city, kind: 'Magasin', address: `Adresse ${key}`, hours: 'Lundi 9h', phone: '034 123', email: `${key}@test.mg`, services: ['Atelier'], lat: -18, lon: 47, desc: '', ...extra });
  DEALERS.splice(0, DEALERS.length, row('rider', 'Rider zone', 'Antananarivo'), row('autre', 'Autre magasin', 'Antananarivo'), row('nord', 'Moto Nord', 'Mahajanga'), row('demo', 'Fausse démo', 'Antananarivo', { isDemo: true }));
  try {
    let r = ask('rider zone'); assert.match(r.reply.text, /Adresse rider/); assert.match(r.reply.text, /Lundi 9h/); assert.ok(r.reply.actions.some((a) => a.page === 'revendeurs' && a.id === 'rider'));
    assert.match(ask('adresse de Rider zone').reply.text, /Adresse rider/);
    assert.match(ask('Moto Nord').reply.text, /Adresse nord/);
    assert.match(ask('horaires Moto Nord').reply.text, /Adresse nord/);
    assert.doesNotMatch(ask('prix moto Rider zone').reply.text, /Adresse rider/);
    assert.match(ask('horaires', r.memory).reply.text, /Lundi 9h/);
    r = ask('revendeurs à antananarivo'); assert.match(r.reply.text, /Rider zone/); assert.match(r.reply.text, /Autre magasin/); assert.doesNotMatch(r.reply.text, /Fausse démo|Moto Nord/);
    assert.match(ask('adresse', r.memory).reply.text, /certitude/);
    assert.match(ask('le deuxième', r.memory).reply.text, /Adresse autre/);
    assert.match(ask('revendeurs à villeinconnue').reply.text, /ne trouve pas/);
    assert.match(ask('revendeur introuvable').reply.text, /ne trouve pas/);
    assert.match(ask('horaires du showroom', r.memory).reply.text, /Showroom Funbike/);
    DEALERS[0].address = 'Nouvelle adresse'; assert.match(ask('RIDER ZONE').reply.text, /Nouvelle adresse/);
    DEALERS.splice(0, 1); assert.doesNotMatch(ask('revendeurs').reply.text, /Rider zone/);
    assert.match(ask('adresse', { ...r.memory, dealerKeys: ['rider'], lastDealerKey: 'rider' }).reply.text, /certitude/);
    assert.doesNotMatch(ask('moto pour la ville').reply.text, /Points de vente/);
  } finally { DEALERS.splice(0, DEALERS.length, ...original); }
});

test('promotions : prix et catégories vérifiés, indisponibilité et produits non publics', async () => {
  const { loadAssistantPromotions } = await server.ssrLoadModule('/src/lib/assistant-promotions.ts');
  const oldFetch = globalThis.fetch;
  const moto = product('PromoMoto', 'motos', { name: 'Zebra Nova' });
  const gear = product('PromoGear', 'equipements', { name: 'Gants Thermo' });
  const hidden = product('hidden', 'motos', { name: 'Secret', status: 'DRAFT' });
  catalog.products.push(moto, gear, hidden);
  const items = [moto, gear, hidden].map((p) => ({ productId: p.id, categoryId: p.categoryId, originalPrice: 100000, discountPercent: 20 }));
  const campaign = { id: 'a', name: 'Promo', startDate: '2026-11-01', endDate: '2026-11-30', enabled: true, published: true, products: items };
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ campaigns: [campaign, { ...campaign, id: 'expired', startDate: '2026-10-01', endDate: '2026-10-31' }], serverTime: '2026-11-15T10:00:00Z' }) });
  try {
    const snapshot = await loadAssistantPromotions(new AbortController().signal); assert.equal(snapshot.campaigns.length, 1);
    let r = assistant.respond('promotions', memory(), snapshot); assert.deepEqual(r.reply.productIds, ['PromoMoto', 'PromoGear']);
    assert.deepEqual(assistant.respond('promotions motos', memory(), snapshot).reply.productIds, ['PromoMoto']);
    assert.deepEqual(assistant.respond('promos gants Thermo', memory(), snapshot).reply.productIds, ['PromoGear']);
    assert.match(assistant.respond('promo gants Inexistant', memory(), snapshot).reply.text, /aucune promotion/i);
    r = assistant.respond('prix Zebra Nova', memory(), snapshot); assert.match(r.reply.text, /80\s?000 Ar/); assert.match(r.reply.text, /30\/11\/2026/); assert.match(r.reply.text, /20 %/);
    assert.match(assistant.respond('prix Zebra Nova', memory(), null).reply.text, /ne peux pas vérifier/);
    assert.match(assistant.respond('promotions', memory(), null).reply.text, /ne peux pas vérifier/);
    assert.equal(assistant.needsPromotionData('Voir la suite', r.memory), false);
    const listing = assistant.respond('promotions', memory(), snapshot);
    assert.equal(assistant.needsPromotionData('Voir la suite', listing.memory), true);
    assert.match(assistant.respond('Voir la suite', listing.memory, { campaigns: [], now: snapshot.now }).reply.text, /plus disponibles/);
    assert.match(assistant.respond('Voir la suite', listing.memory, null).reply.text, /ne peux pas vérifier/);
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ campaigns: [{ ...campaign, products: [{ ...items[0], originalPrice: -1 }] }], serverTime: '2026-11-15T10:00:00Z' }) });
    assert.equal(await loadAssistantPromotions(new AbortController().signal), null);
    globalThis.fetch = async () => { throw new Error('réseau'); };
    assert.equal(await loadAssistantPromotions(new AbortController().signal), null);
  } finally { globalThis.fetch = oldFetch; catalog.products.splice(0); }
});

test('recherche de modèles avec variante accolée : 150 retrouve 150X sans confondre les chiffres', () => {
  catalog.brands.push({ id: 'test-tvs', name: 'TVS', isPublished: true, isEquipmentBrand: false });
  const base = { brandId: 'test-tvs', productTypeId: 'test-ville' };
  const x5s = product('hlx150x5s', 'motos', { ...base, name: 'HLX 150X 5S' });
  const x5g = product('hlx150x5g', 'motos', { ...base, name: 'HLX 150X 5G' });
  const big = product('hlx1500', 'motos', { ...base, name: 'HLX 1500 5S' });
  const other = product('hlx125', 'motos', { ...base, name: 'HLX 125 5S' });
  const draft = product('hlxdraft', 'motos', { ...base, name: 'HLX 150X brouillon', status: 'DRAFT' });
  catalog.products.push(x5s, x5g, big, other, draft);
  try {
    assert.deepEqual(assistant.searchProducts('tvs hlx 150').map(p => p.id), [x5s.id, x5g.id]);
    assert.deepEqual(ask('tvs hlx 150').reply.productIds, [x5s.id, x5g.id]);
    assert.deepEqual(ask('je cherche une moto tvs hlx 150').reply.productIds, [x5s.id, x5g.id]);
    assert.deepEqual(ask('tvs hlx 150x 5s').reply.productIds, [x5s.id]);
    assert.deepEqual(ask('prix tvs hlx 150').reply.productIds, [x5s.id, x5g.id]);
    assert.deepEqual(assistant.searchProducts('tvs hlx 1500').map(p => p.id), [big.id]);
    assert.deepEqual(assistant.searchProducts('tvs hlx 125').map(p => p.id), [other.id]);
    assert.deepEqual(assistant.searchProducts('tvs hlx 150xs'), []);
    assert.deepEqual(assistant.searchProducts('tvs hlx 1505'), []);
    const snapshot = { now: Date.parse('2026-11-15T10:00:00Z'), campaigns: [{ id: 'promo', name: 'Promo', startDate: '2026-11-01', endDate: '2026-11-30', enabled: true, published: true, products: [{ productId: x5s.id, categoryId: 'motos', originalPrice: 100000, discountPercent: 20 }] }] };
    assert.deepEqual(assistant.respond('promotion tvs hlx 150', memory(), snapshot).reply.productIds, [x5s.id]);
  } finally { catalog.products.splice(0); catalog.brands.pop(); }
});
