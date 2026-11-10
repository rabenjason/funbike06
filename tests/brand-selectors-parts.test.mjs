import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { seedCatalog } from './helpers/catalog.mjs';
let dom, server, catalog, Spares, render, cleanup, fireEvent, waitFor, within;
before(async () => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.HTMLElement = dom.window.HTMLElement; globalThis.Element = dom.window.Element; globalThis.SVGElement = dom.window.SVGElement; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window); globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
  window.HTMLElement.prototype.scrollIntoView = () => {}; window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  ({ render, cleanup, fireEvent, waitFor, within } = await import('@testing-library/react'));
  server = await createServer({ server: { middlewareMode: true }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] }, logLevel: 'silent' });
  await seedCatalog(server); catalog = await server.ssrLoadModule('/src/catalog/index.ts');
  ({ Spares } = await server.ssrLoadModule('/src/pages/Catalog.tsx'));
});
after(async () => { cleanup(); dom.window.close(); await server.close(); });

test('pièces : même sélecteur, Toutes, marques compatibles et navigation conservées', async () => {
  const brand = { id: 'test-compatible', name: 'Marque Test', isPublished: true, isEquipmentBrand: false };
  const part = { ...catalog.spareParts[0], id: 'part-compatible', name: 'Pièce compatible', brandId: 'unknown-brand', compatibleBrandIds: [brand.id], status: 'PUBLISHED' };
  catalog.brands.push(brand); catalog.spareParts.push(part);
  try {
    const view = render(React.createElement(Spares, { go() {} }));
    const selector = view.getByRole('group', { name: 'Marques de pièces détachées' });
    const all = within(selector).getByRole('button', { name: 'Toutes' });
    const chosen = within(selector).getByRole('button', { name: 'Marque Test' });
    assert.equal(all.getAttribute('aria-pressed'), 'true'); assert.equal(chosen.getAttribute('aria-pressed'), 'false');
    assert.equal(chosen.getAttribute('aria-controls'), 'spare-parts-products');
    assert.ok(chosen.classList.contains('equipment-brand-button'));
    fireEvent.click(chosen);
    assert.equal(chosen.getAttribute('aria-pressed'), 'true'); assert.equal(all.getAttribute('aria-pressed'), 'false');
    assert.ok(chosen.querySelector('.equipment-brand-active'));
    await waitFor(() => assert.ok(view.getByRole('heading', { name: 'Pièces détachées Marque Test' })), { timeout: 3000 });
    await waitFor(() => assert.ok(view.getByText('Pièce compatible')), { timeout: 3000 });
    fireEvent.click(all);
    assert.equal(all.getAttribute('aria-pressed'), 'true');
    await waitFor(() => assert.ok(view.getByRole('heading', { name: 'Pièces détachées moto' })), { timeout: 3000 });
    view.unmount();
    const linked = render(React.createElement(Spares, { go() {}, initialBrand: `spare-${brand.id}` }));
    assert.equal(within(linked.getByRole('group', { name: 'Marques de pièces détachées' })).getByRole('button', { name: 'Marque Test' }).getAttribute('aria-pressed'), 'true');
    linked.unmount();
  } finally { catalog.spareParts.pop(); catalog.brands.pop(); }
});
