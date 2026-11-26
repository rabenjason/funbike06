import { after, afterEach, before, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { readFileSync } from 'node:fs';
import { seedCatalog } from './helpers/catalog.mjs';
let dom, server, render, cleanup, fireEvent, waitFor, within, act, catalog, Header, Provider, Promotions, AdminPromotions, ConfirmationProvider, BikeCard;
let originalFetch;
before(async () => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.HTMLElement = dom.window.HTMLElement; globalThis.Element = dom.window.Element; globalThis.SVGElement = dom.window.SVGElement;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  ({ render, cleanup, fireEvent, waitFor, within, act } = await import('@testing-library/react'));
  server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  await seedCatalog(server); catalog = await server.ssrLoadModule('/src/catalog/index.ts');
  ({ Header } = await server.ssrLoadModule('/src/components/Layout.tsx'));
  ({ BikeCard } = await server.ssrLoadModule('/src/components/Cards.tsx'));
  ({ PromotionsProvider: Provider } = await server.ssrLoadModule('/src/components/PromotionsContext.tsx'));
  ({ default: Promotions } = await server.ssrLoadModule('/src/pages/Promotions.tsx'));
  ({ default: AdminPromotions } = await server.ssrLoadModule('/src/pages/AdminPromotions.tsx'));
  ({ ConfirmationProvider } = await server.ssrLoadModule('/src/components/ConfirmationModal.tsx'));
  originalFetch = globalThis.fetch;
});
afterEach(() => { cleanup(); globalThis.fetch = originalFetch; });
after(async () => { dom.window.close(); await server?.close(); });

test('site : menu, cartes, prix et retour à Sur devis après désactivation', async () => {
  const product = catalog.motorcycles[0];
  const campaign = { id: 'c', name: 'Promo Noël', description: 'Texte non souhaité', bannerUrl: '/server/uploads/promotions/banniere-test.jpg', startDate: '2020-01-01', endDate: '2099-12-31', enabled: true, published: true, products: [{ productId: product.id, categoryId: product.categoryId, originalPrice: 1000000, discountPercent: 20 }] };
  let active = true;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ campaigns: active ? [campaign] : [], serverTime: new Date().toISOString() }) });
  const view = render(React.createElement(Provider, null,
    React.createElement(Header, { route: { page: 'promotions' }, go: () => {}, dark: false, toggle: () => {} }),
    React.createElement(Promotions, { go: () => {} }),
    React.createElement('aside', { 'aria-label': 'Catalogue' }, React.createElement(BikeCard, { bike: product, go: () => {} }))));
  await waitFor(() => assert.ok(view.getByText('Promo Noël')));
  assert.ok(view.getByText('Offre du 01/01/2020 au 31/12/2099 inclus.'));
  assert.equal(view.queryByRole('timer'), null);
  assert.ok(view.getByRole('link', { name: 'Promotions' }));
  assert.ok(view.getByRole('link', { name: 'Pièces' }));
  assert.equal(view.queryByText('Texte non souhaité'), null);
  assert.equal(view.container.querySelector('img[src="/server/uploads/promotions/banniere-test.jpg"]'), null);
  assert.doesNotMatch(view.container.textContent, /Funbike \/ sélection/i);
  const card = view.container.querySelector('article');
  assert.ok(card); assert.match(card.textContent, /800\s?000 Ar/); assert.match(card.textContent, /1\s?000\s?000 Ar/); assert.match(card.textContent, /20 %/);
  assert.match(card.querySelector('del')?.textContent.replace(/\s/g, ''), /1000000Ar/);
  const badge = within(card).getByLabelText('Réduction de 20 %');
  assert.ok(badge.classList.contains('absolute') && badge.classList.contains('right-3') && badge.classList.contains('top-3'));
  assert.equal((card.textContent.match(/20 %/g) || []).length, 1);
  assert.ok(card.querySelector('strong').classList.contains('text-base'));
  active = false;
  fireEvent(document, new window.Event('visibilitychange'));
  await waitFor(() => assert.ok(view.getByText('Aucune promotion active pour le moment.')));
  assert.ok(view.getByRole('link', { name: 'Pièces détachées' }));
  assert.equal(view.queryByRole('link', { name: 'Promotions' }), null);
  assert.match(view.getByLabelText('Catalogue').textContent, /Sur devis/);
  assert.doesNotMatch(view.getByLabelText('Catalogue').textContent, /800\s?000/);
});

test('dashboard : campagne, recherche, calcul et référence au produit', async () => {
  const p = catalog.motorcycles[0];
  const adminCatalog = { products: [p], brands: catalog.brands, categories: [], families: [], types: [], models: [] };
  let saved;
  globalThis.fetch = async (_url, options = {}) => {
    if (options.method === 'POST') { saved = JSON.parse(options.body).campaign; return { ok: true, json: async () => ({ campaigns: [{ ...saved, id: 'abc' }] }) }; }
    return { ok: true, json: async () => ({ campaigns: [] }) };
  };
  const view = render(React.createElement(ConfirmationProvider, null, React.createElement(AdminPromotions, { catalog: adminCatalog, onDirtyChange: () => {}, onSavingChange: () => {}, productEditor: () => null })));
  await waitFor(() => assert.ok(view.getByRole('button', { name: 'Créer une promotion' })));
  fireEvent.click(view.getByRole('button', { name: 'Créer une promotion' }));
  fireEvent.change(view.getByLabelText('Nom'), { target: { value: 'Promo test' } });
  fireEvent.change(view.getByLabelText('Début (Madagascar)'), { target: { value: '2026-11-12' } });
  fireEvent.change(view.getByLabelText('Fin incluse (Madagascar)'), { target: { value: '2026-12-25' } });
  fireEvent.change(view.getByLabelText('Rechercher un produit par nom ou marque'), { target: { value: p.name } });
  fireEvent.click(view.getByRole('button', { name: new RegExp(p.name) }));
  fireEvent.change(view.getByLabelText('Prix original (Ar)'), { target: { value: '1000000' } });
  fireEvent.change(view.getByLabelText('Réduction (%)'), { target: { value: '20' } });
  assert.match(view.container.textContent, /800\s?000 Ar/);
  fireEvent.click(view.getByRole('button', { name: 'Enregistrer la campagne' }));
  await waitFor(() => assert.ok(saved));
  assert.deepEqual(saved.products, [{ productId: p.id, categoryId: p.categoryId, originalPrice: 1000000, discountPercent: 20 }]);
  assert.ok(within(view.container).getByText('Promo test'));
});

test('équipements en promotion : étiquette sur la photo et prix lisibles, sans modifier la navigation', async () => {
  const p = catalog.ridingGear[0];
  const { PartCard } = await server.ssrLoadModule('/src/components/Cards.tsx');
  const campaign = { id: 'parts', name: 'Offres équipements', description: 'Description masquée', startDate: '2020-01-01', endDate: '2099-12-31', enabled: true, published: true, products: [{ productId: p.id, categoryId: p.categoryId, originalPrice: 1000000, discountPercent: 20 }] };
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ campaigns: [campaign], serverTime: new Date().toISOString() }) });
  const calls = [];
  const view = render(React.createElement(Provider, null, React.createElement(PartCard, { part: p, go: (...args) => calls.push(args) })));
  await waitFor(() => assert.ok(view.getByLabelText('Réduction de 20 %')));
  const badge = view.getByLabelText('Réduction de 20 %');
  assert.ok(badge.classList.contains('top-3') && badge.closest('a'));
  assert.match(view.container.textContent, /800\s?000 Ar/);
  assert.equal((view.container.textContent.match(/20 %/g) || []).length, 1);
  fireEvent.click(view.getByRole('button', { name: p.name }));
  assert.deepEqual(calls[0], ['accessory', p.id, p.categoryId]);
});

test('prix de la fiche conserve le pourcentage et affiche Sur devis sans offre', async () => {
  const product = catalog.motorcycles[0];
  const { PromotionPrice } = await server.ssrLoadModule('/src/components/PromotionsContext.tsx');
  const campaign = { id: 'one', name: 'Promo', description: '', startDate: '2020-01-01', endDate: '2099-12-31', enabled: true, published: true, products: [{ productId: product.id, categoryId: product.categoryId, originalPrice: 300, discountPercent: 2 }] };
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ campaigns: [campaign], serverTime: new Date().toISOString() }) });
  const view = render(React.createElement(Provider, null, React.createElement(PromotionPrice, { product })));
  await waitFor(() => assert.match(view.container.textContent, /294 Ar/));
  assert.match(view.container.textContent, /300 Ar/);
  assert.match(view.container.textContent, /2 %/);
});

test('onglets : catégories disponibles, filtre par type et prix/liens inchangés', async () => {
  const moto = catalog.motorcycles[0], gear = catalog.ridingGear[0], helmet = catalog.helmets[0], part = catalog.spareParts[0];
  const campaign = { id: 'mixte', name: 'Offres de saison', description: '', startDate: '2020-01-01', endDate: '2099-12-31', enabled: true, published: true, products: [part, helmet, moto, gear].map((p) => ({ productId: p.id, categoryId: p.categoryId, originalPrice: 1000000, discountPercent: 20 })) };
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ campaigns: [campaign], preferredCategory: 'equipements', serverTime: new Date().toISOString() }) });
  const calls = []; const view = render(React.createElement(Provider, null, React.createElement(Promotions, { go: (...args) => calls.push(args) })));
  await waitFor(() => assert.ok(view.getByText('Offres de saison')));
  assert.equal(view.getByRole('button', { name: 'Équipements et casques' }).getAttribute('aria-pressed'), 'true');
  const results = view.getByRole('region', { name: 'Produits en promotion' });
  await waitFor(() => assert.equal(results.querySelectorAll('article').length, 2));
  assert.doesNotMatch(results.textContent, /\b\d+ produits?\b/, 'aucun nombre de produits affiché');
  assert.ok(results.textContent.includes(helmet.name) && results.textContent.includes(gear.name));
  const filter = view.getByLabelText('Filtrer par type');
  fireEvent.change(filter, { target: { value: `${helmet.categoryId}:${helmet.productTypeId}` } });
  await waitFor(() => assert.equal(results.querySelectorAll('article').length, 1)); assert.ok(results.textContent.includes(helmet.name));
  assert.doesNotMatch(results.textContent, /\b\d+ produits?\b/, 'pas de compteur après filtrage');
  assert.ok(results.querySelector('[aria-label="Réduction de 20 %"]')); assert.match(results.textContent, /800\s?000 Ar/);
  fireEvent.change(view.getByLabelText('Rechercher une promotion'), { target: { value: 'introuvable' } });
  assert.ok(view.getByText(/Aucun produit ne correspond/));
  assert.doesNotMatch(results.textContent, /\b\d+ produits?\b/, 'pas de compteur lorsque la recherche est vide');
  fireEvent.change(view.getByLabelText('Rechercher une promotion'), { target: { value: '' } });
  fireEvent.click(view.getByRole('button', { name: 'Motos' }));
  assert.equal(view.getByLabelText('Filtrer par type').value, '');
  await waitFor(() => assert.equal(results.querySelectorAll('article').length, 1));
  fireEvent.click(within(results).getByRole('button', { name: moto.name }));
  assert.deepEqual(calls.pop(), ['product', moto.id]);
  fireEvent.click(view.getByRole('button', { name: 'Pièces détachées' }));
  fireEvent.click(await within(results).findByRole('button', { name: part.name }));
  assert.deepEqual(calls.pop(), ['accessory', part.id, part.categoryId]);
  const grid = results.querySelector('article').closest('.grid'); assert.ok(grid.classList.contains('grid-cols-2') && grid.classList.contains('lg:grid-cols-4'));
});

