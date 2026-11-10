import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { seedCatalog } from './helpers/catalog.mjs';

let dom, server, catalog, Catalogue, shuffleMotorcycles, render, cleanup, fireEvent, waitFor;
before(async () => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Element = dom.window.Element; globalThis.SVGElement = dom.window.SVGElement; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window); globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} }); window.scrollTo = () => {};
  globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  ({ render, cleanup, fireEvent, waitFor } = await import('@testing-library/react'));
  server = await createServer({ server: { middlewareMode: true }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] }, logLevel: 'silent' });
  await seedCatalog(server);
  catalog = await server.ssrLoadModule('/src/catalog/index.ts');
  ({ Catalogue } = await server.ssrLoadModule('/src/pages/Catalog.tsx'));
  ({ shuffleMotorcycles } = await server.ssrLoadModule('/src/lib/shuffleMotorcycles.ts'));
});
after(() => { cleanup(); dom.window.close(); return server?.close(); });

test('mélange sans modifier les données et évite une première page identique au retour', () => {
  const bikes = Array.from({ length: 13 }, (_, i) => ({ ...catalog.motorcycles[0], id: `test-${i}` }));
  const previous = bikes.map((bike) => bike.id);
  const shuffled = shuffleMotorcycles(bikes, previous, 6, () => 0.999999);
  assert.deepEqual(bikes.map((bike) => bike.id), previous);
  assert.deepEqual(new Set(shuffled.map((bike) => bike.id)), new Set(previous));
  assert.notDeepEqual(new Set(shuffled.slice(0, 6).map((bike) => bike.id)), new Set(previous.slice(0, 6)));
  const small = bikes.slice(0, 4);
  assert.notDeepEqual(shuffleMotorcycles(small, previous.slice(0, 4), 6, () => 0.999999).map((bike) => bike.id), previous.slice(0, 4));
  assert.deepEqual(shuffleMotorcycles([], [], 6), []);
  assert.deepEqual(shuffleMotorcycles(small.slice(0, 1), [small[0].id], 6), small.slice(0, 1));
});

test('page motos : cartes alignées, pagination stable, recherche, filtres et nouveau mélange au retour', async () => {
  const original = [...catalog.motorcycles];
  const a = original[0];
  const b = original.find((bike) => catalog.getProductFamily(bike)?.id !== catalog.getProductFamily(a)?.id);
  assert.ok(b, 'deux familles disponibles pour tester le filtre');
  const bikes = Array.from({ length: 13 }, (_, i) => ({ ...(i % 2 ? b : a), id: `random-bike-${i}`, name: `Moto test ${String(i).padStart(2, '0')}`, status: 'PUBLISHED', price: i === 0 ? 'Tarif à confirmer auprès de notre équipe' : 'Sur devis' }));
  bikes[0].name = 'Moto uniquezz00';
  catalog.motorcycles.splice(0, catalog.motorcycles.length, ...bikes, { ...a, id: 'draft-bike', name: 'Brouillon secret', status: 'DRAFT' });
  const calls = [];
  const cards = (view) => [...view.container.querySelectorAll('article')];
  const names = (view) => cards(view).map((card) => card.querySelector('h3').textContent);
  try {
    const view = render(React.createElement(Catalogue, { motosOnly: true, go: (...args) => calls.push(args) }));
    await waitFor(() => assert.equal(cards(view).length, 6), { timeout: 5000 });
    const first = names(view);
    cards(view).forEach((card) => {
      const title = card.querySelector('h3');
      const button = [...card.querySelectorAll('button')].find((item) => item.textContent.includes('Découvrir'));
      assert.ok(button.parentElement.classList.contains('mt-auto'));
      assert.ok(button.parentElement.classList.contains('items-center'), 'prix centré verticalement');
      assert.ok(button.classList.contains('self-end'), 'bouton ancré en bas de la carte');
      assert.ok(!title.classList.contains('line-clamp-2'), 'le nom complet reste visible');
      assert.ok(button.parentElement.querySelector('span').classList.contains('min-w-0'));
    });
    fireEvent.click([...cards(view)[0].querySelectorAll('button')].find((item) => item.textContent.includes('Découvrir')));
    assert.equal(calls[0][0], 'product');
    assert.equal(bikes.find((bike) => bike.name === first[0]).id, calls[0][1]);
    fireEvent.click(view.getByRole('button', { name: 'Page 2' }));
    await waitFor(() => { assert.equal(cards(view).length, 6); assert.ok(names(view).every((name) => !first.includes(name))); }, { timeout: 5000 });
    const second = names(view);
    fireEvent.click(view.getByRole('button', { name: 'Page 3' }));
    await waitFor(() => assert.equal(cards(view).length, 1), { timeout: 5000 });
    const third = names(view);
    assert.equal(new Set([...first, ...second, ...third]).size, 13);
    fireEvent.click(view.getByRole('button', { name: 'Page 1' }));
    await waitFor(() => assert.deepEqual(names(view), first), { timeout: 5000 });
    const search = view.getByRole('textbox', { name: 'Rechercher dans le catalogue' });
    fireEvent.change(search, { target: { value: 'uniquezz00' } });
    await waitFor(() => assert.deepEqual(names(view), ['Moto uniquezz00']), { timeout: 5000 });
    fireEvent.change(search, { target: { value: '' } });
    await waitFor(() => assert.deepEqual(names(view), first), { timeout: 5000 });
    const family = catalog.getProductFamily(a);
    fireEvent.click(view.getByRole('button', { name: family.name }));
    await waitFor(() => {
      const shown = names(view);
      assert.ok(shown.length > 0 && shown.every((name) => bikes.some((bike) => bike.name === name && catalog.getProductFamily(bike)?.id === family.id)));
    }, { timeout: 5000 });
    fireEvent.click(view.getByRole('button', { name: 'Tous' }));
    await waitFor(() => assert.deepEqual(names(view), first), { timeout: 5000 });
    view.unmount();
    const returned = render(React.createElement(Catalogue, { motosOnly: true, go() {} }));
    await waitFor(() => assert.equal(cards(returned).length, 6), { timeout: 5000 });
    assert.notDeepEqual(new Set(names(returned)), new Set(first), 'la première page change après avoir quitté puis rouvert');
    assert.deepEqual(catalog.motorcycles.map((bike) => bike.id), [...bikes.map((bike) => bike.id), 'draft-bike']);
    returned.unmount();
  } finally { catalog.motorcycles.splice(0, catalog.motorcycles.length, ...original); }
});
