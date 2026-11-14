import { after, afterEach, before, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import defaults from '../src/content/homepage-defaults.json' with { type:'json' };
let dom, server, render, fireEvent, waitFor, cleanup, AdminSiteLogo, ConfirmationProvider, Header, Footer, homepage;
let originalFetch, originalFormData, originalCreateObjectURL, originalRevokeObjectURL;
const original = '/server/public/assets/company/logo-funbike-720-a3ab2dc4.png';
let images, selected, version, requests;
const revision = () => String(version).padStart(64,'0');
const snapshot = () => ({data:{images:structuredClone(images),selected},revision:revision(),defaultLogo:original});
const ok = (value) => ({ok:true,json:async()=>value});
before(async()=>{
  dom = new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost/',pretendToBeVisual:true});
  globalThis.window=dom.window; globalThis.document=dom.window.document; globalThis.HTMLElement=dom.window.HTMLElement; globalThis.Element=dom.window.Element; globalThis.Image=dom.window.Image; globalThis.requestAnimationFrame=dom.window.requestAnimationFrame.bind(dom.window); globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  window.matchMedia = () => ({matches:false,addEventListener(){},removeEventListener(){}});
  globalThis.IntersectionObserver=class {observe(){} unobserve(){} disconnect(){}};
  ({render,fireEvent,waitFor,cleanup}=await import('@testing-library/react'));
  server=await createServer({server:{middlewareMode:true},appType:'custom',optimizeDeps:{noDiscovery:true,include:[]},logLevel:'silent'});
  ({AdminSiteLogo}=await server.ssrLoadModule('/src/pages/AdminSiteLogo.tsx'));
  ({ConfirmationProvider}=await server.ssrLoadModule('/src/components/ConfirmationModal.tsx'));
  ({Header,Footer}=await server.ssrLoadModule('/src/components/Layout.tsx'));
  homepage=await server.ssrLoadModule('/src/content/homepage.ts');
  originalFetch=globalThis.fetch; originalFormData=globalThis.FormData; globalThis.FormData=dom.window.FormData;
  originalCreateObjectURL=URL.createObjectURL; originalRevokeObjectURL=URL.revokeObjectURL; URL.createObjectURL=()=> 'blob:test-preview'; URL.revokeObjectURL=()=>{};
});
afterEach(()=>{cleanup();globalThis.fetch=originalFetch;});
after(async()=>{globalThis.FormData=originalFormData; URL.createObjectURL=originalCreateObjectURL; URL.revokeObjectURL=originalRevokeObjectURL; dom.window.close(); await server.close();});
function setup(){
  images=[];selected=null;version=1;requests=[];
  globalThis.fetch=async(url,options={})=>{
    requests.push({url:String(url),method:options.method||'GET'});
    if(String(url)==='/server/api/homepage-content.php') return ok({data:structuredClone(defaults),siteLogo:selected ? images.find(i=>i.id===selected).url : original});
    if(String(url)!=='/server/api/site-logo.php') throw new Error('Unexpected: '+url);
    if(options.method==='POST'){
      assert.equal(options.body.get('revision'),revision()); const id='a'.repeat(32); images.push({id,url:`/server/uploads/site-logo/logo-${id}.png`});version++;
    } else if(options.method==='PUT'){
      const body=JSON.parse(options.body);assert.equal(body.revision,revision());selected=body.id;version++;
    } else if(options.method==='DELETE'){
      const body=JSON.parse(options.body);assert.equal(body.revision,revision());assert.notEqual(body.id,selected);images=images.filter(i=>i.id!==body.id);version++;
    }
    return ok(snapshot());
  };
}
test('bibliothèque : aperçu, ajout sans activation, sélection, retour au défaut et suppression confirmée', async()=>{
  setup(); let dirty=false; const view=render(React.createElement(ConfirmationProvider,null,React.createElement(AdminSiteLogo,{onDirtyChange:v=>{dirty=v;}})));
  await waitFor(()=>assert.ok(view.getByText('Logo par défaut · permanent')));
  assert.equal(view.queryByRole('button',{name:/Supprimer.*défaut/i}),null);
  const file=new dom.window.File(['image'], 'noel.png',{type:'image/png'});
  fireEvent.change(view.getByLabelText('Ajouter un logo'),{target:{files:[file]}});
  await waitFor(()=>assert.ok(view.getByAltText('Aperçu du logo à ajouter'))); assert.equal(dirty,true);
  fireEvent.click(view.getByRole('button',{name:'Ajouter à la bibliothèque'}));
  await waitFor(()=>assert.ok(view.getByAltText('Logo ajouté 1'))); assert.equal(dirty,false); assert.equal(selected,null);
  fireEvent.click(view.getByRole('button',{name:'Utiliser le logo ajouté 1'}));
  await waitFor(()=>assert.equal(selected, 'a'.repeat(32)));
  assert.equal(view.queryByRole('button',{name:'Supprimer le logo ajouté 1'}),null);
  fireEvent.click(view.getByRole('button',{name:'Utiliser le logo par défaut'}));
  await waitFor(()=>assert.equal(selected,null));
  fireEvent.click(view.getByRole('button',{name:'Supprimer le logo ajouté 1'}));
  assert.ok(view.getByRole('alertdialog')); fireEvent.click(view.getByRole('button',{name:'Non'}));
  await waitFor(()=>assert.equal(view.queryByRole('alertdialog'),null)); assert.equal(images.length,1);
  fireEvent.click(view.getByRole('button',{name:'Supprimer le logo ajouté 1'}));
  fireEvent.click(view.getByRole('button',{name:'Oui, supprimer'}));
  await waitFor(()=>assert.equal(images.length,0)); assert.ok(view.getByText('Logo par défaut · permanent'));
});
test('logo sélectionné sur en-tête et pied de page, repli sur original et icône inchangée', async()=>{
  setup(); const id='b'.repeat(32), url=`/server/uploads/site-logo/logo-${id}.png`; images=[{id,url}];selected=id;
  await homepage.loadHomepageData();
  const view=render(React.createElement(React.Fragment,null,React.createElement(Header,{route:{page:'home'},go:()=>{},dark:false,toggle:()=>{}}),React.createElement(Footer,{go:()=>{},onCookies:()=>{}})));
  const logos=view.getAllByAltText('Funbike Madagascar'); assert.equal(logos.length,2); assert.ok(logos.every(img=>img.getAttribute('src')===url));
  fireEvent.error(logos[0]); assert.equal(logos[0].getAttribute('src'),original);
  assert.equal(view.container.querySelector('link[rel="icon"]'),null);
  selected=null; await homepage.loadHomepageData(); view.rerender(React.createElement(React.Fragment,null,React.createElement(Header,{route:{page:'home'},go:()=>{},dark:false,toggle:()=>{}}),React.createElement(Footer,{go:()=>{},onCookies:()=>{}})));
  assert.ok(view.getAllByAltText('Funbike Madagascar').every(img=>img.getAttribute('src')===original));
});

test('fichier refusé et conflit de révision : rien n’est supprimé ou activé', async()=>{
  setup(); const id='c'.repeat(32); images=[{id,url:`/server/uploads/site-logo/logo-${id}.png`}];
  const initial=globalThis.fetch; globalThis.fetch=async(url,options={})=> options.method==='PUT' ? {ok:false,json:async()=>({error:'La bibliothèque a changé. Rechargez avant de continuer.'})} : initial(url,options);
  const view=render(React.createElement(ConfirmationProvider,null,React.createElement(AdminSiteLogo)));
  await waitFor(()=>assert.ok(view.getByText('Logo par défaut · permanent')));
  fireEvent.change(view.getByLabelText('Ajouter un logo'),{target:{files:[new dom.window.File(['x'],'unsafe.svg',{type:'image/svg+xml'})]}});
  assert.match(view.getByRole('alert').textContent,/JPEG, PNG ou WebP/);
  assert.equal(view.getByRole('button',{name:'Ajouter à la bibliothèque'}).disabled,true);
  fireEvent.click(view.getByRole('button',{name:'Utiliser le logo ajouté 1'}));
  await waitFor(()=>assert.match(view.getByRole('alert').textContent,/bibliothèque a changé/));
  assert.equal(selected,null); assert.equal(images.length,1);
  fireEvent.click(view.getByRole('button',{name:'Recharger'}));
  await waitFor(()=>assert.equal(view.queryByRole('alert'),null));
});