test('préférence indisponible : seule une catégorie avec promotions est affichée', async () => {
  const moto = catalog.motorcycles[0];
  const campaign = { id: 'moto', name: 'Promo moto', description: '', startDate: '2020-01-01', endDate: '2099-12-31', enabled: true, published: true, products: [{ productId: moto.id, categoryId: moto.categoryId, originalPrice: 300, discountPercent: 2 }] };
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ campaigns: [campaign], preferredCategory: 'equipements', serverTime: new Date().toISOString() }) });
  const view = render(React.createElement(Provider, null, React.createElement(Promotions, { go() {} })));
  await waitFor(() => assert.ok(view.getByRole('button', { name: 'Motos' })));
  assert.equal(view.getByRole('button', { name: 'Motos' }).getAttribute('aria-pressed'), 'true');
  assert.equal(view.queryByRole('button', { name: 'Équipements et casques' }), null);
  assert.equal(view.queryByRole('button', { name: 'Pièces détachées' }), null);
  const results = view.getByRole('region', { name: 'Produits en promotion' });
  await waitFor(() => assert.equal(results.querySelectorAll('article').length, 1));
  assert.ok(results.textContent.includes(moto.name));
  assert.doesNotMatch(results.textContent, /\b\d+ produits?\b/, 'pas de compteur pour un produit');
  fireEvent.click(view.getByRole('button', { name: 'Tous', exact: true }));
  assert.equal(view.getByRole('button', { name: 'Tous', exact: true }).getAttribute('aria-pressed'), 'true');
  await waitFor(() => assert.equal(results.querySelectorAll('article').length, 1));
  assert.ok(results.textContent.includes(moto.name));
});

test('une seule pagination pour plusieurs campagnes, recherche et retour à la première page', async () => {
  const list = catalog.motorcycles.slice(0, 13);
  assert.ok(list.length >= 10);
  const make = (id, products) => ({ id, name: `Campagne ${id}`, description: '', startDate: '2020-01-01', endDate: '2099-12-31', enabled: true, published: true, products: products.map((p) => ({ productId: p.id, categoryId: p.categoryId, originalPrice: 300, discountPercent: 2 })) });
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ campaigns: [make('A', list.slice(0, 7)), make('B', list.slice(7))], serverTime: new Date().toISOString() }) });
  const view = render(React.createElement(Provider, null, React.createElement(Promotions, { go() {} })));
  await waitFor(() => assert.ok(view.getByRole('navigation', { name: 'Pagination des promotions' })));
  assert.equal(view.getAllByRole('navigation', { name: 'Pagination des promotions' }).length, 1);
  await waitFor(() => assert.equal(view.container.querySelectorAll('article').length, 8));
  assert.doesNotMatch(view.getByRole('region', { name: 'Produits en promotion' }).textContent, /\b\d+ produits?\b/, 'pas de compteur sur une liste paginée');
  fireEvent.click(view.getByRole('button', { name: 'Page 2' }));
  assert.equal(view.getByRole('button', { name: 'Page 2' }).getAttribute('aria-current'), 'page');
  await waitFor(() => assert.equal(view.container.querySelectorAll('article').length, list.length - 8));
  const q = view.getByLabelText('Rechercher une promotion');
  fireEvent.change(q, { target: { value: list[0].name } });
  await waitFor(() => assert.ok(view.container.textContent.includes(list[0].name)));
  assert.equal(view.queryByRole('navigation', { name: 'Pagination des promotions' }), null);
  fireEvent.change(q, { target: { value: '' } });
  assert.equal(view.getByRole('button', { name: 'Page 1' }).getAttribute('aria-current'), 'page');
});

test('dashboard : choix global enregistré sans modifier les campagnes', async () => {
  let setting = 'motos', showCardDescription = false, revision = 'r1'; const requests = [];
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    if (String(url).endsWith('promotions-display.php')) {
      if (options.method === 'PUT') { const body = JSON.parse(options.body); assert.equal(body.revision, revision); setting = body.preferredCategory; showCardDescription = body.showCardDescription; revision = 'r2'; }
      return { ok: true, json: async () => ({ data: { preferredCategory: setting, showCardDescription, originalPriceColor: '' }, revision }) };
    }
    return { ok: true, json: async () => ({ campaigns: [] }) };
  };
  const adminCatalog = { products: [], brands: [], categories: [], families: [], types: [], models: [] };
  let dirty = false;
  const view = render(React.createElement(ConfirmationProvider, null, React.createElement(AdminPromotions, { catalog: adminCatalog, onDirtyChange: (v) => { dirty = v; }, onSavingChange: () => {}, productEditor: () => null })));
  await waitFor(() => assert.ok(view.getByLabelText('Catégorie affichée en premier')));
  fireEvent.change(view.getByLabelText('Catégorie affichée en premier'), { target: { value: 'equipements' } });
  assert.equal(dirty, true);
  fireEvent.click(view.getByRole('button', { name: 'Enregistrer l’affichage' }));
  await waitFor(() => assert.ok(view.getByText('Affichage enregistré.')));
  assert.equal(setting, 'equipements'); assert.equal(dirty, false);
  assert.equal(requests.filter(({ options }) => options.method === 'PUT').length, 1);
  assert.ok(requests.find(({ options }) => options.method === 'PUT').url.endsWith('promotions-display.php'));
});


test('compte à rebours : heure serveur, campagnes distinctes, évolution et fin à minuit Madagascar', async () => {
  const items = [catalog.motorcycles[0], catalog.motorcycles[1]];
  const campaigns = items.map((product, i) => ({ id: `c${i}`, name: `Campagne ${i}`, description: '', startDate: '2026-12-01', endDate: i === 0 ? '2026-12-12' : '2026-12-13', enabled: true, published: true, products: [{ productId: product.id, categoryId: product.categoryId, originalPrice: 100, discountPercent: 20 }] }));
  const realNow = Date.now, realInterval = window.setInterval, realClearInterval = window.clearInterval;
  let serverNow = Date.parse('2026-12-12T20:59:58Z');
  let clientNow = serverNow + 48 * 60 * 60 * 1000; // horloge du visiteur erronée
  const timers = new Map(); let nextTimer = -1;
  Date.now = () => clientNow;
  window.setInterval = (fn, delay, ...args) => {
    if (delay !== 1000 && delay !== 30000) return realInterval.call(window, fn, delay, ...args);
    const id = nextTimer--; timers.set(id, { fn, delay }); return id;
  };
  window.clearInterval = (id) => { if (timers.has(id)) timers.delete(id); else realClearInterval.call(window, id); };
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ campaigns, serverTime: new Date(serverNow).toISOString() }) });
  try {
    const view = render(React.createElement(Provider, null, React.createElement(Promotions, { go() {} })));
    await waitFor(() => assert.ok(view.getByRole('heading', { name: 'Campagne 0' })));
    const first = view.getByRole('region', { name: 'Campagne 0' });
    const second = view.getByRole('region', { name: 'Campagne 1' });
    assert.equal(within(first).getByRole('timer').textContent, '00:00:02');
    assert.equal(within(second).getByRole('timer').textContent, '1 j 00:00:02');
    assert.match(within(second).getByRole('timer').getAttribute('aria-label'), /1 jour, 0 heures, 0 minutes et 2 secondes/);
    clientNow += 1000; serverNow += 1000;
    act(() => { for (const timer of timers.values()) if (timer.delay === 1000) timer.fn(); });
    assert.equal(within(first).getByRole('timer').textContent, '00:00:01');
    clientNow += 1000; serverNow += 1000;
    act(() => { for (const timer of timers.values()) if (timer.delay === 1000) timer.fn(); });
    assert.equal(within(first).queryByRole('timer'), null, 'pas de compteur négatif');
    assert.equal(within(second).getByRole('timer').textContent, '1 j 00:00:00');
    await act(async () => { for (const timer of timers.values()) if (timer.delay === 30000) timer.fn(); await Promise.resolve(); });
    await waitFor(() => assert.equal(view.queryByRole('region', { name: 'Campagne 0' }), null));
    assert.ok(view.getByRole('region', { name: 'Campagne 1' }));
    view.unmount();
    assert.equal(timers.size, 0, 'nettoyage des minuteries');
  } finally { Date.now = realNow; window.setInterval = realInterval; window.clearInterval = realClearInterval; }
});


