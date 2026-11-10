import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
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
  if (path === 'public-data-version.php') return { ok: true, json: async () => ({ version: createHash('sha256').update(JSON.stringify(data)).digest('hex') }) };
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
  assert.equal(calls, 13, "première question : vérification avant et après la lecture complète");
  fireEvent.click(screen.getAllByText('Voir la fiche')[0]);
  assert.equal(navigations.at(-1)?.[0], 'accessory');
  // Un ajout est détecté sans recharger la page et invalide les anciennes réponses.
  data['products/helmets.php'].push({ ...data['products/helmets.php'][0], id: 'nouveau-casque-test', name: 'Casque UniqueEssai', status: 'PUBLISHED' });
  send('casque UniqueEssai');
  await waitFor(() => assert.ok(screen.getByText(/Le catalogue a changé/)), { timeout: 5000 });
  await waitFor(() => assert.ok(screen.getByText('Casque UniqueEssai')), { timeout: 5000 });
  assert.equal(screen.queryAllByText(/Voici les produits trouvés/).length, 1);
  assert.equal(calls, 26, 'données modifiées : lecture complète et deux vérifications');
  const beforeUnchanged = calls;
  send('casque UniqueEssai');
  await waitFor(() => assert.equal(screen.getAllByText('Casque UniqueEssai').length, 2), { timeout: 5000 });
  assert.equal(calls - beforeUnchanged, 1, 'données identiques : une seule vérification');
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

test('le chat guide le client de motocross à une moto puis affine en 125 cc', async () => {
  window.localStorage.clear();
  globalThis.fetch = mockFetch;
  const view = render(React.createElement(CatChat, { go() {} }));
  fireEvent.click(screen.getByLabelText(/^Ouvrir la discussion/));
  send('motocross');
  await waitFor(() => assert.ok(screen.getByText(/cherchez-vous une moto, un équipement ou une pièce/)), { timeout: 5000 });
  fireEvent.click(screen.getByRole('button', { name: 'Moto', exact: true }));
  await waitFor(() => assert.ok(screen.getByText('XX 125 2026')), { timeout: 5000 });
  assert.ok(screen.getByText(/ne peux pas confirmer le stock/));
  fireEvent.click(screen.getByRole('button', { name: '125 cc', exact: true }));
  await waitFor(() => assert.equal(screen.getAllByText('XX 125 2026').length, 2), { timeout: 5000 });
  view.unmount();
});

test('identité personnalisée : nom, logo et salutation sans supprimer la conversation', async () => {
  globalThis.localStorage = window.localStorage;
  window.localStorage.clear();
  const content = await server.ssrLoadModule('/src/content/homepage.ts');
  const defaults = JSON.parse(readFileSync('src/content/homepage-defaults.json', 'utf8'));
  const logo = '/server/uploads/chatbot/logo-' + 'b'.repeat(32) + '.png';
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ data: defaults, chatbotEnabled: true, chatbotName: 'Tiana', chatbotLogo: logo }) });
  await content.loadHomepageData(); globalThis.fetch = mockFetch;
  const view = render(React.createElement(CatChat, { go() {} }));
  assert.ok(view.container.querySelector(`img[src="${logo}"]`));
  fireEvent.click(screen.getByLabelText(/^Ouvrir la discussion/));
  assert.ok(screen.getByRole('dialog', { name: 'Discussion avec Tiana, conseiller Funbike' }));
  assert.ok(screen.getAllByText('Tiana', { exact: true })[0]);
  assert.ok(screen.getByText(/l’assistant automatique de Funbike/));
  assert.equal(screen.queryByText('Piston', { exact: true }), null);
  const saved = window.localStorage.getItem('fb_chat_v3');
  view.unmount();
  assert.ok(saved); assert.equal(window.localStorage.getItem('fb_chat_v3'), saved);
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ data: defaults }) });
  await content.loadHomepageData(); globalThis.fetch = mockFetch;
  delete globalThis.localStorage;
});

test('dialogue : revendeur dynamique, lien direct et promotion vérifiée', async () => {
  window.localStorage.clear();
  const oldDealers = data['dealers.php'];
  data['dealers.php'] = [...oldDealers, { key: 'rider-essai', city: 'Antananarivo', name: 'Rider Zone Essai', kind: 'Magasin', address: 'Adresse test Rider', hours: 'Lundi 9h', phone: '034 11', email: 'rider@test.mg', services: ['Atelier'], desc: '', lat: -18.9, lon: 47.5 }];
  const originalMock = globalThis.fetch;
  const target = data['products/motorcycles.php'][0];
  let promoCalls = 0, discount = 20;
  globalThis.fetch = async (url, options) => {
    if (String(url).endsWith('promotions.php')) { promoCalls++; return { ok: true, json: async () => ({ serverTime: '2026-11-15T09:00:00Z', campaigns: [{ id: 'test', name: 'Essai', startDate: '2026-11-01', endDate: '2026-11-30', enabled: true, published: true, products: [{ productId: target.id, categoryId: target.categoryId, originalPrice: 100000, discountPercent: discount }] }] }) }; }
    return mockFetch(url, options);
  };
  const navigations = [];
  const view = render(React.createElement(CatChat, { go: (...args) => navigations.push(args) }));
  try {
    fireEvent.click(screen.getByLabelText(/^Ouvrir la discussion/));
    send('Rider Zone Essai');
    await waitFor(() => assert.ok(screen.getByText(/Adresse test Rider/)), { timeout: 6000 });
    fireEvent.click(screen.getByRole('button', { name: /Voir Rider Zone Essai/ }));
    assert.deepEqual(navigations.at(-1), ['revendeurs', 'rider-essai']);
    send('promotions motos');
    await waitFor(() => assert.ok(screen.getByText(/Produits en promotion vérifiés le 15\/11\/2026/)), { timeout: 6000 });
    assert.ok(screen.getByRole('button', { name: /Voir les promotions/ }));
    discount = 30;
    send(`prix ${target.name}`);
    await waitFor(() => assert.ok(screen.getByText(/Prix promotionnel de/)), { timeout: 6000 });
    assert.match(screen.getByText(/Prix promotionnel de/).parentElement.textContent, /70\s?000 Ar/);
    assert.equal(promoCalls, 2, 'promotions vérifiées séparément à chaque question concernée');
  } finally { view.unmount(); data['dealers.php'] = oldDealers; globalThis.fetch = originalMock; }
});

test('le dialogue retrouve HLX 150X 5S quand le visiteur écrit TVS HLX 150', async () => {
  window.localStorage.clear();
  const saved = data['products/motorcycles.php'];
  const sample = { ...saved[0], id: 'hlx-150x-test', name: 'HLX 150X 5S', description: '', subDescription: '', specifications: [], modelId: undefined };
  data['products/motorcycles.php'] = [sample];
  globalThis.fetch = mockFetch;
  const navigations = [];
  const view = render(React.createElement(CatChat, { go: (...args) => navigations.push(args) }));
  try {
    fireEvent.click(screen.getByLabelText(/^Ouvrir la discussion/));
    send('tvs hlx 150');
    await waitFor(() => assert.ok(screen.getByText('HLX 150X 5S')), { timeout: 6000 });
    assert.equal(screen.queryByText(/Je n’ai pas trouvé de correspondance certaine/), null);
    fireEvent.click(screen.getByText('Voir la fiche'));
    assert.deepEqual(navigations.at(-1), ['product', sample.id]);
  } finally { view.unmount(); data['products/motorcycles.php'] = saved; }
});
