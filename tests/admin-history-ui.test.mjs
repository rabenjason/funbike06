import { after, afterEach, before, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
let dom, server, render, fireEvent, waitFor, cleanup, AdminHistory, Admin, oldFetch;
before(async () => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', {url:'http://localhost/'});
  globalThis.window=dom.window; globalThis.document=dom.window.document; globalThis.localStorage=dom.window.localStorage; globalThis.HTMLElement=dom.window.HTMLElement; globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  ({render,fireEvent,waitFor,cleanup}=await import('@testing-library/react'));
  server=await createServer({server:{middlewareMode:true},appType:'custom',optimizeDeps:{noDiscovery:true,include:[]}});
  ({AdminHistory}=await server.ssrLoadModule('/src/pages/AdminHistory.tsx'));
  ({default:Admin}=await server.ssrLoadModule('/src/pages/Admin.tsx'));
  oldFetch=globalThis.fetch;
});
afterEach(()=>cleanup());
after(async()=>{globalThis.fetch=oldFetch;dom.window.close();await server.close();});

test('historique : filtres, résultat partiel, date Madagascar et pagination', async()=>{
  const calls=[];
  globalThis.fetch=async url=>{ const u=new URL(url,'http://localhost'); calls.push(u); const page=Number(u.searchParams.get('page')); return {ok:true,json:async()=>({page,pages:2,total:21,accounts:['editor'],types:['Retrait — photo produit'],entries:[{time:'2026-11-10T14:15:16+03:00',account:'editor',type:'Retrait — photo produit',subject:'Produit : Moto Test',fields:['images'],result:'Référence retirée, fichier conservé.'}]})}; };
  const view=render(React.createElement(AdminHistory));
  await waitFor(()=>assert.match(view.container.textContent,/14:15:16/));
  assert.match(view.container.textContent,/Compte : editor/); assert.match(view.container.textContent,/fichier conservé/); assert.match(view.container.textContent,/photos/);
  fireEvent.change(view.getByLabelText('Compte'),{target:{value:'editor'}});
  fireEvent.change(view.getByLabelText('Type d’action'),{target:{value:'Retrait — photo produit'}});
  fireEvent.change(view.getByLabelText('Du'),{target:{value:'2026-11-01'}});
  fireEvent.change(view.getByLabelText('Au'),{target:{value:'2026-11-30'}});
  fireEvent.change(view.getByLabelText('Recherche'),{target:{value:'Moto Test'}});
  fireEvent.click(view.getByRole('button',{name:'Filtrer'}));
  await waitFor(()=>assert.ok(calls.some(u=>u.searchParams.get('q')==='Moto Test' && u.searchParams.get('account')==='editor' && u.searchParams.get('from')==='2026-11-01' && u.searchParams.get('to')==='2026-11-30')));
  fireEvent.click(view.getByRole('button',{name:'Suivant'})); await waitFor(()=>assert.ok(calls.some(u=>u.searchParams.get('page')==='2')));
  assert.match(view.container.textContent,/Page 2 \/ 2/);
  fireEvent.click(view.getByRole('button',{name:'Effacer les filtres'})); await waitFor(()=>assert.equal(view.getByLabelText('Recherche').value,''));
});

test('historique : erreur serveur explicite',async()=>{
  globalThis.fetch=async()=>({ok:false,json:async()=>({error:'Historique indisponible.'})});
  const view=render(React.createElement(AdminHistory));
  await waitFor(()=>assert.match(view.getByRole('alert').textContent,/indisponible/));
});

for (const role of ['superadmin','admin']) test(`onglet historique : rôle ${role}`,async()=>{
  const calls=[];
  globalThis.fetch=async url=>{
    const path=String(url).replace('/server/api/',''); calls.push(path);
    if(path.startsWith('admin-history.php?')) return {ok:true,json:async()=>({page:1,pages:0,total:0,accounts:[],types:[],entries:[]})};
    const fixed={'auth/me.php':{user:{id:'test',username:'test',role,mustChangePassword:false}},'brands.php?includeDrafts=1':{brands:[]},'categories.php':{categories:[]},'families.php':{families:[]},'product-types.php':{productTypes:[]},'models.php?includeDrafts=1':{models:[]},'products/motorcycles.php?includeDrafts=1':{data:[]},'products/helmets.php?includeDrafts=1':{data:[]},'products/riding-gear.php?includeDrafts=1':{data:[]},'products/spare-parts.php?includeDrafts=1':{data:[]},'messages.php?count=unread':{unreadCount:0}};
    return fixed[path]?{ok:true,json:async()=>fixed[path]}:{ok:false,json:async()=>({error:'Route inconnue'})};
  };
  const view=render(React.createElement(Admin)); await waitFor(()=>assert.ok(view.getByRole('button',{name:'Produits'})));
  if(role==='superadmin') {fireEvent.click(view.getByRole('button',{name:'Historique'})); await waitFor(()=>assert.match(view.container.textContent,/Aucune action/)); assert.ok(calls.some(p=>p.startsWith('admin-history.php?')));}
  else {assert.equal(view.queryByRole('button',{name:'Historique'}),null); assert.ok(!calls.some(p=>p.startsWith('admin-history.php?')));}
});
