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
const data=Object.fromEntries(Object.entries(files).map(([path,[file,key]])=>[path,JSON.parse(readFileSync(`server/storage/data/${file}`,'utf8'))[key]]));

test('accueil complet sans attendre modèles et catégories, échec secondaire puis réessai',async()=>{
  const server=await createServer({server:{middlewareMode:true},appType:'custom',optimizeDeps:{noDiscovery:true,include:[]},logLevel:'silent'});
  const original=globalThis.fetch; let fail=true; const calls=[];
  globalThis.fetch=async url=>{
    const path=String(url).replace('/server/api/',''); calls.push(path);
    if(path==='models.php' && fail) return {ok:false,status:500};
    return {ok:true,json:async()=>({[path.startsWith('products/')?'data':files[path][1]]:structuredClone(data[path])})};
  };
  try {
    const loader=await server.ssrLoadModule('/src/catalog/loadServerData.ts');
    const catalog=await server.ssrLoadModule('/src/catalog/index.ts');
    const preloaded=await loader.loadInitialCatalog('/');
    assert.equal(calls.includes('models.php'),false); assert.equal(calls.includes('categories.php'),false);
    assert.equal(catalog.products.length,data['products/motorcycles.php'].filter(x=>x.status==='PUBLISHED').length);
    assert.equal(calls.includes('products/riding-gear.php'),false);
    assert.equal(calls.includes('product-types.php'),false);
    const selections=data['products/helmets.php'].concat(data['products/riding-gear.php']).filter(x=>x.status==='PUBLISHED' && x.isEquipementAccueil===true).slice(0,4).map(x=>x.id);
    await assert.rejects(loader.startBackgroundCatalog(preloaded));
    assert.equal(loader.getBackgroundStatus(),'error');
    assert.deepEqual(catalog.getEquipementsAccueil(),[],'les sections non chargées restent en attente, sans données partielles');
    fail=false; await loader.startBackgroundCatalog();
    assert.equal(loader.getBackgroundStatus(),'ready'); assert.ok(catalog.categories.length); assert.ok(catalog.models.length);
    assert.deepEqual(catalog.getEquipementsAccueil().map(x=>x.id),selections);
  } finally {globalThis.fetch=original;await server.close();}
});
