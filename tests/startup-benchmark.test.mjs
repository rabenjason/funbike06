import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';

const files={
  'brands.php':['brands.json','brands'], 'categories.php':['categories.json','categories'], 'families.php':['families.json','families'],
  'product-types.php':['product-types.json','productTypes'], 'models.php':['models.json','models'], 'contacts.php':['contacts.json','contact'],
  'products/motorcycles.php':['products/motorcycles.json','products'], 'products/helmets.php':['products/helmets.json','products'],
  'products/riding-gear.php':['products/riding-gear.json','products'], 'products/spare-parts.php':['products/spare-parts.json','products'],
};
const fixtures=Object.fromEntries(Object.entries(files).map(([path,[file,key]])=>[path,JSON.parse(readFileSync(`server/storage/data/${file}`,'utf8'))[key]]));

test('comparaison simulée du chemin critique moto, latence identique à chaque réponse',async t=>{
  const server=await createServer({server:{middlewareMode:true},appType:'custom',optimizeDeps:{noDiscovery:true,include:[]},logLevel:'silent'});
  const oldFetch=globalThis.fetch; let calls=[];
  globalThis.fetch=async url=>{
    const path=String(url).replace('/server/api/',''); calls.push(path);
    await new Promise(r=>setTimeout(r,120));
    return {ok:true,json:async()=>path==='homepage-content.php'?{}:{[path.startsWith('products/')?'data':files[path][1]]:structuredClone(fixtures[path])}};
  };
  try {
    const {loadServerData,loadInitialCatalog}=await server.ssrLoadModule('/src/catalog/loadServerData.ts');
    const {readPublicJson}=await server.ssrLoadModule('/src/lib/publicDataRequest.ts');
    let start=performance.now();
    await Promise.all([loadServerData(undefined,undefined,true),readPublicJson('homepage-content.php')]);
    const previous=Math.round(performance.now()-start); assert.equal(calls.length,11);
    calls=[]; start=performance.now();
    await Promise.all([loadInitialCatalog('/motos'),readPublicJson('homepage-content.php')]);
    const optimized=Math.round(performance.now()-start); assert.equal(calls.length,6);
    t.diagnostic(`Simulation à 120 ms par lecture, concurrence 3 : ancien chemin ${previous} ms / nouveau ${optimized} ms (hors téléchargements et rendu).`);
  } finally {globalThis.fetch=oldFetch;await server.close();}
});
