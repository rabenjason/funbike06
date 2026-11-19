import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

const files = {
  'brands.php': ['brands.json', 'brands'], 'categories.php': ['categories.json', 'categories'], 'families.php': ['families.json', 'families'],
  'product-types.php': ['product-types.json', 'productTypes'], 'models.php': ['models.json', 'models'], 'dealers.php': ['dealers.json', 'dealers'], 'contacts.php': ['contacts.json', 'contact'],
  'products/motorcycles.php': ['products/motorcycles.json', 'products'], 'products/helmets.php': ['products/helmets.json', 'products'],
  'products/riding-gear.php': ['products/riding-gear.json', 'products'], 'products/spare-parts.php': ['products/spare-parts.json', 'products'],
};
const values = Object.fromEntries(Object.entries(files).map(([path, [file, key]]) => [path, JSON.parse(readFileSync(`server/storage/data/${file}`, 'utf8'))[key]]));
const defaultHome = JSON.parse(readFileSync('server/api/_lib/homepage-defaults.json', 'utf8'));
let server, dom;
const oldFetch = globalThis.fetch;
after(async () => { globalThis.fetch = oldFetch; dom?.window.close(); await server?.close(); });
const ok = data => ({ ok: true, status: 200, json: async () => data });
const valueFor = path => ({ [path.startsWith('products/') ? 'data' : files[path][1]]: structuredClone(values[path]) });

test('les douze API partagent trois places ; une panne revendeurs ne bloque pas les motos et reste réessayable', async () => {
  dom = new JSDOM('<!doctype html><html class="fb-booting"><head><title>Funbike</title></head><body><div id="seo-fallback">Secours</div><div id="root"></div></body></html>', { url: 'http://localhost/motos/tvs-hlx-plus', pretendToBeVisual: true });
  Object.assign(globalThis, { window:dom.window, document:dom.window.document, location:dom.window.location, HTMLElement:dom.window.HTMLElement, Element:dom.window.Element, SVGElement:dom.window.SVGElement, Image:dom.window.Image, requestAnimationFrame:dom.window.requestAnimationFrame.bind(dom.window), IS_REACT_ACT_ENVIRONMENT:true });
  globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = () => ({ matches:false, addEventListener() {}, removeEventListener() {} }); window.scrollTo = () => {};
  const { act, fireEvent, waitFor, within } = await import('@testing-library/react');
  let active=0, peak=0, dealerFails=true, dealerCalls=0, openingCalls=0, releaseDealer;
  const dealerGate = new Promise(resolve => { releaseDealer=resolve; });
  const seen=[];
  globalThis.fetch = async (url, options={}) => {
    const path=String(url).replace('/server/api/',''); seen.push(path); active++; peak=Math.max(peak,active);
    if (path==='dealers.php' && dealerCalls++===0) await dealerGate;
    await new Promise(resolve => setTimeout(resolve, 20));
    active--;
    if (options.signal?.aborted) throw new Error('aborted');
    if (path==='dealers.php' && dealerFails) return {ok:false,status:504};
    if (path==='homepage-content.php') return ok({data:defaultHome,siteTheme:'tvs'});
    if (path==='promotions.php') return ok({campaigns:[],serverTime:new Date().toISOString()});
    if (path==='whatsapp-settings.php') return {ok:false,status:404};
    if (path==='openings.php') { openingCalls++; assert.equal(options.method,'POST'); return {ok:false,status:503}; }
    if (files[path]) return ok(valueFor(path));
    return {ok:false,status:404};
  };
  server = await createServer({ server:{middlewareMode:true},appType:'custom',optimizeDeps:{noDiscovery:true,include:[]},logLevel:'silent' });
  await act(async () => { await server.ssrLoadModule('/src/main.tsx'); });
  await waitFor(() => assert.equal(document.getElementById('seo-fallback'),null), {timeout:10000});
  const root=within(document.getElementById('root'));
  await waitFor(() => assert.ok(root.getAllByText(/TVS HLX/i).length), {timeout:10000});
  assert.equal(dealerCalls,1, 'la fiche moto ne doit pas attendre la réponse secondaire');
  releaseDealer();
  await waitFor(() => { for (const path of [...Object.keys(files),'homepage-content.php']) assert.ok(seen.includes(path),path); }, {timeout:5000});
  await waitFor(() => assert.equal(dealerCalls,3), {timeout:5000});
  await waitFor(() => assert.equal(openingCalls,1), {timeout:5000});
  assert.ok(peak<=3, `observé ${peak} requêtes simultanées`);
  const dealers=await server.ssrLoadModule('/src/catalog/dealers.ts');
  await waitFor(() => assert.equal(dealers.dealerStatus(),'error'));
  fireEvent.click(root.getByRole('button',{name:/funbike, accueil/i}));
  await waitFor(() => assert.ok(document.querySelector('#root h1')?.textContent.includes(defaultHome.content.hero.titreLigne1)),{timeout:10000});
  assert.doesNotMatch(document.getElementById('root').textContent,/Impossible de charger les données du serveur/);
  fireEvent.click(root.getAllByRole('link',{name:/revendeurs/i})[0]);
  await waitFor(() => assert.match(document.getElementById('root').textContent,/Impossible de charger les revendeurs/),{timeout:10000});
  assert.doesNotMatch(document.getElementById('root').textContent,/Aucun revendeur renseigné/);
  dealerFails=false;
  fireEvent.click(root.getByRole('button',{name:'Réessayer'}));
  await waitFor(() => assert.equal(dealers.dealerStatus(),'ready'),{timeout:5000});
  await waitFor(() => assert.ok(dealers.DEALERS.length>0));
  assert.equal(dealerCalls,4);
  assert.ok(peak<=3);
  assert.equal(openingCalls,1,'une écriture échouée ne doit jamais être réessayée automatiquement');
});
