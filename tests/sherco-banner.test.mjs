import { after, before, afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

let dom, server, Banner, AdminBanner, ConfirmationProvider, content, render, cleanup, fireEvent, waitFor, originalFetch;
const defaults = JSON.parse(readFileSync('src/content/homepage-defaults.json', 'utf8'));
const id1 = 'a'.repeat(32), id2 = 'b'.repeat(32);
const image = (id) => ({ id, url: `/server/uploads/homepage/sherco-${id}.png` });
let data, legacy, calls, fail, dirty;
before(async () => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Element = dom.window.Element; globalThis.SVGElement = dom.window.SVGElement; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window); globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
  globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  globalThis.URL.createObjectURL = () => 'blob:preview'; globalThis.URL.revokeObjectURL = () => {};
  ({ render, cleanup, fireEvent, waitFor } = await import('@testing-library/react'));
  server = await createServer({ server: { middlewareMode: true }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] }, logLevel: 'silent' });
  content = await server.ssrLoadModule('/src/content/homepage.ts');
  ({ default: Banner } = await server.ssrLoadModule('/src/components/ShercoBanner.tsx'));
  ({ AdminShercoBanner: AdminBanner } = await server.ssrLoadModule('/src/pages/AdminShercoBanner.tsx'));
  ({ ConfirmationProvider } = await server.ssrLoadModule('/src/components/ConfirmationModal.tsx'));
  originalFetch = globalThis.fetch;
});
afterEach(() => { cleanup(); globalThis.fetch = originalFetch; });
after(async () => { dom.window.close(); await server?.close(); });
const response = (body, ok = true) => ({ ok, json: async () => structuredClone(body) });
function setup() {
  data = { images: [], selected: null }; legacy = true; calls = []; fail = false; dirty = false;
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (fail) return response({ error: 'Erreur serveur' }, false);
    if (!options.method) return response({ data, legacy });
    if (options.method === 'POST') { const next = image(data.images.length ? id2 : id1); data.images.push(next); if (!data.selected) data.selected = next.id; }
    if (options.method === 'PUT') data.selected = JSON.parse(options.body).id;
    if (options.method === 'DELETE') { const id = JSON.parse(options.body).id; data.images = data.images.filter((item) => item.id !== id); if (data.selected === id) data.selected = null; }
    legacy = false; return response({ data });
  };
}
test('administration : aperçu, ajout, sélection et retrait seulement après confirmation', async () => {
  setup(); const view = render(React.createElement(ConfirmationProvider, null, React.createElement(AdminBanner, { onDirtyChange: (v) => { dirty = v; }, onSavingChange() {} })));
  await waitFor(() => assert.ok(view.getByText(/encore hébergée chez Sherco/)));
  const input = view.getByLabelText(/Ajouter une photo/);
  fireEvent.change(input, { target: { files: [new window.File(['photo'], 'photo.png', { type: 'image/png' })] } });
  assert.equal(dirty, true); assert.ok(view.getByAltText('Aperçu de la nouvelle photo'));
  fireEvent.click(view.getByRole('button', { name: 'Annuler' })); assert.equal(dirty, false); assert.equal(calls.length, 1);
  fireEvent.change(input, { target: { files: [new window.File(['photo'], 'photo.png', { type: 'image/png' })] } });
  fireEvent.click(view.getByRole('button', { name: 'Ajouter la photo' }));
  await waitFor(() => assert.ok(view.getByText('Photo affichée'))); assert.equal(data.selected, id1); assert.equal(dirty, false);
  fireEvent.change(input, { target: { files: [new window.File(['photo'], 'autre.png', { type: 'image/png' })] } });
  fireEvent.click(view.getByRole('button', { name: 'Ajouter la photo' }));
  await waitFor(() => assert.equal(view.getAllByRole('button', { name: 'Afficher cette photo' }).length, 2));
  assert.equal(data.selected, id1);
  fireEvent.click(view.getAllByRole('button', { name: 'Afficher cette photo' })[1]);
  await waitFor(() => assert.equal(data.selected, id2));
  fireEvent.click(view.getAllByRole('button', { name: 'Retirer' })[1]);
  assert.ok(view.getByRole('alertdialog')); assert.equal(data.images.length, 2);
  fireEvent.click(view.getByRole('button', { name: 'Annuler' })); assert.equal(data.images.length, 2);
  fireEvent.click(view.getAllByRole('button', { name: 'Retirer' })[1]);
  fireEvent.click(view.getByRole('button', { name: 'Retirer l’image' }));
  await waitFor(() => assert.equal(data.images.length, 1)); assert.equal(data.selected, null);
  assert.ok(view.getByText(/Aucune photo n’est sélectionnée/));
});

test('une erreur d’envoi conserve la photo précédente et l’aperçu', async () => {
  setup(); data = { images: [image(id1)], selected: id1 }; legacy = false;
  const view = render(React.createElement(ConfirmationProvider, null, React.createElement(AdminBanner, { onDirtyChange: (v) => { dirty = v; }, onSavingChange() {} })));
  await waitFor(() => assert.ok(view.getByText('Photo affichée')));
  fireEvent.change(view.getByLabelText(/Ajouter une photo/), { target: { files: [new window.File(['x'], 'photo.png', { type: 'image/png' })] } });
  fail = true; fireEvent.click(view.getByRole('button', { name: 'Ajouter la photo' }));
  await waitFor(() => assert.match(view.getByRole('alert').textContent, /Erreur serveur/));
  assert.equal(data.selected, id1); assert.equal(dirty, true); assert.ok(view.getByAltText('Aperçu de la nouvelle photo'));
});

test('site public : transition initiale, image locale sélectionnée et absence de photo', async () => {
  globalThis.fetch = async () => response({ data: defaults, shercoBannerConfigured: false, shercoBannerImage: null });
  await content.loadHomepageData();
  let view = render(React.createElement(Banner, { go() {} }));
  assert.match(view.getByAltText(defaults.content.sherco.imageAlt).getAttribute('src'), /^https:\/\/www\.sherco\.com/); view.unmount();
  globalThis.fetch = async () => response({ data: defaults, shercoBannerConfigured: true, shercoBannerImage: image(id1).url });
  await content.loadHomepageData(); view = render(React.createElement(Banner, { go() {} }));
  assert.equal(view.getByAltText(defaults.content.sherco.imageAlt).getAttribute('src'), image(id1).url); view.unmount();
  globalThis.fetch = async () => response({ data: defaults, shercoBannerConfigured: true, shercoBannerImage: null });
  await content.loadHomepageData(); view = render(React.createElement(Banner, { go() {} }));
  assert.equal(view.queryByAltText(defaults.content.sherco.imageAlt), null); assert.ok(view.container.querySelector('h2').textContent.includes(defaults.content.sherco.titreLigne1)); view.unmount();
  globalThis.fetch = async () => response({ data: defaults, shercoBannerConfigured: true, shercoBannerImage: 'https://evil.invalid/x' });
  await assert.rejects(content.loadHomepageData(), /invalide/);
});
