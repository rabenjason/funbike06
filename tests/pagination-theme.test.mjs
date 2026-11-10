import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

let dom, server, Pagination, render, cleanup, fireEvent;
before(async () => {
  const css = readFileSync('src/styles/tvs-theme.css', 'utf8');
  dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'http://localhost/' });
  const style = dom.window.document.createElement('style');
  style.textContent = '.fb-pagination-page { color: rgb(23, 24, 22); }\n' + css;
  dom.window.document.head.append(style);
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.HTMLElement = dom.window.HTMLElement; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  ({ render, cleanup, fireEvent } = await import('@testing-library/react'));
  server = await createServer({ server: { middlewareMode: true }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] }, logLevel: 'silent' });
  ({ default: Pagination } = await server.ssrLoadModule('/src/components/Pagination.tsx'));
});
after(async () => { cleanup(); dom.window.close(); await server.close(); });

test('le numéro actif TVS est blanc en modes jour et nuit sans changer Funbike', () => {
  let clicked = null;
  const view = render(React.createElement(Pagination, { id: 'equipements', page: 1, total: 2, onChange: (n) => { clicked = n; } }));
  const p1 = view.getByRole('button', { name: 'Page 1' });
  const p2 = view.getByRole('button', { name: 'Page 2' });
  assert.equal(p1.getAttribute('aria-current'), 'page');
  assert.equal(p2.hasAttribute('aria-current'), false);
  for (const dark of [false, true]) {
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.dataset.siteTheme = 'funbike';
    assert.equal(window.getComputedStyle(p1).color, 'rgb(23, 24, 22)');
    document.documentElement.dataset.siteTheme = 'tvs';
    assert.equal(window.getComputedStyle(p1).color, 'rgb(255, 255, 255)');
    assert.equal(window.getComputedStyle(p2).color, 'rgb(23, 24, 22)', 'la règle ne concerne pas la page inactive');
  }
  fireEvent.click(p2); assert.equal(clicked, 2);
  view.rerender(React.createElement(Pagination, { id: 'equipements', page: 2, total: 2, onChange: (n) => { clicked = n; } }));
  assert.equal(p2.getAttribute('aria-current'), 'page');
  assert.equal(window.getComputedStyle(p2).color, 'rgb(255, 255, 255)');
  assert.equal(p1.hasAttribute('aria-current'), false);
  assert.equal(window.getComputedStyle(p1).color, 'rgb(23, 24, 22)');
  view.unmount();
});