test('campagne du 9 au 10 novembre : compteur dès la veille et commandes compactes', async () => {
  const product = catalog.motorcycles[0];
  const campaign = { id: 'noel', name: 'Promotion noel', startDate: '2026-11-09', endDate: '2026-11-10', enabled: true, published: true, products: [{ productId: product.id, categoryId: product.categoryId, originalPrice: 300, discountPercent: 2 }] };
  const realNow = Date.now;
  const instant = Date.parse('2026-11-09T13:39:00Z'); // 16 h 39 à Antananarivo
  Date.now = () => instant + 3600000; // visiteur dans un autre fuseau ou horloge erronée
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ campaigns: [campaign], serverTime: new Date(instant).toISOString() }) });
  try {
    const view = render(React.createElement(Provider, null, React.createElement(Promotions, { go() {} })));
    await waitFor(() => assert.ok(view.getByRole('timer')));
    assert.equal(view.getByRole('timer').textContent, '1 j 07:21:00');
    assert.match(view.getByRole('timer').getAttribute('aria-label'), /1 jour, 7 heures, 21 minutes et 0 secondes/);
    const title = view.getByRole('heading', { name: 'Promotion noel' });
    assert.equal(view.queryByText('Offre du 09/11/2026 au 10/11/2026 inclus.'), null, 'les dates disparaissent lorsque le compte à rebours apparaît');
    const timer = view.getByRole('timer');
    assert.equal(timer.parentElement.parentElement, title.parentElement, 'titre et compte à rebours partagent la même ligne compacte');
    assert.ok(!timer.parentElement.className.includes('bg-') && !timer.parentElement.className.includes('border'), 'aucun fond ni encadrement autour du compte à rebours');
    const search = view.getByLabelText('Rechercher une promotion');
    const type = view.getByLabelText('Filtrer par type');
    assert.ok(search.parentElement.classList.contains('sm:w-72'));
    assert.ok(type.parentElement.classList.contains('sm:w-52'));
    assert.ok(search.classList.contains('h-10') && type.classList.contains('h-10'));
  } finally { Date.now = realNow; }
});


test('dashboard : parcourir, trier, sélectionner et renseigner les promotions sur plusieurs pages', async () => {
  const base = catalog.motorcycles[0];
  const entries = Array.from({ length: 16 }, (_, index) => ({ ...structuredClone(base), id: `fixture-${index}`, name: `Produit ${String(index).padStart(2, '0')}`, categoryId: index >= 12 ? 'equipements' : 'motos', status: index === 10 ? 'DRAFT' : 'PUBLISHED' }));
  const adminCatalog = { products: entries, brands: catalog.brands, categories: [{ id: 'motos', name: 'Motos' }, { id: 'equipements', name: 'Équipements' }], families: [], types: [], models: [] };
  let saved;
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).endsWith('promotions-display.php')) return { ok: true, json: async () => ({ data: { preferredCategory: 'motos' }, revision: 'r1' }) };
    if (options.method === 'POST') { saved = JSON.parse(options.body).campaign; return { ok: true, json: async () => ({ campaigns: [{ ...saved, id: 'saved' }] }) }; }
    return { ok: true, json: async () => ({ campaigns: [] }) };
  };
  const view = render(React.createElement(ConfirmationProvider, null, React.createElement(AdminPromotions, { catalog: adminCatalog, onDirtyChange: () => {}, onSavingChange: () => {}, productEditor: () => null })));
  await waitFor(() => assert.ok(view.getByRole('button', { name: 'Créer une promotion' })));
  fireEvent.click(view.getByRole('button', { name: 'Créer une promotion' }));
  fireEvent.change(view.getByLabelText('Nom'), { target: { value: 'Offre test' } });
  fireEvent.change(view.getByLabelText('Début (Madagascar)'), { target: { value: '2026-11-09' } });
  fireEvent.change(view.getByLabelText('Fin incluse (Madagascar)'), { target: { value: '2026-11-10' } });
  fireEvent.click(view.getByRole('button', { name: 'Liste des produits' }));
  assert.equal(view.getAllByRole('checkbox', { name: /Sélectionner Produit/ }).length, 8);
  const page = view.getByRole('navigation', { name: 'Pagination de la liste des produits' });
  assert.match(page.textContent, /Page 1 sur 2/);
  for (let index = 0; index < 8; index++) {
    const checkbox = view.getByRole('checkbox', { name: `Sélectionner Produit ${String(index).padStart(2, '0')}` });
    fireEvent.click(checkbox);
    const row = checkbox.closest('div');
    fireEvent.change(within(row).getByLabelText('Prix original (Ar)'), { target: { value: '1000' } });
    fireEvent.change(within(row).getByLabelText('Réduction (%)'), { target: { value: '20' } });
    assert.match(row.textContent, /800 Ar/);
  }
  fireEvent.click(within(page).getByRole('button', { name: 'Suivant' }));
  for (const index of [8, 9]) {
    const checkbox = view.getByRole('checkbox', { name: `Sélectionner Produit ${String(index).padStart(2, '0')}` });
    fireEvent.click(checkbox); const row = checkbox.closest('div');
    fireEvent.change(within(row).getByLabelText('Prix original (Ar)'), { target: { value: '2000' } });
    fireEvent.change(within(row).getByLabelText('Réduction (%)'), { target: { value: '10' } });
  }
  const ninth = view.getByRole('checkbox', { name: 'Sélectionner Produit 08' });
  fireEvent.click(ninth);
  assert.ok(view.getByRole('alertdialog')); fireEvent.click(within(view.getByRole('alertdialog')).getByRole('button', { name: 'Annuler' }));
  assert.equal(view.getByRole('checkbox', { name: 'Sélectionner Produit 08' }).checked, true, 'annuler conserve le produit et sa réduction');
  fireEvent.click(view.getByRole('button', { name: 'Produits sélectionnés (10)' }));
  const selectedPage = view.getByRole('navigation', { name: 'Pagination des produits sélectionnés' });
  assert.match(selectedPage.textContent, /Page 1 sur 2/);
  assert.equal(view.getAllByLabelText('Prix original (Ar)').length, 8);
  fireEvent.click(within(selectedPage).getByRole('button', { name: 'Suivant' }));
  assert.equal(view.getAllByLabelText('Prix original (Ar)').length, 2);
  assert.equal(view.getAllByLabelText('Prix original (Ar)')[0].value, '2000');
  fireEvent.click(view.getByRole('button', { name: 'Liste des produits' }));
  fireEvent.change(view.getByLabelText('Catégorie'), { target: { value: 'equipements' } });
  fireEvent.change(view.getByLabelText('Trier par'), { target: { value: 'name-desc' } });
  assert.equal(view.getAllByRole('checkbox', { name: /Sélectionner Produit/ })[0].getAttribute('aria-label'), 'Sélectionner Produit 15');
  assert.equal(view.getAllByRole('checkbox', { name: /Sélectionner Produit/ }).length, 4);
  fireEvent.change(view.getByLabelText('Rechercher dans la liste'), { target: { value: 'produit 13' } });
  assert.ok(view.getByRole('checkbox', { name: 'Sélectionner Produit 13' }));
  assert.equal(view.queryByRole('navigation', { name: 'Pagination de la liste des produits' }), null);
  fireEvent.click(view.getByRole('button', { name: 'Enregistrer la campagne' }));
  await waitFor(() => assert.ok(saved));
  assert.equal(saved.products.length, 10);
  assert.deepEqual(saved.products.find((item) => item.productId === 'fixture-8'), { productId: 'fixture-8', categoryId: 'motos', originalPrice: 2000, discountPercent: 10 });
});

test('la date disparaît automatiquement quand le compteur commence', async () => {
  const product = catalog.motorcycles[0];
  const campaign = { id: 'transition', name: 'Transition', startDate: '2026-11-01', endDate: '2026-11-10', enabled: true, published: true, products: [{ productId: product.id, categoryId: product.categoryId, originalPrice: 300, discountPercent: 2 }] };
  const realNow = Date.now, realInterval = window.setInterval, realClear = window.clearInterval;
  let now = Date.parse('2026-11-08T20:59:59Z');
  const timers = new Map(); let next = -1;
  Date.now = () => now;
  window.setInterval = (fn, delay, ...args) => { if (delay !== 1000) return realInterval.call(window, fn, delay, ...args); const id = next--; timers.set(id, fn); return id; };
  window.clearInterval = (id) => { if (timers.has(id)) timers.delete(id); else realClear.call(window, id); };
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ campaigns: [campaign], serverTime: new Date(now).toISOString() }) });
  try {
    const view = render(React.createElement(Provider, null, React.createElement(Promotions, { go() {} })));
    await waitFor(() => assert.ok(view.getByText('Offre du 01/11/2026 au 10/11/2026 inclus.')));
    assert.equal(view.queryByRole('timer'), null);
    now += 1000;
    act(() => { for (const tick of timers.values()) tick(); });
    assert.equal(view.queryByText('Offre du 01/11/2026 au 10/11/2026 inclus.'), null);
    assert.equal(view.getByRole('timer').textContent, '2 j 00:00:00');
    view.unmount(); assert.equal(timers.size, 0);
  } finally { Date.now = realNow; window.setInterval = realInterval; window.clearInterval = realClear; }
});

test('bannière de promotion : optimisation avant envoi, limite et conservation du brouillon', async () => {
  const adminCatalog = { products: [], brands: [], categories: [], families: [], types: [], models: [] };
  const uploads=[];
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).endsWith('promotions.php?admin=1')) return {ok:true,json:async()=>({campaigns:[]})};
    if (String(url).endsWith('promotions-display.php')) return {ok:true,json:async()=>({data:{preferredCategory:'motos'},revision:'r1'})};
    if (String(url).endsWith('promotions.php') && options.method === 'POST') { uploads.push(options.body); return {ok:true,json:async()=>({url:'/server/uploads/promotions/'+ 'a'.repeat(32)+'.png'})}; }
    throw new Error(String(url));
  };
  const view=render(React.createElement(ConfirmationProvider,null,React.createElement(AdminPromotions,{catalog:adminCatalog,onDirtyChange:()=>{},onSavingChange:()=>{},productEditor:()=>null})));
  await waitFor(()=>view.getByRole('button',{name:'Créer une promotion'})); fireEvent.click(view.getByRole('button',{name:'Créer une promotion'}));
  fireEvent.change(view.getByLabelText('Nom'),{target:{value:'Brouillon'}});
  const input=view.getByLabelText('Bannière facultative');
  const big=new File([new Uint8Array(8*1024*1024+1)],'lourd.jpg',{type:'image/jpeg'});
  fireEvent.change(input,{target:{files:[big]}}); assert.match(view.container.textContent,/Optimisation de la bannière en cours/); assert.equal(uploads.length,0);
  await waitFor(()=>assert.match(view.getByRole('alert').textContent,/dépasse 8 Mo après optimisation/)); assert.equal(uploads.length,0);
  assert.equal(view.getByLabelText('Nom').value,'Brouillon');
  const light=new File(['image'],'petite.png',{type:'image/png'});
  fireEvent.change(input,{target:{files:[light]}}); await waitFor(()=>assert.equal(uploads.length,1));
  assert.equal(uploads[0].get('banner').name,'petite.png'); assert.match(view.container.textContent,/Original conservé/);
  assert.ok(view.getByAltText('Bannière de la campagne')); assert.equal(light.name,'petite.png');
});

