import { after, afterEach, before, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { seedCatalog } from './helpers/catalog.mjs';

let dom, server, routes, catalog, Header, Provider, App, render, cleanup, fireEvent, waitFor, within, originalFetch;
before(async () => {
  dom = new JSDOM('<!doctype html><html><head><link rel="canonical" href="https://funbike.mg/"></head><body></body></html>', { url:'http://localhost/', pretendToBeVisual:true });
  globalThis.window=dom.window; globalThis.document=dom.window.document; globalThis.HTMLElement=dom.window.HTMLElement; globalThis.Element=dom.window.Element; globalThis.Image=dom.window.Image; globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  globalThis.requestAnimationFrame=window.requestAnimationFrame.bind(window);
  globalThis.IntersectionObserver=class { observe(){} unobserve(){} disconnect(){} };
  window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}}); window.scrollTo=()=>{};
  ({render,cleanup,fireEvent,waitFor,within}=await import('@testing-library/react'));
  server=await createServer({server:{middlewareMode:true},appType:'custom',optimizeDeps:{noDiscovery:true,include:[]},logLevel:'silent'});
  await seedCatalog(server); catalog=await server.ssrLoadModule('/src/catalog/index.ts'); routes=await server.ssrLoadModule('/src/lib/routes.ts');
  ({Header}=await server.ssrLoadModule('/src/components/Layout.tsx')); ({PromotionsProvider:Provider}=await server.ssrLoadModule('/src/components/PromotionsContext.tsx')); ({default:App}=await server.ssrLoadModule('/src/App.tsx'));
  originalFetch=globalThis.fetch;
});
afterEach(()=>{cleanup();globalThis.fetch=originalFetch;});
after(async()=>{dom.window.close();await server.close();});
function currentNav(view) { return view.container.querySelector('header nav a[aria-current="page"]'); }

test('menu : catégorie de fiche exacte, sur ordinateur et dans le menu mobile', async()=>{
  const piece=catalog.spareParts[0], helmet=catalog.helmets[0], gear=catalog.ridingGear[0], bike=catalog.motorcycles[0];
  const cases=[
    [{page:'accessory',id:piece.id,categoryId:'pieces-detachees'},'Pièces détachées','/pieces-detachees'],
    [{page:'accessory',id:helmet.id,categoryId:'casques'},'Équipements','/equipements'],
    [{page:'accessory',id:gear.id,categoryId:'equipements'},'Équipements','/equipements'],
    [{page:'product',id:bike.id,categoryId:'motos'},'Motos','/motos'],
    [{page:'accessory',id:piece.id},'Pièces détachées','/pieces-detachees'],
  ];
  for(const [route,label,path] of cases){
    const calls=[];const view=render(React.createElement(Header,{route,go:(...args)=>calls.push(args),dark:true,toggle(){}}));
    const active=currentNav(view);assert.equal(active?.textContent,label);assert.equal(active?.getAttribute('href'),path);
    assert.equal(view.container.querySelectorAll('header nav a[aria-current="page"]').length,1);
    assert.equal(calls.length,0,'la sélection ne déclenche aucune navigation');
    fireEvent.click(view.getByRole('button',{name:'Ouvrir le menu'}));
    const mobile=view.container.querySelectorAll('header nav')[1];
    assert.equal(mobile.querySelector('button[aria-current="page"]').textContent,label);
    fireEvent.click(within(mobile).getByRole('button',{name:label}));assert.equal(calls.length,1);
    view.unmount();
  }
});

test('la pièce reste active quand une promotion raccourcit le libellé du menu', async()=>{
  const piece=catalog.spareParts[0];const campaign={id:'promo',name:'Promo',startDate:'2020-01-01',endDate:'2099-12-31',enabled:true,published:true,products:[{productId:piece.id,categoryId:piece.categoryId,originalPrice:100,discountPercent:10}]};
  globalThis.fetch=async()=>({ok:true,json:async()=>({campaigns:[campaign],serverTime:new Date().toISOString()})});
  const view=render(React.createElement(Provider,null,React.createElement(Header,{route:{page:'accessory',id:piece.id,categoryId:piece.categoryId},go(){},dark:false,toggle(){}})));
  await waitFor(()=>assert.equal(currentNav(view)?.textContent,'Pièces'));
  assert.equal(currentNav(view).getAttribute('href'),'/pieces-detachees');
});

