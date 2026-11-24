import { after, afterEach, before, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

let dom, server, readAdmin, readAdminCatalog, request, Admin, render, fireEvent, waitFor, cleanup, oldFetch;
const success = (value) => new Response(JSON.stringify(value), { status: 200, headers: { 'Content-Type': 'application/json' } });
const outage = (status = 504) => new Response('<html>Gateway error</html>', { status });
before(async () => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/admin' });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, SVGElement: dom.window.SVGElement, IS_REACT_ACT_ENVIRONMENT: true });
  ({ render, fireEvent, waitFor, cleanup } = await import('@testing-library/react'));
  server = await createServer({ server: { middlewareMode: true }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] }, logLevel: 'silent' });
  ({ readAdmin, readAdminCatalog } = await server.ssrLoadModule('/src/lib/adminRead.ts'));
  ({ request } = await server.ssrLoadModule('/src/lib/adminApi.ts'));
  ({ default: Admin } = await server.ssrLoadModule('/src/pages/Admin.tsx'));
  oldFetch = globalThis.fetch;
});
afterEach(() => { cleanup(); globalThis.fetch = oldFetch; });
after(async () => { dom.window.close(); await server.close(); });

test('les lectures du catalogue sont limitées à trois et un 504 temporaire est réessayé', async () => {
  let active = 0, peak = 0; const counts = {};
  globalThis.fetch = async (url, options) => {
    const path = String(url).replace('/server/api/', '');
    assert.ok(!options.method || options.method === 'GET');
    counts[path] = (counts[path] || 0) + 1;
    active++; peak = Math.max(peak, active); await new Promise(resolve => setTimeout(resolve, 15)); active--;
    return path === 'models.php' && counts[path] < 3 ? outage() : success({ path });
  };
  const values = await readAdminCatalog(['a.php', 'b.php', 'models.php', 'c.php', 'd.php', 'e.php']);
  assert.equal(peak, 3); assert.equal(counts['models.php'], 3);
  assert.deepEqual(values.map(v => v.path), ['a.php', 'b.php', 'models.php', 'c.php', 'd.php', 'e.php']);
});

test('échec définitif donne le statut et le nom sans exposer les paramètres', async () => {
  let count = 0; globalThis.fetch = async () => { count++; return outage(); };
  await assert.rejects(readAdmin('models.php?includeDrafts=1'), /504.*models\.php\.$/);
  assert.equal(count, 3);
  globalThis.fetch = async () => new Response('<html>erreur</html>', { status: 200 });
  await assert.rejects(readAdmin('models.php?includeDrafts=1'), /invalide \(200\).*models\.php\.$/);
});

test('les écritures en erreur ne sont jamais réessayées', async () => {
  for (const method of ['POST', 'PUT', 'DELETE']) {
    let count = 0; globalThis.fetch = async () => { count++; return outage(); };
    await assert.rejects(request('products/motorcycles.php', { method }));
    assert.equal(count, 1, method);
  }
});

test('la liste ne paraît pas vide lors d’une panne et revient après réessai', async () => {
  let fail = true, modelCalls = 0;
  const fixed = {
    'auth/me.php': { user: { id: 'admin', username: 'admin', role: 'admin', mustChangePassword: false } },
    'messages.php?count=unread': { unreadCount: 0 },
    'brands.php?includeDrafts=1': { brands: [{ id: 'b', name: 'Marque' }] },
    'categories.php': { categories: [] }, 'families.php': { families: [] }, 'product-types.php': { productTypes: [] },
    'models.php?includeDrafts=1': { models: [] },
    'products/motorcycles.php?includeDrafts=1': { data: [{ id: 'm', name: 'Moto test', brandId: 'b', categoryId: 'motos', productTypeId: '', status: 'PUBLISHED', images: [], specifications: [], description: '' }] },
    'products/helmets.php?includeDrafts=1': { data: [] }, 'products/riding-gear.php?includeDrafts=1': { data: [] }, 'products/spare-parts.php?includeDrafts=1': { data: [] },
  };
  globalThis.fetch = async (url) => {
    const path = String(url).replace('/server/api/', '');
    if (path === 'models.php?includeDrafts=1') { modelCalls++; if (fail) return outage(); }
    return fixed[path] ? success(fixed[path]) : new Response('{}', { status: 404 });
  };
  const view = render(React.createElement(Admin));
  await waitFor(() => assert.ok(view.container.textContent.includes('Impossible de charger le catalogue')), { timeout: 6000 });
  assert.match(view.container.textContent, /504.*models\.php/);
  assert.ok(!view.container.textContent.includes('Aucun produit ne correspond'));
  assert.ok(!view.queryByRole('button', { name: '+ Ajouter un produit' }));
  assert.equal(modelCalls, 3);
  fail = false; fireEvent.click(view.getByRole('button', { name: 'Réessayer le chargement' }));
  await waitFor(() => assert.ok(view.container.textContent.includes('Moto test')), { timeout: 5000 });
  assert.ok(view.getByRole('button', { name: '+ Ajouter un produit' }));
});

test('une panne de session ne force pas la déconnexion et peut être réessayée', async () => {
  let fail = true, calls = 0;
  globalThis.fetch = async url => {
    const path = String(url).replace('/server/api/', '');
    if (path === 'auth/me.php') { calls++; return fail ? outage() : success({ user: null }); }
    return success({ unreadCount: 0 });
  };
  const view = render(React.createElement(Admin));
  await waitFor(() => assert.ok(view.container.textContent.includes('Impossible de vérifier la session')), { timeout: 5000 });
  assert.equal(calls, 3); assert.ok(!view.queryByRole('button', { name: 'Se connecter' }));
  fail = false; fireEvent.click(view.getByRole('button', { name: 'Réessayer' }));
  await waitFor(() => assert.ok(view.getByRole('button', { name: 'Se connecter' })));
});