test('prix saisi hors promotion : retour au prix normal après la fin de l’offre', async () => {
  const product = { ...catalog.ridingGear[0], price: '150 000 Ar' };
  const { PartCard } = await server.ssrLoadModule('/src/components/Cards.tsx');
  const campaign = { id: 'regular-price', name: 'Promo équipement', description: '', startDate: '2020-01-01', endDate: '2099-12-31', enabled: true, published: true, products: [{ productId: product.id, categoryId: product.categoryId, originalPrice: 150000, discountPercent: 20 }] };
  let active = true;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ campaigns: active ? [campaign] : [], serverTime: new Date().toISOString() }) });
  const view = render(React.createElement(Provider, null, React.createElement(PartCard, { part: product, go() {} })));
  await waitFor(() => assert.match(view.container.textContent, /120\s?000 Ar/));
  assert.match(view.container.textContent, /150\s?000 Ar/);
  active = false; fireEvent(document, new window.Event('visibilitychange'));
  await waitFor(() => assert.ok(!view.queryByLabelText('Réduction de 20 %')));
  assert.ok(view.container.textContent.includes('150 000 Ar'));
  assert.ok(!view.container.textContent.includes('120 000 Ar'));
  assert.ok(!view.container.textContent.includes('Sur devis'));
});

test('prix vide, mention personnalisée et valeur invalide : repli sûr sans promotion', async () => {
  const { PromotionPrice } = await server.ssrLoadModule('/src/components/PromotionsContext.tsx');
  const p = catalog.ridingGear[0];
  for (const [price, expected] of [['', 'Sur devis'], ['  ', 'Sur devis'], [null, 'Sur devis'], ['  150 000 Ar  ', '150 000 Ar'], ['Sur demande', 'Sur demande']]) {
    const view = render(React.createElement(PromotionPrice, { product: { ...p, price } }));
    assert.equal(view.container.textContent, expected);
    view.unmount();
  }
});

test('onglet Tous avant Motos : toutes les catégories et campagnes, filtres et liens conservés', async () => {
  const moto = catalog.motorcycles[0], gear = catalog.ridingGear[0], helmet = catalog.helmets[0], part = catalog.spareParts[0];
  const makeCampaign = (id, list, extra = {}) => ({ id, name: `Offre ${id}`, description: '', startDate: '2020-01-01', endDate: '2099-12-31', enabled: true, published: true, products: list.map(p => ({ productId: p.id, categoryId: p.categoryId, originalPrice: 1000000, discountPercent: 20 })), ...extra });
  const campaigns = [makeCampaign('A', [moto, gear]), makeCampaign('B', [helmet, part]), makeCampaign('inactive', [catalog.motorcycles[1]], { enabled: false })];
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ campaigns, preferredCategory: 'equipements', serverTime: new Date().toISOString() }) });
  const calls = [];
  const view = render(React.createElement(Provider, null, React.createElement(Promotions, { go: (...args) => calls.push(args) })));
  await waitFor(() => assert.ok(view.getByRole('button', { name: 'Tous', exact: true })));
  const buttons = [...view.getByLabelText('Catégories de promotions').querySelectorAll('button')];
  assert.deepEqual(buttons.map(button => button.textContent), ['Tous', 'Motos', 'Équipements et casques', 'Pièces détachées']);
  assert.equal(view.getByRole('button', { name: 'Équipements et casques' }).getAttribute('aria-pressed'), 'true', 'la catégorie choisie dans l’admin reste initiale');
  fireEvent.click(view.getByRole('button', { name: 'Tous', exact: true }));
  assert.equal(view.getByRole('button', { name: 'Tous', exact: true }).getAttribute('aria-pressed'), 'true');
  const results = view.getByRole('region', { name: 'Produits en promotion' });
  await waitFor(() => assert.equal(results.querySelectorAll('article').length, 4));
  for (const product of [moto, gear, helmet, part]) assert.ok(results.textContent.includes(product.name), product.name);
  assert.ok(!results.textContent.includes(catalog.motorcycles[1].name), 'campagne désactivée exclue');
  assert.equal(results.querySelectorAll('[aria-label="Réduction de 20 %"]').length, 4);
  assert.ok(results.textContent.includes('Offre A') && results.textContent.includes('Offre B'));
  const filter = view.getByLabelText('Filtrer par type');
  fireEvent.change(filter, { target: { value: `${helmet.categoryId}:${helmet.productTypeId}` } });
  await waitFor(() => assert.equal(results.querySelectorAll('article').length, 1));
  assert.ok(results.textContent.includes(helmet.name));
  fireEvent.change(filter, { target: { value: '' } });
  fireEvent.change(view.getByLabelText('Rechercher une promotion'), { target: { value: part.name } });
  await waitFor(() => assert.equal(results.querySelectorAll('article').length, 1));
  fireEvent.click(await within(results).findByRole('button', { name: part.name }));
  assert.deepEqual(calls.pop(), ['accessory', part.id, part.categoryId]);
  fireEvent.change(view.getByLabelText('Rechercher une promotion'), { target: { value: '' } });
  fireEvent.click(view.getByRole('button', { name: 'Motos' }));
  await waitFor(() => assert.equal(results.querySelectorAll('article').length, 1));
  fireEvent.click(within(results).getByRole('button', { name: moto.name }));
  assert.deepEqual(calls.pop(), ['product', moto.id]);
});

test('Tous : pagination commune et retour à la première page', async () => {
  const bikes = catalog.motorcycles.slice(0, 9), gear = catalog.ridingGear[0];
  const campaign = { id: 'many', name: 'Offre générale', description: '', startDate: '2020-01-01', endDate: '2099-12-31', enabled: true, published: true, products: [...bikes, gear].map(p => ({ productId: p.id, categoryId: p.categoryId, originalPrice: 1000, discountPercent: 10 })) };
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ campaigns: [campaign], preferredCategory: 'motos', serverTime: new Date().toISOString() }) });
  const view = render(React.createElement(Provider, null, React.createElement(Promotions, { go() {} })));
  await waitFor(() => assert.ok(view.getByRole('button', { name: 'Tous', exact: true })));
  fireEvent.click(view.getByRole('button', { name: 'Tous', exact: true }));
  const results = view.getByRole('region', { name: 'Produits en promotion' });
  await waitFor(() => assert.equal(results.querySelectorAll('article').length, 8));
  fireEvent.click(view.getByRole('button', { name: 'Page 2' }));
  await waitFor(() => assert.equal(results.querySelectorAll('article').length, 2));
  assert.ok(results.textContent.includes(gear.name));
  fireEvent.click(view.getByRole('button', { name: 'Motos' }));
  assert.equal(view.getByRole('button', { name: 'Page 1' }).getAttribute('aria-current'), 'page');
  fireEvent.click(view.getByRole('button', { name: 'Tous', exact: true }));
  assert.equal(view.getByRole('button', { name: 'Page 1' }).getAttribute('aria-current'), 'page');
  fireEvent.change(view.getByLabelText('Rechercher une promotion'), { target: { value: 'Introuvablexyz' } });
  await waitFor(() => assert.equal(results.querySelectorAll('article').length, 0));
  assert.ok(results.textContent.includes('Aucun produit ne correspond'));
});

test('admin : Tous peut être choisi, enregistré une seule fois et retrouvé après rechargement', async () => {
  let setting = 'motos', showCardDescription = false, revision = 'r1'; const writes = [];
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).endsWith('promotions-display.php')) {
      if (options.method === 'PUT') { const body = JSON.parse(options.body); writes.push(body); assert.equal(body.revision, revision); setting = body.preferredCategory; showCardDescription = body.showCardDescription; revision = 'r2'; }
      return { ok: true, json: async () => ({ data: { preferredCategory: setting, showCardDescription, originalPriceColor: '' }, revision }) };
    }
    return { ok: true, json: async () => ({ campaigns: [] }) };
  };
  const adminCatalog = { products: [], brands: [], categories: [], families: [], types: [], models: [] };
  const component = () => React.createElement(ConfirmationProvider, null, React.createElement(AdminPromotions, { catalog: adminCatalog, onDirtyChange() {}, onSavingChange() {}, productEditor: () => null }));
  let view = render(component());
  await waitFor(() => assert.ok(view.getByLabelText('Catégorie affichée en premier')));
  const select = view.getByLabelText('Catégorie affichée en premier');
  assert.deepEqual([...select.options].map(option => option.textContent), ['Tous', 'Motos', 'Équipements et casques', 'Pièces détachées']);
  fireEvent.change(select, { target: { value: 'tous' } });
  fireEvent.click(view.getByRole('button', { name: 'Enregistrer l’affichage' }));
  await waitFor(() => assert.ok(view.getByText('Affichage enregistré.')));
  assert.deepEqual(writes, [{ preferredCategory: 'tous', showCardDescription: false, originalPriceColor: '', revision: 'r1' }]);
  view.unmount(); view = render(component());
  await waitFor(() => assert.equal(view.getByLabelText('Catégorie affichée en premier').value, 'tous'));
  assert.equal(writes.length, 1);
});

