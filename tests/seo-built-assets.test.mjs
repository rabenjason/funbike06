import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';

const wasm = resolve('node_modules/.bin/php-wasm-cli');
const php = process.env.PHP_BINARY || (spawnSync('php', ['-v'], { stdio: 'ignore' }).status === 0 ? 'php' : existsSync(wasm) ? wasm : null);

test('build versionné : assets séparés et SEO PHP sans JavaScript', { timeout: 90000 }, async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'funbike-build-seo-'));
  let child;
  try {
    const built = spawnSync(process.execPath, [resolve('node_modules/vite/bin/vite.js'), 'build', '--manifest', '--outDir', dir, '--emptyOutDir'], { encoding: 'utf8', timeout: 60000 });
    assert.equal(built.status, 0, built.stderr || built.stdout);
    const html = readFileSync(join(dir, 'index.html'), 'utf8');
    const js = html.match(/<script type="module"[^>]*src="(\/assets\/[^\"]+\.js)"/);
    const css = html.match(/<link rel="stylesheet"[^>]*href="(\/assets\/[^\"]+\.css)"/);
    assert.ok(js && css, 'l’HTML référence les fichiers versionnés');
    assert.ok(existsSync(join(dir, js[1])) && existsSync(join(dir, css[1])));
    assert.ok(html.includes('<div id="root"></div>'));
    assert.ok(html.includes('Mise en route'));
    assert.doesNotMatch(html, /src="\/assets\/Admin-[^"]+"/, 'le code admin ne se charge pas dans le HTML public');
    // La première visite de l’accueil ne télécharge plus les autres pages.
    const manifest = JSON.parse(readFileSync(join(dir, '.vite/manifest.json'), 'utf8'));
    const initial = new Set();
    function collect(key) {
      if (initial.has(key)) return;
      assert.ok(manifest[key], `Entrée manquante : ${key}`);
      initial.add(key);
      for (const dependency of manifest[key].imports ?? []) collect(dependency);
    }
    for (const key of ['index.html', 'src/App.tsx', 'src/pages/Home.tsx', 'src/content/homepage.ts']) collect(key);
    for (const page of ['Catalog', 'Product', 'AccessoryDetail', 'Promotions', 'Contact', 'Dealers', 'Admin']) {
      assert.ok(manifest[`src/pages/${page}.tsx`], `page ${page} séparée`);
      assert.equal(initial.has(`src/pages/${page}.tsx`), false, `page ${page} non chargée à l’accueil`);
    }

    if (!php) { t.diagnostic('Vérification PHP ignorée : PHP indisponible.'); return; }
    cpSync(resolve('server'), join(dir, 'server'), { recursive: true });
    const router = join(dir, 'router.php');
    writeFileSync(router, `<?php\n$p=parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH);\nif(preg_match('#^/server/(storage|scripts|api/_lib)(/|$)#',$p)){http_response_code(404);exit;}\nif(strpos($p,'/server/')===0 || strpos($p,'/assets/')===0)return false;\nrequire __DIR__.'/server/seo.php';\n`);
    const listener = createServer(); await new Promise((r) => listener.listen(0, '127.0.0.1', r));
    const port = listener.address().port; await new Promise((r) => listener.close(r));
    const origin = `http://127.0.0.1:${port}`;
    child = spawn(php, ['-S', `127.0.0.1:${port}`, '-t', dir, router], { stdio: 'ignore', env: { ...process.env, FUNBIKE_SITE_ORIGIN: origin } });
    let ready = false;
    for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + '/robots.txt')).ok) { ready = true; break; } } catch {} await new Promise((r) => setTimeout(r, 100)); }
    assert.ok(ready, 'le serveur PHP isolé doit démarrer');
    const page = await fetch(origin + '/motos/tvs-hlx-plus'); const seo = await page.text();
    assert.equal(page.status, 200);
    assert.match(seo, /<title>TVS HLX Plus/); assert.match(seo, /<div id="seo-fallback"><main>/);
    assert.match(seo, /<link rel="canonical"/); assert.match(seo, /application\/ld\+json/);
    assert.ok(seo.includes(js[1]) && seo.includes(css[1]), 'les assets restent liés dans la réponse SEO');
    for (const asset of [js[1], css[1]]) assert.equal((await fetch(origin + asset)).status, 200, asset);
    assert.equal((await fetch(origin + '/server/storage/data/products/motorcycles.json')).status, 404);
    assert.equal((await fetch(origin + '/motos/modele-inconnu')).status, 404);
  } finally {
    child?.kill(); rmSync(dir, { recursive: true, force: true });
  }
});
