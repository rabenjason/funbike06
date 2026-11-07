import { after, afterEach, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

let server, Admin, render, fireEvent, waitFor, cleanup, within, dom, oldFetch;
let records, calls, failIds, failRefresh, inFlight, maxInFlight;
const user = { id: 'admin', username: 'admin', role: 'superadmin', mustChangePassword: false };
const bike = (n) => ({ id: `p-${n}`, name: `Moto ${n}`, categoryId: 'motos', productTypeId: 'urbain', brandId: 'tvs', status: 'PUBLISHED', description: '', images: [], specifications: [] });
const helmet = { ...bike(1), name: 'Casque 1', categoryId: 'casques', productTypeId: 'casque' };
const endpoints = { motos: 'motorcycles', casques: 'helmets', equipements: 'riding-gear', 'pieces-detachees': 'spare-parts' };
const tick = () => new Promise((resolve) => setTimeout(resolve, 1));

before(async () => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.HTMLElement = dom.window.HTMLElement; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  window.confirm = () => { throw new Error('Confirmation native interdite'); };
  ({ render, fireEvent, waitFor, cleanup, within } = await import('@testing-library/react'));
  server = await createServer({ server: { middlewareMode: true }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
  ({ default: Admin } = await server.ssrLoadModule('/src/pages/Admin.tsx'));
  oldFetch = globalThis.fetch;
});
beforeEach(() => {
  records = [...Array.from({ length: 12 }, (_, i) => bike(i + 1)), helmet];
  calls = []; failIds = new Set(); failRefresh = false; inFlight = 0; maxInFlight = 0;
  globalThis.fetch = async (url, options = {}) => {
    const path = String(url).replace('/server/api/', '');
    const method = options.method ?? 'GET';
    calls.push({ path, method });
    if (method === 'DELETE') {
      inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
      await tick(); inFlight--;
      const [endpoint, query] = path.split('?');
      const category = Object.keys(endpoints).find((key) => `products/${endpoints[key]}.php` === endpoint);
      const id = new URLSearchParams(query).get('id');
      if (failIds.has(`${category}:${id}`)) return { ok: false, json: async () => ({ message: 'Suppression refusée' }) };
      records = records.filter((p) => !(p.categoryId === category && p.id === id));
      return { ok: true, json: async () => ({ success: true }) };
    }
    if (failRefresh && path === 'brands.php') return { ok: false, json: async () => ({ message: 'Catalogue indisponible' }) };
    const fixed = {
      'auth/me.php': { user }, 'brands.php': { brands: [{ id: 'tvs', name: 'TVS' }] },
      'categories.php': { categories: [{ id: 'motos', name: 'Motos' }, { id: 'casques', name: 'Casques' }] },
      'families.php': { families: [] }, 'product-types.php': { productTypes: [] }, 'models.php': { models: [] },
    };
    const category = Object.keys(endpoints).find((key) => path === `products/${endpoints[key]}.php?includeDrafts=1`);
    const data = fixed[path] ?? (category ? { data: structuredClone(records.filter((p) => p.categoryId === category)) } : null);
    return { ok: !!data, json: async () => data ?? { error: 'Route inconnue' } };
  };
});
afterEach(() => cleanup());
after(async () => { globalThis.fetch = oldFetch; dom.window.close(); await server?.close(); });
async function open() {
  const view = render(React.createElement(Admin));
  await waitFor(() => assert.ok(view.getByText('Moto 1')));
  return view;
}
const deletes = () => calls.filter((call) => call.method === 'DELETE');

test('sélection par page et entre pages et filtres, avec annulation sans requête', async () => {
  const view = await open();
  const selectPage = view.getByRole('checkbox', { name: 'Sélectionner les produits de cette page' });
  fireEvent.click(view.getByRole('checkbox', { name: 'Sélectionner Moto 1' }));
  assert.equal(selectPage.indeterminate, true);
  fireEvent.click(selectPage);
  assert.match(view.container.textContent, /10 sélectionnés au total/);
  fireEvent.click(selectPage);
  assert.match(view.container.textContent, /0 sélectionné au total/);
  fireEvent.click(view.getByRole('checkbox', { name: 'Sélectionner Moto 1' }));
  fireEvent.click(view.getByRole('button', { name: 'Suivant' }));
  fireEvent.click(view.getByRole('checkbox', { name: 'Sélectionner Moto 11' }));
  fireEvent.change(view.getByLabelText('Catégorie'), { target: { value: 'casques' } });
  fireEvent.click(view.getByRole('checkbox', { name: 'Sélectionner Casque 1' }));
  assert.match(view.container.textContent, /3 sélectionnés au total/);
  const bulkButton = view.getByRole('button', { name: 'Supprimer la sélection (3)' });
  bulkButton.focus();
  fireEvent.click(bulkButton);
  const dialog = view.getByRole('alertdialog');
  assert.match(dialog.textContent, /Supprimer 3 produits/); assert.match(dialog.textContent, /autres pages ou masqués par les filtres/);
  assert.equal(deletes().length, 0);
  fireEvent.click(within(dialog).getByRole('button', { name: 'Annuler' }));
  await waitFor(() => assert.equal(view.queryByRole('alertdialog'), null));
  assert.equal(deletes().length, 0); assert.match(view.container.textContent, /3 sélectionnés au total/);
  await waitFor(() => assert.ok(document.activeElement === bulkButton, "focus restauré après annulation"));
  fireEvent.click(view.getByRole('button', { name: 'Effacer la sélection' }));
  assert.match(view.container.textContent, /0 sélectionné au total/);
});

test('confirmation : suppression séquentielle avec identifiants identiques dans des catégories différentes', async () => {
  const view = await open();
  fireEvent.click(view.getByRole('checkbox', { name: 'Sélectionner Moto 1' }));
  fireEvent.change(view.getByLabelText('Catégorie'), { target: { value: 'casques' } });
  fireEvent.click(view.getByRole('checkbox', { name: 'Sélectionner Casque 1' }));
  fireEvent.click(view.getByRole('button', { name: 'Supprimer la sélection (2)' }));
  fireEvent.click(within(view.getByRole('alertdialog')).getByRole('button', { name: 'Supprimer la sélection' }));
  await waitFor(() => assert.match(view.getByRole('status').textContent, /2 produits supprimés/));
  assert.deepEqual(deletes().map((call) => call.path), ['products/motorcycles.php?id=p-1', 'products/helmets.php?id=p-1']);
  assert.equal(maxInFlight, 1);
  assert.ok(!records.some((p) => p.id === 'p-1'));
  assert.match(view.container.textContent, /0 sélectionné au total/);
});

test('échec partiel : les produits échoués restent sélectionnés et le message indique le problème', async () => {
  const view = await open();
  failIds.add('motos:p-2');
  fireEvent.click(view.getByRole('checkbox', { name: 'Sélectionner Moto 1' }));
  fireEvent.click(view.getByRole('checkbox', { name: 'Sélectionner Moto 2' }));
  fireEvent.click(view.getByRole('button', { name: 'Supprimer la sélection (2)' }));
  fireEvent.click(within(view.getByRole('alertdialog')).getByRole('button', { name: 'Supprimer la sélection' }));
  await waitFor(() => assert.match(view.getByRole('alert').textContent, /Moto 2 : Suppression refusée/));
  assert.match(view.getByRole('status').textContent, /1 produit supprimé/);
  assert.equal(view.queryByText('Moto 1'), null);
  assert.ok(view.getByRole('checkbox', { name: 'Sélectionner Moto 2' }).checked);
  assert.match(view.container.textContent, /1 sélectionné au total/);
  assert.equal(deletes().length, 2);
});

test('actualisation impossible après suppression : résultat conservé et avertissement explicite', async () => {
  const view = await open();
  fireEvent.click(view.getByRole('checkbox', { name: 'Sélectionner Moto 1' }));
  fireEvent.click(view.getByRole('button', { name: 'Supprimer la sélection (1)' }));
  failRefresh = true;
  fireEvent.click(within(view.getByRole('alertdialog')).getByRole('button', { name: 'Supprimer la sélection' }));
  await waitFor(() => assert.match(view.getByRole('alert').textContent, /Actualisation impossible.*Rechargez la page/));
  assert.match(view.getByRole('status').textContent, /1 produit supprimé/);
  assert.equal(view.queryByText('Moto 1'), null);
});
