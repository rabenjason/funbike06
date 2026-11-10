import { after, afterEach, before, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
let dom, server, Admin, render, fireEvent, waitFor, cleanup, originalFetch;
const ok = (body) => ({ ok: true, json: async () => structuredClone(body) });
before(async () => {
  dom = new JSDOM('<!doctype html><html class="dark"><body></body></html>', { url: 'http://localhost/admin' });
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.HTMLElement = dom.window.HTMLElement; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  ({ render, fireEvent, waitFor, cleanup } = await import('@testing-library/react'));
  server = await createServer({ server: { middlewareMode: true }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] }, logLevel: 'silent' });
  ({ default: Admin } = await server.ssrLoadModule('/src/pages/Admin.tsx'));
  originalFetch = globalThis.fetch;
});
afterEach(() => { cleanup(); window.localStorage.clear(); });
after(async () => { globalThis.fetch = originalFetch; dom.window.close(); await server.close(); });
function mock(user) {
  const replies = { 'auth/me.php': { user }, 'brands.php?includeDrafts=1': { brands: [] }, 'categories.php': { categories: [] }, 'families.php': { families: [] }, 'product-types.php': { productTypes: [] }, 'models.php?includeDrafts=1': { models: [] }, 'products/motorcycles.php?includeDrafts=1': { data: [] }, 'products/helmets.php?includeDrafts=1': { data: [] }, 'products/riding-gear.php?includeDrafts=1': { data: [] }, 'products/spare-parts.php?includeDrafts=1': { data: [] }, 'messages.php?count=unread': { unreadCount: 0 } };
  globalThis.fetch = async (url) => ok(replies[String(url).replace('/server/api/', '')] ?? {});
}
test('thème du dashboard indépendant du site, sauvegardé et conservant les formulaires', async () => {
  mock({ id: 'a', username: 'admin', role: 'admin', mustChangePassword: false });
  window.localStorage.setItem('fb-theme-v2', 'dark');
  const view = render(React.createElement(Admin));
  await waitFor(() => view.getByRole('button', { name: /Ajouter un produit/ }));
  assert.equal(document.documentElement.dataset.adminTheme, 'light');
  fireEvent.click(view.getByRole('button', { name: /Ajouter un produit/ }));
  const name = view.getByLabelText('Nom');
  fireEvent.change(name, { target: { value: 'Ma moto' } });
  fireEvent.click(view.getByRole('button', { name: 'Activer le mode nuit du dashboard' }));
  assert.equal(document.documentElement.dataset.adminTheme, 'dark');
  assert.equal(window.localStorage.getItem('fb-admin-theme'), 'dark');
  assert.equal(window.localStorage.getItem('fb-theme-v2'), 'dark');
  assert.equal(name.value, 'Ma moto');
  view.unmount(); assert.equal(document.documentElement.dataset.adminTheme, undefined);
  const again = render(React.createElement(Admin));
  await waitFor(() => again.getByRole('button', { name: 'Activer le mode jour du dashboard' }));
  assert.equal(document.documentElement.dataset.adminTheme, 'dark');
  fireEvent.click(again.getByRole('button', { name: 'Activer le mode jour du dashboard' }));
  assert.equal(window.localStorage.getItem('fb-admin-theme'), 'light');
  assert.ok(document.documentElement.classList.contains('dark'), 'la préférence du site reste inchangée');
});
test('le choix est disponible sur la connexion et les confirmations suivent le thème', async () => {
  mock(null);
  const login = render(React.createElement(Admin));
  await waitFor(() => login.getByRole('button', { name: 'Se connecter' }));
  fireEvent.click(login.getByRole('button', { name: 'Activer le mode nuit du dashboard' }));
  assert.equal(document.documentElement.dataset.adminTheme, 'dark');
  login.unmount();
  mock({ id: 'a', username: 'admin', role: 'admin', mustChangePassword: false });
  const view = render(React.createElement(Admin));
  await waitFor(() => view.getByRole('button', { name: 'Déconnexion' }));
  fireEvent.click(view.getByRole('button', { name: 'Déconnexion' }));
  const dialog = await waitFor(() => view.getByRole('alertdialog'));
  assert.ok(dialog.closest('.fb-admin-confirmation'));
  assert.equal(document.documentElement.dataset.adminTheme, 'dark');
  fireEvent.click(view.getByRole('button', { name: 'Non' }));
});
