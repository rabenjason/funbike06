import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

let server;
after(async () => { await server?.close(); });

test('attente de page : espace réservé, indicateur accessible et mouvement facultatif', async () => {
  server = await createServer({ server: { middlewareMode: true }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] }, logLevel: 'silent' });
  const { PageLoading } = await server.ssrLoadModule('/src/components/Loaders.tsx');
  const document = new JSDOM(renderToStaticMarkup(React.createElement(PageLoading))).window.document;
  const status = document.querySelector('[role="status"]');
  assert.equal(status.textContent, 'Chargement de la page…');
  assert.ok(status.classList.contains('min-h-[100svh]'));
  assert.ok(status.classList.contains('place-items-center'));
  assert.ok(status.querySelector('.sr-only'));
  const spinner = status.querySelector('svg[aria-hidden="true"]');
  assert.ok(spinner.classList.contains('motion-safe:animate-spin'));
  assert.equal(spinner.querySelectorAll('line').length, 12);
});
