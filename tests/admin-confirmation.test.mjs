import { after, before, beforeEach, afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

let server, Admin, render, fireEvent, waitFor, cleanup, within, dom, requests, oldFetch, logoutHandler, currentUser;
const product = { id: 'moto-test', name: 'Moto test', categoryId: 'motos', productTypeId: 'urbain', brandId: 'tvs', description: '', status: 'PUBLISHED', isNewArrival: false, images: [], specifications: [] };
const user = { id: 'super-1', username: 'admin', role: 'superadmin', mustChangePassword: false };
const editor = { id: 'editor-1', username: 'maria', role: 'admin', mustChangePassword: false };

before(async () => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost:5173/' });
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.HTMLElement = dom.window.HTMLElement; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  window.confirm = () => { throw new Error('La confirmation native ne doit pas être utilisée'); };
  ({ render, fireEvent, waitFor, cleanup, within } = await import('@testing-library/react'));
  server = await createServer({ server: { middlewareMode: true }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
  ({ default: Admin } = await server.ssrLoadModule('/src/pages/Admin.tsx'));
  oldFetch = globalThis.fetch;
});
beforeEach(() => {
  requests = []; currentUser = user;
  logoutHandler = async () => ({ ok: true, json: async () => ({ success: true }) });
  globalThis.fetch = async (url, options = {}) => {
    const path = String(url).replace('/server/api/', '');
    requests.push({ path, method: options.method ?? 'GET' });
    if (path === 'auth/logout.php' && options.method === 'POST') return logoutHandler();
    if (path === 'brands.php?id=tvs' && options.method === 'DELETE') return { ok: false, json: async () => ({ error: 'Cette marque est encore utilisée.' }) };
    if (options.method === 'DELETE') return { ok: true, json: async () => ({}) };
    if (path === 'auth/users.php?id=editor-1' && options.method === 'PUT') return { ok: true, json: async () => ({ temporaryPassword: 'temporaire-affiche-une-fois' }) };
    const fixed = {
      'auth/me.php': { user: currentUser }, 'auth/users.php': { users: [user, editor] },
      'brands.php': { brands: [{ id: 'tvs', name: 'TVS', isEquipmentBrand: true }] },
      'categories.php': { categories: [{ id: 'motos', name: 'Motos' }] },
      'families.php': { families: [{ id: 'urbain', name: 'Urbain', categoryId: 'motos' }] },
      'product-types.php': { productTypes: [{ id: 'urbain', name: 'Urbain', categoryId: 'motos', familyId: 'urbain' }] },
      'models.php': { models: [] },
      'products/motorcycles.php?includeDrafts=1': { data: [product] },
      'products/helmets.php?includeDrafts=1': { data: [] },
      'products/riding-gear.php?includeDrafts=1': { data: [] },
      'products/spare-parts.php?includeDrafts=1': { data: [] },
    };
    return { ok: !!fixed[path], json: async () => fixed[path] ?? { error: 'Route inconnue' } };
  };
});
afterEach(() => cleanup());
after(async () => { globalThis.fetch = oldFetch; dom.window.close(); await server?.close(); });

async function openAdmin() {
  const view = render(React.createElement(Admin));
  await waitFor(() => assert.ok(view.getByText('Moto test')));
  return view;
}
const destructiveCalls = () => requests.filter((request) => request.method === 'DELETE' || request.method === 'PUT');

test('suppression d’un produit : dialogue accessible, annulation et clavier sans appel API', async () => {
  const view = await openAdmin();
  const trigger = view.getByRole('button', { name: 'Supprimer' });
  trigger.focus();
  fireEvent.click(trigger);
  const dialog = view.getByRole('alertdialog');
  assert.equal(dialog.getAttribute('aria-modal'), 'true');
  assert.match(dialog.textContent, /Moto test/); assert.match(dialog.textContent, /images seront supprimés/);
  assert.equal(document.activeElement, within(dialog).getByRole('button', { name: 'Annuler' }));
  assert.equal(document.body.style.overflow, 'hidden');
  fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
  assert.equal(document.activeElement, within(dialog).getByRole('button', { name: 'Supprimer le produit' }));
  fireEvent.keyDown(document, { key: 'Tab' });
  assert.equal(document.activeElement, within(dialog).getByRole('button', { name: 'Annuler' }));
  fireEvent.keyDown(document, { key: 'Escape' });
  await waitFor(() => assert.equal(view.queryByRole('alertdialog'), null));
  assert.equal(document.activeElement, trigger); assert.equal(document.body.style.overflow, '');
  assert.deepEqual(destructiveCalls(), []);
});

test('clic en dehors ou fermeture de l’administration : aucune action confirmée', async () => {
  const view = await openAdmin();
  fireEvent.click(view.getByRole('button', { name: 'Supprimer' }));
  fireEvent.click(view.getByRole('alertdialog').parentElement);
  await waitFor(() => assert.equal(view.queryByRole('alertdialog'), null));
  assert.deepEqual(destructiveCalls(), []);
  fireEvent.click(view.getByRole('button', { name: 'Supprimer' }));
  view.unmount();
  await Promise.resolve();
  assert.deepEqual(destructiveCalls(), []);
  assert.equal(document.body.style.overflow, '');
});

test('suppression d’un produit : seule la confirmation envoie la requête', async () => {
  const view = await openAdmin();
  fireEvent.click(view.getByRole('button', { name: 'Supprimer' }));
  fireEvent.click(within(view.getByRole('alertdialog')).getByRole('button', { name: 'Annuler' }));
  await waitFor(() => assert.equal(view.queryByRole('alertdialog'), null));
  assert.deepEqual(destructiveCalls(), []);
  fireEvent.click(view.getByRole('button', { name: 'Supprimer' }));
  fireEvent.click(within(view.getByRole('alertdialog')).getByRole('button', { name: 'Supprimer le produit' }));
  await waitFor(() => assert.ok(requests.some((r) => r.path === 'products/motorcycles.php?id=moto-test' && r.method === 'DELETE')));
});

test('suppression d’une marque : modal nominative, annulation et erreur du serveur protégée', async () => {
  const view = await openAdmin();
  fireEvent.click(view.getByRole('button', { name: 'Marques et classement' }));
  const row = view.getByText('TVS').parentElement.parentElement;
  fireEvent.click(within(row).getByRole('button', { name: 'Supprimer' }));
  let dialog = view.getByRole('alertdialog');
  assert.match(dialog.textContent, /Supprimer « TVS »/); assert.match(dialog.textContent, /ne peuvent pas être supprimés/);
  fireEvent.click(within(dialog).getByRole('button', { name: 'Annuler' }));
  await waitFor(() => assert.equal(view.queryByRole('alertdialog'), null));
  assert.deepEqual(destructiveCalls(), []);
  fireEvent.click(within(row).getByRole('button', { name: 'Supprimer' }));
  dialog = view.getByRole('alertdialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Supprimer' }));
  await waitFor(() => assert.match(view.getByRole('alert').textContent, /encore utilisée/));
  assert.equal(destructiveCalls().length, 1);
});

