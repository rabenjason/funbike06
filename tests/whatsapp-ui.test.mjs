import { after, afterEach, before, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { seedCatalog } from './helpers/catalog.mjs';
let dom, server, catalog, settingsLib, BikeCard, PartCard, WhatsappProvider, AdminWhatsapp, ConfirmationProvider, render, cleanup, fireEvent, waitFor, within, originalFetch;
let config, revision, calls;
before(async () => {
  dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://funbike.test/',pretendToBeVisual:true});
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Element:dom.window.Element,SVGElement:dom.window.SVGElement,IS_REACT_ACT_ENVIRONMENT:true});
  window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}}); globalThis.IntersectionObserver=class{observe(){} unobserve(){} disconnect(){}};
  ({render,cleanup,fireEvent,waitFor,within}=await import('@testing-library/react'));
  server=await createServer({server:{middlewareMode:true},appType:'custom',optimizeDeps:{noDiscovery:true,include:[]},logLevel:'silent'});
  await seedCatalog(server); catalog=await server.ssrLoadModule('/src/catalog/index.ts'); settingsLib=await server.ssrLoadModule('/src/lib/whatsappSettings.ts');
  ({BikeCard,PartCard}=await server.ssrLoadModule('/src/components/Cards.tsx'));
  ({WhatsappProvider}=await server.ssrLoadModule('/src/components/Whatsapp.tsx'));
  ({AdminWhatsapp}=await server.ssrLoadModule('/src/pages/AdminWhatsapp.tsx'));
  ({ConfirmationProvider}=await server.ssrLoadModule('/src/components/ConfirmationModal.tsx'));
  originalFetch=globalThis.fetch;
});
afterEach(()=>{cleanup();globalThis.fetch=originalFetch;});
after(async()=>{dom.window.close();await server.close();});
function setup() {
  config=structuredClone(settingsLib.defaultWhatsappSettings); config.enabled=true;
  config.sales={activeId:'john',people:[{id:'john',name:'John',phone:'+261 34 00 111 11'},{id:'sarah',name:'Sarah',phone:'+261 34 00 222 22'}]};
  config.parts={activeId:'pierre',people:[{id:'pierre',name:'Pierre',phone:'+261 34 00 333 33'}]};
  revision='r1'; calls=[];
  globalThis.fetch=async(url,options={})=>{
    calls.push({url:String(url),options});
    if(options.method==='PUT') {const body=JSON.parse(options.body); if(body.revision!==revision) return {ok:false,json:async()=>({error:'Les réglages ont changé.'})}; config=structuredClone(body.data); revision='r2';}
    if(String(url).endsWith('?admin=1') || options.method==='PUT') return {ok:true,json:async()=>({data:structuredClone(config),revision})};
    const active=(team)=>{const p=team.people.find(x=>x.id===team.activeId);return p?{phone:p.phone}:null;};
    return {ok:true,json:async()=>({data:{enabled:config.enabled,askIntent:config.askIntent,texts:structuredClone(config.texts),sales:active(config.sales),parts:active(config.parts)}})};
  };
}
const wrap = child => React.createElement(WhatsappProvider,null,child);