test('entrée directe : URL, menu et retour vers la bonne catégorie', async()=>{
  for(const [product,label,backPath] of [[catalog.spareParts[0],'Pièces détachées','/pieces-detachees'],[catalog.helmets[0],'Équipements','/equipements'],[catalog.ridingGear[0],'Équipements','/equipements'],[catalog.motorcycles[0],'Motos','/motos']]){
    window.history.replaceState(null,'',routes.productPath(product));
    const view=render(React.createElement(App));
    await waitFor(()=>assert.ok(within(view.container.querySelector('main')).getByRole('heading',{name:product.name,level:1})));
    assert.equal(currentNav(view)?.textContent,label);
    assert.equal(window.location.pathname,routes.productPath(product));
    await waitFor(()=>assert.equal(new URL(document.querySelector('link[rel=canonical]').href).pathname,routes.productPath(product)));
    fireEvent.click(within(view.container.querySelector('main')).getByRole('button',{name:`Retour — ${label}`}));
    await waitFor(()=>assert.equal(window.location.pathname,backPath));
    await waitFor(()=>assert.equal(currentNav(view)?.textContent,label));
    view.unmount();
  }
});

test('depuis les pièces : fiche et retour navigateur conservent la catégorie et le filtre URL', async()=>{
  const piece=catalog.spareParts.find(p=>p.brandId==='tvs' || p.compatibleBrandIds?.includes('tvs'));assert.ok(piece);
  window.history.replaceState(null,'','/pieces-detachees?marque=tvs');
  const view=render(React.createElement(App));
  const link=await waitFor(()=>within(view.container.querySelector('main')).getByRole('link',{name:`Voir les détails de ${piece.name}`}));
  assert.equal(link.getAttribute('href'),routes.productPath(piece));fireEvent.click(link);
  await waitFor(()=>assert.equal(window.location.pathname,routes.productPath(piece)));
  await waitFor(()=>assert.equal(currentNav(view)?.textContent,'Pièces détachées'));
  await waitFor(()=>assert.ok(within(view.container.querySelector('main')).getByRole('button',{name:'Retour — Pièces détachées'})));
  fireEvent.click(within(view.container.querySelector('main')).getByRole('button',{name:'Retour — Pièces détachées'}));
  await waitFor(()=>assert.equal(window.location.pathname+window.location.search,'/pieces-detachees?marque=tvs'));
  await waitFor(()=>assert.equal(currentNav(view)?.textContent,'Pièces détachées'));
  window.history.forward();
  await waitFor(()=>assert.equal(window.location.pathname,routes.productPath(piece)));
  const returnButton=await waitFor(()=>within(view.container.querySelector('main')).getByRole('button',{name:'Retour — Pièces détachées'}));
  fireEvent.click(returnButton);
  await waitFor(()=>assert.equal(window.location.pathname+window.location.search,'/pieces-detachees?marque=tvs'));
});

test('identifiants identiques : la catégorie reste déterminante', async()=>{
  const helmet=catalog.helmets[0], piece=catalog.spareParts[0];const original=piece.id;
  try{
    piece.id=helmet.id;
    assert.notEqual(routes.productPath(piece),routes.productPath(helmet));
    assert.equal(routes.navigationPage(routes.parseRoute(routes.productPath(piece))),'spares');
    assert.equal(routes.navigationPage(routes.parseRoute(routes.productPath(helmet))),'equipements');
    window.history.replaceState(null,'',routes.productPath(piece));
    const view=render(React.createElement(App));
    await waitFor(()=>assert.ok(within(view.container.querySelector('main')).getByRole('heading',{name:piece.name,level:1})));
    assert.equal(currentNav(view)?.textContent,'Pièces détachées');
    assert.equal(new URL(document.querySelector('link[rel=canonical]').href).pathname,routes.productPath(piece));
    view.unmount();
  }finally{piece.id=original;}
});
