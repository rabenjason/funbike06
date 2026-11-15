import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
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
    writeFileSync(history, readFileSync(history,'utf8') + '{"unfinished":');
    assert.equal((await fetch(base+'admin-history.php',{headers:{Cookie:cookie}})).status,500);
    const original=readFileSync(history,'utf8'); const failed=spawnSync(php,[script],{encoding:'utf8'}); assert.match(failed.stdout + failed.stderr, /Journal incomplet/); assert.equal(readFileSync(history,'utf8'),original);
  } finally { child.kill('SIGTERM'); await new Promise(r=>{if(child.exitCode!==null)r(); else {child.once('exit',r);setTimeout(r,1000);}}); rmSync(dir,{recursive:true,force:true}); }
});
