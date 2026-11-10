import { after, afterEach, before, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { seedCatalog } from './helpers/catalog.mjs';

let dom, server, catalog, Catalogue, PromotionsProvider, render, cleanup, waitFor, fireEvent, within, oldFetch;
before(async () => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/motos', pretendToBeVisual: true });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, SVGElement: dom.window.SVGElement, IS_REACT_ACT_ENVIRONMENT: true });
  globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  ({ render, cleanup, waitFor, fireEvent, within } = await import('@testing-library/react'));
  server = await createServer({ server: { middlewareMode: true }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] }, logLevel: 'silent' });
  await seedCatalog(server);
  catalog = await server.ssrLoadModule('/src/catalog/index.ts');
  ({ Catalogue } = await server.ssrLoadModule('/src/pages/Catalog.tsx'));
  ({ PromotionsProvider } = await server.ssrLoadModule('/src/components/PromotionsContext.tsx'));
  oldFetch = globalThis.fetch;
});
afterEach(() => { cleanup(); globalThis.fetch = oldFetch; });
after(async () => { dom.window.close(); await server.close(); });

test('catalogue motos : prix aligné à droite du bouton, repli pour les grands montants et retour à Sur devis', async () => {
  const bike = catalog.motorcycles[0];
  const campaign = { id: 'c', name: 'Offre', description: '', startDate: '2020-01-01', endDate: '2099-12-31', enabled: true, published: true, products: [{ productId: bike.id, categoryId: bike.categoryId, originalPrice: 1_000_000_000_000, discountPercent: 50 }] };
  let active = true;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ campaigns: active ? [campaign] : [], serverTime: new Date().toISOString() }) });
  const calls = [];
  const view = render(React.createElement(PromotionsProvider, null, React.createElement(Catalogue, { go: (...args) => calls.push(args), motosOnly: true })));
  // Le catalogue mélange les motos : isoler la fiche rend le test déterministe.
  fireEvent.change(view.getByLabelText('Rechercher dans le catalogue'), { target: { value: bike.name } });
  const findCard = () => view.getByRole('heading', { name: bike.name }).closest('article');
  await waitFor(() => assert.ok(within(findCard()).getByLabelText('Réduction de 50 %')));
  const card = findCard(); const button = within(card).getByRole('button', { name: /Découvrir/ });
  const row = button.parentElement; const price = card.querySelector('del');
  assert.ok(row.contains(price), 'prix et bouton partagent la même zone de bas de carte');
  assert.ok(row.classList.contains('flex-wrap'), 'les montants longs peuvent se placer à la ligne');
  assert.ok(row.classList.contains('items-center'), 'les prix sont centrés verticalement sur le bouton');
  assert.ok(button.classList.contains('self-end'), 'le bouton reste ancré en bas lorsque les prix sont longs');
  assert.ok(price.closest('.text-right'), 'prix alignés à droite');
  assert.ok(price.parentElement.classList.contains('justify-end'));
  assert.match(card.textContent.replace(/\s/g, ''), /1000000000000Ar/);
  assert.match(card.textContent.replace(/\s/g, ''), /500000000000Ar/);
  assert.equal((card.textContent.match(/50 %/g) || []).length, 1);
  assert.ok(card.querySelector('.fb-stage-white').contains(within(card).getByLabelText('Réduction de 50 %')));
  fireEvent.click(button); assert.deepEqual(calls.pop(), ['product', bike.id]);
  active = false; fireEvent(document, new window.Event('visibilitychange'));
  await waitFor(() => assert.match(findCard().textContent, /Sur devis/));
  assert.equal(findCard().querySelector('del'), null);
  const regularButton = within(findCard()).getByRole('button', { name: /Découvrir/ });
  assert.ok(regularButton.parentElement.textContent.includes('Sur devis'));
  assert.ok(regularButton.parentElement.classList.contains('items-center'), 'Sur devis est aussi centré verticalement');
  assert.ok(regularButton.classList.contains('self-end'));
});

test('les autres cartes motos conservent leur disposition promotionnelle existante', async () => {
  const { BikeCard } = await server.ssrLoadModule('/src/components/Cards.tsx');
  const bike = catalog.motorcycles[0];
  const campaign = { id: 'c', name: 'Offre', description: '', startDate: '2020-01-01', endDate: '2099-12-31', enabled: true, published: true, products: [{ productId: bike.id, categoryId: bike.categoryId, originalPrice: 6000, discountPercent: 50 }] };
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ campaigns: [campaign], serverTime: new Date().toISOString() }) });
  const view = render(React.createElement(PromotionsProvider, null,
    React.createElement(BikeCard, { bike, go() {}, uniformLayout: true }),
    React.createElement(BikeCard, { bike, go() {}, uniformLayout: true, compact: true })));
  await waitFor(() => assert.equal(view.getAllByLabelText('Réduction de 50 %').length, 2));
  for (const card of view.container.querySelectorAll('article')) {
    const button = within(card).getByRole('button', { name: /Découvrir/ });
    assert.ok(!button.parentElement.contains(card.querySelector('del')), 'le prix reste au-dessus du bouton');
    assert.equal((card.textContent.match(/50 %/g) || []).length, 1);
  }
});