test('Tous par défaut : les motos TVS en premier, puis autres motos et les autres produits', async () => {
  const tvs = catalog.motorcycles.filter(p => p.brandId === 'tvs').slice(0, 2);
  const other = catalog.motorcycles.filter(p => p.brandId !== 'tvs').slice(0, 2);
  const [gear, helmet, part] = [catalog.ridingGear[0], catalog.helmets[0], catalog.spareParts[0]];
  assert.equal(tvs.length, 2); assert.equal(other.length, 2);
  const campaign = (id, list) => ({ id, name: `Promotion ${id}`, description: '', startDate: '2020-01-01', endDate: '2099-12-31', enabled: true, published: true, products: list.map(p => ({ productId: p.id, categoryId: p.categoryId, originalPrice: 10000, discountPercent: 20 })) });
  const campaigns = [campaign('A', [gear, other[0], tvs[0], part]), campaign('B', [helmet, other[1], tvs[1]])];
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ campaigns, preferredCategory: 'tous', serverTime: new Date().toISOString() }) });
  const view = render(React.createElement(Provider, null, React.createElement(Promotions, { go() {} })));
  await waitFor(() => assert.ok(view.getByRole('button', { name: 'Tous', exact: true })));
  assert.equal(view.getByRole('button', { name: 'Tous', exact: true }).getAttribute('aria-pressed'), 'true');
  const results = view.getByRole('region', { name: 'Produits en promotion' });
  const names = () => [...results.querySelectorAll('article')].map(article => article.querySelector('h3, h4').textContent);
  await waitFor(() => assert.deepEqual(names(), [tvs[0], tvs[1], other[0], other[1], gear, part, helmet].map(p => p.name)));
  assert.equal(results.querySelectorAll('[aria-label="Réduction de 20 %"]').length, 7);
  fireEvent.click(view.getByRole('button', { name: 'Motos' }));
  await waitFor(() => assert.deepEqual(names(), [other[0], tvs[0], other[1], tvs[1]].map(p => p.name), 'ordre de l’onglet Motos inchangé'));
  fireEvent.click(view.getByRole('button', { name: 'Tous', exact: true }));
  await waitFor(() => assert.deepEqual(names(), [tvs[0], tvs[1], other[0], other[1], gear, part, helmet].map(p => p.name)));
  fireEvent.change(view.getByLabelText('Rechercher une promotion'), { target: { value: tvs[0].name } });
  await waitFor(() => assert.equal(results.querySelectorAll('article').length, 1));
  assert.equal(names()[0], tvs[0].name);
});

test('bannières : styles, photo locale facultative, couleurs, description et chronomètre', async () => {
  const { PromotionCampaignHeader } = await server.ssrLoadModule('/src/components/PromotionCampaignHeader.tsx');
  const { defaultPromotionAppearance } = await server.ssrLoadModule('/src/lib/promotions.ts');
  const banner = '/server/uploads/promotions/' + 'a'.repeat(32) + '.webp';
  const base = { id: 'noel', name: 'Promotion Noël', description: 'Une offre spéciale', bannerUrl: banner, startDate: '2026-12-01', endDate: '2026-12-25', enabled: true, published: true, products: [] };
  const offset = Date.parse('2026-12-24T12:00:00Z') - Date.now();
  const view = render(React.createElement(PromotionCampaignHeader, { campaign: base, clockOffset: offset }));
  assert.ok(view.getByRole('timer')); assert.equal(view.queryByText('Une offre spéciale'), null); assert.equal(view.container.querySelector('img'), null);
  for (const style of ['sobre', 'sportif', 'festif', 'black-friday']) {
    const appearance = { ...defaultPromotionAppearance(), style, showBanner: true, showDescription: true, titleColor: '#ffffff', highlight: 'Noël', highlightColor: '#ff0000' };
    view.rerender(React.createElement(PromotionCampaignHeader, { campaign: { ...base, appearance }, clockOffset: offset }));
    assert.equal(view.container.querySelector('section').dataset.promotionStyle, style);
    assert.ok(view.getByRole('timer')); assert.ok(view.getByText('Une offre spéciale'));
    assert.equal(view.container.querySelector('img').getAttribute('src'), banner);
    assert.equal(view.getByText('Noël').style.color, 'rgb(255, 0, 0)');
    assert.equal(view.getByRole('heading').style.color, 'rgb(255, 255, 255)');
    assert.equal(view.getByRole('heading').classList.contains('italic'), false);
    view.rerender(React.createElement(PromotionCampaignHeader, { campaign: { ...base, appearance: { ...appearance, titleItalic: true } }, clockOffset: offset }));
    assert.equal(view.getByRole('heading').classList.contains('italic'), true);
    assert.equal(view.getByText('Noël').style.color, 'rgb(255, 0, 0)');
  }
  const appearance = { ...defaultPromotionAppearance(), showBanner: true, highlight: 'absent' };
  view.rerender(React.createElement(PromotionCampaignHeader, { campaign: { ...base, bannerUrl: 'https://bad.invalid/x.jpg', appearance }, clockOffset: offset }));
  assert.equal(view.container.querySelector('img'), null); assert.equal(view.container.querySelector('section').dataset.promotionImage, 'false');
  view.rerender(React.createElement(PromotionCampaignHeader, { campaign: { ...base, appearance }, clockOffset: Date.parse('2026-12-01T12:00:00Z') - Date.now() }));
  assert.equal(view.queryByRole('timer'), null); assert.ok(view.getByText(/Offre du 01\/12\/2026 au 25\/12\/2026/));
  view.rerender(React.createElement(PromotionCampaignHeader, { campaign: { ...base, appearance: { ...appearance, style: 'invalide' } }, clockOffset: offset }));
  assert.equal(view.container.querySelector('[data-promotion-style]'), null); assert.ok(view.getByRole('timer'));
});

test('dashboard : personnalisation par campagne, aperçu et enregistrement sans publication automatique', async () => {
  const campaign = { id: 'old', name: 'Promotion Noël', description: 'Description Noël', bannerUrl: '/server/uploads/promotions/' + 'b'.repeat(32) + '.jpg', startDate: '2026-12-01', endDate: '2026-12-25', enabled: false, published: false, products: [] };
  let saved;
  globalThis.fetch = async (url, options = {}) => {
    if (options.method === 'PUT') { saved = JSON.parse(options.body).campaign; return { ok: true, json: async () => ({ campaigns: [saved] }) }; }
    if (String(url).endsWith('promotions-display.php')) return { ok: true, json: async () => ({ data: { preferredCategory: 'motos' }, revision: 'r1' }) };
    return { ok: true, json: async () => ({ campaigns: [campaign] }) };
  };
  const adminCatalog = { products: [], brands: [], categories: [], families: [], types: [], models: [] };
  const view = render(React.createElement(ConfirmationProvider, null, React.createElement(AdminPromotions, { catalog: adminCatalog, onDirtyChange() {}, onSavingChange() {}, productEditor: () => null })));
  await waitFor(() => assert.ok(view.getByRole('button', { name: 'Modifier' })));
  fireEvent.click(view.getByRole('button', { name: 'Modifier' }));
  assert.equal(view.queryByText('Aperçu indicatif'), null);
  fireEvent.click(view.getByLabelText('Personnaliser la présentation'));
  fireEvent.change(view.getByLabelText('Style du titre'), { target: { value: 'festif' } });
  fireEvent.change(view.getByLabelText('Fond'), { target: { value: 'photo' } });
  fireEvent.click(view.getByLabelText('Afficher la description sous le titre'));
  fireEvent.change(view.getByLabelText('Couleur du titre'), { target: { value: '#ffffff' } });
  fireEvent.change(view.getByLabelText('Couleur des mots mis en valeur'), { target: { value: '#ff0000' } });
  fireEvent.change(view.getByLabelText('Mots du titre à mettre en valeur (facultatif)'), { target: { value: 'Noël' } });
  assert.equal(view.getByLabelText('Mettre le titre en italique').checked, false);
  fireEvent.click(view.getByLabelText('Mettre le titre en italique'));
  const preview = view.container.querySelector('.fb-promotion-preview');
  assert.equal(preview.querySelector('section').dataset.promotionStyle, 'festif');
  assert.ok(preview.querySelector('h2').classList.contains('italic'));
  fireEvent.click(view.getByLabelText('Mettre le titre en italique')); assert.equal(preview.querySelector('h2').classList.contains('italic'), false);
  fireEvent.click(view.getByLabelText('Mettre le titre en italique'));
  assert.equal(preview.querySelector('img').getAttribute('src'), campaign.bannerUrl);
  assert.ok(preview.textContent.includes('Description Noël')); assert.equal(preview.querySelector('h2 span').textContent, 'Noël');
  fireEvent.click(view.getByRole('button', { name: 'Enregistrer la campagne' }));
  await waitFor(() => assert.ok(saved));
  assert.deepEqual(saved.appearance, { style: 'festif', showBanner: true, showDescription: true, titleItalic: true, titleColor: '#ffffff', highlight: 'Noël', highlightColor: '#ff0000' });
  assert.equal(saved.enabled, false); assert.equal(saved.published, false); assert.equal(saved.bannerUrl, campaign.bannerUrl);
});

