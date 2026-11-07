import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createViteServer } from 'vite';

test('les valeurs initiales front et serveur restent identiques', async () => {
  const client = JSON.parse(await readFile('src/content/homepage-defaults.json', 'utf8'));
  const server = JSON.parse(await readFile('server/api/_lib/homepage-defaults.json', 'utf8'));
  assert.deepEqual(client, server);
});

test('Vite sert les valeurs initiales comme module et ne les transmet pas au proxy PHP', async () => {
  let proxied = 0;
  const php = createHttpServer((_req, res) => {
    proxied++;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{}');
  });
  await new Promise((resolve) => php.listen(0, '127.0.0.1', resolve));
  let vite;
  try {
    vite = await createViteServer({
      server: { host: '127.0.0.1', port: 0, proxy: { '/server': { target: `http://127.0.0.1:${php.address().port}`, changeOrigin: false } } },
      optimizeDeps: { noDiscovery: true, include: [] },
      logLevel: 'silent',
    });
    await vite.listen();
    const base = `http://127.0.0.1:${vite.httpServer.address().port}`;
    const homepage = await fetch(`${base}/src/content/homepage.ts`);
    assert.equal(homepage.status, 200);
    const source = await homepage.text();
    const importPath = source.match(/import defaults from "([^"]+)"/)?.[1];
    assert.ok(importPath, 'import des valeurs initiales introuvable');
    assert.ok(!importPath.startsWith('/server/'), 'le proxy PHP intercepterait cet import');
    const defaults = await fetch(new URL(importPath, base));
    assert.equal(defaults.status, 200);
    assert.match(defaults.headers.get('content-type'), /javascript/);
    assert.match(await defaults.text(), /export default/);
    assert.equal(proxied, 0);
  } finally {
    await vite?.close();
    await new Promise((resolve, reject) => php.close((error) => error ? reject(error) : resolve()));
  }
});
