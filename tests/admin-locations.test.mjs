import { after, afterEach, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
let server, Admin, render, fireEvent, waitFor, cleanup, within, dom, oldFetch, dealers, contact, calls, fail, failGet;
const original = { key: 'tana', city: 'Antananarivo', name: 'Showroom', kind: 'Showroom', address: 'Adresse', hours: 'Lun - Sam · 8h30 – 17h30', phone: '+261 34 00 000 00', email: 'test@funbike.mg', desc: 'Description', lat: -18.8792, lon: 47.5079, services: ['Motos', 'Atelier'], isDemo: true };
const baseContact = { email: 'contact@funbike.mg', phone: '+261 34 00 000 00', phoneHref: 'tel:+261340000000', address: 'Antananarivo', hours: 'Lun – Sam · 8h – 17h', whatsapp: null, socialLinks: [] };
const ok = (body) => ({ ok: true, json: async () => structuredClone(body) });
const failResponse = (message) => ({ ok: false, json: async () => ({ error: message }) });
before(async () => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.HTMLElement = dom.window.HTMLElement; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  ({ render, fireEvent, waitFor, cleanup, within } = await import('@testing-library/react'));
  server = await createServer({ server: { middlewareMode: true }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
  ({ default: Admin } = await server.ssrLoadModule('/src/pages/Admin.tsx'));
  oldFetch = globalThis.fetch;
});
beforeEach(() => {
  dealers = [structuredClone(original)]; contact = structuredClone(baseContact); calls = []; fail = ''; failGet = '';
  globalThis.fetch = async (url, options = {}) => {
    const path = String(url).replace('/server/api/', ''); const method = options.method ?? 'GET';
    const body = options.body ? JSON.parse(options.body) : null; calls.push({ path, method, body });
    if (failGet && path === failGet && method === 'GET') return failResponse('Chargement impossible');
    if (fail && path.startsWith(fail) && method !== 'GET') return failResponse('Enregistrement refusé');
    if (path === 'dealers.php' && method === 'GET') return ok({ dealers });
    if (path === 'dealers.php' && method === 'POST') {
      const saved = { key: 'tana-2', ...body }; dealers.push(saved); return ok({ dealer: saved });
    }
    if (path.startsWith('dealers.php?key=') && method === 'PUT') {
      const key = decodeURIComponent(path.split('=')[1]); const saved = { key, ...body };
      dealers = dealers.map((d) => d.key === key ? saved : d); return ok({ dealer: saved });
    }
    if (path.startsWith('dealers.php?key=') && method === 'DELETE') { const key = decodeURIComponent(path.split('=')[1]); dealers = dealers.filter((d) => d.key !== key); return ok({}); }
    if (path === 'contacts.php' && method === 'GET') return ok({ contact });
    if (path === 'contacts.php' && method === 'PUT') { contact = body; return ok({ contact }); }
    const fixed = { 'messages.php?count=unread': { unreadCount: 0 }, 'auth/me.php': { user: { id: 'admin', username: 'admin', role: 'superadmin', mustChangePassword: false } },
      'brands.php?includeDrafts=1': { brands: [] }, 'categories.php': { categories: [] }, 'families.php': { families: [] }, 'product-types.php': { productTypes: [] }, 'models.php?includeDrafts=1': { models: [] },
      'products/motorcycles.php?includeDrafts=1': { data: [] }, 'products/helmets.php?includeDrafts=1': { data: [] }, 'products/riding-gear.php?includeDrafts=1': { data: [] }, 'products/spare-parts.php?includeDrafts=1': { data: [] } };
    return fixed[path] ? ok(fixed[path]) : failResponse(`Route inconnue : ${path}`);
  };
});
afterEach(() => cleanup());
after(async () => { globalThis.fetch = oldFetch; dom.window.close(); await server?.close(); });
async function open(section) {
  const view = render(React.createElement(Admin));
  await waitFor(() => assert.ok(view.getByRole('button', { name: section })));
  fireEvent.click(view.getByRole('button', { name: section }));
  return view;
}
function change(view, label, value) { fireEvent.change(view.getByLabelText(label), { target: { value } }); }
const writes = (name) => calls.filter((call) => call.path.startsWith(name) && call.method !== 'GET');

test('revendeurs : liste, horaires existants, modification avec aperçu et conservation des données', async () => {
  const view = await open('Revendeurs');
  await waitFor(() => assert.ok(view.getByRole('button', { name: 'Modifier Showroom' })));
  assert.match(view.container.textContent, /Showroom · Démonstration/);
  fireEvent.click(view.getByRole('button', { name: 'Modifier Showroom' }));
  assert.equal(view.getByLabelText('Horaires d’ouverture').value, original.hours);
  const hours = 'Lundi à vendredi : 8h30 – 17h30\nSamedi : 8h30 – 12h00\nDimanche : fermé';
  change(view, 'Horaires d’ouverture', hours);
  const preview = view.getByText('Aperçu sur le site').parentElement;
  assert.equal(preview.querySelector('p:last-child').textContent, hours);
  assert.match(preview.querySelector('p:last-child').className, /whitespace-pre-line/);
  change(view, 'Adresse', 'Nouvelle adresse');
  fireEvent.click(view.getByRole('button', { name: 'Enregistrer le revendeur' }));
  await waitFor(() => assert.match(view.getByRole('status').textContent, /enregistré/));
  const write = writes('dealers.php')[0]; assert.equal(write.method, 'PUT'); assert.equal(write.path, 'dealers.php?key=tana');
  assert.equal(write.body.hours, hours); assert.equal(write.body.isDemo, true); assert.deepEqual(write.body.services, ['Motos', 'Atelier']);
  assert.equal(write.body.lat, original.lat); assert.equal(write.body.lon, original.lon); assert.equal(dealers[0].address, 'Nouvelle adresse');
});

test('revendeurs : création complète puis suppression seulement après confirmation', async () => {
  const view = await open('Revendeurs'); await waitFor(() => assert.ok(view.getByRole('button', { name: 'Modifier Showroom' })));
  fireEvent.click(view.getByRole('button', { name: '+ Ajouter un revendeur' }));
  for (const [label, value] of [['Nom', 'Atelier B'], ['Ville', 'Antananarivo'], ['Type de point de vente', 'Atelier'], ['Adresse', 'Rue B'], ['Téléphone', '+261 34 99 999 99'], ['E-mail', 'b@example.com'], ['Horaires d’ouverture', 'Lundi : 9h – 17h\nDimanche : fermé'], ['Description', 'Un atelier.'], ['Services proposés', 'Atelier\nPièces'], ['Latitude', '-18.8'], ['Longitude', '47.5']]) change(view, label, value);
  fireEvent.click(view.getByRole('button', { name: 'Enregistrer le revendeur' }));
  await waitFor(() => assert.ok(view.getByRole('button', { name: 'Supprimer Atelier B' })));
  assert.deepEqual(writes('dealers.php')[0].body.services, ['Atelier', 'Pièces']);
  fireEvent.click(view.getByRole('button', { name: 'Supprimer Atelier B' }));
  assert.match(view.getByRole('alertdialog').textContent, /Atelier B/);
  fireEvent.click(within(view.getByRole('alertdialog')).getByRole('button', { name: 'Annuler' }));
  await waitFor(() => assert.ok(!view.queryByRole('alertdialog')));
  assert.equal(writes('dealers.php').filter((r) => r.method === 'DELETE').length, 0);
  fireEvent.click(view.getByRole('button', { name: 'Supprimer Atelier B' }));
  fireEvent.click(within(view.getByRole('alertdialog')).getByRole('button', { name: 'Supprimer' }));
  await waitFor(() => assert.ok(!view.queryByRole('button', { name: 'Supprimer Atelier B' })));
  assert.ok(view.getByRole('button', { name: 'Modifier Showroom' }));
});

test('revendeur incomplet : nom et ville seuls, coordonnées par paire et modification ultérieure', async () => {
  const view = await open('Revendeurs'); await waitFor(() => assert.ok(view.getByRole('button', { name: '+ Ajouter un revendeur' })));
  fireEvent.click(view.getByRole('button', { name: '+ Ajouter un revendeur' }));
  change(view, 'Nom', 'Hell Ville Dépannage'); change(view, 'Ville', 'Nosy Be');
  assert.equal(view.getByLabelText('Nom').required, true); assert.equal(view.getByLabelText('Ville').required, true);
  for (const label of ['Adresse', 'Téléphone', 'E-mail', 'Horaires d’ouverture', 'Description', 'Latitude', 'Longitude', 'Type de point de vente']) assert.equal(view.getByLabelText(label).required, false, label);
  change(view, 'Latitude', '-13.4'); fireEvent.click(view.getByRole('button', { name: 'Enregistrer le revendeur' }));
  assert.match(view.getByRole('alert').textContent, /longitude/); assert.equal(writes('dealers.php').length, 0);
  change(view, 'Latitude', ''); fireEvent.click(view.getByRole('button', { name: 'Enregistrer le revendeur' }));
  await waitFor(() => assert.ok(view.getByRole('button', { name: 'Modifier Hell Ville Dépannage' })));
  const first = writes('dealers.php')[0].body;
  assert.equal(first.lat, null); assert.equal(first.lon, null); assert.equal(first.phone, ''); assert.deepEqual(first.services, []);
  fireEvent.click(view.getByRole('button', { name: 'Modifier Hell Ville Dépannage' }));
  assert.equal(view.getByLabelText('Latitude').value, ''); assert.equal(view.getByLabelText('Longitude').value, '');
  change(view, 'Téléphone', '034 12 345 67'); change(view, 'Latitude', '-13.4'); change(view, 'Longitude', '48.3');
  fireEvent.click(view.getByRole('button', { name: 'Enregistrer le revendeur' }));
  await waitFor(() => assert.equal(writes('dealers.php').length, 2));
  const second = writes('dealers.php')[1].body; assert.equal(second.lat, -13.4); assert.equal(second.lon, 48.3); assert.equal(second.phone, '034 12 345 67');
  assert.deepEqual(dealers[0], original, 'la fiche existante ne change pas');
});

test('revendeurs : erreur serveur conserve les données et le formulaire', async () => {
  const view = await open('Revendeurs'); await waitFor(() => assert.ok(view.getByRole('button', { name: 'Modifier Showroom' })));
  fireEvent.click(view.getByRole('button', { name: 'Modifier Showroom' })); change(view, 'Adresse', 'Nouvelle adresse');
  fail = 'dealers.php'; fireEvent.click(view.getByRole('button', { name: 'Enregistrer le revendeur' }));
  await waitFor(() => assert.match(view.getByRole('alert').textContent, /refusé/));
  assert.equal(view.getByLabelText('Adresse').value, 'Nouvelle adresse'); assert.equal(dealers[0].address, original.address);
});

test('contact : coordonnées, horaires multilignes, WhatsApp et liens sont enregistrés', async () => {
  const view = await open('Contact'); await waitFor(() => assert.ok(view.getByLabelText('Téléphone')));
  const hours = 'Lundi : 8h – 18h\nDimanche : fermé'; change(view, 'Horaires d’ouverture', hours);
  assert.equal(view.getByText('Aperçu sur le site').parentElement.querySelector('p:last-child').textContent, hours);
  change(view, 'Téléphone', '+261 33 12 345 67'); change(view, 'WhatsApp (facultatif)', '+261 34 12 345 67');
  fireEvent.click(view.getByRole('button', { name: '+ Ajouter un lien' }));
  change(view, 'Nom du réseau 1', 'Facebook'); change(view, 'Adresse du lien 1', 'https://facebook.com/funbike');
  fireEvent.click(view.getByRole('button', { name: 'Enregistrer les coordonnées' }));
  await waitFor(() => assert.match(view.getByRole('status').textContent, /enregistrées/));
  assert.equal(contact.hours, hours); assert.equal(contact.phoneHref, 'tel:+261331234567');
  assert.equal(contact.whatsapp, '+261 34 12 345 67'); assert.deepEqual(contact.socialLinks, [{ label: 'Facebook', url: 'https://facebook.com/funbike' }]);
  assert.equal(contact.email, baseContact.email); assert.equal(contact.address, baseContact.address);
});

test('contact : échec et suppression de liens optionnels sans perdre les valeurs', async () => {
  contact.socialLinks = [{ label: 'Facebook', url: 'https://facebook.com/funbike' }]; contact.whatsapp = '+261341234567';
  const view = await open('Contact'); await waitFor(() => assert.ok(view.getByLabelText('Nom du réseau 1')));
  fireEvent.click(view.getByRole('button', { name: 'Retirer le lien 1' })); change(view, 'WhatsApp (facultatif)', '');
  fail = 'contacts.php'; fireEvent.click(view.getByRole('button', { name: 'Enregistrer les coordonnées' }));
  await waitFor(() => assert.match(view.getByRole('alert').textContent, /refusé/));
  assert.equal(contact.socialLinks.length, 1);
  fail = ''; fireEvent.click(view.getByRole('button', { name: 'Enregistrer les coordonnées' }));
  await waitFor(() => assert.match(view.getByRole('status').textContent, /enregistrées/));
  assert.deepEqual(contact.socialLinks, []); assert.equal(contact.whatsapp, null); assert.equal(contact.phoneHref, baseContact.phoneHref);
});


test('erreur de chargement : les données ne sont pas présentées comme vides et la reprise est possible', async () => {
  failGet = 'dealers.php';
  const view = await open('Revendeurs');
  await waitFor(() => assert.match(view.getByRole('alert').textContent, /Chargement impossible/));
  assert.ok(view.getByRole('button', { name: '+ Ajouter un revendeur' }).disabled);
  assert.equal(view.queryByText('Aucun revendeur renseigné.'), null);
  failGet = ''; fireEvent.click(view.getByRole('button', { name: 'Réessayer le chargement' }));
  await waitFor(() => assert.ok(view.getByRole('button', { name: 'Modifier Showroom' })));
});

test('contact : ajout rapide, modification et retrait du lien Facebook sans perdre les autres coordonnées', async () => {
  contact.socialLinks = [{ label: 'Instagram', url: 'https://instagram.com/funbike' }];
  const view = await open('Contact'); await waitFor(() => assert.ok(view.getByLabelText('Nom du réseau 1')));
  fireEvent.click(view.getByRole('button', { name: 'Ajouter Facebook' }));
  assert.equal(view.getByLabelText('Nom du réseau 2').value, 'Facebook');
  change(view, 'Adresse du lien 2', 'https://example.com');
  assert.match(view.container.textContent, /adresse Facebook valide/);
  change(view, 'Adresse du lien 2', 'https://www.facebook.com/funbike');
  assert.doesNotMatch(view.container.textContent, /adresse Facebook valide/);
  fireEvent.click(view.getByRole('button', { name: 'Enregistrer les coordonnées' }));
  await waitFor(() => assert.match(view.getByRole('status').textContent, /enregistrées/));
  assert.deepEqual(contact.socialLinks, [{ label: 'Instagram', url: 'https://instagram.com/funbike' }, { label: 'Facebook', url: 'https://www.facebook.com/funbike' }]);
  assert.equal(contact.email, baseContact.email);
  change(view, 'Adresse du lien 2', 'https://facebook.com/nouvelle-page');
  fireEvent.click(view.getByRole('button', { name: 'Enregistrer les coordonnées' }));
  await waitFor(() => assert.equal(contact.socialLinks[1].url, 'https://facebook.com/nouvelle-page'));
  fireEvent.click(view.getByRole('button', { name: 'Retirer le lien 2' }));
  fireEvent.click(view.getByRole('button', { name: 'Enregistrer les coordonnées' }));
  await waitFor(() => assert.deepEqual(contact.socialLinks, [{ label: 'Instagram', url: 'https://instagram.com/funbike' }]));
  assert.ok(view.getByRole('button', { name: 'Ajouter Facebook' }));
});
