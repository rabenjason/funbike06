import { after, afterEach, before, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

let dom, server, render, fireEvent, waitFor, cleanup, AdminOpenings, Admin, recordSiteOpening, calls, oldFetch;
before(async () => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.HTMLElement = dom.window.HTMLElement; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  ({ render, fireEvent, waitFor, cleanup } = await import('@testing-library/react'));
  server = await createServer({ server: { middlewareMode: true }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
  ({ AdminOpenings } = await server.ssrLoadModule('/src/pages/AdminOpenings.tsx'));
  ({ default: Admin } = await server.ssrLoadModule('/src/pages/Admin.tsx'));
  ({ recordSiteOpening } = await server.ssrLoadModule('/src/lib/openings.ts'));
  oldFetch = globalThis.fetch;
});
afterEach(() => cleanup());
after(async () => { globalThis.fetch = oldFetch; dom.window.close(); await server.close(); });

test('compteur inactif par défaut, sans identifiant ni cookies, une seule tentative par chargement', async () => {
  calls = [];
  const send = async (...args) => { calls.push(args); return { ok: true }; };
  recordSiteOpening(false, send); assert.equal(calls.length, 0);
  recordSiteOpening(true, send); recordSiteOpening(true, send);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], '/server/api/openings.php');
  assert.equal(calls[0][1].method, 'POST');
  assert.equal(calls[0][1].credentials, 'omit'); assert.equal(calls[0][1].referrerPolicy, 'no-referrer');
  assert.equal(calls[0][1].body, undefined);
});

test('statistiques mensuelles, annuelles, données manquantes et état désactivé', async () => {
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ enabled: false, currentMonth: '2026-11', months: [{ month: '2026-01', count: 4 }, { month: '2026-02', count: 7 }, { month: '2025-12', count: 12 }] }) });
  const view = render(React.createElement(AdminOpenings));
  await waitFor(() => assert.match(view.container.textContent, /Comptage désactivé/));
  assert.match(view.container.textContent, /pas des visiteurs uniques/);
  assert.match(view.container.textContent, /Total des mois enregistrés :\s*11/);
  assert.equal(view.getAllByText('—').length, 10);
  fireEvent.change(view.getByLabelText('Année des statistiques'), { target: { value: '2025' } });
  assert.match(view.container.textContent, /Total des mois enregistrés :\s*12/);
  assert.equal(view.getAllByText('—').length, 11);
});

test('erreur serveur visible, sans inventer de nombres', async () => {
  globalThis.fetch = async () => ({ ok: false, json: async () => ({ message: 'Statistiques indisponibles.' }) });
  const view = render(React.createElement(AdminOpenings));
  await waitFor(() => assert.match(view.getByRole('alert').textContent, /indisponibles/));
  assert.ok(view.getByText('Réessayer')); assert.equal(view.queryByText(/Total des mois enregistrés/), null);
});


test('l’onglet Statistiques est accessible dans l’administration sans collecte publique', async () => {
  calls = [];
  globalThis.fetch = async (url, options = {}) => {
    const path = String(url).replace('/server/api/', ''); calls.push({ path, method: options.method || 'GET' });
    const fixed = { 'auth/me.php': { user: { id: 'admin', username: 'admin', role: 'admin', mustChangePassword: false } }, 'brands.php?includeDrafts=1': { brands: [] }, 'categories.php': { categories: [] }, 'families.php': { families: [] }, 'product-types.php': { productTypes: [] }, 'models.php?includeDrafts=1': { models: [] }, 'products/motorcycles.php?includeDrafts=1': { data: [] }, 'products/helmets.php?includeDrafts=1': { data: [] }, 'products/riding-gear.php?includeDrafts=1': { data: [] }, 'products/spare-parts.php?includeDrafts=1': { data: [] }, 'openings.php': { enabled: false, currentMonth: '2026-11', months: [] }, 'messages.php?count=unread': { unreadCount: 0 } };
    return fixed[path] ? { ok: true, json: async () => fixed[path] } : { ok: false, json: async () => ({ message: 'Route inconnue' }) };
  };
  const view = render(React.createElement(Admin));
  await waitFor(() => assert.ok(view.getByRole('button', { name: 'Statistiques' })));
  fireEvent.click(view.getByRole('button', { name: 'Statistiques' }));
  await waitFor(() => assert.match(view.container.textContent, /Comptage désactivé sur le serveur/));
  assert.ok(calls.some((call) => call.path === 'openings.php' && call.method === 'GET'));
  assert.ok(!calls.some((call) => call.path === 'openings.php' && call.method === 'POST'));
});