test('cartes promotions : structure commune et réservations par catégorie', async () => {
  const { WhatsappProvider } = await server.ssrLoadModule('/src/components/Whatsapp.tsx');
  const { defaultWhatsappSettings } = await server.ssrLoadModule('/src/lib/whatsappSettings.ts');
  const products = [catalog.motorcycles[0], catalog.ridingGear[0], catalog.spareParts[0]];
  const campaign = { id: 'c'.repeat(32), name: 'Promo mixte', description: '', startDate: '2020-01-01', endDate: '2099-12-31', enabled: true, published: true, products: products.map((p) => ({ productId: p.id, categoryId: p.categoryId, originalPrice: 1000000, discountPercent: 20 })) };
  const settings = { enabled: true, askIntent: true, texts: structuredClone(defaultWhatsappSettings.texts), sales: { phone: '+261 34 00 111 11' }, parts: { phone: '+261 34 00 333 33' } };
  const writes = [];
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes('promotion-reservations.php')) {
      const body = JSON.parse(options.body); writes.push(body); const product = products.find(p => p.id === body.productId);
      return { ok: true, status: 201, json: async () => ({ id: 'a'.repeat(32), phone: product.categoryId === 'pieces-detachees' ? settings.parts.phone : settings.sales.phone, product: { name: product.name, brand: product.brandId, path: `/${product.categoryId}/${product.id}` }, promotion: { name: campaign.name, originalPrice: 1000000, promotionalPrice: 800000, discountPercent: 20 } }) };
    }
    return { ok: true, json: async () => String(url).includes('whatsapp-settings.php') ? { data: settings } : { campaigns: [campaign], preferredCategory: 'tous', serverTime: new Date().toISOString() } };
  };
  const view = render(React.createElement(WhatsappProvider, null, React.createElement(Provider, null, React.createElement(Promotions, { go() {} }))));
  await waitFor(() => assert.equal(view.container.querySelectorAll('article').length, 3));
  const cards = [...view.container.querySelectorAll('article')];
  for (const [index, card] of cards.entries()) {
    const action = within(card).getByRole('button', { name: 'Réserver' });
    const details = within(card).getByRole('link', { name: /Voir la fiche/ });
    assert.ok(action.classList.contains('h-11') && details.classList.contains('h-11'));
    fireEvent.click(action); let dialog = within(view.getByRole('dialog'));
    assert.ok(dialog.getByText(products[index].name)); assert.ok(dialog.getByRole('link', { name: 'Voir la fiche produit' }));
    fireEvent.click(dialog.getByRole('button', { name: 'Contacter un commercial' }));
    const link = await dialog.findByRole('link', { name: 'Ouvrir WhatsApp' }); const target = new URL(link.href);
    assert.equal(target.pathname, index === 2 ? '/261340033333' : '/261340011111');
    assert.ok(target.searchParams.get('text').includes('800'));
    assert.ok(target.searchParams.get('text').includes(products[index].name));
    assert.ok(target.searchParams.get('text').includes('a'.repeat(32)));
    assert.equal(writes[index].source, 'whatsapp'); assert.equal(writes[index].productId, products[index].id);
    assert.ok(dialog.getByText(/ne peut pas confirmer l’envoi/));
    fireEvent.click(dialog.getByRole('button', { name: 'Fermer', exact: true }));
  }
});

test('descriptions : réglage global, annulation et sauvegarde sans autre écriture', async () => {
  let data = { preferredCategory: 'equipements', showCardDescription: false }, revision = 'r1';
  const writes = [];
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).endsWith('promotions-display.php')) {
      if (options.method === 'PUT') { const body = JSON.parse(options.body); writes.push(body); assert.equal(body.revision, revision); data = { preferredCategory: body.preferredCategory, showCardDescription: body.showCardDescription, originalPriceColor: body.originalPriceColor }; revision = 'r2'; }
      return { ok: true, json: async () => ({ data, revision }) };
    }
    return { ok: true, json: async () => ({ campaigns: [] }) };
  };
  const catalog = { products: [], brands: [], categories: [], families: [], types: [], models: [] };
  let dirty = false;
  const component = () => React.createElement(ConfirmationProvider, null, React.createElement(AdminPromotions, { catalog, onDirtyChange(v) { dirty = v; }, onSavingChange() {}, productEditor: () => null }));
  let view = render(component());
  const label = 'Afficher la description sur toutes les cartes Promotions';
  await waitFor(() => assert.ok(view.getByLabelText(label)));
  assert.equal(view.getByLabelText(label).checked, false);
  fireEvent.click(view.getByLabelText(label)); assert.equal(dirty, true);
  fireEvent.click(view.getByRole('button', { name: 'Annuler' })); assert.equal(view.getByLabelText(label).checked, false); assert.equal(dirty, false);
  fireEvent.change(view.getByLabelText('Couleur du prix barré'), { target: { value: '#ff0000' } }); assert.equal(dirty, true);
  fireEvent.click(view.getByRole('button', { name: 'Annuler' })); assert.equal(view.getByLabelText('Couleur du prix barré').value, '#808080');
  fireEvent.change(view.getByLabelText('Couleur du prix barré'), { target: { value: '#ff0000' } });
  fireEvent.click(view.getByLabelText(label)); fireEvent.click(view.getByRole('button', { name: 'Enregistrer l’affichage' }));
  await waitFor(() => assert.ok(view.getByText('Affichage enregistré.')));
  assert.deepEqual(writes, [{ preferredCategory: 'equipements', showCardDescription: true, originalPriceColor: '#ff0000', revision: 'r1' }]);
  await waitFor(() => assert.equal(dirty, false)); view.unmount(); view = render(component());
  await waitFor(() => assert.equal(view.getByLabelText(label).checked, true));
  assert.equal(view.getByLabelText('Catégorie affichée en premier').value, 'equipements'); assert.equal(view.getByLabelText('Couleur du prix barré').value, '#ff0000'); assert.equal(writes.length, 1);
  fireEvent.click(view.getByRole('button', { name: 'Couleur par défaut' })); assert.equal(view.getByLabelText('Couleur du prix barré').value, '#808080'); assert.equal(dirty, true);
});

test('descriptions : masquées par défaut ou affichées sur chaque carte Promotions uniquement', async () => {
  const products = [catalog.motorcycles[0], catalog.ridingGear[0], catalog.spareParts[0]];
  const originals = products.map(p => p.description);
  products.forEach((p, i) => { p.description = `Description testunique${i}`; });
  try {
  const campaign = { id: 'descriptions', name: 'Promo descriptions', description: '', startDate: '2020-01-01', endDate: '2099-12-31', enabled: true, published: true, products: products.map(p => ({ productId: p.id, categoryId: p.categoryId, originalPrice: 1000000, discountPercent: 20 })) };
  let showCardDescription;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ campaigns: [campaign], preferredCategory: 'tous', showCardDescription, serverTime: new Date().toISOString() }) });
  const view = render(React.createElement(Provider, null, React.createElement(Promotions, { go() {} })));
  await waitFor(() => assert.equal(view.container.querySelectorAll('article').length, 3));
  let cards = [...view.container.querySelectorAll('article')];
  for (const [i, card] of cards.entries()) assert.equal(card.textContent.includes(products[i].description), false);
  showCardDescription = true; fireEvent(document, new window.Event('visibilitychange'));
  await waitFor(() => { cards = [...view.container.querySelectorAll('article')]; for (const [i, card] of cards.entries()) assert.ok(card.textContent.includes(products[i].description)); });
  showCardDescription = false; fireEvent(document, new window.Event('visibilitychange'));
  await waitFor(() => { for (const [i, card] of [...view.container.querySelectorAll('article')].entries()) assert.equal(card.textContent.includes(products[i].description), false); });
  fireEvent.change(view.getByLabelText('Rechercher une promotion'), { target: { value: products[1].description.split(' ')[0] } });
  assert.ok(view.getByRole('region', { name: 'Produits en promotion' }).textContent.includes(products[1].name), 'la recherche reste possible même si le texte est masqué');
  } finally { products.forEach((p, i) => { p.description = originals[i]; }); }
});

test('réservation : formulaire, confirmation et échec bloquant WhatsApp', async () => {
  const { WhatsappProvider } = await server.ssrLoadModule('/src/components/Whatsapp.tsx');
  const { defaultWhatsappSettings } = await server.ssrLoadModule('/src/lib/whatsappSettings.ts');
  const moto = catalog.motorcycles[0];
  const campaign = { id: 'c'.repeat(32), name: 'Promo moto', description: '', startDate: '2020-01-01', endDate: '2099-12-31', enabled: true, published: true, products: [{ productId: moto.id, categoryId: moto.categoryId, originalPrice: 1000000, discountPercent: 20 }] };
  const settings = { enabled: true, askIntent: false, texts: structuredClone(defaultWhatsappSettings.texts), sales: { phone: '+261 34 00 111 11' }, parts: null };
  let fail = false, writes = [];
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes('promotion-reservations.php')) { writes.push(JSON.parse(options.body)); if (fail) return { ok: false, status: 409, json: async () => ({ error: 'Promotion expirée' }) }; return { ok: true, status: 201, json: async () => ({ id: 'b'.repeat(32), phone: null, product: { name: moto.name, brand: 'TVS', path: `/motos/${moto.id}` }, promotion: { name: campaign.name, originalPrice: 1000000, promotionalPrice: 800000, discountPercent: 20 } }) }; }
    return { ok: true, json: async () => String(url).includes('whatsapp-settings.php') ? { data: settings } : { campaigns: [campaign], serverTime: new Date().toISOString() } };
  };
  const view = render(React.createElement(WhatsappProvider, null, React.createElement(Provider, null, React.createElement(Promotions, { go() {} }))));
  const action = await view.findByRole('button', { name: 'Réserver' });
  await waitFor(() => { fireEvent.click(action); assert.ok(within(view.getByRole('dialog')).queryByRole('button', { name: 'Contacter un commercial' })); });
  let dialog = within(view.getByRole('dialog'));
  fireEvent.click(dialog.getByRole('button', { name: 'Réserver via le formulaire' }));
  for (const [label, value] of [['Nom complet', 'Jean Rakoto'], ['Numéro de téléphone', '0341234567'], ['Ville', 'Antananarivo'], ['Quantité', '2'], ['Message (facultatif)', 'Livraison ?']]) fireEvent.change(dialog.getByLabelText(label, { exact: false }), { target: { value } });
  fireEvent.click(dialog.getByRole('button', { name: 'Envoyer ma réservation' }));
  await dialog.findByText('Votre demande a bien été reçue.');
  assert.equal(writes.length, 1); assert.equal(writes[0].quantity, 2); assert.equal(writes[0].source, 'form'); assert.equal(writes[0].originalPrice, 1000000);
  fireEvent.click(dialog.getByRole('button', { name: 'Fermer', exact: true }));
  fail = true; action.focus(); fireEvent.click(action); dialog = within(view.getByRole('dialog'));
  fireEvent.click(dialog.getByRole('button', { name: 'Contacter un commercial' }));
  await dialog.findByRole('alert'); assert.ok(dialog.getByRole('alert').textContent.includes('Promotion expirée'));
  assert.equal(dialog.queryByRole('link', { name: 'Ouvrir WhatsApp' }), null); assert.equal(writes.length, 2);
  fireEvent.keyDown(document, { key: 'Escape' }); assert.ok(document.activeElement === action);
});

