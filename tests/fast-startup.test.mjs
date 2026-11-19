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
const home = JSON.parse(readFileSync('server/api/_lib/homepage-defaults.json', 'utf8'));
let server, dom; const oldFetch=globalThis.fetch;
after(async()=>{globalThis.fetch=oldFetch;dom?.window.close();await server?.close();});

test('la fiche moto ne dépend pas des équipements ; navigation et données complémentaires restent disponibles',async()=>{
  dom = new JSDOM('<!doctype html><html><head></head><body><div id="seo-fallback">SEO</div><div id="root"></div></body></html>',{url:'http://localhost/motos/tvs-hlx-plus',pretendToBeVisual:true});
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,location:dom.window.location,HTMLElement:dom.window.HTMLElement,Element:dom.window.Element,SVGElement:dom.window.SVGElement,Image:dom.window.Image,requestAnimationFrame:dom.window.requestAnimationFrame.bind(dom.window),IS_REACT_ACT_ENVIRONMENT:true});
  globalThis.IntersectionObserver=class{observe(){} unobserve(){} disconnect(){}};
  window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}}); window.scrollTo=()=>{};
  const {act,waitFor,fireEvent,within,cleanup}=await import('@testing-library/react');
  let release, pendingStarted=false, failGear=true, active=0,peak=0; const gate=new Promise(r=>release=r); const seen=[];
  globalThis.fetch=async (url,options={})=>{
    const path=String(url).replace('/server/api/',''); seen.push(path); active++; peak=Math.max(peak,active);
    try {
      if(path==='products/riding-gear.php'){pendingStarted=true;await gate; if(failGear) return {ok:false,status:500};}
      if(options.signal?.aborted) throw new Error('aborted');
      if(path==='homepage-content.php') return {ok:true,json:async()=>({data:home})};
      if(path==='promotions.php') return {ok:true,json:async()=>({campaigns:[],serverTime:new Date().toISOString()})};
      if(path==='whatsapp-settings.php') return {ok:false,status:404};
      if(path==='openings.php') return {ok:true,status:204};
      if(files[path]) return {ok:true,json:async()=>({[path.startsWith('products/')?'data':files[path][1]]:structuredClone(values[path])})};
      return {ok:false,status:404};
    } finally { active--; }
  };
  server=await createServer({server:{middlewareMode:true},appType:'custom',optimizeDeps:{noDiscovery:true,include:[]},logLevel:'silent'});
  await act(async()=>{await server.ssrLoadModule('/src/main.tsx');});
  const root=within(document.getElementById('root'));
  await waitFor(()=>assert.ok(root.getAllByText(/TVS HLX/i).length),{timeout:10000});
  await waitFor(()=>assert.ok(pendingStarted));
  assert.equal(document.getElementById('seo-fallback'),null,'la fiche est visible avant la fin des équipements');
  const catalog=await server.ssrLoadModule('/src/catalog/loadServerData.ts');
  assert.equal(catalog.getBackgroundStatus(),'loading');
  fireEvent.click(root.getAllByRole('link',{name:/équipements/i})[0]);
  await waitFor(()=>assert.ok(root.getByRole('status')));
  await act(async()=>release());
  await waitFor(()=>assert.equal(catalog.getBackgroundStatus(),'error'),{timeout:5000});
  await waitFor(()=>assert.match(document.getElementById('root').textContent,/Impossible de charger les données de cette page/));
  for(const path of [...Object.keys(files),'homepage-content.php']) assert.equal(seen.filter(p=>p===path).length,1,path);
  fireEvent.click(root.getAllByRole('link',{name:/revendeurs/i})[0]);
  await waitFor(()=>assert.ok(window.location.pathname.includes('revendeurs')));
  await waitFor(()=>assert.doesNotMatch(document.getElementById('root').textContent,/Impossible de charger les données de cette page/));
  fireEvent.click(root.getAllByRole('link',{name:/équipements/i})[0]);
  await waitFor(()=>assert.ok(root.getByRole('button',{name:'Réessayer'})));
  failGear=false; fireEvent.click(root.getByRole('button',{name:'Réessayer'}));
  await waitFor(()=>assert.equal(catalog.getBackgroundStatus(),'ready'),{timeout:5000});
  await waitFor(()=>assert.match(document.getElementById('root').textContent,/équipements/i),{timeout:10000});
  assert.ok(peak<=3,`concurrence ${peak}`);
  cleanup();
});
