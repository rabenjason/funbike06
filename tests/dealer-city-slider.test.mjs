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
  assert.ok(!list.classList.contains('sm:overflow-visible'), 'le défilement reste disponible sur ordinateur');
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

test('recherche et regroupement de 17 revendeurs, sans distinction des accents ou de la casse', () => {
  const many = Array.from({ length: 17 }, (_, i) => ({
    ...fixtures[0], key: `dealer-${i}`, city: i < 2 ? (i ? '  ANTANANARIVO  ' : 'Antananarivo') : `Ville ${i}`,
    name: i === 1 ? 'Moto Évasion' : `Concession ${i}`, address: `Route ${i}`, lat: -18 - i, lon: 47 + i,
  }));
  DEALERS.splice(0, DEALERS.length, ...many);
  const view = render(React.createElement(Dealers, { go() {}, initialCity: 'dealer-1' }));
  const list = view.getByRole('tablist', { name: 'Choisir une ville' });
  assert.equal(list.querySelectorAll('[role=tab]').length, 16);
  assert.equal(view.getByRole('tab', { name: 'Antananarivo' }).getAttribute('aria-selected'), 'true');
  const dealerChoice = view.getByLabelText('Revendeur à Antananarivo');
  assert.equal(dealerChoice.value, 'dealer-1');
  assert.ok(view.getByTitle(/Carte OpenStreetMap de/).getAttribute('src').includes('marker=-19%2C48'));
  fireEvent.change(dealerChoice, { target: { value: 'dealer-0' } });
  assert.ok(view.getByTitle(/Carte OpenStreetMap de/).getAttribute('src').includes('marker=-18%2C47'));
  const search = view.getByLabelText('Rechercher un revendeur ou une ville');
  fireEvent.change(search, { target: { value: 'EVASION antananarivo' } });
  const results = view.getByRole('list', { name: 'Résultats de recherche des revendeurs' });
  assert.equal(results.querySelectorAll('button').length, 1);
  fireEvent.click(results.querySelector('button'));
  assert.equal(search.value, '');
  assert.equal(view.getByLabelText('Revendeur à Antananarivo').value, 'dealer-1');
  assert.ok(view.getByTitle(/Carte OpenStreetMap de/).getAttribute('src').includes('marker=-19%2C48'));
  fireEvent.change(search, { target: { value: 'ville 16' } });
  fireEvent.click(view.getByRole('list', { name: 'Résultats de recherche des revendeurs' }).querySelector('button'));
  assert.equal(view.getByRole('tab', { name: 'Ville 16' }).getAttribute('aria-selected'), 'true');
  assert.ok(view.getByTitle('Carte OpenStreetMap de Ville 16'));
  assert.ok(view.getByRole('button', { name: 'Villes suivantes' }));
  fireEvent.change(search, { target: { value: 'introuvable' } });
  assert.equal(view.getByRole('status').textContent, 'Aucun revendeur trouvé.');
  fireEvent.keyDown(search, { key: 'Escape' });
  assert.equal(search.value, '');
  fireEvent.change(search, { target: { value: 'introuvable' } });
  fireEvent.click(view.getByRole('button', { name: 'Effacer' }));
  assert.equal(search.value, '');
  view.rerender(React.createElement(Dealers, { go() {}, initialCity: 'dealer-1' }));
  view.rerender(React.createElement(Dealers, { go() {}, initialCity: 'dealer-0' }));
  assert.equal(view.getByLabelText('Revendeur à Antananarivo').value, 'dealer-0');
  view.unmount();
  DEALERS.splice(0);
});

test('sélection entre fiche complète et fiche sans coordonnées, sans carte ni liens vides', async () => {
  DEALERS.splice(0, DEALERS.length, fixtures[0], { key: 'nosy', city: 'Nosy Be', name: 'Hell Ville Dépannage', kind: '', address: '', hours: '', phone: '', email: '', desc: '', lat: null, lon: null, services: [] });
  const view = render(React.createElement(Dealers, { go() {} }));
  assert.ok(view.getByTitle('Carte OpenStreetMap de Antananarivo'));
  assert.ok(view.getByRole('link', { name: /Itinéraire/ }));
  fireEvent.click(view.getByRole('tab', { name: 'Nosy Be' }));
  assert.ok(view.getByText('Localisation à renseigner'));
  assert.equal(view.queryByTitle(/Carte OpenStreetMap/) === null, true);
  await waitFor(() => assert.ok(view.getAllByText('Hell Ville Dépannage').length));
  await waitFor(() => assert.equal(view.queryByRole('link', { name: /Itinéraire/ }) === null, true), { timeout: 3000 });
  assert.equal(view.queryByRole('link', { name: /Appeler/ }) === null, true);
  assert.equal(view.queryByRole('link', { name: /Écrire/ }) === null, true);
  fireEvent.click(view.getByRole('tab', { name: 'Antananarivo' }));
  assert.ok(view.getByTitle('Carte OpenStreetMap de Antananarivo'));
  await waitFor(() => assert.ok(view.getByRole('link', { name: /Itinéraire/ })));
  view.unmount(); DEALERS.splice(0);
});