test('contact depuis une promotion moto : sujet et message adaptés, sans changer les pièces', async () => {
  const { default: Contact } = await server.ssrLoadModule('/src/pages/Contact.tsx');
  const moto = catalog.motorcycles.find(p => p.brandId === 'tvs');
  const part = catalog.spareParts.find(p => p.brandId !== 'tvs');
  assert.ok(moto); assert.ok(part);
  let view = render(React.createElement(Contact, { inquiryId: moto.id }));
  assert.equal(view.getByLabelText('Sujet').value, 'tvs');
  assert.ok(view.getByLabelText('Votre message').value.includes(moto.name));
  assert.doesNotMatch(view.getByLabelText('Votre message').value, /compatibilité/);
  view.unmount(); view = render(React.createElement(Contact, { inquiryId: part.id }));
  assert.equal(view.getByLabelText('Sujet').value, 'pieces');
  assert.ok(view.getByLabelText('Votre message').value.includes(part.name));
  assert.match(view.getByLabelText('Votre message').value, /compatibilité/);
});

test('réservations admin : recherche, filtres, statut, note et suppression confirmée', async () => {
  const { AdminPromotionReservations } = await server.ssrLoadModule('/src/pages/AdminPromotionReservations.tsx');
  const make = (id, source, status, name) => ({ id: id.repeat(32), revision: 'r1', createdAt: new Date().toISOString(), source, status, product: { id: 'test', categoryId: 'motos', name: 'Moto Test', brand: 'TVS', path: '/motos/test', image: '/server/uploads/products/motorcycles/test/main.jpg' }, promotion: { id: 'c'.repeat(32), name: 'Noël', startDate: '2020-01-01', endDate: '2099-12-31', originalPrice: 1000000, promotionalPrice: 800000, discountPercent: 20 }, customer: { name, phone: '0341234567', city: 'Tana' }, quantity: 1, message: 'Bonjour', internalNotes: '' });
  let records = [make('a', 'form', 'new', 'Jean'), make('b', 'whatsapp', 'whatsapp_initiated', '')], writes = [];
  globalThis.fetch = async (_url, options = {}) => {
    if (options.method === 'PUT') { const body = JSON.parse(options.body); writes.push({ method: 'PUT', body }); records = records.map(r => r.id === body.id ? { ...r, customer: body.customer, status: body.status, internalNotes: body.internalNotes, revision: 'r2' } : r); records.push(make('d', 'form', 'new', 'Nouvelle demande')); return { ok: true, json: async () => ({ reservation: records.find(r => r.id === body.id), revision: 'new-list-including-unseen-record' }) }; }
    if (options.method === 'DELETE') { const body = JSON.parse(options.body); writes.push({ method: 'DELETE', body }); records = records.filter(r => !body.ids.includes(r.id)); return { ok: true, json: async () => ({ deleted: body.ids.length, revision: 'newer-list' }) }; }
    return { ok: true, json: async () => ({ reservations: structuredClone(records), revision: 'list-revision' }) };
  };
  let dirty = false, refreshed = 0;
  const view = render(React.createElement(ConfirmationProvider, null, React.createElement(AdminPromotionReservations, { onChanged: () => refreshed++, onDirtyChange: v => { dirty = v; }, onSavingChange() {} })));
  await view.findByText(/2 demande\(s\)/);
  fireEvent.change(view.getByLabelText('Rechercher'), { target: { value: 'jean' } }); assert.ok(view.getByText(/1 demande\(s\)/));
  fireEvent.change(view.getByLabelText('Rechercher'), { target: { value: '' } });
  fireEvent.change(view.getByLabelText('Origine'), { target: { value: 'whatsapp' } }); assert.ok(view.getByText(/1 demande\(s\)/));
  fireEvent.change(view.getByLabelText('Origine'), { target: { value: '' } });
  fireEvent.click(view.getAllByRole('button', { name: 'Ouvrir' })[0]);
  await waitFor(() => assert.ok(view.getByRole('region', { name: 'Détail de réservation' })));
  fireEvent.change(view.getByLabelText('Notes internes (admin uniquement)'), { target: { value: 'Attente de stock' } });
  const detail = within(view.getByRole('region', { name: 'Détail de réservation' }));
  fireEvent.change(detail.getByLabelText('Statut'), { target: { value: 'confirmed' } }); assert.equal(dirty, true);
  fireEvent.click(detail.getByRole('button', { name: 'Enregistrer' }));
  await waitFor(() => assert.ok(view.getByText('Réservation enregistrée.')));
  assert.equal(writes.length, 1); assert.equal(writes[0].body.internalNotes, 'Attente de stock'); assert.equal(writes[0].body.status, 'confirmed'); assert.equal(dirty, false); assert.equal(refreshed, 1);
  assert.ok(detail.getByRole('link', { name: 'Voir la fiche produit' })); assert.ok(detail.getByRole('link', { name: 'WhatsApp client' })); assert.ok(detail.getByRole('link', { name: 'Appeler' }));
  assert.equal(view.getByRole('button', { name: 'Tout supprimer (2)' }).disabled, true);
  assert.ok(view.getByText('Actualisez la liste avant de supprimer toutes les réservations.'));
  fireEvent.click(view.getByRole('button', { name: 'Actualiser' })); await view.findByText(/3 demande\(s\)/);
  assert.equal(view.getByRole('button', { name: 'Tout supprimer (3)' }).disabled, false);
  fireEvent.click(view.getByLabelText(`Sélectionner ${'a'.repeat(32)}`)); fireEvent.click(view.getByLabelText(`Sélectionner ${'b'.repeat(32)}`));
  fireEvent.click(view.getByRole('button', { name: 'Supprimer la sélection (2)' }));
  await waitFor(() => assert.ok(view.getByRole('alertdialog')));
  assert.equal(writes.length, 1); fireEvent.click(within(view.getByRole('alertdialog')).getByRole('button', { name: 'Annuler' }));
  assert.equal(writes.length, 1);
  fireEvent.click(view.getByRole('button', { name: 'Supprimer la sélection (2)' }));
  await waitFor(() => assert.ok(view.getByRole('alertdialog'))); fireEvent.click(within(view.getByRole('alertdialog')).getByRole('button', { name: 'Supprimer' }));
  await waitFor(() => assert.ok(view.getByText('Suppression effectuée.'))); assert.equal(writes.length, 2); assert.equal(records.length, 1); assert.equal(view.getByRole('button', { name: 'Tout supprimer (1)' }).disabled, true);
});

test('réservation WhatsApp : échec réseau incertain, pas de lien ni de répétition automatique', async () => {
  const { PromotionReservationDialog } = await server.ssrLoadModule('/src/components/PromotionReservationDialog.tsx');
  const product = catalog.motorcycles[0]; const offer = { productId: product.id, categoryId: product.categoryId, originalPrice: 1000000, discountPercent: 20 };
  const campaign = { id: 'c'.repeat(32), name: 'Promo', description: '', startDate: '2020-01-01', endDate: '2099-12-31', enabled: true, published: true, products: [offer] };
  let attempts = 0; globalThis.fetch = async () => { attempts++; throw new TypeError('connexion interrompue'); };
  const view = render(React.createElement(PromotionReservationDialog, { product, campaign, offer, canWhatsapp: true, onClose() {} }));
  fireEvent.click(view.getByRole('button', { name: 'Contacter un commercial' }));
  await view.findByRole('alert'); assert.match(view.getByRole('alert').textContent, /non confirmée/);
  assert.equal(view.queryByRole('link', { name: 'Ouvrir WhatsApp' }), null);
  assert.equal(view.getByRole('button', { name: 'Contacter un commercial' }).disabled, true); assert.equal(attempts, 1);
});

test('WhatsApp : redirection seulement après confirmation et jamais de nouvelle écriture', async () => {
  const { PromotionReservationDialog } = await server.ssrLoadModule('/src/components/PromotionReservationDialog.tsx');
  const product = catalog.motorcycles[0], offer = { productId: product.id, categoryId: product.categoryId, originalPrice: 1000000, discountPercent: 20 };
  const campaign = { id: 'c'.repeat(32), name: 'Promo Noël', description: '', startDate: '2020-01-01', endDate: '2099-12-31', enabled: true, published: true, products: [offer] };
  let resolveResponse, writes = 0; const opened = [];
  globalThis.fetch = () => { writes++; return new Promise(resolve => { resolveResponse = resolve; }); };
  const result = { id: 'e'.repeat(32), phone: '+261 34 00 111 11', product: { name: product.name, brand: 'TVS', path: `/motos/${product.id}` }, promotion: { name: campaign.name, originalPrice: 1000000, promotionalPrice: 800000, discountPercent: 20 } };
  const view = render(React.createElement(PromotionReservationDialog, { product, campaign, offer, canWhatsapp: true, navigateWhatsapp: url => opened.push(url), onClose() {} }));
  const button = view.getByRole('button', { name: 'Contacter un commercial' }); fireEvent.click(button); fireEvent.click(button);
  assert.equal(writes, 1); assert.equal(opened.length, 0); assert.equal(view.queryByRole('link', { name: 'Ouvrir WhatsApp' }), null);
  await act(async () => { resolveResponse({ ok: true, status: 201, json: async () => result }); });
  assert.equal(opened.length, 1); assert.equal(writes, 1);
  const url = new URL(opened[0]); assert.equal(url.pathname, '/261340011111'); assert.ok(url.searchParams.get('text').includes(result.id));
  assert.equal(view.getByRole('link', { name: 'Ouvrir WhatsApp' }).href, url.href, 'le lien de secours ne crée pas de nouvelle demande');
});

