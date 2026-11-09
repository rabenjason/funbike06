import { after, afterEach, before, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
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
  assert.equal(results.querySelectorAll('article').length, 2);
  assert.match(results.textContent, /2 produits/);
  assert.ok(results.textContent.includes(helmet.name) && results.textContent.includes(gear.name));
  const filter = view.getByLabelText('Filtrer par type');
  fireEvent.change(filter, { target: { value: `${helmet.categoryId}:${helmet.productTypeId}` } });
  assert.equal(results.querySelectorAll('article').length, 1); assert.ok(results.textContent.includes(helmet.name));
  assert.ok(results.querySelector('[aria-label="Réduction de 20 %"]')); assert.match(results.textContent, /800\s?000 Ar/);
  fireEvent.change(view.getByLabelText('Rechercher une promotion'), { target: { value: 'introuvable' } });
  assert.ok(view.getByText(/Aucun produit ne correspond/));
  fireEvent.change(view.getByLabelText('Rechercher une promotion'), { target: { value: '' } });
  fireEvent.click(view.getByRole('button', { name: 'Motos' }));
  assert.equal(view.getByLabelText('Filtrer par type').value, '');
  assert.equal(results.querySelectorAll('article').length, 1);
  fireEvent.click(within(results).getByRole('button', { name: /Découvrir/i }));
  assert.deepEqual(calls.pop(), ['product', moto.id]);
  fireEvent.click(view.getByRole('button', { name: 'Pièces détachées' }));
  fireEvent.click(within(results).getByRole('button', { name: part.name }));
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
  assert.match(view.getByRole('region', { name: 'Produits en promotion' }).textContent, /1 produit/);
});

test('une seule pagination pour plusieurs campagnes, recherche et retour à la première page', async () => {
  const list = catalog.motorcycles.slice(0, 13);
  assert.ok(list.length >= 10);
  const make = (id, products) => ({ id, name: `Campagne ${id}`, description: '', startDate: '2020-01-01', endDate: '2099-12-31', enabled: true, published: true, products: products.map((p) => ({ productId: p.id, categoryId: p.categoryId, originalPrice: 300, discountPercent: 2 })) });
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ campaigns: [make('A', list.slice(0, 7)), make('B', list.slice(7))], serverTime: new Date().toISOString() }) });
  const view = render(React.createElement(Provider, null, React.createElement(Promotions, { go() {} })));
  await waitFor(() => assert.ok(view.getByRole('navigation', { name: 'Pagination des promotions' })));
  assert.equal(view.getAllByRole('navigation', { name: 'Pagination des promotions' }).length, 1);
  assert.equal(view.container.querySelectorAll('article').length, 8);
  fireEvent.click(view.getByRole('button', { name: 'Page 2' }));
  assert.equal(view.getByRole('button', { name: 'Page 2' }).getAttribute('aria-current'), 'page');
  assert.equal(view.container.querySelectorAll('article').length, list.length - 8);
  const q = view.getByLabelText('Rechercher une promotion');
  fireEvent.change(q, { target: { value: list[0].name } });
  assert.ok(view.container.textContent.includes(list[0].name));
  assert.equal(view.queryByRole('navigation', { name: 'Pagination des promotions' }), null);
  fireEvent.change(q, { target: { value: '' } });
  assert.equal(view.getByRole('button', { name: 'Page 1' }).getAttribute('aria-current'), 'page');
});

test('dashboard : choix global enregistré sans modifier les campagnes', async () => {
  let setting = 'motos', revision = 'r1'; const requests = [];
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    if (String(url).endsWith('promotions-display.php')) {
      if (options.method === 'PUT') { const body = JSON.parse(options.body); assert.equal(body.revision, revision); setting = body.preferredCategory; revision = 'r2'; }
      return { ok: true, json: async () => ({ data: { preferredCategory: setting }, revision }) };
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
  await waitFor(() => assert.ok(view.getByText('Catégorie enregistrée.')));
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
