import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';
import { randomBytes } from 'node:crypto';

const wasm = resolve('node_modules/.bin/php-wasm-cli');
const php = process.env.PHP_BINARY || (spawnSync('php', ['-v'], { stdio: 'ignore' }).status === 0 ? 'php' : existsSync(wasm) ? wasm : null);

test('historique privé : écriture, lecture filtrée et accès superadmin', {skip: !php && 'PHP non installé', timeout: 90000}, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'fb-history-'));
  cpSync(resolve('server'), join(dir, 'server'), {recursive:true});
  const root = join(dir, 'server'), history = join(root, 'storage/private/admin-history.jsonl');
  const init = `initial-${randomBytes(8).toString('hex')}`, changed = `changed-${randomBytes(8).toString('hex')}`;
  const created = spawnSync(php, [join(root, 'scripts/create-admin.php'), 'owner'], {env:{...process.env, FUNBIKE_TEMP_PASSWORD:init}, encoding:'utf8'});
  assert.equal(created.status, 0, created.stderr);
  const script = join(root, 'seed-history.php');
  writeFileSync(script, `<?php require __DIR__ . '/api/_lib/admin-history.php'; for ($i=0;$i<25;$i++) funbikeHistoryAppend(['username'=>$i%2?'editor':'owner'], $i%2?'Modification':'Ajout', 'Moto '.$i, ['name'], 'OK');`);
  const seed = spawnSync(php, [script], {encoding:'utf8'}); assert.equal(seed.status, 0, seed.stderr);
  const portServer = createServer(); await new Promise(r => portServer.listen(0, '127.0.0.1', r)); const port = portServer.address().port; await new Promise(r => portServer.close(r));
  const router = join(dir, 'router.php');
  writeFileSync(router, `<?php $p=parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH); if(preg_match('#^/server/(storage|scripts|api/_lib)(/|$)#',$p)){http_response_code(404);exit;} return false;`);
  const child = spawn(php, ['-S', `127.0.0.1:${port}`, '-t', dir, router], {stdio:'ignore'});
  const base = `http://127.0.0.1:${port}/server/api/`;
  try {
    for (let n=0; n<100; n++) { try { if ((await fetch(base+'brands.php')).ok) break; } catch {} await new Promise(r=>setTimeout(r,100)); }
    assert.equal((await fetch(base+'admin-history.php')).status, 401);
    async function login(username, password) { const r=await fetch(base+'auth/login.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})}); assert.equal(r.status,200); return r.headers.get('set-cookie').split(';')[0]; }
    let cookie=await login('owner',init);
    const change=await fetch(base+'auth/change-password.php',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({currentPassword:init,newPassword:changed,newPasswordConfirmation:changed})}); assert.equal(change.status,200); cookie=change.headers.get('set-cookie').split(';')[0];
    let r=await fetch(base+'admin-history.php',{headers:{Cookie:cookie}}); assert.equal(r.status,200); let data=await r.json();
    assert.equal(data.total,25); assert.equal(data.pages,2); assert.equal(data.entries.length,20); assert.equal(data.entries[0].subject,'Moto 24'); assert.match(data.entries[0].time,/\+03:00$/);
    r=await fetch(base+'admin-history.php?page=2',{headers:{Cookie:cookie}}); data=await r.json(); assert.equal(data.entries.length,5); assert.equal(data.entries[4].subject,'Moto 0');
    r=await fetch(base+'admin-history.php?account=editor&type=Modification&q=Moto%201',{headers:{Cookie:cookie}}); data=await r.json(); assert.equal(data.total,6); assert.ok(data.entries.every(e=>e.account==='editor' && e.type==='Modification'));
    assert.equal((await fetch(base+'admin-history.php?from=2025-02-30',{headers:{Cookie:cookie}})).status,400);
    const editor=await fetch(base+'auth/users.php',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({username:'editor'})}); const info=await editor.json(); assert.equal(editor.status,201);
    let ec=await login('editor',info.temporaryPassword); const ep=`editor-${randomBytes(8).toString('hex')}`;
    const changeEditor=await fetch(base+'auth/change-password.php',{method:'POST',headers:{Cookie:ec,'Content-Type':'application/json'},body:JSON.stringify({currentPassword:info.temporaryPassword,newPassword:ep,newPasswordConfirmation:ep})}); assert.equal(changeEditor.status,200); ec=changeEditor.headers.get('set-cookie').split(';')[0];
    assert.equal((await fetch(base+'admin-history.php',{headers:{Cookie:ec}})).status,403);
    assert.equal((await fetch(base.replace('/api/','/storage/private/admin-history.jsonl'))).status,404);
    assert.equal(readFileSync(history,'utf8').includes(changed),false);
    // Les opérations réelles sont attribuées au compte connecté, sans valeurs de champs.
    async function call(path, method = 'GET', body, using = ec) {
      const res = await fetch(base + path, {method, headers:{Cookie:using, ...(body ? {'Content-Type':'application/json'} : {})}, body:body ? JSON.stringify(body) : undefined});
      const value = await res.json(); return {status:res.status, value};
    }
    const dealer = await call('dealers.php','POST',{name:'Journal revendeur',city:'Testville'}); assert.equal(dealer.status,201, JSON.stringify(dealer.value));
    const key=dealer.value.dealer.key;
    assert.equal((await call(`dealers.php?key=${key}`,'PUT',{phone:'034 00 000 00'})).status,200);
    assert.equal((await call(`dealers.php?key=${key}`,'DELETE')).status,200);
    assert.equal((await call('contacts.php','PUT',{address:'Adresse privée test'})).status,200);
    const home=await call('homepage-content.php'); home.value.data.content.hero.titreLigne1='Titre privé test';
    assert.equal((await call('homepage-content.php','PUT',{revision:home.value.revision,data:home.value.data})).status,200);
    const sample=JSON.parse(readFileSync(join(root,'storage/data/products/motorcycles.json'),'utf8')).products[0];
    const product = {...sample, id:'journal-test-moto', name:'Moto historique spéciale', status:'DRAFT', images:[{id:'x',url:'/server/uploads/products/motorcycles/journal-test-moto/main.png',position:0,isMain:true,altText:'Photo'}]};
    const added=await call('products/motorcycles.php','POST',product); assert.equal(added.status,201,JSON.stringify(added.value));
    const id=added.value.data.id;
    assert.equal((await call(`products/motorcycles.php?id=${id}`,'PUT',{name:'Moto historique modifiée',status:'PUBLISHED'})).status,200);
    assert.equal((await call(`products/motorcycles.php?id=${id}`,'PUT',{status:'ARCHIVED'})).status,200);
    const removed=await call('products/photo.php','DELETE',{categoryId:'motos',productId:id,url:product.images[0].url}); assert.equal(removed.status,200,JSON.stringify(removed.value)); assert.equal(removed.value.fileStatus,'missing');
    // Une photo partagée est retirée de la fiche mais son fichier est conservé.
    const photoDir=join(root,'uploads/products/motorcycles',id); mkdirSync(photoDir,{recursive:true});
    const photoPath=join(photoDir,'image-2.png'); writeFileSync(photoPath,readFileSync(join(root,'public/assets/company/logo-funbike-720-a3ab2dc4.png')));
    const photoUrl=`/server/uploads/products/motorcycles/${id}/image-2.png`;
    assert.equal((await call(`products/motorcycles.php?id=${id}`,'PUT',{images:[{id:'image-shared',url:photoUrl,position:0,isMain:true}]})).status,200);
    const refs=join(root,'storage/data/history-test-reference.json'); writeFileSync(refs,JSON.stringify({image:photoUrl}));
    const shared=await call('products/photo.php','DELETE',{categoryId:'motos',productId:id,url:photoUrl}); assert.equal(shared.status,200); assert.equal(shared.value.fileStatus,'shared'); assert.ok(existsSync(photoPath));
    rmSync(refs);
    const cleanup=await call('products/photo.php?action=cleanup','POST',{categoryId:'motos',productId:id,files:['image-2.png']}); assert.equal(cleanup.status,200); assert.deepEqual(cleanup.value.deleted,['image-2.png']); assert.equal(existsSync(photoPath),false);
    const campaign={name:'Journal promo',description:'texte privé',bannerUrl:'',startDate:'2020-01-01',endDate:'2099-12-31',enabled:false,published:false,products:[]};
    const addedPromo=await call('promotions.php','POST',{campaign}); assert.equal(addedPromo.status,201,JSON.stringify(addedPromo.value)); const promoId=addedPromo.value.campaign.id;
    assert.equal((await call('promotions.php','PUT',{campaign:{...campaign,id:promoId,enabled:true}})).status,200);
    assert.equal((await call('promotions.php','PUT',{campaign:{...campaign,id:promoId,enabled:false}})).status,200);
    assert.equal((await call('promotions.php','DELETE',{id:promoId})).status,200);
    writeFileSync(photoPath,readFileSync(join(root,'public/assets/company/logo-funbike-720-a3ab2dc4.png')));
    assert.equal((await call(`products/motorcycles.php?id=${id}`,'PUT',{images:[{id:'shared-delete',url:photoUrl,position:0,isMain:true}]})).status,200);
    writeFileSync(refs,JSON.stringify({image:'https://funbike.mg'+photoUrl}));
    assert.equal((await call(`products/motorcycles.php?id=${id}`,'DELETE')).status,200); assert.ok(existsSync(photoPath),'un fichier encore référencé est conservé'); rmSync(refs);
    for (const category of ['helmets','riding-gear','spare-parts']) {
      const candidate=JSON.parse(readFileSync(join(root,'storage/data/products',category+'.json'),'utf8')).products[0]; assert.ok(candidate,category);
      const newProduct={...candidate,id:`history-${category}`,name:`Historique ${category}`,brandId:'tvs',modelId:'',status:'DRAFT',images:[]};
      const created=await call(`products/${category}.php`,'POST',newProduct); assert.equal(created.status,201,JSON.stringify(created.value));
      const newId=created.value.data.id; assert.equal((await call(`products/${category}.php?id=${newId}`,'PUT',{name:`Historique ${category} modifié`})).status,200);
      assert.equal((await call(`products/${category}.php?id=${newId}`,'DELETE')).status,200);
    }
    const brandForm=new FormData(); brandForm.set('name','Marque historique'); brandForm.set('logo',new Blob([readFileSync(join(root,'public/assets/company/logo-funbike-720-a3ab2dc4.png'))],{type:'image/png'}),'logo.png');
    const brandResponse=await fetch(base+'brands.php',{method:'POST',headers:{Cookie:ec},body:brandForm}); const brand=await brandResponse.json(); assert.equal(brandResponse.status,201,JSON.stringify(brand));
    const brandPath=join(dir,brand.brand.logo); assert.ok(existsSync(brandPath)); writeFileSync(refs,JSON.stringify({image:brand.brand.logo}));
    assert.equal((await call(`brands.php?id=${brand.brand.id}`,'DELETE')).status,200); assert.ok(existsSync(brandPath),'logo de marque référencé conservé'); rmSync(refs);
    const raw=readFileSync(history,'utf8'); const entries=raw.trim().split('\n').map(JSON.parse);
    for (const type of ['Ajout — Revendeur','Modification — Revendeur','Suppression — Revendeur','Modification — Coordonnées','Modification — Contenu de l’accueil','Ajout — Produit','Publication — Produit','Archivage — Produit','Retrait — photo produit','Ajout — Promotion','Activation — Promotion','Désactivation — Promotion','Suppression — Promotion','Suppression — Produit']) assert.ok(entries.some(e=>e.type===type && e.account==='editor'),type);
    assert.ok(entries.some(e=>e.type==='Publication — Produit' && e.fields.includes('status') && e.fields.includes('name')));
    assert.ok(entries.some(e=>e.type==='Retrait — photo produit' && /fichier était déjà absent/.test(e.result)));
    assert.ok(entries.some(e=>e.type==='Retrait — photo produit' && /encore utilisé ailleurs/.test(e.result)));
    assert.ok(entries.some(e=>e.type==='Suppression physique — photo produit' && /Fichier supprimé : image-2.png/.test(e.result)));
    assert.ok(entries.some(e=>e.type==='Suppression physique — photo produit' && /Fichier conservé : référence présente/.test(e.result)));
    for (const category of ['helmets','riding-gear','spare-parts']) assert.ok(entries.some(e=>e.type==='Ajout — Produit' && e.subject.includes(`history-${category}`)));
    assert.ok(entries.some(e=>e.type==='Suppression physique — logo de marque' && e.result.includes('Fichier conservé')));
    assert.ok(entries.some(e=>e.type==='Modification — Coordonnées' && e.fields.includes('contact.address')));
    assert.equal(raw.includes('Adresse privée test'),false); assert.equal(raw.includes('Titre privé test'),false); assert.equal(raw.includes('texte privé'),false); assert.equal(raw.includes(ep),false);
    const filtered=await call('admin-history.php?q=historique%20modifi%C3%A9e','GET',undefined,cookie); assert.equal(filtered.status,200); assert.ok(filtered.value.entries.some(e=>e.subject.includes(id)));
    assert.equal((await call('dealers.php','POST',{name:'',city:''})).status,400);
    assert.ok(readFileSync(history,'utf8').trim().split('\n').map(JSON.parse).some(e=>e.type==='Échec — opération administration' && e.result.includes('HTTP 400')));
    // Une panne du journal après une modification ne doit pas renvoyer un faux succès.
    const failureScript=join(root,'test-history-failure.php');
    writeFileSync(failureScript, `<?php require __DIR__ . '/api/_lib/admin-history-recorder.php'; $_SERVER['SCRIPT_FILENAME']=__DIR__ . '/api/contacts.php'; funbikeHistoryBegin(['username'=>'editor'], 'PUT'); funbikeHistoryNote('Test', 'Action', 'effectuée'); file_put_contents(funbikeHistoryFile(), '{broken', FILE_APPEND); http_response_code(200); echo '{"ok":true}';`);
    const cleanHistory=readFileSync(history,'utf8');
    const failure=await fetch(base.replace('/api/','/test-history-failure.php')); assert.equal(failure.status,500); assert.match((await failure.json()).error,/a pu être effectuée/);
    writeFileSync(history,cleanHistory);
    writeFileSync(history, readFileSync(history,'utf8') + '{"unfinished":');
    const dataBefore=readFileSync(join(root,'storage/data/contacts.json'),'utf8');
    assert.equal((await call('contacts.php','PUT',{address:'Ne pas écrire'})).status,503);
    assert.equal(readFileSync(join(root,'storage/data/contacts.json'),'utf8'),dataBefore);
    assert.equal((await fetch(base+'admin-history.php',{headers:{Cookie:cookie}})).status,500);
    const original=readFileSync(history,'utf8'); const failed=spawnSync(php,[script],{encoding:'utf8'}); assert.match(failed.stdout + failed.stderr, /Journal incomplet/); assert.equal(readFileSync(history,'utf8'),original);
  } finally { child.kill('SIGTERM'); await new Promise(r=>{if(child.exitCode!==null)r(); else {child.once('exit',r);setTimeout(r,1000);}}); rmSync(dir,{recursive:true,force:true}); }
});
