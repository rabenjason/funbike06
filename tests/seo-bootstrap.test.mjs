import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

let dom, server;
const originalFetch = globalThis.fetch;
after(async () => { globalThis.fetch = originalFetch; dom?.window.close(); await server?.close(); });

test('le HTML public reste visible si les API sont bloquées, puis disparaît après chargement', async () => {
  dom = new JSDOM('<!doctype html><html><head><title>TVS HLX Plus</title></head><body><div id="seo-fallback"><main><h1>TVS HLX Plus</h1><p>Contenu SEO public</p></main></div><div id="root"></div></body></html>', { url: 'http://localhost/motos/tvs-hlx-plus', pretendToBeVisual: true });
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.location = dom.window.location;
  globalThis.HTMLElement = dom.window.HTMLElement; globalThis.Element = dom.window.Element;
  globalThis.Image = dom.window.Image; globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} }); window.scrollTo = () => {};
  const { waitFor, fireEvent, act } = await import('@testing-library/react');
  let blocked = true;
  const files = {
    'brands.php': ['brands.json', 'brands'], 'categories.php': ['categories.json', 'categories'], 'families.php': ['families.json', 'families'],
    'product-types.php': ['product-types.json', 'productTypes'], 'models.php': ['models.json', 'models'], 'dealers.php': ['dealers.json', 'dealers'], 'contacts.php': ['contacts.json', 'contact'],
    'products/motorcycles.php': ['products/motorcycles.json', 'products'], 'products/helmets.php': ['products/helmets.json', 'products'],
    'products/riding-gear.php': ['products/riding-gear.json', 'products'], 'products/spare-parts.php': ['products/spare-parts.json', 'products'],
  };
  globalThis.fetch = async (url) => {
    if (blocked) return { ok: false, status: 403 };
    const path = String(url).replace('/server/api/', '');
    if (path === 'homepage-content.php') return { ok: true, json: async () => ({ data: JSON.parse(readFileSync('server/api/_lib/homepage-defaults.json', 'utf8')) }) };
    const [file, key] = files[path] ?? [];
    if (!file) return { ok: false, status: 404 };
    const value = JSON.parse(readFileSync(`server/storage/data/${file}`, 'utf8'))[key];
    return { ok: true, json: async () => ({ [path.startsWith('products/') ? 'data' : key]: value }) };
  };
  server = await createServer({ server: { middlewareMode: true }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] }, logLevel: 'silent' });
  await act(async () => { await server.ssrLoadModule('/src/main.tsx'); });
  await waitFor(() => assert.match(document.getElementById('root').textContent, /Impossible de charger/));
  assert.match(document.getElementById('seo-fallback').textContent, /Contenu SEO public/);
  blocked = false;
  fireEvent.click(document.querySelector('#root button'));
  await waitFor(() => assert.equal(document.getElementById('seo-fallback'), null));
  await waitFor(() => assert.match(document.title, /TVS HLX Plus/));
});
