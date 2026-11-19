import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';

let server, readPublicJson, schedulePublicOperation, loadServerData, reloadDealers, catalog, dealers, homepage;
const originalFetch=globalThis.fetch;
const paths = {
  'brands.php': ['brands.json', 'brands'], 'categories.php': ['categories.json', 'categories'], 'families.php': ['families.json', 'families'],
  'product-types.php': ['product-types.json', 'productTypes'], 'models.php': ['models.json', 'models'], 'dealers.php': ['dealers.json', 'dealers'], 'contacts.php': ['contacts.json', 'contact'],
  'products/motorcycles.php': ['products/motorcycles.json', 'products'], 'products/helmets.php': ['products/helmets.json', 'products'],
  'products/riding-gear.php': ['products/riding-gear.json', 'products'], 'products/spare-parts.php': ['products/spare-parts.json', 'products'],
};
const fixtures=Object.fromEntries(Object.entries(paths).map(([path,[file,key]])=>[path,JSON.parse(readFileSync(`server/storage/data/${file}`,'utf8'))[key]]));
const ok=data=>({ok:true,status:200,json:async()=>data});
const getValue=(path)=>({[path.startsWith('products/')?'data':paths[path][1]]:structuredClone(fixtures[path])});
const waitUntil=async fn=>{ for(let i=0;i<100;i++){if(fn())return; await new Promise(r=>setTimeout(r,10));} throw new Error('Condition non atteinte'); };
before(async()=>{
  server=await createServer({server:{middlewareMode:true},appType:'custom',optimizeDeps:{noDiscovery:true,include:[]},logLevel:'silent'});
  ({readPublicJson,schedulePublicOperation}=await server.ssrLoadModule('/src/lib/publicDataRequest.ts'));
  ({loadServerData,reloadDealers}=await server.ssrLoadModule('/src/catalog/loadServerData.ts'));
  catalog=await server.ssrLoadModule('/src/catalog/index.ts'); dealers=await server.ssrLoadModule('/src/catalog/dealers.ts');
  homepage=await server.ssrLoadModule('/src/content/homepage.ts');
});
after(async()=>{globalThis.fetch=originalFetch;await server.close();});

test('502, 503 et 504 : essais bornés et délais progressifs ; pas de nouvel essai sur 500 ou écriture',async()=>{
  let calls=[]; const statuses=[502,503,200];
  globalThis.fetch=async()=>{calls.push(Date.now()); const status=statuses.shift();return status===200?ok({answer:true}):{ok:false,status};};
  assert.deepEqual(await readPublicJson('brands.php'),{answer:true}); assert.equal(calls.length,3);
  assert.ok(calls[1]-calls[0]>=200); assert.ok(calls[2]-calls[1]>=650);
  calls=[]; globalThis.fetch=async()=>{calls.push(1);return calls.length===1?{ok:false,status:504}:ok({ok:true});};
  assert.deepEqual(await readPublicJson('dealers.php'),{ok:true}); assert.equal(calls.length,2);
  calls=[]; globalThis.fetch=async()=>{calls.push(1);return {ok:false,status:500};};
  await assert.rejects(readPublicJson('brands.php'),/500/); assert.equal(calls.length,1);
  let writes=0; await schedulePublicOperation(async()=>{writes++;return {ok:false,status:503};}); assert.equal(writes,1);
  const controller=new AbortController(); calls=[];
  globalThis.fetch=async()=>{calls.push(1);return {ok:false,status:504};};
  const pending=readPublicJson('brands.php',controller.signal); await waitUntil(()=>calls.length===1); controller.abort();
  await assert.rejects(pending,/annulé/); assert.equal(calls.length,1);
});

test('une lecture bloquée est interrompue puis réessayée de manière bornée', async () => {
  let calls = 0, aborted = 0;
  globalThis.fetch = async (_url, options) => {
    calls++;
    return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => { aborted++; reject(new Error('aborted')); }, {once:true}));
  };
  await assert.rejects(readPublicJson('brands.php', undefined, 10), /504/);
  assert.equal(calls, 3); assert.equal(aborted, 3);
});

test('annulation d’une requête en attente sans démarrer l’opération', async () => {
  let release; const gate = new Promise(resolve => { release = resolve; });
  let started = 0, cancelledStarted = false;
  const running = Array.from({length:3}, () => schedulePublicOperation(async () => { started++; await gate; }));
  await waitUntil(() => started === 3);
  const controller = new AbortController();
  const pending = schedulePublicOperation(async () => { cancelledStarted = true; }, controller.signal);
  controller.abort();
  await assert.rejects(pending, /annulé/);
  release(); await Promise.all(running);
  assert.equal(cancelledStarted, false);
});

test('les anciens chargements catalogue et revendeurs ne peuvent pas écraser les nouveaux',async()=>{
  let releaseOld, oldStarted=false, oldCalls=0, latest=false;
  const gate=new Promise(resolve=>{releaseOld=resolve;});
  globalThis.fetch=async url=>{
    const path=String(url).replace('/server/api/',''); const wasLatest=latest;
    if (!wasLatest) oldCalls++;
    const data=getValue(path);
    if (path==='products/motorcycles.php') data.data[0].name=wasLatest?'Moto récente':'Moto ancienne';
    if (path==='brands.php' && !wasLatest) {oldStarted=true;await gate;}
    return ok(data);
  };
  const old=loadServerData().then(()=>null,error=>error);
  await waitUntil(()=>oldStarted && oldCalls===11);
  latest=true; await loadServerData();
  assert.equal(catalog.motorcycles[0].name,'Moto récente');
  releaseOld(); assert.match((await old).message,/annulé/);
  assert.equal(catalog.motorcycles[0].name,'Moto récente');
  let releaseFirst, count=0; const dealerGate=new Promise(resolve=>{releaseFirst=resolve;});
  globalThis.fetch=async()=>{const number=++count; if(number===1) await dealerGate; return ok({dealers:[{...fixtures['dealers.php'][0],name:number===1?'Ancien':'Récent'}]});};
  const first=reloadDealers(); await waitUntil(()=>count===1); await reloadDealers(); releaseFirst(); await first;
  assert.equal(dealers.DEALERS[0].name,'Récent'); assert.equal(dealers.dealerStatus(),'ready');
});

test('un ancien contenu d’accueil ne peut pas remplacer le plus récent',async()=>{
  const defaults=JSON.parse(readFileSync('server/api/_lib/homepage-defaults.json','utf8'));
  let releaseFirst,count=0; const gate=new Promise(resolve=>{releaseFirst=resolve;});
  globalThis.fetch=async()=>{const n=++count;const data=structuredClone(defaults);data.content.hero.titreLigne1=n===1?'Ancien':'Récent'; if(n===1) await gate;return ok({data});};
  const first=homepage.loadHomepageData().then(()=>null,error=>error); await waitUntil(()=>count===1);
  await homepage.loadHomepageData(); releaseFirst(); assert.match((await first).message,/annulé/);
  assert.equal(homepage.homepageContent.hero.titreLigne1,'Récent');
});
