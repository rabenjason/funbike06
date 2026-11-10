import { after, afterEach, before, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { seedCatalog } from './helpers/catalog.mjs';

let dom, server, render, cleanup, fireEvent, waitFor, within, catalog, NewArrivals, PromotionsProvider, originalFetch;
before(async () => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Element = dom.window.Element; globalThis.SVGElement = dom.window.SVGElement; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  ({ render, cleanup, fireEvent, waitFor, within } = await import('@testing-library/react'));
  server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  await seedCatalog(server); catalog = await server.ssrLoadModule('/src/catalog/index.ts');
  ({ default: NewArrivals } = await server.ssrLoadModule('/src/components/NewArrivals.tsx'));
  ({ PromotionsProvider } = await server.ssrLoadModule('/src/components/PromotionsContext.tsx'));
  originalFetch = globalThis.fetch;
});
afterEach(() => { cleanup(); globalThis.fetch = originalFetch; });
after(async () => { dom.window.close(); await server?.close(); });

test('nouveautés : badge sur la photo, prix adaptés et disparition après la promotion', async () => {
  const [bike, helmet, part] = [catalog.motorcycles[0], catalog.helmets[0], catalog.spareParts[0]];
  const old = catalog.products.map((product) => product.isNewArrival);
  const campaign = { id: 'offre', name: 'Offre', description: '', startDate: '2020-01-01', endDate: '2099-12-31', enabled: true, published: true, products: [
    { productId: bike.id, categoryId: bike.categoryId, originalPrice: 5003, discountPercent: 20 },
    { productId: helmet.id, categoryId: helmet.categoryId, originalPrice: 1000000000000, discountPercent: 20 },
  ] };
  let active = true;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ campaigns: active ? [campaign] : [], serverTime: new Date().toISOString() }) });
  try {
    catalog.products.forEach((product) => { product.isNewArrival = [bike, helmet, part].includes(product); });
    const calls = [];
    const view = render(React.createElement(PromotionsProvider, null, React.createElement(NewArrivals, { go: (...args) => calls.push(args) })));
    await waitFor(() => assert.equal(view.getAllByLabelText('Réduction de 20 %').length, 2));
    function card(product) { return view.getByRole('heading', { name: product.name }).closest('article'); }
    for (const product of [bike, helmet]) {
      const article = card(product);
      const badge = within(article).getByLabelText('Réduction de 20 %');
      const imageButton = within(article).getByRole('button', { name: new RegExp(product.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) });
      assert.equal(badge.closest('button'), imageButton);
      assert.ok(badge.classList.contains('absolute') && badge.classList.contains('right-3') && badge.classList.contains('top-3'));
      assert.equal((article.textContent.match(/20 %/g) || []).length, 1, 'le pourcentage ne doit pas être répété en bas');
      const footer = article.querySelector('del').closest('div').parentElement;
      assert.ok(footer.classList.contains('flex-wrap'), 'les prix longs et le bouton peuvent se réorganiser');
      assert.ok(article.querySelector('del').parentElement.className.includes('flex-wrap'));
    }
    assert.match(card(bike).textContent.replace(/\s/g, ''), /5003Ar/);
    assert.match(card(bike).textContent.replace(/\s/g, ''), /4002Ar/);
    assert.match(card(helmet).textContent.replace(/\s/g, ''), /800000000000Ar/);
    assert.equal(within(card(part)).queryByLabelText('Réduction de 20 %'), null);
    assert.match(card(part).textContent, /Sur devis/);
    fireEvent.click(within(card(bike)).getByRole('button', { name: /Découvrir/i }));
    assert.deepEqual(calls.pop(), ['product', bike.id]);
    fireEvent.click(within(card(helmet)).getByRole('button', { name: /Découvrir/i }));
    assert.deepEqual(calls.pop(), ['accessory', helmet.id]);
    active = false;
    fireEvent(document, new window.Event('visibilitychange'));
    await waitFor(() => assert.equal(view.queryByLabelText('Réduction de 20 %'), null));
    assert.match(card(bike).textContent, /Sur devis/);
    assert.equal(card(bike).querySelector('del'), null);
    assert.match(card(helmet).textContent, /Sur devis/);
  } finally { catalog.products.forEach((product, index) => { product.isNewArrival = old[index]; }); }
});
