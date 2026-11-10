import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';

const paths = {
  'brands.php': ['brands.json', 'brands'], 'categories.php': ['categories.json', 'categories'], 'families.php': ['families.json', 'families'],
  'product-types.php': ['product-types.json', 'productTypes'], 'models.php': ['models.json', 'models'], 'dealers.php': ['dealers.json', 'dealers'], 'contacts.php': ['contacts.json', 'contact'],
  'products/motorcycles.php': ['products/motorcycles.json', 'products'], 'products/helmets.php': ['products/helmets.json', 'products'],
  'products/riding-gear.php': ['products/riding-gear.json', 'products'], 'products/spare-parts.php': ['products/spare-parts.json', 'products'],
};

test('vérification du chatbot : changements, pannes, annulation et mise à jour concurrente', async () => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] }, logLevel: 'silent' });
  const oldFetch = globalThis.fetch;
  const data = Object.fromEntries(Object.entries(paths).map(([path, [file, key]]) => [path, JSON.parse(readFileSync(`server/storage/data/${file}`, 'utf8'))[key]]));
  let revision = 'a'.repeat(64), calls = [], versionFailure = false, badVersion = false, dataFailure = false, endMismatch = false, versionReads = 0, perpetualChange = false;
  globalThis.fetch = async (url, options = {}) => {
    const path = String(url).replace('/server/api/', ''); calls.push(path);
    assert.equal(options.cache, 'no-store');
    if (options.signal?.aborted) throw new Error('aborted');
    if (path === 'public-data-version.php') {
      versionReads++;
      if (versionFailure) return { ok: false, status: 503 };
      if (badVersion) return { ok: true, json: async () => ({ version: 'invalide' }) };
      if (perpetualChange) revision = versionReads % 2 ? 'e'.repeat(64) : 'f'.repeat(64);
      if (endMismatch && versionReads === 2) { revision = 'c'.repeat(64); data['contacts.php'].address = 'Adresse concurrente'; }
      return { ok: true, json: async () => ({ version: revision }) };
    }
    if (dataFailure && path === 'dealers.php') return { ok: false, status: 500 };
    const key = path.startsWith('products/') ? 'data' : paths[path]?.[1];
    return { ok: true, json: async () => ({ [key]: structuredClone(data[path]) }) };
  };
  try {
    const { refreshAssistantData } = await server.ssrLoadModule('/src/catalog/refreshAssistantData.ts');
    const { loadServerData } = await server.ssrLoadModule('/src/catalog/loadServerData.ts');
    const catalog = await server.ssrLoadModule('/src/catalog/index.ts');
    const contact = await server.ssrLoadModule('/src/catalog/contact.ts');
    const signal = () => new AbortController().signal;
    await refreshAssistantData(signal()); assert.equal(calls.length, 13);
    calls = []; await refreshAssistantData(signal()); assert.deepEqual(calls, ['public-data-version.php']);
    // Toutes les sources, pas seulement les produits, déclenchent un rechargement.
    for (const [path, mutate, check] of [
      ['products/motorcycles.php', value => { value[0].name = 'Moto modifiée'; }, () => assert.equal(catalog.motorcycles[0].name, 'Moto modifiée')],
      ['dealers.php', value => { value[0].name = 'Revendeur modifié'; }, async () => assert.equal((await server.ssrLoadModule('/src/catalog/dealers.ts')).DEALERS[0].name, 'Revendeur modifié')],
      ['contacts.php', value => { value.phone = '034 nouveau'; }, () => assert.equal(contact.CONTACT_PHONE, '034 nouveau')],
      ['brands.php', value => { value[0].isPublished = false; }, () => assert.equal(catalog.brands[0].isPublished, false)],
      ['categories.php', value => { value[0].name = 'Catégorie modifiée'; }, () => assert.equal(catalog.categories[0].name, 'Catégorie modifiée')],
    ]) {
      mutate(data[path]); revision = String.fromCharCode(revision.charCodeAt(0) + 1).repeat(64); calls = [];
      await refreshAssistantData(signal()); assert.equal(calls.length, 13, path); await check();
      calls = []; await refreshAssistantData(signal()); assert.equal(calls.length, 1, path);
    }
    // Toute lecture externe invalide l'association version/données mémoire.
    await loadServerData(signal()); calls = []; await refreshAssistantData(signal()); assert.equal(calls.length, 13);
    versionFailure = true; calls = []; await assert.rejects(refreshAssistantData(signal())); assert.equal(calls.length, 1); versionFailure = false;
    badVersion = true; await assert.rejects(refreshAssistantData(signal()), /invalide/); badVersion = false;
    const controller = new AbortController(); controller.abort(); await assert.rejects(refreshAssistantData(controller.signal));
    // Une annulation pendant la confirmation ne doit pas publier les nouvelles données.
    const previousAddress = contact.CONTACT_ADDRESS;
    data['contacts.php'].address = 'Chargement annulé';
    const duringConfirmation = new AbortController();
    await assert.rejects(loadServerData(duringConfirmation.signal, async () => { duringConfirmation.abort(); }), /annulé/);
    assert.equal(contact.CONTACT_ADDRESS, previousAddress);
    revision = 'b'.repeat(64); data['contacts.php'].address = 'Ne pas publier'; dataFailure = true;
    await assert.rejects(refreshAssistantData(signal())); assert.notEqual(contact.CONTACT_ADDRESS, 'Ne pas publier'); dataFailure = false;
    versionReads = 0; endMismatch = true; calls = []; await refreshAssistantData(signal()); endMismatch = false;
    assert.equal(calls.length, 26, 'recommencer après un changement en cours de lecture');
    assert.equal(contact.CONTACT_ADDRESS, 'Adresse concurrente');
    // Trois tentatives, puis échec sans appliquer une version incohérente.
    const previous = contact.CONTACT_ADDRESS; data['contacts.php'].address = 'Ne pas valider'; versionReads = 0; perpetualChange = true;
    await assert.rejects(refreshAssistantData(signal()), /changent/); assert.equal(contact.CONTACT_ADDRESS, previous);
  } finally { globalThis.fetch = oldFetch; await server.close(); }
});
