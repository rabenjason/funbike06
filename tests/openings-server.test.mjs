import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer as netServer } from 'node:net';
import { randomBytes } from 'node:crypto';

const wasm = resolve('node_modules/.bin/php-wasm-cli');
const php = process.env.PHP_BINARY || (spawnSync('php', ['-v'], { stdio: 'ignore' }).status === 0 ? 'php' : existsSync(wasm) ? wasm : null);

test('ouvertures : désactivation, IP distinctes, accès privé et protection contre les abus', { skip: !php && 'PHP non installé', timeout: 90000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'funbike-openings-'));
  cpSync(resolve('server'), join(dir, 'server'), { recursive: true });
  const root = join(dir, 'server');
  const router = join(dir, 'router.php');
  writeFileSync(router, `<?php\n$p=parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH);\nif (isset($_SERVER['HTTP_X_TEST_CLIENT'])) { $_SERVER['REMOTE_ADDR'] = $_SERVER['HTTP_X_TEST_CLIENT']; }\nif(preg_match('#^/server/(storage|scripts|api/_lib)(/|$)#',$p)){http_response_code(404);exit;}\nreturn false;\n`);
  const password = `initial-${randomBytes(12).toString('hex')}`; const changed = `changed-${randomBytes(12).toString('hex')}`;
  const created = spawnSync(php, [join(root, 'scripts/create-admin.php'), 'test-admin'], { env: { ...process.env, FUNBIKE_TEMP_PASSWORD: password }, encoding: 'utf8' });
  assert.equal(created.status, 0, created.stderr);
  const statsFile = join(root, 'storage/private/site-ip-audience.json');
  let child;
  async function stop() { if (!child) return; child.kill('SIGTERM'); await new Promise((r) => { if (child.exitCode !== null) r(); else { child.once('exit', r); setTimeout(r, 1000); } }); child = null; }
  async function start(enabled) {
    const listener = netServer(); await new Promise((r) => listener.listen(0, '127.0.0.1', r)); const port = listener.address().port; await new Promise((r) => listener.close(r));
    const env = { ...process.env }; delete env.FUNBIKE_OPENINGS_ENABLED; if (enabled !== null) env.FUNBIKE_OPENINGS_ENABLED = enabled;
    child = spawn(php, ['-S', `127.0.0.1:${port}`, '-t', dir, router], { stdio: 'ignore', env });
    const base = `http://127.0.0.1:${port}/server/api/`;
    for (let n = 0; n < 100; n++) { try { if ((await fetch(base + 'brands.php')).ok) return base; } catch {} await new Promise((r) => setTimeout(r, 100)); }
    throw new Error('Serveur PHP indisponible');
  }
  async function login(base, pass) {
    const res = await fetch(base + 'auth/login.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'test-admin', password: pass }) });
    assert.equal(res.status, 200); return res.headers.get('set-cookie').split(';')[0];
  }
  try {
    let base = await start('0');
    assert.equal((await fetch(base + 'openings.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({kind:'opening'}) })).status, 204);
    assert.equal(existsSync(statsFile), false, 'aucun fichier de comptage si désactivé');
    assert.equal((await fetch(base + 'openings.php')).status, 401);
    let cookie = await login(base, password);
    const change = await fetch(base + 'auth/change-password.php', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword: password, newPassword: changed, newPasswordConfirmation: changed }) });
    assert.equal(change.status, 200);
    cookie = change.headers.get('set-cookie').split(';')[0];
    const inactive = await fetch(base + 'openings.php', { headers: { Cookie: cookie } });
    assert.equal(inactive.status, 200); assert.equal((await inactive.json()).enabled, false); assert.equal(existsSync(statsFile), false);
    await stop();
    base = await start(null);
    assert.equal((await fetch(base + 'openings.php')).status, 401);
    const badOrigin = await fetch(base + 'openings.php', { method: 'POST', headers: { Origin: 'https://malicious.invalid' } });
    assert.equal(badOrigin.status, 403); assert.equal(existsSync(statsFile), false);
    cookie = await login(base, changed);
    assert.equal((await fetch(base + 'openings.php', { method: 'PUT', headers: { Cookie: cookie } })).status, 405);
    const before = await (await fetch(base + 'openings.php', { headers: { Cookie: cookie } })).json();
    assert.equal(before.enabled, true); assert.deepEqual(before.months, []);
    for (let n = 0; n < 10; n++) assert.equal((await fetch(base + 'openings.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({kind:'opening'}) })).status, 204);
    let data = await (await fetch(base + 'openings.php', { headers: { Cookie: cookie } })).json();
    assert.deepEqual(data.months, [{ month: data.currentMonth, count: 10, visitors: 1, browsers: null }]);
    const stored = JSON.parse(readFileSync(statsFile, 'utf8'));
    assert.deepEqual(Object.keys(stored).sort(), ['limit', 'months']); assert.equal(stored.months[data.currentMonth].count, 10);
    assert.equal(readFileSync(statsFile, 'utf8').includes('127.0.0.1'), false);
    assert.equal((await fetch(base.replace('/api/', '/storage/private/site-ip-audience.json'))).status, 404);
    // Même IP, deux identifiants de navigateurs et plusieurs ouvertures.
    const phone = 'a'.repeat(64), computer = 'b'.repeat(64);
    for (const browserId of [phone, phone, computer]) {
      const r = await fetch(base + 'openings.php', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({kind:'opening', browserId})});
      assert.equal(r.status, 204);
    }
    data = await (await fetch(base + 'openings.php', {headers:{Cookie:cookie}})).json();
    assert.equal(data.months[0].count, 13); assert.equal(data.months[0].visitors, 1);
    assert.equal(data.months[0].browsers, 2); assert.equal(data.years[0].browsers, 2);
    const rawStats = readFileSync(statsFile, 'utf8');
    assert.equal(rawStats.includes(phone), false); assert.equal(rawStats.includes(computer), false);
    assert.equal((await fetch(base + 'openings.php', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({kind:'opening', browserId:'not-valid'})})).status, 400);
    // Le routeur de test uniquement simule une seconde adresse distante ; le code de production n'utilise pas cet en-tête.
    for (let n = 0; n < 3; n++) {
      const response = await fetch(base + 'openings.php', {method:'POST', headers:{'Content-Type':'application/json', 'X-Test-Client':'203.0.113.2'}, body:JSON.stringify({kind:'opening'})});
      assert.equal(response.status, 204);
    }
    data = await (await fetch(base + 'openings.php', { headers: { Cookie: cookie } })).json();
    assert.deepEqual(data.months, [{month:data.currentMonth, count:16, visitors:2, browsers:2}]);
    assert.equal(data.years[0].visitors, 2);
    const results = await Promise.all(Array.from({ length: 12 }, () => fetch(base + 'openings.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({kind:'opening'}) })));
    assert.ok(results.every(response => response.status === 204));
    data = await (await fetch(base + 'openings.php', { headers: { Cookie: cookie } })).json();
    assert.equal(data.months[0].count, 28, 'aucune ouverture perdue lors des requêtes rapprochées');
    const idA = 'a'.repeat(64);
    const prior = readFileSync(statsFile, 'utf8');
    const event = await fetch(base + 'openings.php', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({kind:'visitor', id:idA})});
    assert.equal(event.status, 204); assert.equal(readFileSync(statsFile, 'utf8'), prior);
    const opening = await fetch(base + 'openings.php', {method:'POST', headers:{'Content-Type':'application/json', 'X-Forwarded-For':'203.0.113.91'}, body:JSON.stringify({kind:'opening', id:idA})});
    assert.equal(opening.status, 204);
    data = await (await fetch(base + 'openings.php', { headers: { Cookie: cookie } })).json();
    assert.equal(data.months[0].count, 29); assert.equal(data.months[0].visitors, 2, 'les en-têtes client ne changent pas l’IP');
    assert.equal(readFileSync(statsFile, 'utf8').includes(idA), false);
    assert.equal(readFileSync(statsFile, 'utf8').includes('127.0.0.1'), false);
    assert.equal((await fetch(base + 'openings.php', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({kind:'visitor', id:'bad'})})).status, 400);
    const historical = JSON.parse(readFileSync(statsFile, 'utf8'));
    const year = data.currentMonth.slice(0,4);
    const previous = `${year}-01`;
    if (previous < data.currentMonth) {
      historical.months[previous] = {count:4, visitors:[historical.months[data.currentMonth].visitors[0], 'c'.repeat(64)], browsers:[historical.months[data.currentMonth].browsers[0], 'd'.repeat(64)]};
      writeFileSync(statsFile, JSON.stringify(historical));
      const annual = await (await fetch(base + 'openings.php', { headers: { Cookie: cookie } })).json();
      assert.equal(annual.years.find(y => y.year === year).visitors, 3, 'une même empreinte est dédupliquée entre les mois');
      assert.equal(annual.years.find(y => y.year === year).browsers, 3, 'les navigateurs annuels sont dédupliqués entre les mois');
    }
    const keyFile = join(root, 'storage/private/site-ip-audience-key.json');
    const savedKey = readFileSync(keyFile, 'utf8');
    assert.equal((await fetch(base.replace('/api/', '/storage/private/site-ip-audience-key.json'))).status, 404);
    writeFileSync(keyFile, '{invalid');
    assert.equal((await fetch(base + 'openings.php', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({kind:'opening'})})).status, 503);
    writeFileSync(keyFile, savedKey);
    rmSync(keyFile);
    const beforeMissing = readFileSync(statsFile, 'utf8');
    assert.equal((await fetch(base + 'openings.php', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({kind:'opening'})})).status, 503);
    assert.equal(readFileSync(statsFile, 'utf8'), beforeMissing);
    writeFileSync(keyFile, savedKey);
    const extended = JSON.parse(readFileSync(statsFile, 'utf8'));
    extended.months['1990-01'] = {count:99, visitors:[]}; writeFileSync(statsFile, JSON.stringify(extended));
    await fetch(base + 'openings.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({kind:'opening'}) });
    const pruned = JSON.parse(readFileSync(statsFile, 'utf8'));
    assert.equal(pruned.months['1990-01'], undefined);
    if (Math.floor(Date.now() / 1000) % 60 < 58) {
      const current = pruned.months[data.currentMonth].count; pruned.limit = { minute: Math.floor(Date.now() / 60000), count: 120 };
      writeFileSync(statsFile, JSON.stringify(pruned));
      assert.equal((await fetch(base + 'openings.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({kind:'opening'}) })).status, 204);
      assert.equal(JSON.parse(readFileSync(statsFile, 'utf8')).months[data.currentMonth].count, current, 'limitation globale à 120 par minute');
    }
    const future = JSON.parse(readFileSync(statsFile, 'utf8'));
    future.months['9999-12'] = {count:42, visitors:[]}; writeFileSync(statsFile, JSON.stringify(future));
    assert.equal((await fetch(base + 'openings.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({kind:'opening'}) })).status, 503);
    assert.equal(JSON.parse(readFileSync(statsFile, 'utf8')).months['9999-12'].count, 42, 'ne pas effacer des données futures si l’horloge est incohérente');
    writeFileSync(statsFile, '{invalid');
    assert.equal((await fetch(base + 'openings.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({kind:'opening'}) })).status, 503);
    assert.equal((await fetch(base + 'openings.php', { headers: { Cookie: cookie } })).status, 503);
    assert.equal(readFileSync(statsFile, 'utf8'), '{invalid', 'ne pas écraser des données endommagées');
  } finally { await stop(); rmSync(dir, { recursive: true, force: true }); }
});
