import { after, afterEach, before, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { readFileSync } from 'node:fs';
import { seedCatalog } from './helpers/catalog.mjs';

const defaults = JSON.parse(readFileSync('src/content/homepage-defaults.json', 'utf8'));
const adminCatalog = { brands: [{ id: 'tvs', name: 'TVS' }], categories: [], families: [], types: [], models: [], products: [] };
let dom, server, render, cleanup, fireEvent, waitFor, Home, AdminHomepage, ConfirmationProvider, content, catalog, originalFetch;
let data, revision, conflict, photoData, selected, calls;
const response = (body, ok = true) => ({ ok, json: async () => structuredClone(body) });
function setup() {
  data = structuredClone(defaults); revision = 'r1'; conflict = false; calls = []; selected = 'a'.repeat(32);
  photoData = { images: [{ id: selected, url: `/server/uploads/homepage/sherco-${selected}.png` }], selected };
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith('sherco-banner.php')) {
      if (options.method === 'POST') return response({ data: photoData, retired: [], legacy: false });
      return response({ data: photoData, retired: [], legacy: false });
    }
    if (!String(url).endsWith('homepage-content.php')) throw new Error(`Requête inattendue ${url}`);
    if (options.method === 'PUT') {
      if (conflict) return response({ error: 'Le contenu a changé depuis votre ouverture.' }, false);
      const body = JSON.parse(options.body); assert.equal(body.revision, revision);
      data = structuredClone(body.data); revision = 'r2';
    }
    return response({ data, revision, shercoBannerConfigured: true, shercoBannerImage: photoData.images[0].url });
  };
}
before(async () => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.HTMLElement = dom.window.HTMLElement; globalThis.Element = dom.window.Element; globalThis.SVGElement = dom.window.SVGElement; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  window.HTMLElement.prototype.scrollTo = () => {};
  globalThis.URL.createObjectURL = () => 'blob:preview'; globalThis.URL.revokeObjectURL = () => {};
  ({ render, cleanup, fireEvent, waitFor } = await import('@testing-library/react'));
  server = await createServer({ server: { middlewareMode: true }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] }, logLevel: 'silent' });
  catalog = await server.ssrLoadModule('/src/catalog/index.ts'); await seedCatalog(server);
  content = await server.ssrLoadModule('/src/content/homepage.ts');
  ({ default: Home } = await server.ssrLoadModule('/src/pages/Home.tsx'));
  ({ AdminHomepage } = await server.ssrLoadModule('/src/pages/AdminHomepage.tsx'));
  ({ ConfirmationProvider } = await server.ssrLoadModule('/src/components/ConfirmationModal.tsx'));
  originalFetch = globalThis.fetch;
});
afterEach(() => { cleanup(); globalThis.fetch = originalFetch; content.setHomepage(structuredClone(defaults)); });
after(async () => { dom.window.close(); await server.close(); });
function mountAdmin() {
  function Wrapper() {
    const [dirty, setDirty] = React.useState(false); const [saving, setSaving] = React.useState(false);
    return React.createElement(ConfirmationProvider, null, React.createElement(AdminHomepage, { catalog: adminCatalog, onToggle: async () => {}, dirty, saving, onDirtyChange: setDirty, onSavingChange: setSaving }));
  }
  return render(React.createElement(Wrapper));
}
test('onglet unique : textes, destination TVS et photo, changements non enregistrés préservés', async () => {
  setup(); const view = mountAdmin();
  fireEvent.click(view.getByRole('button', { name: 'Bannière de mise en avant' }));
  await waitFor(() => assert.ok(view.getByLabelText('Titre — ligne 1')));
  await waitFor(() => assert.ok(view.getByText('Photo affichée')));
  fireEvent.change(view.getByLabelText('Titre — ligne 1'), { target: { value: 'Nos motos TVS' } });
  fireEvent.change(view.getByLabelText('Marque du bouton (facultatif)'), { target: { value: 'tvs' } });
  const file = new window.File(['photo'], 'photo.png', { type: 'image/png' });
  fireEvent.change(view.getByLabelText(/Ajouter une photo/), { target: { files: [file] } });
  fireEvent.click(view.getByRole('button', { name: 'Ajouter la photo' }));
  await waitFor(() => assert.ok(view.getByText(/Image ajoutée/)));
  await waitFor(() => assert.equal(view.getByRole('button', { name: 'Textes et liens' }).disabled, false));
  fireEvent.click(view.getByRole('button', { name: 'Textes et liens' }));
  assert.ok(view.getByRole('alertdialog'), 'enregistrer la photo ne doit pas effacer la protection du brouillon texte');
  fireEvent.click(view.getByRole('button', { name: 'Continuer à modifier' }));
  fireEvent.click(view.getByRole('button', { name: 'Enregistrer les textes et le bouton' }));
  await waitFor(() => assert.ok(view.getByText(/Textes et destination enregistrés/)));
  assert.equal(data.content.sherco.titreLigne1, 'Nos motos TVS');
  assert.deepEqual(data.bannerLink, { to: 'motos', brandId: 'tvs' });
  assert.equal(photoData.selected, selected);
  assert.equal(data.content.hero.titreLigne1, defaults.content.hero.titreLigne1);
  await waitFor(() => assert.equal(view.getByRole('button', { name: 'Textes et liens' }).disabled, false));
  fireEvent.change(view.getByLabelText('Destination du bouton'), { target: { value: 'contact' } });
  assert.equal(view.getByLabelText('Marque du bouton (facultatif)').value, '');
  assert.equal(view.getByLabelText('Marque du bouton (facultatif)').disabled, true);
});
test('enregistrer les textes ne retire pas la protection de la photo en attente', async () => {
  setup(); const view = mountAdmin(); fireEvent.click(view.getByRole('button', { name: 'Bannière de mise en avant' }));
  await waitFor(() => assert.ok(view.getByLabelText('Titre — ligne 1')));
  await waitFor(() => assert.ok(view.getByLabelText(/Ajouter une photo/)));
  fireEvent.change(view.getByLabelText('Titre — ligne 1'), { target: { value: 'Mise en avant' } });
  fireEvent.change(view.getByLabelText(/Ajouter une photo/), { target: { files: [new window.File(['x'], 'photo.png', { type: 'image/png' })] } });
  fireEvent.click(view.getByRole('button', { name: 'Enregistrer les textes et le bouton' }));
  await waitFor(() => assert.ok(view.getByText(/Textes et destination enregistrés/)));
  await waitFor(() => assert.equal(view.getByRole('button', { name: 'Textes et liens' }).disabled, false));
  fireEvent.click(view.getByRole('button', { name: 'Textes et liens' }));
  assert.ok(view.getByRole('alertdialog')); assert.ok(view.getByAltText('Aperçu de la nouvelle photo'));
});
test('conflit sur les textes : brouillon et photo sélectionnée restent intacts', async () => {
  setup(); conflict = true; const view = mountAdmin(); fireEvent.click(view.getByRole('button', { name: 'Bannière de mise en avant' }));
  await waitFor(() => assert.ok(view.getByLabelText('Titre — ligne 1')));
  fireEvent.change(view.getByLabelText('Titre — ligne 1'), { target: { value: 'Brouillon' } });
  fireEvent.click(view.getByRole('button', { name: 'Enregistrer les textes et le bouton' }));
  await waitFor(() => assert.match(view.getByRole('alert').textContent, /changé depuis/));
  assert.equal(view.getByLabelText('Titre — ligne 1').value, 'Brouillon'); assert.equal(photoData.selected, selected);
});
test('site public : bannière toujours présente sans Sherco et bouton motos TVS fonctionnel', async () => {
  setup(); data.bannerLink = { to: 'motos', brandId: 'tvs' }; await content.loadHomepageData();
  const sherco = catalog.brands.find((b) => b.id === 'sherco'); const tvs = catalog.brands.find((b) => b.id === 'tvs');
  const previousSherco = sherco.isPublished, previousTvs = tvs.isPublished;
  sherco.isPublished = false; const navigations = [];
  try {
    const go = (...args) => navigations.push(args); const view = render(React.createElement(Home, { go }));
    assert.equal(view.getByAltText(data.content.sherco.imageAlt).getAttribute('src'), photoData.images[0].url);
    fireEvent.click(view.getByRole('button', { name: data.content.sherco.bouton })); assert.deepEqual(navigations.at(-1), ['motos', tvs.name]);
    tvs.isPublished = false; view.rerender(React.createElement(Home, { go }));
    fireEvent.click(view.getByRole('button', { name: data.content.sherco.bouton })); assert.deepEqual(navigations.at(-1), ['motos', undefined]);
  } finally { sherco.isPublished = previousSherco; tvs.isPublished = previousTvs; }
});
