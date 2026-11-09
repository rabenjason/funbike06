import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

let server, LOGO, Header, Footer;
const logoUrl = '/server/public/assets/company/logo-funbike-720-a3ab2dc4.png';
before(async () => {
  server = await createServer({ server: { middlewareMode: true }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
  ({ LOGO } = await server.ssrLoadModule('/src/catalog/brands.ts'));
  ({ Header, Footer } = await server.ssrLoadModule('/src/components/Layout.tsx'));
});
after(async () => await server?.close());

test('logo Funbike local pour l’en-tête, le pied de page, le chargement et le favicon', async () => {
  const data = await readFile(`.${logoUrl}`);
  assert.deepEqual([...data.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(LOGO, logoUrl);
  const header = renderToStaticMarkup(React.createElement(Header, { route: { page: 'home' }, go() {}, dark: false, toggle() {} }));
  const footer = renderToStaticMarkup(React.createElement(Footer, { go() {}, onCookies() {} }));
  for (const markup of [header, footer]) assert.ok(markup.includes(`src="${logoUrl}"`));
  const html = await readFile('index.html', 'utf8');
  assert.match(html, new RegExp(`<link rel="icon"[^>]+href="${logoUrl}"`));
  assert.match(html, new RegExp(`<div id="funbike-boot"[\\s\\S]*?<img[^>]+src="${logoUrl}"`));
  assert.ok(!html.includes('wp-content/themes/funbike/images/logo-funbike.png'));
});
