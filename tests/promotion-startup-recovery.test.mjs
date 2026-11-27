import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import React from 'react';
import { createServer } from 'vite';

const files = {
  'brands.php': ['brands.json', 'brands'], 'categories.php': ['categories.json', 'categories'],
  'families.php': ['families.json', 'families'], 'product-types.php': ['product-types.json', 'productTypes'],
  'models.php': ['models.json', 'models'], 'contacts.php': ['contacts.json', 'contact'],
  'products/motorcycles.php': ['products/motorcycles.json', 'products'], 'products/helmets.php': ['products/helmets.json', 'products'],
  'products/riding-gear.php': ['products/riding-gear.json', 'products'], 'products/spare-parts.php': ['products/spare-parts.json', 'products'],
};
const raw = Object.fromEntries(Object.entries(files).map(([path, [file, key]]) => [path, JSON.parse(readFileSync(`server/storage/data/${file}`, 'utf8'))[key]]));
const brandIds = new Set(raw['brands.php'].filter(b => b.isPublished !== false).map(b => b.id));
const part = raw['products/spare-parts.php'].find(p => p.status === 'PUBLISHED' && brandIds.has(p.brandId));
const campaign = { id: 'active', name: 'Promo pièce', startDate: '2020-01-01', endDate: '2099-12-31', enabled: true, published: true, products: [{ productId: part.id, categoryId: part.categoryId, originalPrice: 1000, discountPercent: 10 }] };
const response = value => ({ ok: true, status: 200, json: async () => value });
const catalogResponse = path => {
  const key = files[path][1]; let value = structuredClone(raw[path]);
  if (path === 'brands.php') value = value.filter(b => b.isPublished !== false);
  if (path.startsWith('products/')) value = value.filter(p => p.status === 'PUBLISHED' && brandIds.has(p.brandId));
  return response({ [path.startsWith('products/') ? 'data' : key]: value });
};

test('promotion prioritaire : panneau et menu avant catalogue, cartes ensuite sans recharger', async () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, SVGElement: dom.window.SVGElement, IS_REACT_ACT_ENVIRONMENT: true });
  globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  const { render, cleanup, waitFor, act, fireEvent } = await import('@testing-library/react');
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  const originalFetch = globalThis.fetch; let releaseParts; let promoRequests = 0, partWaiting = false;
  const gate = new Promise(resolve => { releaseParts = resolve; });
  globalThis.fetch = async url => {
    const path = String(url).replace('/server/api/', '');
    if (path === 'promotions.php') { promoRequests++; return response({ campaigns: [campaign], serverTime: new Date().toISOString() }); }
    if (path === 'products/spare-parts.php') { partWaiting = true; await gate; }
    if (files[path]) return catalogResponse(path);
    return { ok: false, status: 404 };
  };
  try {
    const catalog = await server.ssrLoadModule('/src/catalog/loadServerData.ts');
    const initial = await catalog.loadInitialCatalog('/');
    const pending = catalog.startBackgroundCatalog(initial);
    const { PromotionsProvider } = await server.ssrLoadModule('/src/components/PromotionsContext.tsx');
    const { HomePromotionSign } = await server.ssrLoadModule('/src/components/HomePromotionSign.tsx');
    const { Header } = await server.ssrLoadModule('/src/components/Layout.tsx');
    const { default: Promotions } = await server.ssrLoadModule('/src/pages/Promotions.tsx');
    const view = render(React.createElement(PromotionsProvider, null,
      React.createElement(Header, { route: { page: 'home' }, go() {}, dark: false, toggle() {} }),
      React.createElement(HomePromotionSign, { go() {} }),
      React.createElement(Promotions, { go() {} })));
    await waitFor(() => assert.ok(partWaiting));
    await view.findByRole('link', { name: 'Promotions' });
    await view.findByRole('link', { name: /Voir les promotions/ });
    assert.ok(view.getByRole('status').textContent.includes('Chargement de la page'));
    assert.equal(promoRequests, 1);
    await act(async () => { releaseParts(); await pending; });
    await waitFor(() => assert.ok(view.getByRole('region', { name: 'Produits en promotion' }).querySelector('article')));
    assert.equal(promoRequests, 1, 'le catalogue prêt ne relance pas la requête promotions');
    fireEvent.click(view.getByRole('link', { name: /Voir les promotions/ }));
  } finally { releaseParts(); cleanup(); globalThis.fetch = originalFetch; dom.window.close(); await server.close(); }
});

