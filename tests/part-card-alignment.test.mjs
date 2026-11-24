import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { seedCatalog } from './helpers/catalog.mjs';

let dom, server, PartCard, base, render, cleanup, fireEvent, within;
before(async () => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  ({ render, cleanup, fireEvent, within } = await import('@testing-library/react'));
  server = await createServer({ server: { middlewareMode: true }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] }, logLevel: 'silent' });
  await seedCatalog(server);
  const catalog = await server.ssrLoadModule('/src/catalog/index.ts');
  base = catalog.ridingGear[0];
  ({ PartCard } = await server.ssrLoadModule('/src/components/Cards.tsx'));
});
after(() => { cleanup(); dom.window.close(); return server?.close(); });

test('cartes équipements : titres courts et longs, prix et actions restent dans une disposition alignée', () => {
  const parts = [
    { ...base, id: 'court', name: 'Pantalon', price: 'Sur devis' },
    { ...base, id: 'long', name: 'Pantalon cross avec un nom de produit particulièrement long', price: 'Sur devis' },
    { ...base, id: 'prix-long', name: 'Maillot', price: 'Tarif à confirmer auprès de notre équipe' },
  ];
  const calls = [];
  const view = render(React.createElement('div', null, parts.map((part) => React.createElement(PartCard, { key: part.id, part, go: (...args) => calls.push(args), onEnquire: (item) => calls.push(['contact', item.id]) }))));
  const cards = view.container.querySelectorAll('article');
  assert.equal(cards.length, parts.length);
  cards.forEach((card, index) => {
    const title = card.querySelector('h3');
    const price = [...card.querySelectorAll('p')].find((p) => p.textContent === parts[index].price);
    assert.ok(card.classList.contains('flex') && card.classList.contains('flex-col'));
    assert.ok(title.parentElement.parentElement.classList.contains('flex-1'));
    assert.ok(title.classList.contains('line-clamp-2') && title.classList.contains('min-h-10'));
    assert.ok(title.classList.contains('[overflow-wrap:anywhere]'));
    assert.ok(price.classList.contains('mt-auto') && price.classList.contains('[overflow-wrap:anywhere]'));
    assert.equal(title.textContent, parts[index].name);
    fireEvent.click(within(card).getByRole('button', { name: parts[index].name }));
    assert.deepEqual(calls.at(-1), ['accessory', parts[index].id, parts[index].categoryId]);
    fireEvent.click(within(card).getByRole('button', { name: /Se renseigner/i }));
    assert.deepEqual(calls.at(-1), ['contact', parts[index].id]);
  });
  view.unmount();
});

test('une carte sans bouton de renseignement garde sa navigation', () => {
  const calls = [];
  const view = render(React.createElement(PartCard, { part: base, go: (...args) => calls.push(args) }));
  assert.equal(view.queryByRole('button', { name: /Se renseigner/i }), null);
  fireEvent.click(view.getByRole('button', { name: base.name }));
  assert.deepEqual(calls[0], ['accessory', base.id, base.categoryId]);
  view.unmount();
});
