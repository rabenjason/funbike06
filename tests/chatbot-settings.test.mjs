import { after, afterEach, before, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import defaults from '../src/content/homepage-defaults.json' with { type: 'json' };
let dom, server, HomepageManager, homepage, render, fireEvent, waitFor, cleanup, originalFetch;
let enabled, revision, requests, fail, saveCallback;
const ok = body => ({ ok: true, json: async () => structuredClone(body) });
before(async () => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/admin' });
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.HTMLElement = dom.window.HTMLElement; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  ({ render, fireEvent, waitFor, cleanup } = await import('@testing-library/react'));
  server = await createServer({ server: { middlewareMode: true }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] }, logLevel: 'silent' });
  ({ HomepageManager } = await server.ssrLoadModule('/src/pages/AdminCatalog.tsx'));
  homepage = await server.ssrLoadModule('/src/content/homepage.ts'); originalFetch = globalThis.fetch;
});
afterEach(() => { cleanup(); globalThis.fetch = originalFetch; });
after(async () => { dom.window.close(); await server.close(); });
function setup() {
  enabled = true; revision = 'r1'; requests = []; fail = false; saveCallback = [];
  globalThis.fetch = async (url, options = {}) => {
    const path = String(url); const method = options.method ?? 'GET'; requests.push({ path, method, body: options.body && JSON.parse(options.body) });
    if (path.endsWith('/homepage-content.php')) return ok({ data: defaults, chatbotEnabled: enabled });
    if (path.endsWith('/chatbot-settings.php')) {
      if (fail) return { ok: false, json: async () => ({ error: 'Le réglage a changé. Rechargez.' }) };
      if (method === 'PUT') { const body = JSON.parse(options.body); if (body.revision !== revision) return { ok: false, json: async () => ({ error: 'Le réglage a changé. Rechargez.' }) }; enabled = body.enabled; revision = 'r2'; }
      return ok({ data: { enabled }, revision });
    }
    throw new Error(path);
  };
}
const catalog = { brands: [], categories: [], families: [], types: [], models: [], products: [] };
function open() { return render(React.createElement(HomepageManager, { catalog, onToggle: async () => {}, onSavingChange: value => saveCallback.push(value) })); }
test('onglet accueil : activation, désactivation, conservation et erreur de conflit', async () => {
  setup(); const view = open();
  fireEvent.click(view.getByRole('button', { name: 'Chatbot' }));
  await waitFor(() => view.getByRole('button', { name: 'Désactiver le chatbot' }));
  assert.match(view.getByText(/État actuel/).textContent, /Activé/);
  fireEvent.click(view.getByRole('button', { name: 'Désactiver le chatbot' }));
  await waitFor(() => view.getByRole('button', { name: 'Activer le chatbot' }));
  assert.equal(enabled, false); assert.deepEqual(saveCallback, [true, false]);
  assert.match(view.getByRole('status').textContent, /actualisées/);
  assert.deepEqual(requests.find(r => r.method === 'PUT').body, { enabled: false, revision: 'r1' });
  view.unmount(); const again = open(); fireEvent.click(again.getByRole('button', { name: 'Chatbot' }));
  await waitFor(() => again.getByRole('button', { name: 'Activer le chatbot' }));
  fail = true; fireEvent.click(again.getByRole('button', { name: 'Activer le chatbot' }));
  await waitFor(() => assert.match(again.getByRole('alert').textContent, /changé/));
  assert.equal(enabled, false); fail = false;
  fireEvent.click(again.getByRole('button', { name: 'Recharger le réglage' }));
  await waitFor(() => again.getByRole('button', { name: 'Activer le chatbot' }));
  fireEvent.click(again.getByRole('button', { name: 'Activer le chatbot' }));
  await waitFor(() => again.getByRole('button', { name: 'Désactiver le chatbot' })); assert.equal(enabled, true);
});
test('chargement public : état, compatibilité ancien serveur et validation', async () => {
  setup(); await homepage.loadHomepageData(); assert.equal(homepage.chatbotEnabled, true);
  enabled = false; await homepage.loadHomepageData(); assert.equal(homepage.chatbotEnabled, false);
  globalThis.fetch = async () => ok({ data: defaults }); await homepage.loadHomepageData(); assert.equal(homepage.chatbotEnabled, true);
  globalThis.fetch = async () => ok({ data: defaults, chatbotEnabled: 'false' }); await assert.rejects(homepage.loadHomepageData(), /chatbot/); assert.equal(homepage.chatbotEnabled, true);
});