test('504 temporaire : réessai automatique partagé, sans rechargement ni requêtes simultanées', async () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, SVGElement: dom.window.SVGElement, IS_REACT_ACT_ENVIRONMENT: true });
  globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  const { render, cleanup, waitFor, act, fireEvent } = await import('@testing-library/react');
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  const originalFetch = globalThis.fetch, setIntervalOriginal = window.setInterval.bind(window), clearIntervalOriginal = window.clearInterval.bind(window);
  let tick, attempts = 0, release; const gate = new Promise(resolve => { release = resolve; });
  window.setInterval = (fn, ms, ...args) => ms === 30000 ? (tick = fn, -42) : setIntervalOriginal(fn, ms, ...args);
  window.clearInterval = id => id === -42 ? undefined : clearIntervalOriginal(id);
  globalThis.fetch = async url => {
    if (!String(url).includes('promotions.php')) return { ok: false, status: 404 };
    attempts++;
    if (attempts <= 3) return { ok: false, status: 504 };
    await gate;
    return response({ campaigns: [campaign], serverTime: new Date().toISOString() });
  };
  try {
    const { PromotionsProvider } = await server.ssrLoadModule('/src/components/PromotionsContext.tsx');
    const { HomePromotionSign } = await server.ssrLoadModule('/src/components/HomePromotionSign.tsx');
    const { Header } = await server.ssrLoadModule('/src/components/Layout.tsx');
    const { default: Promotions } = await server.ssrLoadModule('/src/pages/Promotions.tsx');
    const view = render(React.createElement(PromotionsProvider, null,
      React.createElement(Header, { route: { page: 'home' }, go() {}, dark: false, toggle() {} }),
      React.createElement(HomePromotionSign, { go() {} }), React.createElement(Promotions, { go() {} })));
    await view.findByRole('alert', {}, { timeout: 6000 });
    assert.equal(attempts, 3, 'les deux nouveaux essais 504 restent bornés');
    await act(async () => { tick(); });
    await waitFor(() => assert.equal(attempts, 4));
    assert.ok(view.getByRole('status').textContent.includes('Chargement de la page'));
    fireEvent(window, new window.Event('online')); fireEvent(document, new window.Event('visibilitychange'));
    assert.equal(attempts, 4, 'les événements simultanés ne lancent pas d’autres lectures');
    await act(async () => release());
    await view.findByRole('link', { name: 'Promotions' });
    await view.findByRole('link', { name: /Voir les promotions/ });
    assert.equal(attempts, 4);
  } finally { release(); cleanup(); window.setInterval = setIntervalOriginal; window.clearInterval = clearIntervalOriginal; globalThis.fetch = originalFetch; dom.window.close(); await server.close(); }
});

test('catalogue complémentaire : reprise automatique temporisée après erreur, un seul lot', async () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element });
  const { waitFor } = await import('@testing-library/react');
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  const originalFetch = globalThis.fetch, originalRandom = Math.random;
  const originalTimeout = window.setTimeout.bind(window), originalClear = window.clearTimeout.bind(window);
  let retry, retryDelay, failing = true, failedReads = 0;
  Math.random = () => 0;
  window.setTimeout = (fn, delay, ...args) => delay >= 30000 ? (retry = fn, retryDelay = delay, 77777) : originalTimeout(fn, delay, ...args);
  window.clearTimeout = id => id === 77777 ? undefined : originalClear(id);
  globalThis.fetch = async url => {
    const path = String(url).replace('/server/api/', '');
    if (path === 'products/riding-gear.php' && failing) { failedReads++; return { ok: false, status: 500 }; }
    if (files[path]) return catalogResponse(path);
    return { ok: false, status: 404 };
  };
  try {
    const catalog = await server.ssrLoadModule('/src/catalog/loadServerData.ts');
    const initial = await catalog.loadInitialCatalog('/');
    const first = catalog.startBackgroundCatalog(initial);
    assert.strictEqual(first, catalog.startBackgroundCatalog(initial), 'un seul lot en cours');
    await assert.rejects(first);
    assert.equal(catalog.getBackgroundStatus(), 'error'); assert.equal(failedReads, 1);
    assert.equal(retryDelay, 30000);
    failing = false; retry();
    await waitFor(() => assert.equal(catalog.getBackgroundStatus(), 'ready'));
  } finally { globalThis.fetch = originalFetch; Math.random = originalRandom; window.setTimeout = originalTimeout; window.clearTimeout = originalClear; dom.window.close(); await server.close(); }
});
