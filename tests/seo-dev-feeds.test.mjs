import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer as createNetServer } from 'node:net';
import { createServer as createViteServer } from 'vite';

const wasm = resolve('node_modules/.bin/php-wasm-cli');
const php = process.env.PHP_BINARY || (spawnSync('php', ['-v'], { stdio: 'ignore' }).status === 0 ? 'php' : existsSync(wasm) ? wasm : null);

test('Vite transmet les deux flux SEO au PHP réel sans écraser les données', { skip: !php && 'PHP non installé', timeout: 90000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'funbike-dev-seo-'));
  cpSync(resolve('server'), join(dir, 'server'), { recursive: true });
  const router = join(dir, 'router.php');
  writeFileSync(router, `<?php\n$p=parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH);\nif(preg_match('#^/server/(storage|scripts|api/_lib)(/|$)#',$p)){http_response_code(404);exit;}\nreturn false;\n`);
  const dataPath = join(dir, 'server/storage/data/products/motorcycles.json');
  const initial = readFileSync(dataPath, 'utf8');
  const listener = createNetServer(); await new Promise((r) => listener.listen(0, '127.0.0.1', r)); const port = listener.address().port; await new Promise((r) => listener.close(r));
  const phpOrigin = `http://127.0.0.1:${port}`;
  const child = spawn(php, ['-S', `127.0.0.1:${port}`, '-t', dir, router], { stdio: 'ignore', env: { ...process.env, FUNBIKE_SITE_ORIGIN: 'http://localhost:5173' } });
  const oldTarget = process.env.FUNBIKE_PHP_TARGET;
  process.env.FUNBIKE_PHP_TARGET = phpOrigin;
  let vite;
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) { try { if ((await fetch(phpOrigin + '/server/api/seo-feed.php?feed=robots')).ok) { ready = true; break; } } catch {} await new Promise((r) => setTimeout(r, 100)); }
    assert.ok(ready, 'le serveur PHP doit démarrer');
    vite = await createViteServer({ server: { host: '127.0.0.1', port: 0 }, optimizeDeps: { noDiscovery: true, include: [] }, logLevel: 'silent' });
    await vite.listen();
    const base = `http://127.0.0.1:${vite.httpServer.address().port}`;
    const robotsResponse = await fetch(base + '/robots.txt');
    assert.equal(robotsResponse.status, 200);
    assert.match(robotsResponse.headers.get('content-type'), /text\/plain/);
    const robots = await robotsResponse.text();
    assert.match(robots, /^User-agent: \*$/m);
    assert.match(robots, /^Disallow: \/server\/api\/$/m);
    assert.match(robots, /^Sitemap: http:\/\/localhost:5173\/sitemap\.xml$/m);
    assert.doesNotMatch(robots, /^Disallow:\s*\/server\/\s*$/m);
    const sitemapResponse = await fetch(base + '/sitemap.xml');
    assert.equal(sitemapResponse.status, 200);
    assert.match(sitemapResponse.headers.get('content-type'), /application\/xml/);
    const sitemap = await sitemapResponse.text();
    assert.match(sitemap, /<loc>http:\/\/localhost:5173\/motos\/tvs-hlx-plus<\/loc>/);
    assert.doesNotMatch(sitemap, /\/server\/|\/admin/);
    assert.equal((await fetch(base + '/robots.txt?test=1')).status, 200);
    assert.equal((await fetch(phpOrigin + '/server/api/seo-feed.php?feed=admin')).status, 404);
    assert.equal((await fetch(phpOrigin + '/server/api/seo-feed.php?feed=robots', { method: 'POST' })).status, 405);
    assert.equal((await fetch(base + '/server/storage/data/products/motorcycles.json')).status, 404);
    assert.equal(readFileSync(dataPath, 'utf8'), initial);
    // Actualisation immédiate : aucun build ni modification des fichiers réels.
    const edited = JSON.parse(initial);
    edited.products.push({ ...edited.products.find((p) => p.status === 'PUBLISHED'), id: 'nouveau-test-seo', name: 'Moto test SEO' });
    writeFileSync(dataPath, JSON.stringify(edited));
    assert.match(await (await fetch(base + '/sitemap.xml')).text(), /\/motos\/nouveau-test-seo/);
  } finally {
    if (oldTarget === undefined) delete process.env.FUNBIKE_PHP_TARGET; else process.env.FUNBIKE_PHP_TARGET = oldTarget;
    await vite?.close(); child.kill(); rmSync(dir, { recursive: true, force: true });
  }
});
