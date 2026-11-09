import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';

const wasm = resolve('node_modules/.bin/php-wasm-cli');
const php = process.env.PHP_BINARY || (spawnSync('php', ['-v'], { stdio: 'ignore' }).status === 0 ? 'php' : existsSync(wasm) ? wasm : null);

test('Apache : les anciennes sections confirmées sont routées sans règle générale', () => {
  const htaccess = readFileSync('public/.htaccess', 'utf8');
  const rule = htaccess.split('\n').find((line) => line.startsWith('RewriteRule ^(?:catalogue-motos/?|catalogue-motos/page/2/?|catalogue-equipements/?)$'));
  assert.ok(rule, 'règle ciblée présente dans le modèle Apache');
  const [directive, pattern, destination, flags] = rule.split(/\s+/);
  assert.equal(directive, 'RewriteRule'); assert.equal(destination, 'server/seo.php'); assert.match(flags, /L/);
  const matcher = new RegExp(pattern, 'i');
  for (const path of ['catalogue-motos', 'catalogue-motos/', 'catalogue-motos/page/2', 'catalogue-motos/page/2/', 'catalogue-equipements', 'catalogue-equipements/']) assert.ok(matcher.test(path), path);
  for (const path of ['catalogue-motos/page/3/', 'catalogue-motos/xx125-2026/', 'server/api/test.php', 'vide']) assert.equal(matcher.test(path), false, path);
  assert.ok(htaccess.indexOf('RewriteRule ^server(?:/|$) - [L]') < htaccess.indexOf(rule), 'les URL serveur restent exclues');
});

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
    for (const [oldPath, target] of [
      ['/catalogue-motos', '/motos'],
      ['/catalogue-motos/page/2', '/motos'],
      ['/catalogue-equipements', '/equipements'],
      ['/catalogue-motos/xx125-2026', '/motos/xx-125-2026'],
    ]) {
      for (const suffix of ['', '/', '/?source=test']) {
        const response = await fetch(origin + oldPath + suffix, { redirect: 'manual' });
        assert.equal(response.status, 301, oldPath + suffix);
        assert.equal(response.headers.get('location'), origin + target);
        assert.equal((await fetch(response.headers.get('location'))).status, 200);
      }
      assert.ok(!sitemap.includes(origin + oldPath), 'le sitemap utilise les nouvelles adresses');
    }
    assert.equal((await fetch(origin + '/catalogue/')).status, 200, 'le catalogue existant reste disponible');
    for (const unknown of ['/catalogue-motos/page/3', '/catalogue-motos/hlx-125', '/catalogue-motos/tvs-hlx-150', '/catalogue-motos/tvs-raider', '/catalogue-motos/sherco-sef-300-2026']) {
      assert.equal((await fetch(origin + unknown, { redirect: 'manual' })).status, 404, 'aucune correspondance non confirmée : ' + unknown);
    }
    const xx = products.products.find((p) => p.id === 'xx-125-2026');
    const xxStatus = xx.status; xx.status = 'ARCHIVED'; writeFileSync(file, JSON.stringify(products));
    assert.equal((await fetch(origin + '/catalogue-motos/xx125-2026/', { redirect: 'manual' })).status, 404, 'ne pas rediriger vers un produit archivé');
    xx.status = xxStatus; writeFileSync(file, JSON.stringify(products));
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
    const savedRedirects = JSON.stringify({ '/catalogue-motos/ancienne': '/motos/nouveau-test', '/catalogue-motos/externe': 'https://evil.invalid/', '/catalogue-motos/tvs-hlx-plus': null, '/catalogue-motos/xx125-2026': null, '/catalogue-motos/tvs-apache-rtr-200-4v': '/motos/nouveau-test' });
    writeFileSync(redirects, savedRedirects);
    assert.equal((await fetch(origin + '/catalogue-motos/xx125-2026', { redirect: 'manual' })).status, 404, 'le fichier privé reste prioritaire pour la nouvelle redirection');
    assert.equal(readFileSync(redirects, 'utf8'), savedRedirects, 'aucune écriture dans le fichier privé');
    assert.equal((await fetch(origin + '/catalogue-motos/tvs-hlx-plus', { redirect: 'manual' })).status, 404, 'une configuration existante peut désactiver une redirection par défaut');
    const overridden = await fetch(origin + '/catalogue-motos/tvs-apache-rtr-200-4v', { redirect: 'manual' });
    assert.equal(overridden.status, 301); assert.equal(overridden.headers.get('location'), origin + '/motos/nouveau-test', 'la configuration de l’installation est prioritaire');
    const redirect = await fetch(origin + '/catalogue-motos/ancienne/', { redirect: 'manual' });
    assert.equal(redirect.status, 301); assert.equal(redirect.headers.get('location'), origin + '/motos/nouveau-test');
    assert.equal((await fetch(origin + '/catalogue-motos/externe', { redirect: 'manual' })).status, 404);
  } finally { child.kill(); rmSync(dir, { recursive: true, force: true }); }
});
