import { after, afterEach, before, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { seedCatalog } from './helpers/catalog.mjs';
let dom, server, render, cleanup, fireEvent, waitFor, within, catalog, Header, Provider, Promotions, AdminPromotions, ConfirmationProvider, BikeCard;
let originalFetch;
before(async () => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.HTMLElement = dom.window.HTMLElement; globalThis.Element = dom.window.Element; globalThis.SVGElement = dom.window.SVGElement;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  ({ render, cleanup, fireEvent, waitFor, within } = await import('@testing-library/react'));
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
  const campaign = { id: 'c', name: 'Promo Noël', description: 'Notre offre', startDate: '2020-01-01', endDate: '2099-12-31', enabled: true, published: true, products: [{ productId: product.id, categoryId: product.categoryId, originalPrice: 1000000, discountPercent: 20 }] };
  let active = true;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ campaigns: active ? [campaign] : [], serverTime: new Date().toISOString() }) });
  const view = render(React.createElement(Provider, null,
    React.createElement(Header, { route: { page: 'promotions' }, go: () => {}, dark: false, toggle: () => {} }),
    React.createElement(Promotions, { go: () => {} }),
    React.createElement('aside', { 'aria-label': 'Catalogue' }, React.createElement(BikeCard, { bike: product, go: () => {} }))));
  await waitFor(() => assert.ok(view.getByText('Promo Noël')));
  assert.ok(view.getByRole('link', { name: 'Promotions' }));
  assert.ok(view.getByRole('link', { name: 'Pièces' }));
  const card = view.container.querySelector('article');
  assert.ok(card); assert.match(card.textContent, /800\s?000 Ar/); assert.match(card.textContent, /1\s?000\s?000 Ar/); assert.match(card.textContent, /20 %/);
  assert.equal(card.querySelector('del')?.textContent.replace(/\s/g, ''), '1000000Ar');
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
