import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { JSDOM } from 'jsdom';
let server, dom, theme, originalStorage;
before(async () => {
  dom = new JSDOM('', { url: 'http://localhost/' });
  originalStorage = globalThis.localStorage; globalThis.localStorage = dom.window.localStorage;
  server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  theme = await server.ssrLoadModule('/src/lib/theme.ts');
});
after(async () => { globalThis.localStorage = originalStorage; dom.window.close(); await server.close(); });

test('mode initial : défaut serveur, choix explicite prioritaire et stockage indisponible', () => {
  localStorage.clear();
  assert.equal(theme.readDarkPreference('dark'), true);
  assert.equal(theme.readDarkPreference('light'), false);
  assert.equal(localStorage.getItem('fb-theme-v2'), null, 'lecture sans écriture');
  theme.persistTheme(true); assert.equal(theme.readDarkPreference('light'), true);
  theme.persistTheme(false); assert.equal(theme.readDarkPreference('dark'), false);
  localStorage.setItem('fb-theme-v2', 'invalid'); assert.equal(theme.readDarkPreference('light'), false);
  globalThis.localStorage = { getItem() { throw new Error('bloqué'); }, setItem() { throw new Error('bloqué'); } };
  assert.equal(theme.readDarkPreference('light'), false); assert.equal(theme.readDarkPreference('dark'), true);
  assert.doesNotThrow(() => theme.persistTheme(true)); globalThis.localStorage = dom.window.localStorage;
});
