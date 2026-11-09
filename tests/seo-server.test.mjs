import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';

const wasm = resolve('node_modules/.bin/php-wasm-cli');
const php = process.env.PHP_BINARY || (spawnSync('php', ['-v'], { stdio: 'ignore' }).status === 0 ? 'php' : existsSync(wasm) ? wasm : null);

test('SEO PHP : pages publiques, sitemap dynamique, confidentialité et liens stables', { skip: !php && 'PHP non installé', timeout: 90000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'funbike-seo-'));
  cpSync(resolve('server'), join(dir, 'server'), { recursive: true });
  // Même structure que le build, sans dépendre d'un fichier dist généré.
  writeFileSync(join(dir, 'index.html'), '<!doctype html><html lang="fr"><head><title>Initial</title><meta name="description" content="Initial"></head><body><div id="root"></div></body></html>');
  const router = join(dir, 'router.php');
  writeFileSync(router, `<?php\n$p=parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH);\nif(preg_match('#^/server/(storage|scripts|api/_lib)(/|$)#',$p)){http_response_code(404);exit;}\nif(strpos($p,'/server/')===0)return false;\nrequire __DIR__.'/server/seo.php';\n`);
  const file = join(dir, 'server/storage/data/products/motorcycles.json');
  const brandsFile = join(dir, 'server/storage/data/brands.json');
  const products = JSON.parse(readFileSync(file, 'utf8'));
  const original = products.products.find((p) => p.status === 'PUBLISHED');
  const injected = { ...structuredClone(original), id: 'nouveau-test', name: 'Moto <script>danger</script> & Test', description: 'Description test <img src=x onerror=alert(1)>', status: 'PUBLISHED' };
  // Le catalogue de démonstration ne contient pas forcément les mêmes produits
  // qu'en production ; ces données restent isolées dans le dossier temporaire.
  const apacheFixture = { ...structuredClone(original), id: 'tvs-apache-rtr-200-4v', name: 'TVS Apache RTR 200 4V', status: 'PUBLISHED' };
  products.products.push(apacheFixture, injected, { ...structuredClone(original), id: 'brouillon-secret', name: 'Brouillon secret', status: 'DRAFT' }, { ...structuredClone(original), id: 'marque-masquee', brandId: 'marque-cachee', status: 'PUBLISHED' });
  writeFileSync(file, JSON.stringify(products));
  const brands = JSON.parse(readFileSync(brandsFile, 'utf8')); brands.brands.push({ id: 'marque-cachee', name: 'Cachée', isPublished: false }); writeFileSync(brandsFile, JSON.stringify(brands));
  const listener = createServer(); await new Promise((r) => listener.listen(0, '127.0.0.1', r)); const port = listener.address().port; await new Promise((r) => listener.close(r));
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(php, ['-S', `127.0.0.1:${port}`, '-t', dir, router], { stdio: 'ignore', env: { ...process.env, FUNBIKE_SITE_ORIGIN: origin } });
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + '/robots.txt')).ok) { ready = true; break; } } catch {} await new Promise((r) => setTimeout(r, 100)); }
    assert.ok(ready, 'le serveur PHP doit démarrer');
    const robotsResponse = await fetch(origin + '/robots.txt');
    assert.match(robotsResponse.headers.get('content-type'), /text\/plain/);
    const robots = await robotsResponse.text();
    assert.match(robots, /^User-agent: \*$/m);
    for (const path of ['/server/api/', '/server/storage/', '/server/scripts/', '/server/seo.php']) {
      assert.ok(robots.includes(`Disallow: ${path}\n`), path);
    }
    assert.doesNotMatch(robots, /^Disallow:\s*\/server\/\s*$/m, 'les images publiques ne doivent pas être bloquées');
    assert.doesNotMatch(robots, /^Disallow:\s*\/server\/(uploads|public)(?:\/|$)/m);
    assert.ok(robots.includes(`Sitemap: ${origin}/sitemap.xml`));
    const sitemap = await (await fetch(origin + '/sitemap.xml')).text();
    assert.match(sitemap, /<loc>http:\/\/127\.0\.0\.1:\d+\/motos\/nouveau-test<\/loc>/);
    assert.doesNotMatch(sitemap, /brouillon-secret|marque-masquee|\/admin|\/server/);
    const page = await fetch(origin + '/motos/nouveau-test'); const html = await page.text();
    assert.equal(page.status, 200); assert.match(html, /<h1>Moto danger &amp; Test<\/h1>/);
    assert.match(html, /<div id="seo-fallback"><main>/);
    assert.match(html, /<div id="root"><\/div>/);
    assert.match(html, /<meta property="og:title"/); assert.match(html, /<meta property="og:image"/);
    assert.match(html, /<link rel="canonical" href="http:\/\/127\.0\.0\.1:\d+\/motos\/nouveau-test">/);
    assert.match(html, /application\/ld\+json/); assert.doesNotMatch(html, /<script>danger<\/script>|<img src=x onerror/);
    assert.equal((await fetch(origin + '/motos/brouillon-secret')).status, 404);
    assert.equal((await fetch(origin + '/motos/marque-masquee')).status, 404);
    assert.equal((await fetch(origin + '/motos/inconnu')).status, 404);
    assert.match(await (await fetch(origin + '/motos')).text(), /href="\/motos\/nouveau-test"/);
    assert.match((await fetch(origin + '/admin')).headers.get('x-robots-tag'), /noindex/);
    assert.equal((await fetch(origin + '/server/storage/data/products/motorcycles.json')).status, 404);
    // Renommer, archiver et republier ne change pas l'identifiant ou le lien.
    injected.name = 'Moto renommée'; products.products[products.products.length - 3] = injected; writeFileSync(file, JSON.stringify(products));
    assert.match(await (await fetch(origin + '/motos/nouveau-test')).text(), /Moto renommée/);
    injected.status = 'ARCHIVED'; writeFileSync(file, JSON.stringify(products));
    assert.equal((await fetch(origin + '/motos/nouveau-test')).status, 404);
    assert.doesNotMatch(await (await fetch(origin + '/sitemap.xml')).text(), /nouveau-test/);
    injected.status = 'PUBLISHED'; writeFileSync(file, JSON.stringify(products));
    assert.equal((await fetch(origin + '/motos/nouveau-test')).status, 200);
    const redirects = join(dir, 'server/storage/data/seo-redirects.json');
    for (const id of ['tvs-hlx-plus', 'tvs-apache-rtr-200-4v']) {
      for (const suffix of ['', '/', '/?utm_source=test']) {
        const old = await fetch(`${origin}/catalogue-motos/${id}${suffix}`, { redirect: 'manual' });
        assert.equal(old.status, 301); assert.equal(old.headers.get('location'), `${origin}/motos/${id}`);
        assert.equal((await fetch(old.headers.get('location'))).status, 200);
      }
      assert.doesNotMatch(sitemap, new RegExp(`/catalogue-motos/${id}`));
    }
    assert.equal((await fetch(origin + '/catalogue-motos/apache-rtr-160-4v', { redirect: 'manual' })).status, 404, 'ne pas confondre 160 4V et 160 2V');
    apacheFixture.status = 'ARCHIVED'; writeFileSync(file, JSON.stringify(products));
    assert.equal((await fetch(origin + '/catalogue-motos/tvs-apache-rtr-200-4v', { redirect: 'manual' })).status, 404, 'ne pas rediriger vers une fiche archivée');
    apacheFixture.status = 'PUBLISHED'; writeFileSync(file, JSON.stringify(products));
    writeFileSync(redirects, JSON.stringify({ '/catalogue-motos/ancienne': '/motos/nouveau-test', '/catalogue-motos/externe': 'https://evil.invalid/', '/catalogue-motos/tvs-hlx-plus': null, '/catalogue-motos/tvs-apache-rtr-200-4v': '/motos/nouveau-test' }));
    assert.equal((await fetch(origin + '/catalogue-motos/tvs-hlx-plus', { redirect: 'manual' })).status, 404, 'une configuration existante peut désactiver une redirection par défaut');
    const overridden = await fetch(origin + '/catalogue-motos/tvs-apache-rtr-200-4v', { redirect: 'manual' });
    assert.equal(overridden.status, 301); assert.equal(overridden.headers.get('location'), origin + '/motos/nouveau-test', 'la configuration de l’installation est prioritaire');
    const redirect = await fetch(origin + '/catalogue-motos/ancienne/', { redirect: 'manual' });
    assert.equal(redirect.status, 301); assert.equal(redirect.headers.get('location'), origin + '/motos/nouveau-test');
    assert.equal((await fetch(origin + '/catalogue-motos/externe', { redirect: 'manual' })).status, 404);
  } finally { child.kill(); rmSync(dir, { recursive: true, force: true }); }
});
