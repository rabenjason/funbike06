import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { seedCatalog } from './helpers/catalog.mjs';

let dom, server, catalog, Equipements, render, cleanup, fireEvent, within;
before(async () => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Element = dom.window.Element; globalThis.SVGElement = dom.window.SVGElement;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
  globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  ({ render, cleanup, fireEvent, within } = await import('@testing-library/react'));
  server = await createServer({ server: { middlewareMode: true }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] }, logLevel: 'silent' });
  await seedCatalog(server);
  catalog = await server.ssrLoadModule('/src/catalog/index.ts');
  ({ Equipements } = await server.ssrLoadModule('/src/pages/Catalog.tsx'));
});
after(() => { cleanup(); dom.window.close(); return server?.close(); });

function useFixture() {
  const oldBrands = [...catalog.brands], oldProducts = [...catalog.products];
  const brand = (id, name, extra = {}) => ({ id, name, isEquipmentBrand: true, isPublished: true, isPartner: false, ...extra });
  const item = (id, brandId, categoryId = 'equipements', status = 'PUBLISHED') => ({ ...catalog.ridingGear[0], id, name: id, brandId, categoryId, status });
  catalog.brands.splice(0, catalog.brands.length,
    brand('beta', 'Bêta'), brand('shot', 'SHOT'), brand('alpha', 'Alpha'),
    brand('hidden', 'Masquée', { isPublished: false }), brand('not-gear', 'Moto', { isEquipmentBrand: false }), brand('empty', 'Vide'));
  catalog.products.splice(0, catalog.products.length,
    item('shot-1', 'shot'), item('shot-2', 'shot', 'casques'), item('shot-3', 'shot'),
    item('alpha-1', 'alpha'), item('alpha-2', 'alpha', 'casques'),
    item('beta-1', 'beta'), item('beta-2', 'beta'),
    item('beta-draft', 'beta', 'equipements', 'DRAFT'), item('beta-archived', 'beta', 'casques', 'ARCHIVED'),
    item('beta-moto', 'beta', 'motos'), item('beta-part', 'beta', 'pieces-detachees'),
    item('hidden-1', 'hidden'), item('not-gear-1', 'not-gear'));
  return {
    item,
    restore() { catalog.brands.splice(0, catalog.brands.length, ...oldBrands); catalog.products.splice(0, catalog.products.length, ...oldProducts); },
  };
}

test('classe les marques publiées par casques et équipements publiés, puis par nom, sans modifier le catalogue', () => {
  const fixture = useFixture();
  try {
    const originalOrder = catalog.brands.map((brand) => brand.id);
    assert.deepEqual(catalog.getEquipmentBrandsByProductCount().map((brand) => brand.id), ['shot', 'alpha', 'beta']);
    assert.deepEqual(catalog.brands.map((brand) => brand.id), originalOrder);
    // Une publication change immédiatement le classement et l'égalité reste alphabétique.
    catalog.products.push(fixture.item('alpha-3', 'alpha'));
    assert.deepEqual(catalog.getEquipmentBrandsByProductCount().map((brand) => brand.id), ['alpha', 'shot', 'beta']);
    catalog.products.find((item) => item.id === 'alpha-1').status = 'ARCHIVED';
    assert.deepEqual(catalog.getEquipmentBrandsByProductCount().map((brand) => brand.id), ['shot', 'alpha', 'beta']);
  } finally { fixture.restore(); }
});

test('la page montre le classement, sélectionne la première marque et respecte les choix et liens directs', async () => {
  const fixture = useFixture();
  try {
    const view = render(React.createElement(Equipements, { go() {} }));
    const brandButtons = [...view.container.querySelectorAll('button[aria-pressed]')];
    assert.deepEqual(brandButtons.map((button) => button.querySelector('span.block.truncate').textContent), ['SHOT', 'Alpha', 'Bêta']);
    assert.equal(brandButtons[0].getAttribute('aria-pressed'), 'true');
    assert.ok(view.getByRole('heading', { name: 'Équipements SHOT' }));
    assert.ok(view.getByText(/3 références/));
    fireEvent.click(within(view.container).getByRole('button', { name: 'Alpha' }));
    assert.equal(view.getByRole('button', { name: 'Alpha' }).getAttribute('aria-pressed'), 'true');
    assert.ok(await view.findByRole('heading', { name: 'Équipements Alpha' }, { timeout: 3000 }));
    assert.ok(view.getByText(/2 références/));
    view.unmount();
    const linked = render(React.createElement(Equipements, { go() {}, initialBrand: 'beta' }));
    assert.equal(linked.getByRole('button', { name: 'Bêta' }).getAttribute('aria-pressed'), 'true');
    assert.ok(linked.getByRole('heading', { name: 'Équipements Bêta' }));
    linked.unmount();
  } finally { fixture.restore(); }
});

test('un catalogue sans équipement publié reste utilisable sans marque sélectionnée', () => {
  const fixture = useFixture();
  try {
    catalog.products.splice(0, catalog.products.length);
    assert.deepEqual(catalog.getEquipmentBrandsByProductCount(), []);
    const view = render(React.createElement(Equipements, { go() {} }));
    assert.equal(view.container.querySelectorAll('button[aria-pressed]').length, 0);
    assert.ok(view.getByRole('heading', { name: 'Équipements' }));
    assert.ok(view.getByText(/0 références/));
    view.unmount();
  } finally { fixture.restore(); }
});
