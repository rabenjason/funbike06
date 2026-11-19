import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

const files={
  'brands.php':['brands.json','brands'], 'categories.php':['categories.json','categories'], 'families.php':['families.json','families'],
  'product-types.php':['product-types.json','productTypes'], 'models.php':['models.json','models'], 'contacts.php':['contacts.json','contact'], 'dealers.php':['dealers.json','dealers'],
  'products/motorcycles.php':['products/motorcycles.json','products'], 'products/helmets.php':['products/helmets.json','products'],
  'products/riding-gear.php':['products/riding-gear.json','products'], 'products/spare-parts.php':['products/spare-parts.json','products'],
};
const data=Object.fromEntries(Object.entries(files).map(([path,[file,key]])=>[path,JSON.parse(readFileSync(`server/storage/data/${file}`,'utf8'))[key]]));
const home=JSON.parse(readFileSync('server/api/_lib/homepage-defaults.json','utf8'));

test('l’accueil et sa photo sont visibles pendant le chargement des autres sections, puis le réessai les restaure',async()=>{
  const dom=new JSDOM('<!doctype html><html class="fb-booting"><head></head><body><div id="seo-fallback">SEO</div><div id="root"></div></body></html>',{url:'http://localhost/',pretendToBeVisual:true});
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,location:dom.window.location,HTMLElement:dom.window.HTMLElement,Element:dom.window.Element,SVGElement:dom.window.SVGElement,Image:dom.window.Image,requestAnimationFrame:dom.window.requestAnimationFrame.bind(dom.window),IS_REACT_ACT_ENVIRONMENT:true});
  globalThis.IntersectionObserver=class {observe(){} unobserve(){} disconnect(){}};
  window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}}); window.scrollTo=()=>{};
  const {act,waitFor,fireEvent,within}=await import('@testing-library/react');
  const server=await createServer({server:{middlewareMode:true},appType:'custom',optimizeDeps:{noDiscovery:true,include:[]},logLevel:'silent'});
  const oldFetch=globalThis.fetch; let release; let failing=true; let blocked=false; let active=0,peak=0;
  const gate=new Promise(resolve=>release=resolve); const seen=[];
  globalThis.fetch=async(url,options={})=>{
    const path=String(url).replace('/server/api/','');seen.push(path);active++;peak=Math.max(peak,active);
    try {
      if(path==='products/riding-gear.php' && failing){blocked=true;await gate;return {ok:false,status:500};}
      if(options.signal?.aborted) throw new Error('aborted');
      if(path==='homepage-content.php') return {ok:true,json:async()=>({data:home})};
      if(path==='promotions.php') return {ok:true,json:async()=>({campaigns:[],serverTime:new Date().toISOString()})};
      if(path==='whatsapp-settings.php') return {ok:false,status:404};
      if(path==='openings.php') return {ok:true,status:204};
      if(files[path]) return {ok:true,json:async()=>({[path.startsWith('products/')?'data':files[path][1]]:structuredClone(data[path])})};
      return {ok:false,status:404};
    } finally {active--;}
  };
  try {
    await act(async()=>{await server.ssrLoadModule('/src/main.tsx');});
    const root=within(document.getElementById('root'));
    await waitFor(()=>assert.ok(document.querySelector('#root h1')?.textContent.includes(home.content.hero.titreLigne1)),{timeout:10000});
    assert.equal(document.documentElement.classList.contains('fb-booting'),false);
    assert.equal(document.getElementById('seo-fallback'),null);
    await waitFor(()=>assert.ok(blocked));
    const bike=data['products/motorcycles.php'].find(p=>p.status==='PUBLISHED' && p.isHomepageHero);
    assert.equal(document.querySelector('#root img[fetchpriority=high]')?.getAttribute('alt'),bike.images.find(i=>i.isMain)?.altText || bike.name);
    assert.ok(document.querySelector('link[data-homepage-hero]'), 'l’image prioritaire a été annoncée avant le rendu');
    const firstPhoto=document.querySelector('#root img[fetchpriority=high]');
    fireEvent.error(firstPhoto);
    await waitFor(()=>assert.ok(document.querySelector('#root img[fetchpriority=high]') !== firstPhoto),{timeout:4000});
    assert.equal(root.queryByText(home.content.atelier.titre),null, 'pas de section incomplète présentée comme vide');
    await act(async()=>release());
    await waitFor(()=>assert.match(document.getElementById('root').textContent,/Impossible de charger les autres sections/));
    failing=false; fireEvent.click(root.getByRole('button',{name:'Réessayer'}));
    await waitFor(()=>assert.ok(root.getByText(home.content.atelier.titre)),{timeout:10000});
    assert.ok(peak<=3);
    // Démonter l'accueil avant de fermer JSDOM pour arrêter l'animation du slogan.
    await act(async () => { window.history.pushState({}, '', '/revendeurs'); window.dispatchEvent(new window.PopStateEvent('popstate')); });
    await waitFor(()=>assert.ok(!document.getElementById('root').textContent.includes(home.content.atelier.titre)),{timeout:10000});
  } finally {release();globalThis.fetch=oldFetch;dom.window.close();await server.close();}
});
