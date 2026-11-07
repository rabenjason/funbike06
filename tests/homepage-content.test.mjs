import { after, before, afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { readFileSync } from 'node:fs';
import { seedCatalog } from './helpers/catalog.mjs';

let dom, server, render, cleanup, fireEvent, waitFor, Home, content, catalog, Editor, AdminHomepage, ConfirmationProvider, originalFetch;
const defaults = JSON.parse(readFileSync('server/api/_lib/homepage-defaults.json', 'utf8'));
const adminCatalog = { brands: [{ id: 'tvs', name: 'TVS', isEquipmentBrand: true }, { id: 'troy-lee-designs', name: 'Troy Lee Designs', isEquipmentBrand: true }], categories: [], families: [], types: [], models: [], products: [] };
let data, revision, requests, conflict, dirty, saving;
const setDirty = (value) => { dirty = value; };
const setSaving = (value) => { saving = value; };
const mockFetch = async (url, options = {}) => {
  requests.push({ url: String(url), options });
  if (String(url) !== '/server/api/homepage-content.php') throw new Error('Requête inattendue : ' + url);
  if (options.method === 'PUT') {
    if (conflict) return { ok: false, json: async () => ({ error: 'Le contenu a changé depuis votre ouverture.' }) };
    const body = JSON.parse(options.body);
    assert.equal(body.revision, revision);
    data = structuredClone(body.data); revision = 'r2';
  }
  return { ok: true, json: async () => ({ data: structuredClone(data), revision }) };
};
before(async () => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.HTMLElement = dom.window.HTMLElement; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  window.HTMLElement.prototype.scrollTo = () => {};
  ({ render, cleanup, fireEvent, waitFor } = await import('@testing-library/react'));
  server = await createServer({ server: { middlewareMode: true }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
  catalog = await server.ssrLoadModule('/src/catalog/index.ts'); await seedCatalog(server);
  content = await server.ssrLoadModule('/src/content/homepage.ts');
  ({ default: Home } = await server.ssrLoadModule('/src/pages/Home.tsx'));
  ({ HomepageContentEditor: Editor, AdminHomepage } = await server.ssrLoadModule('/src/pages/AdminHomepage.tsx'));
  ({ ConfirmationProvider } = await server.ssrLoadModule('/src/components/ConfirmationModal.tsx'));
  originalFetch = globalThis.fetch;
});
afterEach(() => { cleanup(); globalThis.fetch = originalFetch; content.setHomepage(structuredClone(defaults)); });
after(async () => { dom.window.close(); await server?.close(); });
function setup() { data = structuredClone(defaults); revision = 'r1'; requests = []; conflict = false; dirty = false; saving = false; globalThis.fetch = mockFetch; }

test('administration : modifier les textes, les liens et les marques, puis retrouver les valeurs sauvegardées', async () => {
  setup(); const view = render(React.createElement(Editor, { catalog: adminCatalog, onDirtyChange: setDirty, onSavingChange: setSaving }));
  await waitFor(() => assert.ok(view.getByText('Textes et liens de l’accueil')));
  fireEvent.click(view.getByText('Bandeau principal'));
  fireEvent.change(view.getByLabelText('Bandeau principal — Titre — ligne 1'), { target: { value: 'Un nouvel accueil' } });
  fireEvent.change(view.getByLabelText(/Bandeau principal — Usages du slogan animé/), { target: { value: 'la route\nla ville' } });
  fireEvent.change(view.getByLabelText('Titre du lien 1'), { target: { value: 'Toutes nos pièces' } });
  fireEvent.change(view.getByLabelText('Destination du lien 1'), { target: { value: 'spares' } });
  fireEvent.change(view.getByLabelText('Marque du lien 1 (facultatif)'), { target: { value: 'tvs' } });
  fireEvent.change(view.getByLabelText('Icône du lien 1'), { target: { value: 'parts' } });
  fireEvent.click(view.getByRole('button', { name: 'Ajouter un lien' }));
  fireEvent.change(view.getByLabelText('Titre du lien 5'), { target: { value: 'Nous contacter' } });
  fireEvent.change(view.getByLabelText('Destination du lien 5'), { target: { value: 'contact' } });
  fireEvent.click(view.getByRole('button', { name: 'Monter le lien 5' }));
  fireEvent.change(view.getByLabelText('Slogan de la marque 1'), { target: { value: 'Slogan édité' } });
  assert.equal(dirty, true);
  fireEvent.click(view.getByRole('button', { name: 'Enregistrer les textes et liens' }));
  await waitFor(() => assert.match(view.getByRole('status').textContent, /enregistrés/));
  assert.equal(dirty, false); assert.equal(saving, false);
  assert.equal(data.content.hero.titreLigne1, 'Un nouvel accueil');
  assert.deepEqual(data.content.hero.usages, ['la route', 'la ville']);
  assert.deepEqual(data.links[0], { title: 'Toutes nos pièces', to: 'spares', brandId: 'tvs', icon: 'parts' });
  assert.equal(data.links[3].title, 'Nous contacter'); assert.equal(data.exclusiveBrands[0].tagline, 'Slogan édité');
  view.unmount(); const again = render(React.createElement(Editor, { catalog: adminCatalog, onDirtyChange: setDirty, onSavingChange: setSaving }));
  await waitFor(() => assert.equal(again.getByLabelText('Titre du lien 1').value, 'Toutes nos pièces'));
});

test('erreur et conflit : le brouillon reste visible et le serveur n’est pas écrasé', async () => {
  setup(); conflict = true; const view = render(React.createElement(Editor, { catalog: adminCatalog, onDirtyChange: setDirty, onSavingChange: setSaving }));
  await waitFor(() => assert.ok(view.getByLabelText('Titre du lien 1')));
  fireEvent.change(view.getByLabelText('Titre du lien 1'), { target: { value: 'Mon brouillon' } });
  fireEvent.click(view.getByRole('button', { name: 'Enregistrer les textes et liens' }));
  await waitFor(() => assert.match(view.getByRole('alert').textContent, /changé depuis/));
  assert.equal(view.getByLabelText('Titre du lien 1').value, 'Mon brouillon');
  assert.equal(data.links[0].title, defaults.links[0].title); assert.equal(dirty, true); assert.equal(saving, false);
});

test('site public : le contenu chargé et les liens configurés sont affichés et fonctionnent', async () => {
  setup(); data.content.hero.titreLigne1 = 'Bienvenue personnalisé'; data.content.univers.titre = 'Notre sélection';
  data.links = [{ title: 'Voir les pièces TVS', to: 'spares', brandId: 'tvs', icon: 'parts' }];
  await content.loadHomepageData();
  const navigations = []; const view = render(React.createElement(Home, { go: (...args) => navigations.push(args) }));
  assert.match(view.container.querySelector('h1').textContent, /Bienvenue personnalisé/); assert.ok(view.getByText('Notre sélection'));
  fireEvent.click(view.getByRole('button', { name: /Voir les pièces TVS/ }));
  assert.deepEqual(navigations.at(-1), ['spares', 'tvs']);
  const brand = catalog.brands.find((b) => b.id === 'tvs'); const published = brand.isPublished; brand.isPublished = false;
  try { view.rerender(React.createElement(Home, { go: (...args) => navigations.push(args) })); fireEvent.click(view.getByRole('button', { name: /Voir les pièces TVS/ })); assert.deepEqual(navigations.at(-1), ['spares', undefined]); } finally { brand.isPublished = published; }
  assert.equal(view.container.innerHTML.includes('wp-content/themes/funbike/images/piece.jpg'), false);
});

test('chargement public en erreur : ne pas remplacer le contenu courant', async () => {
  setup(); data.content.univers.titre = 'Version précédente'; content.setHomepage(structuredClone(data));
  globalThis.fetch = async () => ({ ok: false });
  await assert.rejects(content.loadHomepageData());
  assert.equal(content.homepageContent.univers.titre, 'Version précédente');
});

test('navigation : une confirmation protège les changements non enregistrés', async () => {
  setup();
  function Example() {
    const [isDirty, setIsDirty] = React.useState(false);
    const [isSaving, setIsSaving] = React.useState(false);
    return React.createElement(ConfirmationProvider, null, React.createElement(AdminHomepage, { catalog: adminCatalog, onToggle: async () => {}, dirty: isDirty, saving: isSaving, onDirtyChange: setIsDirty, onSavingChange: setIsSaving }));
  }
  const view = render(React.createElement(Example));
  fireEvent.click(view.getByRole('button', { name: 'Textes et liens' }));
  await waitFor(() => assert.ok(view.getByLabelText('Titre du lien 1')));
  fireEvent.change(view.getByLabelText('Titre du lien 1'), { target: { value: 'Brouillon à préserver' } });
  fireEvent.click(view.getByRole('button', { name: 'Sélections de produits' }));
  assert.ok(view.getByRole('alertdialog'));
  fireEvent.click(view.getByRole('button', { name: 'Continuer à modifier' }));
  await waitFor(() => assert.equal(view.getByLabelText('Titre du lien 1').value, 'Brouillon à préserver'));
  fireEvent.click(view.getByRole('button', { name: 'Sélections de produits' }));
  fireEvent.click(view.getByRole('button', { name: 'Abandonner' }));
  await waitFor(() => assert.ok(view.getByRole('button', { name: 'Nouveautés' })));
  assert.equal(data.links[0].title, defaults.links[0].title);
});

test('marque officielle sans motos : le lien ouvre les équipements de cette marque', async () => {
  setup(); data.exclusiveBrands = [{ brandId: 'troy-lee-designs', tagline: 'Équipements' }];
  await content.loadHomepageData();
  const calls = []; const view = render(React.createElement(Home, { go: (...args) => calls.push(args) }));
  const brandButton = view.getByText('Équipements', { selector: 'p' }).closest('button');
  assert.ok(brandButton); fireEvent.click(brandButton);
  assert.deepEqual(calls.at(-1), ['equipements', 'troy-lee-designs']);
});

test('le tableau de bord demande confirmation avant de quitter les textes modifiés', async () => {
  setup(); const { default: Admin } = await server.ssrLoadModule('/src/pages/Admin.tsx');
  globalThis.fetch = async (url, options = {}) => {
    const path = String(url).replace('/server/api/', '');
    if (path === 'homepage-content.php') return mockFetch(url, options);
    const responses = {
      'auth/me.php': { user: { id: 'admin', username: 'admin', role: 'admin', mustChangePassword: false } },
      'messages.php?count=unread': { unreadCount: 0 }, 'brands.php?includeDrafts=1': { brands: adminCatalog.brands },
      'categories.php': { categories: [] }, 'families.php': { families: [] }, 'product-types.php': { productTypes: [] }, 'models.php?includeDrafts=1': { models: [] },
      'products/motorcycles.php?includeDrafts=1': { data: [] }, 'products/helmets.php?includeDrafts=1': { data: [] },
      'products/riding-gear.php?includeDrafts=1': { data: [] }, 'products/spare-parts.php?includeDrafts=1': { data: [] },
    };
    return { ok: !!responses[path], json: async () => responses[path] ?? { error: 'inconnu' } };
  };
  const view = render(React.createElement(Admin));
  await waitFor(() => assert.ok(view.getByRole('button', { name: 'Accueil' })));
  fireEvent.click(view.getByRole('button', { name: 'Accueil' }));
  fireEvent.click(view.getByRole('button', { name: 'Textes et liens' }));
  await waitFor(() => assert.ok(view.getByLabelText('Titre du lien 1')));
  fireEvent.change(view.getByLabelText('Titre du lien 1'), { target: { value: 'Changement non enregistré' } });
  const unload = new window.Event('beforeunload', { cancelable: true });
  window.dispatchEvent(unload); assert.equal(unload.defaultPrevented, true);
  fireEvent.click(view.getByRole('button', { name: 'Messages' }));
  assert.ok(view.getByRole('alertdialog'));
  fireEvent.click(view.getByRole('button', { name: 'Continuer à modifier' }));
  await waitFor(() => assert.equal(view.getByLabelText('Titre du lien 1').value, 'Changement non enregistré'));
});

test('les usages animés administrés restent du texte et non du HTML', async () => {
  const { default: TypedText } = await server.ssrLoadModule('/src/components/TypedText.tsx');
  const view = render(React.createElement(TypedText, { strings: ['<img src=x onerror=alert(1)>'] }));
  await new Promise((resolve) => setTimeout(resolve, 1900));
  assert.equal(view.container.querySelector('img'), null);
  assert.match(view.container.textContent, /<img/);
});