test('moto : carte cliquable, galerie indépendante, choix, message modifiable et contact commercial',async()=>{
  setup(); const bike={...catalog.motorcycles[0],name:'TVS HLX test',images:[...catalog.motorcycles[0].images,...catalog.motorcycles[0].images.map((i)=>({...i,id:i.id+'bis',position:20}))]};
  const navigation=[]; const view=render(wrap(React.createElement(BikeCard,{bike,go:(...args)=>navigation.push(args)})));
  const button=await view.findByRole('button',{name:/WhatsApp/});
  assert.match(view.container.textContent,/Sur devis/); assert.equal(view.queryByRole('button',{name:'Découvrir'}),null);
  fireEvent.click(view.getAllByRole('link',{name:'Découvrir TVS HLX test'}).at(-1)); assert.deepEqual(navigation.at(-1),['product',bike.id,undefined]);
  const n=navigation.length; fireEvent.click(view.getByRole('button',{name:'Voir la photo 2'})); assert.equal(navigation.length,n);
  button.focus(); fireEvent.click(button); const dialog=within(view.getByRole('dialog'));
  assert.ok(dialog.getByText('TVS HLX test')); assert.equal(navigation.length,n);
  fireEvent.click(dialog.getByRole('button',{name:'Prix et disponibilité'}));
  const textarea=dialog.getByLabelText('Votre message'); assert.match(textarea.value,/TVS HLX test/); assert.match(textarea.value,/https:\/\/funbike.test\/motos\//);
  fireEvent.change(textarea,{target:{value:'Bonjour, une question ?'}});
  const link=dialog.getByRole('link',{name:/Continuer sur WhatsApp/}); const url=new URL(link.href);
  assert.equal(url.hostname,'wa.me'); assert.equal(url.pathname,'/261340011111'); assert.equal(url.searchParams.get('text'),'Bonjour, une question ?');
  assert.equal(link.target,'_blank'); assert.match(link.rel,/noopener/);
  fireEvent.keyDown(document,{key:'Escape'}); assert.equal(view.queryByRole('dialog'),null); assert.equal(document.activeElement,button); assert.equal(navigation.length,n);
});

test('pièce et équipement : choix site ou WhatsApp et responsables indépendants',async()=>{
  setup(); const part={...catalog.spareParts[0],name:'Pièce test'}; const gear={...catalog.ridingGear[0],name:'Équipement test'};
  const contact=[]; const view=render(wrap(React.createElement('div',null,
    React.createElement(PartCard,{part,go(){},onEnquire:(p)=>contact.push(p.id)}),React.createElement(PartCard,{part:gear,go(){},onEnquire:(p)=>contact.push(p.id)}))));
  await waitFor(()=>assert.ok(calls.length));
  fireEvent.click(view.getAllByRole('button',{name:'Se renseigner'})[0]); let dialog=within(view.getByRole('dialog'));
  fireEvent.click(dialog.getByRole('button',{name:'Via le site'})); assert.deepEqual(contact,[part.id]);
  fireEvent.click(view.getAllByRole('button',{name:'Se renseigner'})[0]); dialog=within(view.getByRole('dialog'));
  fireEvent.click(dialog.getByRole('button',{name:'Par WhatsApp'})); fireEvent.click(dialog.getByRole('button',{name:'Informations'}));
  assert.match(dialog.getByLabelText('Votre message').value,/Pièce test/); assert.equal(new URL(dialog.getByRole('link',{name:/Continuer/}).href).pathname,'/261340033333');
  fireEvent.click(dialog.getByRole('button',{name:'Annuler'}));
  fireEvent.click(view.getAllByRole('button',{name:'Se renseigner'})[1]); dialog=within(view.getByRole('dialog'));
  fireEvent.click(dialog.getByRole('button',{name:'Par WhatsApp'})); fireEvent.click(dialog.getByRole('button',{name:'Informations'}));
  assert.equal(new URL(dialog.getByRole('link',{name:/Continuer/}).href).pathname,'/261340011111');
});

test('désactivation, mode direct, numéro absent et échec réseau conservent une navigation sûre',async()=>{
  setup(); config.askIntent=false; const bike=catalog.motorcycles[0]; const part=catalog.spareParts[0];
  const contacts=[]; const view=render(wrap(React.createElement('div',null,React.createElement(BikeCard,{bike,go(){}}),React.createElement(PartCard,{part,go(){},onEnquire:()=>contacts.push(1)}))));
  const direct=await view.findByRole('link',{name:/WhatsApp/}); assert.equal(new URL(direct.href).pathname,'/261340011111'); assert.match(new URL(direct.href).searchParams.get('text'),/Bonjour/);
  fireEvent.click(view.getByRole('button',{name:'Se renseigner'})); let dialog=within(view.getByRole('dialog')); assert.ok(dialog.getByRole('link',{name:/Par WhatsApp/})); fireEvent.click(dialog.getByRole('button',{name:'Annuler'}));
  config.enabled=false; fireEvent(document,new window.Event('visibilitychange'));
  await waitFor(()=>assert.ok(view.getByRole('button',{name:'Découvrir'}))); fireEvent.click(view.getByRole('button',{name:'Se renseigner'})); assert.deepEqual(contacts,[1]);
  config.enabled=true; config.sales.activeId=null; fireEvent(document,new window.Event('visibilitychange'));
  await waitFor(()=>assert.ok(view.getByRole('button',{name:'Découvrir'}))); assert.equal(view.queryByRole('link',{name:/WhatsApp/}),null);
  globalThis.fetch=async()=>{throw new Error('hors ligne');}; fireEvent(document,new window.Event('visibilitychange'));
  await waitFor(()=>assert.ok(view.getByRole('button',{name:'Découvrir'})));
});

test('administration : listes indépendantes, choix actif, textes, sauvegarde et suppression confirmée',async()=>{
  setup(); let dirty=false, saving=false; const view=render(React.createElement(ConfirmationProvider,null,React.createElement(AdminWhatsapp,{onDirtyChange:v=>{dirty=v;},onSavingChange:v=>{saving=v;}})));
  await waitFor(()=>view.getByRole('heading',{name:'Commerciaux — motos et équipements'}));
  const sales=within(view.getByRole('heading',{name:'Commerciaux — motos et équipements'}).closest('section'));
  const parts=within(view.getByRole('heading',{name:'Responsables — pièces détachées'}).closest('section'));
  fireEvent.click(sales.getByRole('button',{name:'Activer'})); assert.equal(dirty,true);
  fireEvent.change(view.getByLabelText('Titre du choix de contact'),{target:{value:'Contactez-nous'}});
  fireEvent.click(view.getByRole('button',{name:'Enregistrer les réglages WhatsApp'}));
  await waitFor(()=>view.getByRole('status')); assert.equal(config.sales.activeId,'sarah'); assert.equal(config.parts.activeId,'pierre'); assert.equal(config.texts.choiceTitle,'Contactez-nous'); assert.equal(dirty,false); assert.equal(saving,false);
  fireEvent.click(parts.getByRole('button',{name:'Ajouter un responsable'}));
  fireEvent.change(parts.getByLabelText('Nom 2'),{target:{value:'Marie'}}); fireEvent.change(parts.getByLabelText('Numéro WhatsApp 2'),{target:{value:'+261 34 55 555 55'}});
  fireEvent.click(parts.getByRole('button',{name:'Activer'}));
  fireEvent.click(view.getByRole('button',{name:'Enregistrer les réglages WhatsApp'})); await waitFor(()=>assert.equal(config.parts.people.length,2)); assert.equal(config.sales.activeId,'sarah'); assert.equal(config.parts.activeId,config.parts.people[1].id);
  fireEvent.click(parts.getAllByRole('button',{name:'Supprimer'})[1]); fireEvent.click(within(view.getByRole('alertdialog')).getByRole('button',{name:'Supprimer'}));
  await waitFor(()=>assert.equal(dirty,true)); assert.equal(parts.queryByLabelText('Nom 2'),null); assert.equal(parts.queryByRole('button',{name:'Actif'}),null);
  fireEvent.click(view.getByRole('button',{name:'Enregistrer les réglages WhatsApp'})); await waitFor(()=>assert.equal(config.parts.activeId,null)); assert.equal(config.sales.activeId,'sarah');
});

test('administration : validation, conflit et protection des changements dans Accueil',async()=>{
  setup(); const {AdminHomepage}=await server.ssrLoadModule('/src/pages/AdminHomepage.tsx');
  function Example(){
    const [dirty,setDirty]=React.useState(false),[saving,setSaving]=React.useState(false);
    return React.createElement(ConfirmationProvider,null,React.createElement(AdminHomepage,{catalog:{brands:[],categories:[],families:[],types:[],models:[],products:[]},onToggle:async()=>{},dirty,saving,onDirtyChange:setDirty,onSavingChange:setSaving}));
  }
  const view=render(React.createElement(Example)); fireEvent.click(view.getByRole('button',{name:'WhatsApp'}));
  await waitFor(()=>view.getByLabelText('Message pour le prix'));
  fireEvent.change(view.getByLabelText('Message pour le prix'),{target:{value:'Bonjour'}});
  fireEvent.click(view.getByRole('button',{name:'Enregistrer les réglages WhatsApp'}));
  assert.match(view.getByRole('alert').textContent,/Chaque modèle/); assert.equal(calls.filter(c=>c.options.method==='PUT').length,0);
  fireEvent.change(view.getByLabelText('Message pour le prix'),{target:{value:'Prix {produit} {lien}'}});
  revision='autre'; fireEvent.click(view.getByRole('button',{name:'Enregistrer les réglages WhatsApp'}));
  await waitFor(()=>assert.match(view.getByRole('alert').textContent,/changé/));
  assert.equal(view.getByLabelText('Message pour le prix').value,'Prix {produit} {lien}');
  fireEvent.click(view.getByRole('button',{name:'Textes et liens'}));
  await waitFor(()=>assert.ok(view.getByRole('alertdialog')));
  fireEvent.click(within(view.getByRole('alertdialog')).getByRole('button',{name:'Continuer à modifier'}));
  await waitFor(()=>assert.equal(view.getByLabelText('Message pour le prix').value,'Prix {produit} {lien}'));
});

test('modèles, numéros et liens sont validés et correctement encodés',()=>{
  assert.equal(settingsLib.validPhone('+261 34 12 345 67'),true); assert.equal(settingsLib.validPhone('034 12 345 67'),false); assert.equal(settingsLib.validPhone('+0000000000'),false);
  const product={...catalog.motorcycles[0],name:'Moto & casque / été'};
  const text=settingsLib.whatsappMessage('Prix de {produit} : {lien}',product,'https://funbike.test');
  const url=new URL(settingsLib.whatsappUrl('+261 34 12 345 67',text));
  assert.equal(url.searchParams.get('text'),text); assert.match(text,/Moto & casque \/ été/); assert.match(text,/https:\/\/funbike.test\/motos\//);
});
