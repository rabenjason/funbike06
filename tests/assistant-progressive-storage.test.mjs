import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { readFileSync } from 'node:fs';
const files={
  'brands.php':['brands.json','brands'], 'categories.php':['categories.json','categories'], 'families.php':['families.json','families'],
  'product-types.php':['product-types.json','productTypes'], 'models.php':['models.json','models'], 'contacts.php':['contacts.json','contact'], 'dealers.php':['dealers.json','dealers'],
  'products/motorcycles.php':['products/motorcycles.json','products'], 'products/helmets.php':['products/helmets.json','products'],
  'products/riding-gear.php':['products/riding-gear.json','products'], 'products/spare-parts.php':['products/spare-parts.json','products'],
};
const fixtures=Object.fromEntries(Object.entries(files).map(([p,[f,k]])=>[p,JSON.parse(readFileSync(`server/storage/data/${f}`,'utf8'))[k]]));

test('une conversation enregistrée n’est pas effacée pendant le chargement progressif',async()=>{
  const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost/',pretendToBeVisual:true});
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,HTMLElement:dom.window.HTMLElement,Element:dom.window.Element,SVGElement:dom.window.SVGElement,IS_REACT_ACT_ENVIRONMENT:true});
  window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});window.HTMLElement.prototype.scrollTo=()=>{};
  const {render,fireEvent,waitFor,cleanup,act}=await import('@testing-library/react');
  const server=await createServer({server:{middlewareMode:true},appType:'custom',optimizeDeps:{noDiscovery:true,include:[]},logLevel:'silent'});
  const oldFetch=globalThis.fetch; let hold=false, release;const gate=new Promise(resolve=>release=resolve);
  globalThis.fetch=async url=>{const p=String(url).replace('/server/api/','');if(p==='models.php' && hold) await gate;return {ok:true,json:async()=>({[p.startsWith('products/')?'data':files[p][1]]:structuredClone(fixtures[p])})};};
  try {
    const loader=await server.ssrLoadModule('/src/catalog/loadServerData.ts');await loader.loadServerData();
    const catalog=await server.ssrLoadModule('/src/catalog/index.ts'), contact=await server.ssrLoadModule('/src/catalog/contact.ts'), dealer=await server.ssrLoadModule('/src/catalog/dealers.ts');
    const raw=JSON.stringify([catalog.brands,catalog.products,catalog.categories,catalog.families,catalog.productTypes,catalog.models,dealer.DEALERS,contact.CONTACT_ADDRESS,contact.CONTACT_EMAIL,contact.CONTACT_HOURS,contact.CONTACT_PHONE,contact.CONTACT_WHATSAPP]);
    let hash=2166136261;for(let i=0;i<raw.length;i++) hash=Math.imul(hash^raw.charCodeAt(i),16777619);
    const previous=JSON.stringify({messages:[{id:'one',from:'bot',text:'Conversation conservée',time:Date.now()}],memory:{lastIds:[],misses:0},quick:[],catalogVersion:(hash>>>0).toString(36)});
    localStorage.setItem('fb_chat_v3',previous);hold=true;
    const pending=loader.startBackgroundCatalog();
    const {default:CatChat}=await server.ssrLoadModule('/src/components/CatChat.tsx');
    const view=render(React.createElement(CatChat,{go(){}}));
    assert.equal(localStorage.getItem('fb_chat_v3'),previous);
    await act(async()=>{release();await pending;});
    fireEvent.click(view.getByLabelText(/^Ouvrir la discussion/));
    await waitFor(()=>assert.ok(view.getByText('Conversation conservée')));
    assert.match(localStorage.getItem('fb_chat_v3'),/Conversation conservée/);
  } finally {release();cleanup();globalThis.fetch=oldFetch;dom.window.close();await server.close();}
});
