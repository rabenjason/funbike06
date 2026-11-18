import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer as netServer } from 'node:net';
import { randomBytes } from 'node:crypto';
const wasm=resolve('node_modules/.bin/php-wasm-cli');
const php=process.env.PHP_BINARY || (spawnSync('php',['-v'],{stdio:'ignore'}).status===0 ? 'php' : existsSync(wasm) ? wasm : null);

test('WhatsApp : droits, confidentialité, validation, sauvegarde et conflit de révision', {skip:!php && 'PHP non installé',timeout:90000}, async()=>{
  const dir=mkdtempSync(join(tmpdir(),'funbike-whatsapp-')); cpSync(resolve('server'),join(dir,'server'),{recursive:true});
  const root=join(dir,'server'),router=join(dir,'router.php');
  writeFileSync(router,`<?php\n$p=parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH);\nif(preg_match('#^/server/(storage|scripts|api/_lib)(/|$)#',$p)){http_response_code(404);exit;}\nreturn false;\n`);
  const initial=`initial-${randomBytes(12).toString('hex')}`, next=`changed-${randomBytes(12).toString('hex')}`;
  const created=spawnSync(php,[join(root,'scripts/create-admin.php'),'admin-test'],{env:{...process.env,FUNBIKE_TEMP_PASSWORD:initial},encoding:'utf8'}); assert.equal(created.status,0,created.stderr);
  const listener=netServer(); await new Promise(r=>listener.listen(0,'127.0.0.1',r)); const port=listener.address().port; await new Promise(r=>listener.close(r));
  const child=spawn(php,['-S',`127.0.0.1:${port}`,'-t',dir,router],{stdio:'ignore'}); const base=`http://127.0.0.1:${port}/server/api/`; let cookie='';
  async function call(path,method='GET',body,auth=true,extra={}) {
    const headers={...extra}; if(auth && cookie) headers.Cookie=cookie; if(body) headers['Content-Type']='application/json';
    const res=await fetch(base+path,{method,headers,body:body?JSON.stringify(body):undefined}); const set=res.headers.get('set-cookie'); if(auth&&set) cookie=set.split(';')[0];
    return {status:res.status,body:await res.json()};
  }
  try {
    let ready=false; for(let i=0;i<100;i++){try{if((await fetch(base+'brands.php')).ok){ready=true;break;}}catch{} await new Promise(r=>setTimeout(r,100));} assert.ok(ready);
    assert.equal((await call('whatsapp-settings.php?admin=1','GET',undefined,false)).status,401);
    assert.equal((await call('whatsapp-settings.php','PUT',{},false)).status,401);
    const empty=await call('whatsapp-settings.php','GET',undefined,false); assert.equal(empty.status,200); assert.equal(empty.body.data.enabled,false); assert.equal(empty.body.data.sales,null); assert.equal(empty.body.data.parts,null);
    assert.equal((await call('auth/login.php','POST',{username:'admin-test',password:initial})).status,200);
    assert.equal((await call('auth/change-password.php','POST',{currentPassword:initial,newPassword:next,newPasswordConfirmation:next})).status,200);
    const start=await call('whatsapp-settings.php?admin=1'); assert.equal(start.status,200); const data=start.body.data;
    data.enabled=true; data.sales={activeId:'john',people:[{id:'john',name:'John',phone:'+261 34 00 111 11'},{id:'sarah',name:'Sarah',phone:'+261 34 00 222 22'}]}; data.parts={activeId:'pierre',people:[{id:'pierre',name:'Pierre',phone:'+261 34 00 333 33'}]};
    assert.equal((await call('whatsapp-settings.php','PUT',{revision:start.body.revision,data},true,{Origin:'https://evil.example'})).status,403);
    const invalid=structuredClone(data); invalid.sales.people[0].phone='0340011111'; assert.equal((await call('whatsapp-settings.php','PUT',{revision:start.body.revision,data:invalid})).status,400);
    invalid.sales.people[0].phone='+261 34 00 111 11'; invalid.texts.priceTemplate='Sans variables'; assert.equal((await call('whatsapp-settings.php','PUT',{revision:start.body.revision,data:invalid})).status,400);
    invalid.texts.priceTemplate=data.texts.priceTemplate; invalid.parts.activeId='absent'; assert.equal((await call('whatsapp-settings.php','PUT',{revision:start.body.revision,data:invalid})).status,400);
    const saved=await call('whatsapp-settings.php','PUT',{revision:start.body.revision,data}); assert.equal(saved.status,200,JSON.stringify(saved.body));
    assert.equal((await call('whatsapp-settings.php','PUT',{revision:start.body.revision,data})).status,409);
    const pub=await call('whatsapp-settings.php','GET',undefined,false); assert.deepEqual(pub.body.data.sales,{phone:'+261 34 00 111 11'}); assert.deepEqual(pub.body.data.parts,{phone:'+261 34 00 333 33'});
    assert.doesNotMatch(JSON.stringify(pub.body),/Sarah|222 22|John|Pierre/);
    data.sales.activeId='sarah'; const update=await call('whatsapp-settings.php','PUT',{revision:saved.body.revision,data}); assert.equal(update.status,200);
    assert.equal((await call('whatsapp-settings.php','GET',undefined,false)).body.data.sales.phone,'+261 34 00 222 22');
    const file=join(root,'storage/private/whatsapp-settings.json'); assert.equal(JSON.parse(readFileSync(file)).parts.activeId,'pierre');
    writeFileSync(file,'{invalide'); const broken=await call('whatsapp-settings.php?admin=1'); assert.equal(broken.status,500); assert.equal(readFileSync(file,'utf8'),'{invalide');
    assert.equal((await fetch(`http://127.0.0.1:${port}/server/storage/private/whatsapp-settings.json`)).status,404);
  } finally {child.kill();rmSync(dir,{recursive:true,force:true});}
});
