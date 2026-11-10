import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { seedCatalog } from './helpers/catalog.mjs';

let dom, server, App, render, cleanup, waitFor, fireEvent;
before(async () => {
  dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'http://localhost/motos', pretendToBeVisual: true });
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.Image = dom.window.Image; globalThis.Element = dom.window.Element; globalThis.HTMLElement = dom.window.HTMLElement; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
  window.scrollTo = () => {}; window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  ({ render, cleanup, waitFor, fireEvent } = await import('@testing-library/react'));
  server = await createServer({ server: { middlewareMode: true }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] }, logLevel: 'silent', plugins: [{ name: 'simulate-page-failure', enforce: 'pre', transform(code, id) { if (id.endsWith('/src/pages/Catalog.tsx')) return 'throw new Error("chargement simulé"); export const Catalogue = null, Equipements = null, Spares = null;'; } }] });
  await seedCatalog(server);
  ({ default: App } = await server.ssrLoadModule('/src/App.tsx'));
});
after(async () => { cleanup(); dom.window.close(); await server.close(); });

test('une page indisponible propose une actualisation et la navigation reste possible', async () => {
  window.localStorage.setItem('funbike-cookie-consent', 'necessary');
  const view = render(React.createElement(App));
  await waitFor(() => assert.match(view.getByRole('alert').textContent, /Impossible de charger cette page/));
  assert.ok(view.getByRole('button', { name: 'actualisez la page' }));
  fireEvent.click(view.getAllByRole('link', { name: /Accueil/i })[0]);
  await waitFor(() => assert.match(view.container.textContent, /Le terrain est votre point de départ/));
  assert.equal(view.queryByRole('alert'), null);
  view.unmount();
});
