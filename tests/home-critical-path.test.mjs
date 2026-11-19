import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

test('l’image de la moto sélectionnée est préchargée avant une réponse de contact lente', async()=>{
  const dom=new JSDOM('<!doctype html><html><head></head><body></body></html>',{url:'http://localhost/'});
  const oldDocument=globalThis.document, oldFetch=globalThis.fetch;globalThis.document=dom.window.document;
  const server=await createServer({server:{middlewareMode:true},appType:'custom',optimizeDeps:{noDiscovery:true,include:[]},logLevel:'silent'});
  const files={'brands.php':['brands.json','brands'],'contacts.php':['contacts.json','contact'],'products/motorcycles.php':['products/motorcycles.json','products']};
  let release,contactStarted=false;const gate=new Promise(resolve=>release=resolve);
  globalThis.fetch=async url=>{
    const path=String(url).replace('/server/api/',''); if(path==='contacts.php'){contactStarted=true;await gate;}
    const [file,key]=files[path]; const value=JSON.parse(readFileSync(`server/storage/data/${file}`,'utf8'))[key];
    return {ok:true,json:async()=>({[path.startsWith('products/')?'data':key]:value})};
  };
  try {
    const {loadInitialCatalog}=await server.ssrLoadModule('/src/catalog/loadServerData.ts');
    let settled=false; const pending=loadInitialCatalog('/').finally(()=>{settled=true;});
    for(let i=0;i<100 && !document.querySelector('link[data-homepage-hero]');i++) await new Promise(r=>setTimeout(r,10));
    const link=document.querySelector('link[data-homepage-hero]');assert.ok(link);assert.ok(contactStarted);assert.equal(settled,false);
    const motos=JSON.parse(readFileSync('server/storage/data/products/motorcycles.json','utf8')).products;
    const bike=motos.find(p=>p.status==='PUBLISHED' && p.isHomepageHero);
    const image=[...bike.images].sort((a,b)=>a.position-b.position).find(i=>i.isMain) ?? bike.images[0];
    assert.equal(link.getAttribute('href'),image.url);assert.equal(link.getAttribute('fetchpriority'),'high');
    release();await pending;
  } finally {release();globalThis.fetch=oldFetch;globalThis.document=oldDocument;dom.window.close();await server.close();}
});
