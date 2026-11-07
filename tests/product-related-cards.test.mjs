import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { seedCatalog } from './helpers/catalog.mjs';

let dom, server, catalog, Product, render, cleanup, fireEvent, within;
before(async () => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  ({ render, cleanup, fireEvent, within } = await import('@testing-library/react'));
  server = await createServer({ server: { middlewareMode: true }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] }, logLevel: 'silent' });
  await seedCatalog(server);
  catalog = await server.ssrLoadModule('/src/catalog/index.ts');
  ({ default: Product } = await server.ssrLoadModule('/src/pages/Product.tsx'));
});
after(() => { cleanup(); dom.window.close(); return server?.close(); });

test('cartes similaires : titres et descriptions limités, actions alignées et navigation conservée', () => {
  const originals = structuredClone(catalog.motorcycles);
  const current = catalog.motorcycles.find((item) => item.id === 'offroad-450');
  const family = catalog.getProductFamily(current);
  const related = catalog.motorcycles.filter((item) => item.id !== current.id && catalog.getProductFamily(item)?.id === family.id && item.status === 'PUBLISHED').slice(0, 4);
  assert.equal(related.length, 4);
  try {
    related[0].name = 'Moto'; related[0].description = '';
    related[1].name = 'Moto avec un nom très long '.repeat(5); related[1].description = 'Description longue pour cette moto. '.repeat(20);
    related[2].description = 'motparticulièrementlongsansespaces'.repeat(30);
    related[3].price = 'Tarif à confirmer auprès de notre équipe';
    const calls = [];
    const view = render(React.createElement(Product, { id: current.id, go: (...args) => calls.push(args), back() {}, canGoBack: false, backLabel: '' }));
    const section = view.getByText('Dans le même esprit').closest('section');
    const cards = [...section.querySelectorAll('article')];
    assert.equal(cards.length, 4);
    cards.forEach((card, i) => {
      const heading = card.querySelector('h3');
      const description = [...card.querySelectorAll('p')].find((element) => element.classList.contains('fluid-body'));
      const button = within(card).getByRole('button', { name: /Découvrir/ });
      assert.equal(heading.textContent, related[i].name);
      assert.ok(heading.classList.contains('line-clamp-2'));
      assert.ok(heading.classList.contains('min-h-[2.1em]'));
      assert.equal(description.textContent, related[i].description, 'la description complète est préservée');
      assert.ok(description.classList.contains('line-clamp-2'));
      assert.ok(description.classList.contains('min-h-[3.2em]'));
      assert.ok(description.classList.contains('[overflow-wrap:anywhere]'));
      assert.ok(button.parentElement.classList.contains('mt-auto'));
      assert.ok(button.parentElement.classList.contains('items-end'));
      assert.ok(button.classList.contains('whitespace-nowrap'));
      fireEvent.click(button);
      assert.deepEqual(calls.at(-1), ['product', related[i].id]);
    });
    assert.equal(catalog.motorcycles.find((item) => item.id === related[1].id).description, related[1].description);
    view.unmount();
  } finally { catalog.motorcycles.splice(0, catalog.motorcycles.length, ...originals); }
});