test('formulaire : la demande confirmée précède la redirection avec ses coordonnées et le lien de secours', async () => {
  const { PromotionReservationDialog } = await server.ssrLoadModule('/src/components/PromotionReservationDialog.tsx');
  const product = catalog.spareParts[0], offer = { productId: product.id, categoryId: product.categoryId, originalPrice: 1000000, discountPercent: 20 };
  const campaign = { id: 'c'.repeat(32), name: 'Promo pièce', description: '', startDate: '2020-01-01', endDate: '2099-12-31', enabled: true, published: true, products: [offer] };
  const writes = [], opened = [];
  globalThis.fetch = async (_url, options) => { writes.push(JSON.parse(options.body)); return { ok: true, status: 201, json: async () => ({ id: 'f'.repeat(32), phone: '+261 34 00 333 33', product: { name: product.name, brand: 'Pièces', path: `/pieces-detachees/${product.id}` }, promotion: { name: campaign.name, originalPrice: 1000000, promotionalPrice: 800000, discountPercent: 20 } }) }; };
  const view = render(React.createElement(PromotionReservationDialog, { product, campaign, offer, canWhatsapp: true, navigateWhatsapp: url => { opened.push(url); throw new Error('navigation bloquée'); }, onClose() {} }));
  fireEvent.click(view.getByRole('button', { name: 'Réserver via le formulaire' }));
  for (const [label, value] of [['Nom complet', 'Jean Rakoto'], ['Numéro de téléphone', '0341234567'], ['Ville', 'Tana'], ['Quantité', '2'], ['Message (facultatif)', 'Livraison ?']]) fireEvent.change(view.getByLabelText(label, { exact: false }), { target: { value } });
  fireEvent.click(view.getByRole('button', { name: 'Envoyer ma réservation' }));
  await view.findByText('Votre demande a bien été reçue.');
  assert.equal(writes.length, 1); assert.equal(writes[0].source, 'form'); assert.equal(opened.length, 1);
  const url = new URL(opened[0]); assert.equal(url.pathname, '/261340033333');
  for (const value of ['Jean Rakoto', '0341234567', 'Tana', 'Quantité : 2', 'Livraison ?', 'f'.repeat(32)]) assert.ok(url.searchParams.get('text').includes(value));
  assert.equal(view.getByRole('link', { name: 'Ouvrir WhatsApp' }).href, url.href); assert.equal(writes.length, 1);
});

test('admin : tout supprimer exige confirmation et protège contre une liste périmée', async () => {
  const { AdminPromotionReservations } = await server.ssrLoadModule('/src/pages/AdminPromotionReservations.tsx');
  const make = (id, name) => ({ id: id.repeat(32), revision: 'x', createdAt: new Date().toISOString(), source: 'form', status: 'new', product: { id: 'test', categoryId: 'motos', name: 'Moto', brand: 'TVS', path: '/motos/test', image: '' }, promotion: { id: 'c'.repeat(32), name: 'Promo', startDate: '2020-01-01', endDate: '2099-12-31', originalPrice: 100, promotionalPrice: 80, discountPercent: 20 }, customer: { name, phone: '0341234567', city: 'Tana' }, quantity: 1, message: '', internalNotes: '' });
  let records = [make('a', 'Jean'), make('b', 'Marie')], revision = 'r1', attempts = [];
  globalThis.fetch = async (_url, options = {}) => {
    if (options.method === 'DELETE') { const body = JSON.parse(options.body); attempts.push(body); if (body.revision !== revision) return { ok: false, status: 409, json: async () => ({ error: 'La liste a changé. Rechargez.' }) }; const deleted = records.length; records = []; revision = 'r3'; return { ok: true, json: async () => ({ deleted, revision }) }; }
    return { ok: true, json: async () => ({ reservations: structuredClone(records), revision }) };
  };
  const view = render(React.createElement(ConfirmationProvider, null, React.createElement(AdminPromotionReservations, { onChanged() {}, onDirtyChange() {}, onSavingChange() {} })));
  await view.findByText(/2 demande\(s\)/);
  fireEvent.change(view.getByLabelText('Rechercher'), { target: { value: 'Jean' } });
  fireEvent.click(view.getByRole('button', { name: 'Tout supprimer (2)' }));
  let confirmation = within(await view.findByRole('alertdialog')); assert.match(confirmation.getByText(/masquées par les filtres/).textContent, /définitivement/);
  fireEvent.click(confirmation.getByRole('button', { name: 'Annuler' })); assert.equal(attempts.length, 0); assert.equal(records.length, 2);
  revision = 'r2'; fireEvent.click(view.getByRole('button', { name: 'Tout supprimer (2)' }));
  confirmation = within(await view.findByRole('alertdialog')); fireEvent.click(confirmation.getByRole('button', { name: 'Tout supprimer' }));
  await view.findByRole('alert'); assert.match(view.getByRole('alert').textContent, /liste a changé/i); assert.equal(records.length, 2); assert.equal(attempts.length, 1);
  fireEvent.click(view.getByRole('button', { name: 'Actualiser' })); await waitFor(() => assert.ok(view.getByRole('button', { name: 'Tout supprimer (2)' })));
  fireEvent.click(view.getByRole('button', { name: 'Tout supprimer (2)' }));
  confirmation = within(await view.findByRole('alertdialog')); fireEvent.click(confirmation.getByRole('button', { name: 'Tout supprimer' }));
  await view.findByText('Toutes les réservations ont été supprimées.'); assert.equal(attempts.length, 2); assert.equal(records.length, 0);
});


test('Promotions : bannière pleine largeur et prix barré coloré uniquement sur les cartes Promotions', async () => {
  const p = catalog.motorcycles[0];
  const campaign = { id: 'wide', name: 'Promotions', description: '', startDate: '2020-01-01', endDate: '2099-12-31', enabled: true, published: true, appearance: { style: 'festif', showBanner: false, showDescription: false, titleColor: '', highlight: '', highlightColor: '' }, products: [{ productId: p.id, categoryId: p.categoryId, originalPrice: 1000000, discountPercent: 20 }] };
  let color = '';
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ campaigns: [campaign], originalPriceColor: color, serverTime: new Date().toISOString() }) });
  const view = render(React.createElement(Provider, null, React.createElement(Promotions, { go() {} }), React.createElement('aside', { 'aria-label': 'Catalogue' }, React.createElement(BikeCard, { bike: p, go() {} }))));
  await view.findByRole('region', { name: 'Produits en promotion' });
  const banner = view.getByRole('region', { name: 'Promotions' });
  assert.equal(banner.parentElement.parentElement.classList.contains('max-w-(--container-site)'), false);
  assert.equal(banner.parentElement.parentElement.classList.contains('px-4'), false);
  assert.equal(banner.parentElement.parentElement.classList.contains('page-compact-top'), false);
  assert.equal(banner.parentElement.parentElement.classList.contains('pt-6'), false);
  assert.equal(banner.classList.contains('rounded-xl'), false);
  await waitFor(() => assert.ok(view.getByRole('region', { name: 'Produits en promotion' }).querySelector('del')));
  const del = view.getByRole('region', { name: 'Produits en promotion' }).querySelector('del');
  assert.equal(del.style.color, '');
  color = '#ff0000'; fireEvent(document, new window.Event('visibilitychange'));
  await waitFor(() => assert.equal(del.style.color, 'rgb(255, 0, 0)'));
  assert.equal(view.getByLabelText('Catalogue').querySelector('del').style.color, '');
  color = 'red; background: red'; fireEvent(document, new window.Event('visibilitychange'));
  await waitFor(() => assert.equal(del.style.color, ''));
});


test('Promotions : squelettes au chargement et aux changements de catégorie, type et page', async () => {
  const bikes = catalog.motorcycles.slice(0, 9), gear = catalog.ridingGear[0];
  const campaign = { id: 'loading', name: 'Promos animées', description: '', startDate: '2020-01-01', endDate: '2099-12-31', enabled: true, published: true, products: [...bikes, gear].map(p => ({ productId: p.id, categoryId: p.categoryId, originalPrice: 1000, discountPercent: 10 })) };
  let release; let requests = 0;
  globalThis.fetch = () => { requests++; return new Promise(resolve => { release = () => resolve({ ok: true, json: async () => ({ campaigns: [campaign], preferredCategory: 'tous', serverTime: new Date().toISOString() }) }); }); };
  const view = render(React.createElement(Provider, null, React.createElement(Promotions, { go() {} })));
  await waitFor(() => assert.equal(requests, 1));
  assert.ok(view.getByRole('status', { name: 'Chargement des promotions' }));
  assert.equal(view.container.querySelectorAll('article').length, 0);
  assert.ok(view.container.querySelectorAll('.promotion-skeleton .skeleton').length > 4);
  await act(async () => release());
  const results = await view.findByRole('region', { name: 'Produits en promotion' });
  await waitFor(() => assert.equal(results.querySelectorAll('article').length, 8));
  fireEvent.click(view.getByRole('button', { name: 'Page 2' }));
  assert.ok(within(results).getByRole('status', { name: 'Chargement des promotions' }));
  await waitFor(() => assert.equal(results.querySelectorAll('article').length, 2));
  fireEvent.click(view.getByRole('button', { name: 'Équipements et casques' }));
  assert.ok(within(results).getByRole('status', { name: 'Chargement des promotions' }));
  await waitFor(() => assert.equal(results.querySelectorAll('article').length, 1));
  fireEvent.click(view.getByRole('button', { name: 'Tous', exact: true }));
  await waitFor(() => assert.equal(results.querySelectorAll('article').length, 8));
  fireEvent.change(view.getByLabelText('Filtrer par type'), { target: { value: `${gear.categoryId}:${gear.productTypeId}` } });
  assert.ok(within(results).getByRole('status', { name: 'Chargement des promotions' }));
  await waitFor(() => assert.equal(results.querySelectorAll('article').length, 1));
  assert.equal(requests, 1, 'les transitions ne provoquent aucune requête');
  assert.match(readFileSync('src/index.css', 'utf8'), /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.promotion-skeleton \.skeleton::after\s*\{\s*animation:\s*none/);
});

test('Promotions : pas de squelette infini si chargement vide ou en erreur', async () => {
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ campaigns: [], serverTime: new Date().toISOString() }) });
  let view = render(React.createElement(Provider, null, React.createElement(Promotions, { go() {} })));
  await view.findByText('Aucune promotion active pour le moment.');
  assert.equal(view.queryByRole('status', { name: 'Chargement des promotions' }), null);
  view.unmount(); globalThis.fetch = async () => { throw new Error('réseau'); };
  view = render(React.createElement(Provider, null, React.createElement(Promotions, { go() {} })));
  await view.findByRole('alert'); assert.equal(view.queryByRole('status', { name: 'Chargement des promotions' }), null);
});
