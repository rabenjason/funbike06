import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { readFileSync } from 'node:fs';
import { seedCatalog } from './helpers/catalog.mjs';

let dom, server, CatChat, render, cleanup, fireEvent, screen, waitFor, act, originalFetch;
const fixtures = {
  'brands.php': ['brands.json', 'brands'], 'categories.php': ['categories.json', 'categories'], 'families.php': ['families.json', 'families'],
  'product-types.php': ['product-types.json', 'productTypes'], 'models.php': ['models.json', 'models'], 'dealers.php': ['dealers.json', 'dealers'], 'contacts.php': ['contacts.json', 'contact'],
  'products/motorcycles.php': ['products/motorcycles.json', 'products'], 'products/helmets.php': ['products/helmets.json', 'products'],
  'products/riding-gear.php': ['products/riding-gear.json', 'products'], 'products/spare-parts.php': ['products/spare-parts.json', 'products'],
};
const data = Object.fromEntries(Object.entries(fixtures).map(([path, [file, key]]) => [path, JSON.parse(readFileSync(`server/storage/data/${file}`, 'utf8'))[key]]));
let calls = 0;
const mockFetch = async (url) => {
  calls++;
  const path = String(url).replace('/server/api/', '');
  const value = structuredClone(data[path]);
  const key = path.startsWith('products/') ? 'data' : fixtures[path]?.[1];
  return { ok: true, json: async () => ({ [key]: value }) };
};
before(async () => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.HTMLElement = dom.window.HTMLElement; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  window.HTMLElement.prototype.scrollTo = () => {};
  ({ render, cleanup, fireEvent, screen, waitFor, act } = await import('@testing-library/react'));
  server = await createServer({ server: { middlewareMode: true }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
  await seedCatalog(server);
  ({ default: CatChat } = await server.ssrLoadModule('/src/components/CatChat.tsx'));
  originalFetch = globalThis.fetch; globalThis.fetch = mockFetch;
});
after(async () => { cleanup(); globalThis.fetch = originalFetch; dom.window.close(); await server?.close(); });

const send = (question) => { fireEvent.change(screen.getByLabelText('Votre message'), { target: { value: question } }); fireEvent.click(screen.getByLabelText('Envoyer le message')); };

test('rafraîchissement, cartes accessoires, échec réseau et annulation', async () => {
  const navigations = [];
  const view = render(React.createElement(CatChat, { go: (...args) => navigations.push(args) }));
  fireEvent.click(screen.getByLabelText(/^Ouvrir la discussion/));
  send('casques');
  await waitFor(() => assert.ok(screen.getByText(/Voici les produits trouvés/)), { timeout: 5000 });
  assert.equal(calls, 11);
  fireEvent.click(screen.getAllByText('Voir la fiche')[0]);
  assert.equal(navigations.at(-1)?.[0], 'accessory');
  // Un ajout est détecté sans recharger la page et invalide les anciennes réponses.
  data['products/helmets.php'].push({ ...data['products/helmets.php'][0], id: 'nouveau-casque-test', name: 'Casque UniqueEssai', status: 'PUBLISHED' });
  send('casque UniqueEssai');
  await waitFor(() => assert.ok(screen.getByText(/Le catalogue a changé/)), { timeout: 5000 });
  await waitFor(() => assert.ok(screen.getByText('Casque UniqueEssai')), { timeout: 5000 });
  assert.equal(screen.queryAllByText(/Voici les produits trouvés/).length, 1);
  // Une panne ne doit pas déclencher une réponse sur les anciennes données.
  globalThis.fetch = async () => { throw new Error('réseau'); };
  send('prix TVS HLX 125');
  await waitFor(() => assert.ok(screen.getByText(/Je ne peux pas vérifier les informations/)), { timeout: 5000 });
  assert.ok(!screen.queryByText(/Prix indiqué pour/));
  // Une réponse réseau arrivée après réinitialisation ne doit pas être affichée.
  let release;
  globalThis.fetch = () => new Promise((resolve) => { release = resolve; });
  send('motos');
  assert.ok(screen.getByLabelText('Envoyer le message').disabled);
  fireEvent.click(screen.getByLabelText('Nouvelle conversation'));
  await act(async () => { release?.({ ok: false, status: 500 }); });
  assert.equal(screen.queryByText('motos'), null);
  globalThis.fetch = mockFetch;
  view.unmount();
});
