import { after, afterEach, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
let dom, server, Admin, render, fireEvent, waitFor, within, cleanup, oldFetch, oldFormData, oldCreate, oldRevoke, brands, writes, revoked, failWrite, failRefresh;
const initial = [{ id: 'tvs', name: 'TVS', logo: '/server/uploads/brands/tvs/logo.png', isEquipmentBrand: true }, { id: 'other', name: 'Autre', logo: '', isEquipmentBrand: false }];
before(async () => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.HTMLElement = dom.window.HTMLElement; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  oldFetch = globalThis.fetch; oldFormData = globalThis.FormData; oldCreate = URL.createObjectURL; oldRevoke = URL.revokeObjectURL;
  globalThis.FormData = dom.window.FormData;
  URL.createObjectURL = (file) => `blob:${file.name}`;
  URL.revokeObjectURL = (url) => revoked.push(url);
  ({ render, fireEvent, waitFor, within, cleanup } = await import('@testing-library/react'));
  server = await createServer({ server: { middlewareMode: true }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
  ({ default: Admin } = await server.ssrLoadModule('/src/pages/Admin.tsx'));
});
beforeEach(() => {
  brands = structuredClone(initial); writes = []; revoked = []; failWrite = false; failRefresh = false;
  globalThis.fetch = async (url, options = {}) => {
    const path = String(url).replace('/server/api/', '');
    if (path === 'brands.php?id=tvs' && options.method === 'POST') {
      writes.push(options.body);
      if (failWrite) return { ok: false, json: async () => ({ error: 'Transfert impossible' }) };
      const file = options.body.get('logo');
      brands = brands.map((b) => b.id === 'tvs' ? { ...b, name: options.body.get('name'), isEquipmentBrand: options.body.get('isEquipmentBrand') === 'true', logo: file ? '/server/uploads/brands/tvs/nouveau.png' : b.logo } : b);
      return { ok: true, json: async () => ({ brand: brands[0] }) };
    }
    if (path === 'brands.php' && failRefresh && writes.length) return { ok: false, json: async () => ({ error: 'Indisponible' }) };
    const fixed = {
      'auth/me.php': { user: { id: 'admin', username: 'admin', role: 'superadmin', mustChangePassword: false } },
      'brands.php': { brands }, 'categories.php': { categories: [] }, 'families.php': { families: [] }, 'product-types.php': { productTypes: [] }, 'models.php': { models: [] },
      'products/motorcycles.php?includeDrafts=1': { data: [] }, 'products/helmets.php?includeDrafts=1': { data: [] }, 'products/riding-gear.php?includeDrafts=1': { data: [] }, 'products/spare-parts.php?includeDrafts=1': { data: [] },
    };
    return { ok: !!fixed[path], json: async () => fixed[path] ?? { error: 'Route inconnue' } };
  };
});
afterEach(() => cleanup());
after(async () => { globalThis.fetch = oldFetch; globalThis.FormData = oldFormData; URL.createObjectURL = oldCreate; URL.revokeObjectURL = oldRevoke; dom.window.close(); await server.close(); });
async function editTVS() {
  const view = render(React.createElement(Admin));
  await waitFor(() => assert.ok(view.getByRole('button', { name: 'Marques et classement' })));
  fireEvent.click(view.getByRole('button', { name: 'Marques et classement' }));
  await waitFor(() => assert.ok(view.getByText('TVS')));
  const row = view.getByText('TVS').closest('.py-3');
  fireEvent.click(within(row).getByRole('button', { name: 'Modifier' }));
  return view;
}
function select(view, file) { fireEvent.change(view.getByLabelText('Nouveau logo (facultatif)'), { target: { files: [file] } }); }
const file = (name, type = 'image/png') => new dom.window.File(['image'], name, { type });

test('logo actuel, aperçu immédiat, annulation et remplacement avec confirmation visible', async () => {
  const view = await editTVS();
  assert.equal(view.getByAltText('Logo actuel TVS').getAttribute('src'), initial[0].logo);
  assert.ok(view.getByText('Aucun logo'));
  select(view, file('tvs.png'));
  assert.equal(view.getByAltText('Aperçu du nouveau logo').getAttribute('src'), 'blob:tvs.png');
  assert.match(view.container.textContent, /pas encore enregistré/); assert.equal(writes.length, 0);
  fireEvent.click(view.getByRole('button', { name: 'Ne pas changer le logo' }));
  assert.ok(!view.queryByAltText('Aperçu du nouveau logo')); assert.ok(revoked.includes('blob:tvs.png'));
  select(view, file('tvs.png'));
  fireEvent.click(view.getByRole('button', { name: 'Enregistrer' }));
  await waitFor(() => assert.match(view.getByRole('status').textContent, /marque « TVS » a été enregistrée/));
  assert.equal(writes.length, 1); assert.equal(writes[0].get('_method'), 'PUT'); assert.equal(writes[0].get('logo').name, 'tvs.png');
  assert.equal(view.getByAltText('Logo TVS').getAttribute('src'), '/server/uploads/brands/tvs/nouveau.png');
  assert.ok(revoked.filter((url) => url === 'blob:tvs.png').length >= 2);
});

test('modifier seulement le nom ne transmet pas de logo et conserve l’image', async () => {
  const view = await editTVS();
  fireEvent.change(view.getByLabelText('Nom'), { target: { value: 'TVS Madagascar' } });
  fireEvent.click(view.getByRole('button', { name: 'Enregistrer' }));
  await waitFor(() => assert.ok(view.getByRole('status')));
  assert.equal(writes[0].get('logo'), null); assert.equal(brands[0].logo, initial[0].logo);
});

test('un logo introuvable, un format invalide et une erreur serveur sont clairement signalés', async () => {
  const view = await editTVS();
  fireEvent.error(view.getByAltText('Logo actuel TVS'));
  assert.ok(view.getByText('Logo indisponible'));
  select(view, file('fichier.txt', 'text/plain'));
  assert.match(view.getByRole('alert').textContent, /PNG, JPG ou WEBP/);
  assert.ok(view.getByRole('button', { name: 'Enregistrer' }).disabled); assert.equal(writes.length, 0);
  select(view, file('tvs.png')); failWrite = true;
  fireEvent.click(view.getByRole('button', { name: 'Enregistrer' }));
  await waitFor(() => assert.match(view.getByRole('alert').textContent, /Transfert impossible/));
  assert.ok(view.getByAltText('Aperçu du nouveau logo')); assert.equal(brands[0].logo, initial[0].logo);
  assert.equal(view.queryByRole('status'), null);
});

test('un échec d’actualisation après enregistrement est distingué d’un échec de sauvegarde', async () => {
  const view = await editTVS(); select(view, file('tvs.png')); failRefresh = true;
  fireEvent.click(view.getByRole('button', { name: 'Enregistrer' }));
  await waitFor(() => assert.match(view.getByRole('alert').textContent, /modification a été enregistrée.*Rechargez/));
  assert.equal(writes.length, 1); assert.equal(brands[0].logo, '/server/uploads/brands/tvs/nouveau.png');
});
