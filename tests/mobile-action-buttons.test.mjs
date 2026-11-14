import { after, afterEach, before, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { seedCatalog } from './helpers/catalog.mjs';

let dom, server, render, fireEvent, cleanup, Footer, Home, Product, AccessoryDetail, PartCard, Dealers, catalog, content;
before(async () => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', {url:'http://localhost/',pretendToBeVisual:true});
  globalThis.window=dom.window; globalThis.document=dom.window.document; globalThis.HTMLElement=dom.window.HTMLElement; globalThis.Element=dom.window.Element; globalThis.Image=dom.window.Image; globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
  globalThis.IntersectionObserver=class {observe(){} unobserve(){} disconnect(){}};
  ({render,fireEvent,cleanup}=await import('@testing-library/react'));
  server=await createServer({server:{middlewareMode:true},appType:'custom',optimizeDeps:{noDiscovery:true,include:[]},logLevel:'silent'});
  await seedCatalog(server); catalog=await server.ssrLoadModule('/src/catalog/index.ts');
  ({Footer}=await server.ssrLoadModule('/src/components/Layout.tsx')); ({default:Home}=await server.ssrLoadModule('/src/pages/Home.tsx'));
  ({default:Product}=await server.ssrLoadModule('/src/pages/Product.tsx')); ({default:AccessoryDetail}=await server.ssrLoadModule('/src/pages/AccessoryDetail.tsx'));
  ({default:Dealers}=await server.ssrLoadModule('/src/pages/Dealers.tsx')); ({PartCard}=await server.ssrLoadModule('/src/components/Cards.tsx'));
  content=await server.ssrLoadModule('/src/constants/content.ts');
});
afterEach(()=>cleanup());
after(async()=>{dom.window.close();await server.close();});
function centered(button, desktopRestore = false) {
  assert.ok(button.classList.contains('justify-center')); assert.ok(button.querySelector('span'));
  const icons=button.querySelectorAll('svg'); assert.equal(icons.length,2); assert.ok(button.querySelector('span.invisible svg'));
  if(desktopRestore) {assert.ok(button.classList.contains('sm:justify-between'));assert.ok(button.querySelector('span.invisible').classList.contains('sm:hidden'));}
}
test('pied de page : devis et appel centrés, actions et libellés conservés',()=>{
  const calls=[];const view=render(React.createElement(Footer,{go:(...args)=>calls.push(args),onCookies(){}}));
  const quote=view.getByRole('button',{name:content.content.footer.demanderDevis});const call=view.getByRole('link',{name:content.content.footer.appeler});
  centered(quote); centered(call); fireEvent.click(quote); assert.deepEqual(calls.at(-1),['contact']); assert.match(call.getAttribute('href'),/^tel:/);
});
test('fiches moto et accessoire : devis centré sur mobile et alignement bureau inchangé',()=>{
  const calls=[];const bike=catalog.motorcycles[0], part=catalog.products.find(p=>p.categoryId!=='motos'); assert.ok(bike);assert.ok(part);
  const props={go:(...args)=>calls.push(args),back(){},canGoBack:false,backLabel:''};
  let view=render(React.createElement(Product,{...props,id:bike.id})); let quote=view.getByRole('button',{name:'Demander un devis'});centered(quote,true); fireEvent.click(quote);assert.deepEqual(calls.at(-1),['contact']);view.unmount();
  view=render(React.createElement(AccessoryDetail,{...props,id:part.id,categoryId:part.categoryId})); quote=view.getByRole('button',{name:'Demander un devis'});centered(quote,true);fireEvent.click(quote);assert.deepEqual(calls.at(-1),['contact',part.id]);
});
test('cartes et revendeurs : actions centrées sans changer leur destination',()=>{
  const part=catalog.products.find(p=>p.categoryId!=='motos');let enquiry=null;let view=render(React.createElement(PartCard,{part,onEnquire:p=>{enquiry=p;}}));
  let button=view.getByRole('button',{name:'Se renseigner'});centered(button,true);fireEvent.click(button);assert.equal(enquiry.id,part.id);view.unmount();
  const calls=[];view=render(React.createElement(Dealers,{go:(...a)=>calls.push(a)}));
  button=view.getAllByRole('button',{name:'Devenir revendeur'}).find(el=>el.classList.contains('sm:hidden'));assert.ok(button);centered(button);fireEvent.click(button);assert.deepEqual(calls.at(-1),['contact']);
});
test('accueil : action principale centrée sans texte rogné sur mobile',()=>{
  const calls=[]; const view=render(React.createElement(Home,{go:(...args)=>calls.push(args)}));
  const button=view.getByRole('button',{name:/explorer le catalogue/i});centered(button);assert.ok(button.querySelector('span:not(.invisible)').classList.contains('[overflow-wrap:anywhere]'));
  fireEvent.click(button);assert.deepEqual(calls.at(-1),['catalogue']);
});
