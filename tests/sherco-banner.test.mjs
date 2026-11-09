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
let data, retired, legacy, calls, fail, dirty;
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
  data = { images: [], selected: null }; retired = []; legacy = true; calls = []; fail = false; dirty = false;
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (fail) return response({ error: 'Erreur serveur' }, false);
    if (!options.method) return response({ data, retired, legacy });
    if (options.method === 'POST') { const next = image(data.images.length ? id2 : id1); data.images.push(next); if (!data.selected) data.selected = next.id; legacy = false; }
    if (options.method === 'PUT') { const { id, action } = JSON.parse(options.body); if (action === 'restore') { data.images.push(retired.find((item) => item.id === id)); retired = retired.filter((item) => item.id !== id); } else { data.selected = id; legacy = false; } }
    if (options.method === 'DELETE') { const { id, action } = JSON.parse(options.body); if (action === 'purge') retired = retired.filter((item) => item.id !== id); else { retired.push(data.images.find((item) => item.id === id)); data.images = data.images.filter((item) => item.id !== id); if (data.selected === id) data.selected = null; } }
    return response({ data, retired, legacy });
  };
}
test('administration : aperçu, ajout, sélection et retrait seulement après confirmation', async () => {
  setup(); const view = render(React.createElement(ConfirmationProvider, null, React.createElement(AdminBanner, { onDirtyChange: (v) => { dirty = v; }, onSavingChange() {} })));
  await waitFor(() => assert.ok(view.getByText(/encore hébergée chez Sherco/)));
  const input = view.getByLabelText(/Ajouter une photo/);
  const chooser = view.getByText('Choisir une photo à ajouter');
  const label = chooser.closest('label');
  assert.ok(label.contains(input), 'toute la zone ouvre le sélecteur de fichier');
  assert.ok(label.querySelector('[aria-hidden="true"] svg'), 'le symbole de téléversement est visible et décoratif');
  assert.match(view.container.querySelector(`#${input.getAttribute('aria-describedby')}`).textContent, /8 Mo maximum/);
  let chooserOpened = false;
  input.addEventListener('click', () => { chooserOpened = true; }, { once: true });
  fireEvent.click(chooser);
  assert.ok(chooserOpened, 'un clic sur le texte active le champ fichier');
  assert.equal(input.disabled, false);
  input.focus();
  assert.equal(document.activeElement, input, 'le champ reste accessible au clavier');
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
  fireEvent.click(view.getByText('Photos retirées ou retrouvées (1)'));
  assert.ok(view.getByAltText('Photo retirée 1'));
  fireEvent.click(view.getByRole('button', { name: 'Restaurer la photo retirée 1' }));
  await waitFor(() => assert.equal(data.images.length, 2));
  assert.equal(data.selected, null, 'restaurer ne change pas la bannière publique');
  fireEvent.click(view.getAllByRole('button', { name: 'Retirer' })[1]);
  fireEvent.click(view.getByRole('button', { name: 'Retirer l’image' }));
  await waitFor(() => assert.equal(retired.length, 1));
  fireEvent.click(view.getByRole('button', { name: 'Supprimer définitivement la photo retirée 1' }));
  assert.match(view.getByRole('alertdialog').textContent, /sauvegarde/);
  fireEvent.click(view.getByRole('button', { name: 'Annuler' }));
  assert.equal(retired.length, 1, 'annuler ne supprime rien');
  fireEvent.click(view.getByRole('button', { name: 'Supprimer définitivement la photo retirée 1' }));
  fireEvent.click(view.getByRole('button', { name: 'Supprimer définitivement' }));
  await waitFor(() => assert.equal(retired.length, 0));
  assert.equal(data.images.length, 1, 'la photo active est préservée');
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

test('suppression définitive en erreur : la liste et les autres photos restent intactes', async () => {
  setup(); data = { images: [image(id1)], selected: id1 }; retired = [image(id2)]; legacy = false;
  const view = render(React.createElement(ConfirmationProvider, null, React.createElement(AdminBanner, { onDirtyChange() {}, onSavingChange() {} })));
  await waitFor(() => assert.ok(view.getByText('Photos retirées ou retrouvées (1)')));
  fireEvent.click(view.getByText('Photos retirées ou retrouvées (1)'));
  fireEvent.click(view.getByRole('button', { name: 'Supprimer définitivement la photo retirée 1' }));
  fail = true; fireEvent.click(view.getByRole('button', { name: 'Supprimer définitivement' }));
  await waitFor(() => assert.match(view.getByRole('alert').textContent, /Erreur serveur/));
  assert.equal(retired.length, 1); assert.equal(data.selected, id1); assert.ok(view.getByAltText('Photo retirée 1'));
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