test('comptes : les modales couvrent la réinitialisation et la suppression', async () => {
  const view = await openAdmin();
  fireEvent.click(view.getByRole('button', { name: 'Administrateurs' }));
  await waitFor(() => assert.ok(view.getByText(/maria/)));
  fireEvent.click(view.getByRole('button', { name: 'Réinitialiser' }));
  let dialog = view.getByRole('alertdialog');
  assert.match(dialog.textContent, /maria/); assert.match(dialog.textContent, /mot de passe temporaire/);
  fireEvent.click(within(dialog).getByRole('button', { name: 'Annuler' }));
  await waitFor(() => assert.equal(view.queryByRole('alertdialog'), null)); assert.deepEqual(destructiveCalls(), []);
  fireEvent.click(view.getByRole('button', { name: 'Réinitialiser' }));
  dialog = view.getByRole('alertdialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Réinitialiser' }));
  await waitFor(() => assert.ok(view.getByText('temporaire-affiche-une-fois')));
  assert.deepEqual(destructiveCalls()[0], { path: 'auth/users.php?id=editor-1', method: 'PUT' });
  fireEvent.click(view.getByRole('button', { name: 'Supprimer' }));
  dialog = view.getByRole('alertdialog');
  assert.match(dialog.textContent, /Supprimer le compte « maria »/);
  fireEvent.click(within(dialog).getByRole('button', { name: 'Supprimer le compte' }));
  await waitFor(() => assert.ok(requests.some((r) => r.path === 'auth/users.php?id=editor-1' && r.method === 'DELETE')));
});


test('déconnexion : Non et Échap annulent, Oui déconnecte une seule fois', async () => {
  const view = await openAdmin();
  const trigger = view.getByRole('button', { name: 'Déconnexion' });
  trigger.focus(); fireEvent.click(trigger);
  let dialog = view.getByRole('alertdialog');
  assert.match(dialog.textContent, /Voulez-vous vous déconnecter/);
  assert.equal(document.activeElement, within(dialog).getByRole('button', { name: 'Non' }));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Non' }));
  await waitFor(() => assert.equal(view.queryByRole('alertdialog'), null));
  assert.ok(document.activeElement === trigger);
  assert.equal(requests.filter((r) => r.path === 'auth/logout.php').length, 0);
  fireEvent.click(trigger);
  fireEvent.keyDown(document, { key: 'Escape' });
  await waitFor(() => assert.equal(view.queryByRole('alertdialog'), null));
  assert.equal(requests.filter((r) => r.path === 'auth/logout.php').length, 0);
  let resolveLogout;
  logoutHandler = () => new Promise((resolve) => { resolveLogout = resolve; });
  fireEvent.click(trigger);
  dialog = view.getByRole('alertdialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Oui' }));
  await waitFor(() => assert.equal(requests.filter((r) => r.path === 'auth/logout.php').length, 1));
  assert.ok(view.getByRole('button', { name: 'Déconnexion…' }).disabled);
  resolveLogout({ ok: true, json: async () => ({ success: true }) });
  await waitFor(() => assert.ok(view.getByRole('heading', { name: 'Connexion' })));
  assert.deepEqual(requests.filter((r) => r.path === 'auth/logout.php'), [{ path: 'auth/logout.php', method: 'POST' }]);
});

test('déconnexion : une erreur laisse la session ouverte, y compris lors du changement de mot de passe obligatoire', async () => {
  currentUser = { ...user, mustChangePassword: true };
  logoutHandler = async () => ({ ok: false, json: async () => ({ message: 'Déconnexion impossible' }) });
  const view = render(React.createElement(Admin));
  await waitFor(() => assert.ok(view.getByRole('heading', { name: 'Choisissez votre mot de passe' })));
  fireEvent.click(view.getByRole('button', { name: 'Déconnexion' }));
  fireEvent.click(within(view.getByRole('alertdialog')).getByRole('button', { name: 'Oui' }));
  await waitFor(() => assert.equal(view.getByRole('alert').textContent, 'Déconnexion impossible'));
  assert.ok(view.getByRole('heading', { name: 'Choisissez votre mot de passe' }));
  assert.equal(view.getByRole('button', { name: 'Déconnexion' }).disabled, false);
});
