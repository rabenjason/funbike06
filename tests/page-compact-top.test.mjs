import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { seedCatalog } from './helpers/catalog.mjs';
let server, modules;
before(async () => {
  server = await createServer({ server: { middlewareMode: true }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] }, logLevel: 'silent' });
  await seedCatalog(server);
  const catalog = await server.ssrLoadModule('/src/pages/Catalog.tsx');
  modules = { ...catalog, Contact: (await server.ssrLoadModule('/src/pages/Contact.tsx')).default, Dealers: (await server.ssrLoadModule('/src/pages/Dealers.tsx')).default, Promotions: (await server.ssrLoadModule('/src/pages/Promotions.tsx')).default, Home: (await server.ssrLoadModule('/src/pages/Home.tsx')).default };
});
after(async () => { await server.close(); });
const dom = (component, props = {}) => new JSDOM(renderToStaticMarkup(React.createElement(component, { go() {}, ...props }))).window.document;
test('chaque page principale concernée réduit seulement son espace initial', () => {
  for (const name of ['Catalogue', 'Equipements', 'Spares', 'Contact', 'Dealers', 'Promotions']) {
    const document = dom(modules[name]);
    assert.equal(document.querySelectorAll('.page-compact-top').length, 1, `${name} : un seul espace compact`);
    const compact = document.querySelector('.page-compact-top');
    assert.ok(!compact.querySelector('.page-compact-top'), `${name} : sections internes préservées`);
  }
  const home = dom(modules.Home);
  assert.equal(home.querySelectorAll('.page-compact-top').length, 0, 'la bannière de l’accueil est conservée');
});
