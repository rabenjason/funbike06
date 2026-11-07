import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { seedCatalog } from './helpers/catalog.mjs';

let dom, server, routes, catalog, App, render, cleanup, fireEvent, waitFor;
before(async () => {
  dom = new JSDOM('<!doctype html><html><head><link rel="canonical" href="https://funbike.mg/motos/tvs-hlx-plus"></head><body></body></html>', { url: 'http://localhost/motos/tvs-hlx-plus', pretendToBeVisual: true });
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.Image = dom.window.Image; globalThis.Element = dom.window.Element; globalThis.HTMLElement = dom.window.HTMLElement; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
  window.scrollTo = () => {}; window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  ({ render, cleanup, fireEvent, waitFor } = await import('@testing-library/react'));
  server = await createServer({ server: { middlewareMode: true }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
  await seedCatalog(server);
  catalog = await server.ssrLoadModule('/src/catalog/index.ts'); routes = await server.ssrLoadModule('/src/lib/routes.ts');
  ({ default: App } = await server.ssrLoadModule('/src/App.tsx'));
});
after(async () => { cleanup(); dom.window.close(); await server?.close(); });

test('adresses directes, identifiants immuables et filtres', () => {
  const bike = catalog.motorcycles.find((p) => p.id === 'tvs-hlx-plus');
  assert.equal(routes.productPath(bike), '/motos/tvs-hlx-plus');
  assert.deepEqual(routes.parseRoute('/motos/tvs-hlx-plus/'), { page: 'product', id: 'tvs-hlx-plus', categoryId: 'motos' });
  assert.deepEqual(routes.parseRoute('/motos/tvs-hlx-plus/inexistant'), { page: 'not-found' });
  assert.deepEqual(routes.parseRoute('/motos/inconnu'), { page: 'not-found' });
  assert.equal(routes.routePath({ page: 'equipements', id: 'tvs' }), '/equipements?marque=tvs');
  assert.deepEqual(routes.parseRoute('/equipements', '?marque=tvs'), { page: 'equipements', id: 'tvs' });
  const old = bike.name;
  try { bike.name = 'Nom modifié'; assert.equal(routes.productPath(bike), '/motos/tvs-hlx-plus'); } finally { bike.name = old; }
  for (const product of catalog.products) assert.equal(routes.parseRoute(routes.productPath(product)).id, product.id);
  const helmet = catalog.products.find((p) => p.categoryId === 'casques');
  const gear = catalog.products.find((p) => p.categoryId === 'equipements');
  const oldId = gear.id;
  try {
    gear.id = helmet.id;
    assert.notEqual(routes.productPath(helmet), routes.productPath(gear));
    assert.equal(routes.parseRoute(routes.productPath(helmet)).categoryId, 'casques');
    assert.equal(routes.parseRoute(routes.productPath(gear)).categoryId, 'equipements');
    assert.equal(routes.routePath({ page: 'accessory', id: gear.id, categoryId: 'equipements' }), routes.productPath(gear));
  } finally { gear.id = oldId; }
});

test('entrée directe, liens, historique navigateur et balises pendant la navigation', async () => {
  window.localStorage.setItem('funbike-cookie-consent', 'necessary');
  const view = render(React.createElement(App));
  await waitFor(() => assert.match(view.container.textContent, /TVS HLX Plus/));
  await waitFor(() => assert.equal(document.title, 'TVS HLX Plus | Funbike Madagascar'));
  assert.equal(document.querySelector('link[rel="canonical"]').href, 'https://funbike.mg/motos/tvs-hlx-plus');
  const motoLinks = view.getAllByRole('link', { name: 'Motos' });
  fireEvent.click(motoLinks[0]);
  assert.equal(window.location.pathname, '/motos');
  await waitFor(() => assert.equal(document.title, 'Motos à Madagascar | Funbike'));
  assert.equal(document.querySelector('link[rel="canonical"]').href, 'https://funbike.mg/motos');
  window.history.back();
  await waitFor(() => assert.equal(window.location.pathname, '/motos/tvs-hlx-plus'));
  await waitFor(() => assert.equal(document.title, 'TVS HLX Plus | Funbike Madagascar'));
  window.history.forward();
  await waitFor(() => assert.equal(window.location.pathname, '/motos'));
  view.unmount();
});
