import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

let dom, server, DEALERS, Dealers, render, cleanup, fireEvent, waitFor;
const cities = ['Antananarivo', 'Toamasina', 'Mahajanga', 'Fianarantsoa'];
const fixtures = cities.map((city, i) => ({
  key: `city-${i}`, city, name: `Revendeur ${city}`, kind: 'Showroom', address: `Adresse ${city}`,
  hours: '9h – 17h', phone: '+261340000000', email: 'test@example.com', desc: 'Description',
  lat: -18 - i, lon: 47 + i, services: [],
}));

before(async () => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
  globalThis.window = dom.window; globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement; globalThis.Element = dom.window.Element; globalThis.SVGElement = dom.window.SVGElement;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window); globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  ({ render, cleanup, fireEvent, waitFor } = await import('@testing-library/react'));
  server = await createServer({ server: { middlewareMode: true }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] }, logLevel: 'silent' });
  ({ DEALERS } = await server.ssrLoadModule('/src/catalog/dealers.ts'));
  ({ default: Dealers } = await server.ssrLoadModule('/src/pages/Dealers.tsx'));
});
after(async () => { cleanup(); dom.window.close(); await server?.close(); });

test('rangée mobile de deux villes : accès tactile et clavier, carte et sélection restent synchronisées', async () => {
  DEALERS.splice(0, DEALERS.length, ...fixtures);
  const view = render(React.createElement(Dealers, { go() {} }));
  const list = view.getByRole('tablist', { name: 'Choisir une ville' });
  const tabs = [...list.querySelectorAll('[role=tab]')];
  assert.deepEqual(tabs.map((tab) => tab.textContent), cities);
  assert.ok(list.classList.contains('overflow-x-auto'));
  assert.ok(list.classList.contains('sm:overflow-visible'));
  assert.match(view.getByText(/Glissez pour voir les autres villes/).className, /sm:hidden/);
  assert.equal(tabs[0].getAttribute('aria-selected'), 'true');
  assert.equal(tabs[0].tabIndex, 0);
  assert.equal(tabs[2].tabIndex, -1);
  assert.ok(view.getByTitle('Carte OpenStreetMap de Antananarivo'));

  fireEvent.click(tabs[2]);
  assert.equal(tabs[2].getAttribute('aria-selected'), 'true');
  assert.ok(view.getByTitle('Carte OpenStreetMap de Mahajanga').getAttribute('src').includes('marker=-20%2C49'));
  fireEvent.keyDown(tabs[2], { key: 'ArrowRight' });
  assert.equal(tabs[3].getAttribute('aria-selected'), 'true');
  assert.equal(document.activeElement, tabs[3]);
  assert.ok(view.getByTitle('Carte OpenStreetMap de Fianarantsoa'));
  fireEvent.keyDown(tabs[3], { key: 'Home' });
  assert.equal(tabs[0].getAttribute('aria-selected'), 'true');
  assert.equal(document.activeElement, tabs[0]);
  await waitFor(() => assert.ok(view.getByTitle('Carte OpenStreetMap de Antananarivo')));
  view.unmount();
});

test('une ville initiale éloignée et un nombre variable de revendeurs sont pris en charge', () => {
  DEALERS.splice(0, DEALERS.length, ...fixtures);
  let view = render(React.createElement(Dealers, { go() {}, initialCity: 'city-3' }));
  assert.equal(view.getByRole('tab', { name: 'Fianarantsoa' }).getAttribute('aria-selected'), 'true');
  assert.ok(view.getByTitle('Carte OpenStreetMap de Fianarantsoa'));
  view.unmount();
  DEALERS.splice(0, DEALERS.length, ...fixtures.slice(0, 2));
  view = render(React.createElement(Dealers, { go() {} }));
  assert.equal(view.queryByText(/Glissez pour voir les autres villes/), null);
  view.unmount();
  DEALERS.splice(0);
});

test('les boutons occupent chacun la moitié de la rangée mobile sans modifier les onglets desktop', () => {
  const css = readFileSync('src/index.css', 'utf8');
  assert.match(css, /\.dealer-city\s*\{[^}]*flex:\s*0 0 calc\(\(100% - 0\.5rem\) \/ 2\)/s);
  assert.match(css, /@media \(min-width: 640px\)[\s\S]*?\.dealer-city,[\s\S]*?flex:\s*1 1 0/);
});
