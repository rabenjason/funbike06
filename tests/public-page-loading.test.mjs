import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
let server, pages;
before(async () => {
  server = await createServer({ server: { middlewareMode: true }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] }, logLevel: 'silent' });
  pages = await server.ssrLoadModule('/src/lib/publicPages.tsx');
});
after(async () => { await server.close(); });

test('l’adresse initiale précharge seulement la page nécessaire', async () => {
  const cases = [
    ['/', 'home'], ['/catalogue/', 'catalog'], ['/motos', 'catalog'], ['/motos/hlx', 'product'],
    ['/equipements', 'catalog'], ['/equipements/gants', 'accessory'], ['/casques/casque', 'accessory'],
    ['/pieces-detachees', 'catalog'], ['/pieces-detachees/kit', 'accessory'], ['/promotions', 'promotions'],
    ['/revendeurs', 'dealers'], ['/contact', 'contact'], ['/inexistant', undefined], ['/admin', undefined],
    ['/motos/a/b', undefined],
  ];
  for (const [path, expected] of cases) assert.equal(pages.publicPageKeyForPath(path), expected, path);
  for (const key of ['home', 'catalog', 'product', 'accessory', 'promotions', 'dealers', 'contact']) assert.equal(pages.loadedPublicPage(key), undefined);
  await Promise.all([pages.preloadPublicPage('/'), pages.preloadPublicPage('/')]);
  assert.equal(typeof pages.loadedPublicPage('home'), 'function');
  for (const key of ['catalog', 'product', 'accessory', 'promotions', 'dealers', 'contact']) assert.equal(pages.loadedPublicPage(key), undefined, key);
  const component = await pages.loadPublicPage('home');
  assert.equal(component, pages.loadedPublicPage('home'), 'un second passage réutilise le module chargé');
  await pages.preloadPublicPage('/motos/hlx');
  assert.equal(typeof pages.loadedPublicPage('product'), 'function');
  assert.equal(pages.loadedPublicPage('catalog'), undefined);
});

test('les pages et leurs variantes restent associées au bon module', () => {
  for (const page of ['motos', 'catalogue', 'equipements', 'spares']) assert.equal(pages.publicPageKey(page), 'catalog');
  for (const [page, key] of [['home', 'home'], ['product', 'product'], ['accessory', 'accessory'], ['promotions', 'promotions'], ['contact', 'contact'], ['revendeurs', 'dealers'], ['not-found', undefined]]) assert.equal(pages.publicPageKey(page), key);
});
