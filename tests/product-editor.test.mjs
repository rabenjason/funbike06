import { after, before, beforeEach, afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

let server, ProductEditor, render, fireEvent, waitFor, cleanup, dom, calls, revoked, originalFetch, originalFormData, originalURL;
const catalog = { brands: [{ id: 'tvs', name: 'TVS' }], categories: [{ id: 'motos', name: 'Motos' }], families: [{ id: 'urbain', name: 'Urbain', categoryId: 'motos' }], types: [{ id: 'urbain', name: 'Urbain', categoryId: 'motos', familyId: 'urbain' }], models: [], products: [] };
const image = (id, isMain, position) => ({ id, url: '/' + id + '.jpg', altText: id, isMain, position });
const current = { id: 'moto-test', name: 'Moto test', brandId: 'tvs', categoryId: 'motos', productTypeId: 'urbain', description: '', price: '', status: 'DRAFT', isNewArrival: false, images: [image('premiere', true, 0), image('autre', false, 1)], specifications: [] };

before(async () => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost:5173/' });
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  originalFetch = globalThis.fetch; originalFormData = globalThis.FormData; originalURL = globalThis.URL;
  globalThis.FormData = dom.window.FormData;
  globalThis.URL.createObjectURL = (file) => `blob:${file.name}`;
  globalThis.URL.revokeObjectURL = (url) => revoked.push(url);
  ({ render, fireEvent, waitFor, cleanup } = await import('@testing-library/react'));
  server = await createServer({ server: { middlewareMode: true }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
  ({ ProductEditor } = await server.ssrLoadModule('/src/pages/Admin.tsx'));
});
beforeEach(() => { calls = []; revoked = []; globalThis.fetch = async (url, options) => { calls.push({ url, options }); return { ok: true, json: async () => ({}) }; }; });
afterEach(() => { cleanup(); });
after(async () => {
  globalThis.fetch = originalFetch; globalThis.FormData = originalFormData;
  delete originalURL.createObjectURL; delete originalURL.revokeObjectURL;
  dom.window.close(); await server?.close();
});
const file = (name) => new dom.window.File(['image'], name, { type: 'image/png' });

test('modifier : aperçu immédiat, choix de nouvelle principale et conservation des anciennes', async () => {
  let closed = false;
  const view = render(React.createElement(ProductEditor, { catalog, current, close: () => { closed = true; }, refresh: async () => {} }));
  fireEvent.change(view.getByLabelText('Ajouter des photos (JPG, PNG ou WebP)'), { target: { files: [file('ajout.png'), file('ajout2.png')] } });
  assert.ok(view.getByAltText('ajout.png')); assert.equal(view.getByAltText('ajout.png').getAttribute('src'), 'blob:ajout.png');
  const newCard = view.getByAltText('ajout.png').closest('div').parentElement;
  fireEvent.click([...newCard.querySelectorAll('button')].find((button) => button.textContent.includes('Définir comme principale')));
  assert.match(newCard.textContent, /Photo principale/);
  assert.equal(calls.length, 0, 'aucun enregistrement avant le clic');
  fireEvent.submit(view.container.querySelector('form'));
  await waitFor(() => assert.equal(closed, true));
  const form = calls[0].options.body; const product = JSON.parse(form.get('product'));
  assert.equal(form.get('mainImage').name, 'ajout.png'); assert.equal(form.getAll('gallery[]')[0].name, 'ajout2.png');
  assert.deepEqual(product.images.map((p) => [p.url, p.isMain]), [['/premiere.jpg', false], ['/autre.jpg', false]]);
  view.unmount(); assert.ok(revoked.includes('blob:ajout.png')); assert.ok(revoked.includes('blob:ajout2.png'));
});

test('ajouter : plusieurs photos, nouvelle principale et retrait avant enregistrement', async () => {
  const view = render(React.createElement(ProductEditor, { catalog, close() {}, refresh: async () => {} }));
  fireEvent.change(view.getByLabelText('Ajouter des photos (JPG, PNG ou WebP)'), { target: { files: [file('une.png'), file('deux.png')] } });
  const first = view.getByAltText('une.png').closest('div').parentElement;
  assert.match(first.textContent, /Photo principale/);
  const second = view.getByAltText('deux.png').closest('div').parentElement;
  fireEvent.click([...second.querySelectorAll('button')].find((button) => button.textContent.includes('Définir comme principale')));
  fireEvent.click([...first.querySelectorAll('button')].find((button) => button.textContent.includes('Retirer')));
  assert.ok(revoked.includes('blob:une.png')); assert.equal(view.queryByAltText('une.png'), null);
  fireEvent.submit(view.container.querySelector('form'));
  await waitFor(() => assert.equal(calls.length, 1));
  assert.equal(calls[0].options.body.get('mainImage').name, 'deux.png');
});

test('retirer la principale impose un nouveau choix, puis une ancienne photo peut être choisie', async () => {
  const view = render(React.createElement(ProductEditor, { catalog, current, close() {}, refresh: async () => {} }));
  const first = view.getByAltText('premiere').closest('div').parentElement;
  fireEvent.click([...first.querySelectorAll('button')].find((button) => button.textContent.includes('Retirer')));
  assert.match(view.container.textContent, /Choisissez une nouvelle photo principale/);
  fireEvent.submit(view.container.querySelector('form'));
  await waitFor(() => assert.match(view.getByRole('alert').textContent, /Choisissez une photo principale/));
  assert.equal(calls.length, 0);
  fireEvent.click(view.getByText('Définir comme principale'));
  fireEvent.submit(view.container.querySelector('form'));
  await waitFor(() => assert.equal(calls.length, 1));
  const product = JSON.parse(calls[0].options.body.get('product'));
  assert.equal(product.images.length, 1); assert.equal(product.images[0].url, '/autre.jpg'); assert.equal(product.images[0].isMain, true);
});

test('création depuis une promotion : la fiche et la photo sont envoyées une seule fois', async () => {
  const savedProduct = { ...current, id: 'produit-nouveau', name: 'Nouvelle moto', images: [] };
  let received, failed;
  globalThis.fetch = async (url, options) => { calls.push({ url, options }); return { ok: true, json: async () => ({ data: savedProduct }) }; };
  const view = render(React.createElement(ProductEditor, { catalog, close() {}, refresh: async () => {}, onSaved: (product, refreshFailed) => { received = product; failed = refreshFailed; } }));
  fireEvent.change(view.getByLabelText('Nom'), { target: { value: savedProduct.name } });
  fireEvent.change(view.getByLabelText('Ajouter des photos (JPG, PNG ou WebP)'), { target: { files: [file('nouvelle.png')] } });
  fireEvent.submit(view.container.querySelector('form'));
  await waitFor(() => assert.ok(received));
  assert.equal(calls.length, 1); assert.match(calls[0].url, /products\/motorcycles.php$/);
  assert.equal(calls[0].options.body.get('mainImage').name, 'nouvelle.png');
  assert.equal(received.id, 'produit-nouveau'); assert.equal(failed, false);
});

test('optimisation indisponible : l’original est conservé, le statut est visible et l’envoi attend la fin', async () => {
  const changes = [];
  const view = render(React.createElement(ProductEditor, { catalog, current, close() {}, refresh: async () => {}, onBusyChange: (busy) => changes.push(busy) }));
  const original = new dom.window.File([new Uint8Array(150 * 1024)], 'image.jpg', { type: 'image/jpeg' });
  fireEvent.change(view.getByLabelText('Ajouter des photos (JPG, PNG ou WebP)'), { target: { files: [original] } });
  assert.match(view.container.textContent, /Optimisation des photos en cours/);
  assert.equal(view.getByRole('button', { name: 'Optimisation…' }).disabled, true);
  fireEvent.submit(view.container.querySelector('form'));
  assert.equal(calls.length, 0, 'aucun envoi pendant le traitement');
  await waitFor(() => assert.match(view.container.textContent, /Optimisation impossible, original conservé/));
  assert.deepEqual(changes, [true, false]);
  const card = view.getByAltText('image.jpg').closest('div').parentElement;
  fireEvent.click([...card.querySelectorAll('button')].find((button) => button.textContent.includes('Définir comme principale')));
  fireEvent.submit(view.container.querySelector('form'));
  await waitFor(() => assert.equal(calls.length, 1));
  assert.equal(calls[0].options.body.get('mainImage').name, 'image.jpg');
  assert.deepEqual(JSON.parse(calls[0].options.body.get('product')).images.map((p) => p.url), ['/premiere.jpg', '/autre.jpg']);
});

test('fermeture pendant l’optimisation : pas d’envoi et libération de l’aperçu', () => {
  const view = render(React.createElement(ProductEditor, { catalog, current, close() {}, refresh: async () => {} }));
  const original = new dom.window.File([new Uint8Array(150 * 1024)], 'image-longue.jpg', { type: 'image/jpeg' });
  fireEvent.change(view.getByLabelText('Ajouter des photos (JPG, PNG ou WebP)'), { target: { files: [original] } });
  view.unmount();
  assert.equal(calls.length, 0); assert.ok(revoked.includes('blob:image-longue.jpg'));
});
