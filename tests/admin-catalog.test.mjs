import { after, before, beforeEach, afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import React, { useState } from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
let server, HomepageManager, ProductList, render, fireEvent, waitFor, cleanup, within, dom;
const bike = (n, extra = {}) => ({ id: `bike-${n}`, name: `Moto numéro ${n}`, categoryId: 'motos', productTypeId: 'enduro', brandId: 'sherco', description: '', status: 'PUBLISHED', isNewArrival: true, isMotoAccueil: true, isHomepageHero: n === 1, images: [], specifications: [], ...extra });
const gear = (n) => ({ ...bike(`g${n}`), name: `Casque modèle ${n}`, categoryId: 'casques', productTypeId: 'casque', brandId: 'tvs', isNewArrival: false, isMotoAccueil: false, isEquipementAccueil: n === 1 });
const catalog = { brands: [{ id: 'sherco', name: 'Sherco' }, { id: 'tvs', name: 'TVS' }], categories: [{ id: 'motos', name: 'Motos' }, { id: 'casques', name: 'Casques' }], families: [{ id: 'off-road', name: 'Off-road', categoryId: 'motos' }], types: [{ id: 'enduro', name: 'Enduro', categoryId: 'motos', familyId: 'off-road' }, { id: 'casque', name: 'Casque', categoryId: 'casques' }], models: [], products: [...Array.from({ length: 22 }, (_, i) => bike(i + 1)), bike(23, { status: 'DRAFT' }), gear(1), gear(2)] };
before(async () => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost:5173/' });
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.HTMLElement = dom.window.HTMLElement; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  ({ render, fireEvent, waitFor, cleanup, within } = await import('@testing-library/react'));
  server = await createServer({ server: { middlewareMode: true }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
  ({ HomepageManager, ProductList } = await server.ssrLoadModule('/src/pages/AdminCatalog.tsx'));
});
afterEach(() => cleanup());
after(async () => { dom.window.close(); await server?.close(); });

test('Accueil : toutes les sélections sont accessibles, y compris après la troisième et les brouillons', () => {
  const view = render(React.createElement(HomepageManager, { catalog, onToggle: async () => {} }));
  assert.match(view.container.textContent, /23 sélectionnés · 22 visibles avant limite/);
  assert.match(view.container.textContent, /Page 1 \/ 3/);
  assert.ok(view.getByText('Moto numéro 1'));
  assert.match(view.getByText('Moto numéro 1').closest('.flex.flex-wrap').textContent, /Affiché sur le site/);
  assert.match(view.getByText('Moto numéro 4').closest('.flex.flex-wrap').textContent, /Hors limite d’affichage/);
  assert.equal(view.queryByText('Moto numéro 11'), null);
  fireEvent.click(view.getByRole('button', { name: 'Suivant' }));
  assert.ok(view.getByText('Moto numéro 11'));
  fireEvent.click(view.getByRole('button', { name: 'Suivant' }));
  assert.ok(view.getByText('Moto numéro 23'));
  assert.ok(view.getByText('Brouillon'));
  fireEvent.click(view.getByRole('button', { name: 'Motos accueil' }));
  assert.match(view.container.textContent, /23 sélectionnés/);
  fireEvent.click(view.getByRole('button', { name: 'Bandeau' }));
  assert.match(view.container.textContent, /1 sélectionné/);
  fireEvent.click(view.getByRole('button', { name: 'Équipements accueil' }));
  assert.ok(view.getByText('Casque modèle 1'));
});

test('Accueil : ajouter et retirer ne change que le champ sélectionné et conserve les autres sections', async () => {
  const calls = [];
  function Example() {
    const [state, setState] = useState(catalog);
    const toggle = async (product, field, value) => {
      calls.push({ product, field, value });
      setState((p) => ({ ...p, products: p.products.map((v) => v.id === product.id ? { ...v, [field]: value } : v) }));
    };
    return React.createElement(HomepageManager, { catalog: state, onToggle: toggle });
  }
  const view = render(React.createElement(Example));
  fireEvent.click(view.getByRole('button', { name: /Retirer Moto numéro 1 de Nouveautés/ }));
  await waitFor(() => assert.equal(calls.length, 1));
  assert.equal(calls[0].field, 'isNewArrival'); assert.equal(calls[0].value, false);
  assert.equal(view.queryByText('Moto numéro 1'), null);
  fireEvent.click(view.getByRole('button', { name: 'Bandeau' }));
  assert.ok(view.getByText('Moto numéro 1'), 'la sélection du bandeau reste inchangée');
  fireEvent.click(view.getByRole('button', { name: 'Nouveautés' }));
  fireEvent.click(view.getByRole('button', { name: /Tous les produits/ }));
  fireEvent.click(view.getByRole('button', { name: /Ajouter Moto numéro 1 à Nouveautés/ }));
  await waitFor(() => assert.equal(calls.length, 2));
  assert.equal(calls[1].value, true);
  assert.match(view.container.textContent, /23 sélectionnés/);
});

test('Accueil : une erreur de sauvegarde est affichée sans modifier les choix', async () => {
  const view = render(React.createElement(HomepageManager, { catalog, onToggle: async () => { throw new Error('Échec API'); } }));
  fireEvent.click(view.getByRole('button', { name: /Retirer Moto numéro 1 de Nouveautés/ }));
  await waitFor(() => assert.equal(view.getByRole('alert').textContent, 'Échec API'));
  assert.ok(view.getByText('Moto numéro 1'));
});

test('Produits : recherche accent-insensible, filtres liés et pagination', () => {
  let edited;
  const view = render(React.createElement(ProductList, { catalog, onEdit: (p) => { edited = p.id; }, onDelete() {}, onAdd() {} }));
  assert.match(view.container.textContent, /25 produits trouvés/);
  assert.match(view.container.textContent, /Page 1 \/ 3/);
  fireEvent.click(view.getByRole('button', { name: 'Suivant' }));
  assert.ok(view.getByText('Moto numéro 11'));
  const row = view.getByText('Moto numéro 11').closest('.flex.flex-wrap');
  fireEvent.click(within(row).getByRole('button', { name: 'Modifier' })); assert.equal(edited, 'bike-11');
  fireEvent.change(view.getByLabelText('Recherche'), { target: { value: 'sherco numero 23' } });
  assert.match(view.container.textContent, /1 produit trouvé/); assert.ok(view.getByText('Moto numéro 23')); assert.match(view.container.textContent, /Page 1 \/ 1/);
  fireEvent.click(view.getByRole('button', { name: 'Effacer les filtres' }));
  fireEvent.change(view.getByLabelText('Catégorie'), { target: { value: 'casques' } });
  assert.match(view.container.textContent, /2 produits trouvés/);
  assert.ok(view.getByRole('option', { name: 'Casque' })); assert.equal(view.queryByRole('option', { name: 'Enduro' }), null);
  fireEvent.change(view.getByLabelText('Type'), { target: { value: 'casque' } });
  fireEvent.change(view.getByLabelText('Marque'), { target: { value: 'tvs' } });
  assert.ok(view.getByText('Casque modèle 1'));
  fireEvent.change(view.getByLabelText('Statut'), { target: { value: 'DRAFT' } });
  assert.match(view.container.textContent, /Aucun produit ne correspond/);
  fireEvent.click(view.getByRole('button', { name: 'Effacer les filtres' }));
  assert.match(view.container.textContent, /25 produits trouvés/);
});

test('l’administration relie Accueil à l’API et garde la sélection après changement d’onglet', async () => {
  const { default: Admin } = await server.ssrLoadModule('/src/pages/Admin.tsx');
  const previousFetch = globalThis.fetch;
  const records = structuredClone(catalog.products);
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    const path = String(url).replace('/server/api/', '');
    calls.push({ path, options });
    const fixed = { 'messages.php?count=unread': { unreadCount: 0 }, 'auth/me.php': { user: { id: 'admin', username: 'admin', role: 'superadmin', mustChangePassword: false } }, 'brands.php?includeDrafts=1': { brands: catalog.brands }, 'categories.php': { categories: catalog.categories }, 'families.php': { families: catalog.families }, 'product-types.php': { productTypes: catalog.types }, 'models.php?includeDrafts=1': { models: [] } };
    if (path === 'homepage-selections.php') {
      const { id, categoryId, field, value } = JSON.parse(options.body);
      const product = records.find((p) => p.id === id && p.categoryId === categoryId);
      product[field] = value;
      return { ok: true, json: async () => ({ data: structuredClone(product) }) };
    }
    const productPaths = { 'products/motorcycles.php?includeDrafts=1': 'motos', 'products/helmets.php?includeDrafts=1': 'casques', 'products/riding-gear.php?includeDrafts=1': 'equipements', 'products/spare-parts.php?includeDrafts=1': 'pieces-detachees' };
    const data = fixed[path] ?? (productPaths[path] ? { data: structuredClone(records.filter((p) => p.categoryId === productPaths[path])) } : null);
    return { ok: !!data, json: async () => data ?? { error: 'inconnu' } };
  };
  try {
    const view = render(React.createElement(Admin));
    await waitFor(() => assert.ok(view.getByText('25 produits trouvés')));
    fireEvent.click(view.getByRole('button', { name: 'Accueil' }));
    fireEvent.click(view.getByRole('button', { name: 'Bandeau' }));
    fireEvent.click(view.getByRole('button', { name: /Retirer Moto numéro 1 de Bandeau/ }));
    await waitFor(() => assert.match(view.getByRole('status').textContent, /retiré/));
    const write = calls.find((c) => c.path === 'homepage-selections.php');
    assert.equal(write.options.method, 'PUT');
    assert.deepEqual(JSON.parse(write.options.body), { id: 'bike-1', categoryId: 'motos', field: 'isHomepageHero', value: false });
    fireEvent.click(view.getByRole('button', { name: 'Produits' }));
    fireEvent.click(view.getByRole('button', { name: 'Accueil' }));
    fireEvent.click(view.getByRole('button', { name: 'Bandeau' }));
    assert.match(view.container.textContent, /0 sélectionné/);
    fireEvent.click(view.getByRole('button', { name: 'Nouveautés' }));
    assert.ok(view.getByText('Moto numéro 1'));
  } finally { globalThis.fetch = previousFetch; }
});


test('Accueil indique si un produit publié est masqué par sa marque', () => {
  const sample = { ...catalog, brands: catalog.brands.map((b) => b.id === 'sherco' ? { ...b, isPublished: false } : b), products: [bike(1), { ...gear(1), isNewArrival: true }] };
  const view = render(React.createElement(HomepageManager, { catalog: sample, onToggle: async () => {} }));
  assert.match(view.container.textContent, /2 sélectionnés · 1 visible avant limite/);
  assert.match(view.getByText('Moto numéro 1').closest('.flex.flex-wrap').textContent, /Masqué : marque non publiée/);
  assert.match(view.getByText('Casque modèle 1').closest('.flex.flex-wrap').textContent, /Affiché sur le site/);
});
