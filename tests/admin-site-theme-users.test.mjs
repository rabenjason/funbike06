import { after, afterEach, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

let dom, server, Admin, render, fireEvent, waitFor, cleanup, within, originalFetch, users, theme, calls, failTheme, failRename;
const ok = (body) => ({ ok: true, json: async () => structuredClone(body) });
before(async () => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/admin' });
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.HTMLElement = dom.window.HTMLElement; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  ({ render, fireEvent, waitFor, cleanup, within } = await import('@testing-library/react'));
  server = await createServer({ server: { middlewareMode: true }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] }, logLevel: 'silent' });
  ({ default: Admin } = await server.ssrLoadModule('/src/pages/Admin.tsx'));
  originalFetch = globalThis.fetch;
});
beforeEach(() => {
  users = [{ id: 'super', username: 'boss', role: 'superadmin', mustChangePassword: false }, { id: 'editor', username: 'editor', role: 'admin', mustChangePassword: false }];
  theme = 'funbike'; calls = []; failTheme = false; failRename = false;
  globalThis.fetch = async (url, options = {}) => {
    const path = String(url).replace('/server/api/', ''); const method = options.method ?? 'GET';
    const body = options.body ? JSON.parse(options.body) : null; calls.push({ path, method, body });
    if (path === 'site-theme.php') {
      if (failTheme) return { ok: false, json: async () => ({ error: 'Le thème a changé.' }) };
      if (method === 'PUT') theme = body.theme;
      return ok({ data: { theme }, revision: `revision-${theme}` });
    }
    if (path === 'auth/users.php') return ok({ users });
    if (path === 'auth/username.php') {
      if (failRename) return { ok: false, json: async () => ({ message: 'Mot de passe incorrect.' }) };
      users = users.map((u) => u.id === body.id ? { ...u, username: body.username.toLowerCase() } : u);
      return ok({ user: users.find((u) => u.id === body.id) });
    }
    const fixed = { 'auth/me.php': { user: users[0] }, 'brands.php?includeDrafts=1': { brands: [] }, 'categories.php': { categories: [] }, 'families.php': { families: [] }, 'product-types.php': { productTypes: [] }, 'models.php?includeDrafts=1': { models: [] }, 'products/motorcycles.php?includeDrafts=1': { data: [] }, 'products/helmets.php?includeDrafts=1': { data: [] }, 'products/riding-gear.php?includeDrafts=1': { data: [] }, 'products/spare-parts.php?includeDrafts=1': { data: [] }, 'messages.php?count=unread': { unreadCount: 0 } };
    return fixed[path] ? ok(fixed[path]) : { ok: false, json: async () => ({ error: 'Route inconnue' }) };
  };
});
afterEach(() => cleanup());
after(async () => { globalThis.fetch = originalFetch; dom.window.close(); await server.close(); });
async function open(section) {
  const view = render(React.createElement(Admin));
  await waitFor(() => assert.ok(view.getByRole('button', { name: section })));
  fireEvent.click(view.getByRole('button', { name: section }));
  return view;
}

test('thème global : choix explicite, sauvegarde, retour et gestion des conflits', async () => {
  const view = await open('Thème du site');
  await waitFor(() => assert.ok(view.getByLabelText(/Funbike — thème actuel/).checked));
  assert.equal(view.getByRole('button', { name: 'Appliquer le thème' }).disabled, true);
  fireEvent.click(view.getByLabelText(/TVS Motor/));
  assert.equal(theme, 'funbike', 'choix non publié avant enregistrement');
  fireEvent.click(view.getByRole('button', { name: 'Appliquer le thème' }));
  await waitFor(() => assert.equal(theme, 'tvs'));
  assert.deepEqual(calls.find((c) => c.path === 'site-theme.php' && c.method === 'PUT').body, { theme: 'tvs', revision: 'revision-funbike' });
  await waitFor(() => assert.match(view.getByRole('status').textContent, /tous les visiteurs/));
  assert.equal(document.documentElement.dataset.siteTheme, undefined, 'le dashboard ne change pas de thème');
  failTheme = true;
  fireEvent.click(view.getByLabelText(/Funbike — thème actuel/));
  fireEvent.click(view.getByRole('button', { name: 'Appliquer le thème' }));
  await waitFor(() => assert.match(view.getByRole('alert').textContent, /Le thème a changé/));
  assert.equal(theme, 'tvs');
  failTheme = false; fireEvent.click(view.getByRole('button', { name: 'Recharger' }));
  await waitFor(() => assert.ok(view.getByLabelText(/TVS Motor/).checked));
  fireEvent.click(view.getByLabelText(/Funbike — thème actuel/)); fireEvent.click(view.getByRole('button', { name: 'Appliquer le thème' }));
  await waitFor(() => assert.equal(theme, 'funbike'));
});

test('superadmin : renommage de soi et des autres, confirmation par mot de passe et erreur', async () => {
  const view = await open('Administrateurs');
  await waitFor(() => assert.equal(view.getAllByRole('button', { name: 'Changer le nom' }).length, 2));
  fireEvent.click(view.getAllByRole('button', { name: 'Changer le nom' })[0]);
  fireEvent.change(view.getByLabelText('Nouveau nom d’utilisateur'), { target: { value: 'Boss-new' } });
  fireEvent.change(view.getByLabelText('Votre mot de passe superadmin'), { target: { value: 'secret' } });
  failRename = true; fireEvent.click(view.getByRole('button', { name: 'Enregistrer le nom' }));
  await waitFor(() => assert.match(view.getByRole('alert').textContent, /Mot de passe incorrect/));
  assert.equal(view.getByLabelText('Votre mot de passe superadmin').value, '', 'le secret est effacé après erreur');
  failRename = false; fireEvent.change(view.getByLabelText('Votre mot de passe superadmin'), { target: { value: 'secret' } });
  fireEvent.click(view.getByRole('button', { name: 'Enregistrer le nom' }));
  await waitFor(() => assert.match(view.container.querySelector('header').textContent, /boss-new/));
  assert.equal(calls.find((c) => c.path === 'auth/username.php').body.id, 'super');
  fireEvent.click(view.getAllByRole('button', { name: 'Changer le nom' })[1]);
  fireEvent.change(view.getByLabelText('Nouveau nom d’utilisateur'), { target: { value: 'editor-new' } });
  fireEvent.change(view.getByLabelText('Votre mot de passe superadmin'), { target: { value: 'secret' } });
  fireEvent.click(view.getByRole('button', { name: 'Enregistrer le nom' }));
  await waitFor(() => assert.equal(users[1].username, 'editor-new'));
  assert.match(view.getByRole('status').textContent, /autres sessions/);
});
