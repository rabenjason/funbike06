import { after, afterEach, before, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import defaults from '../src/content/homepage-defaults.json' with { type: 'json' };
let dom, server, HomepageManager, homepage, render, fireEvent, waitFor, cleanup, originalFetch;
let enabled, name, logo, revision, requests, fail, saveCallback;
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
  enabled = true; name = 'Piston'; logo = null; revision = 'r1'; requests = []; fail = false; saveCallback = [];
  globalThis.fetch = async (url, options = {}) => {
    const path = String(url); const method = options.method ?? 'GET'; const body = options.body instanceof FormData ? Object.fromEntries(options.body) : options.body && JSON.parse(options.body); requests.push({ path, method, body });
    if (path.endsWith('/homepage-content.php')) return ok({ data: defaults, chatbotEnabled: enabled, chatbotName: name, chatbotLogo: logo });
    if (path.endsWith('/chatbot-settings.php')) {
      if (fail) return { ok: false, json: async () => ({ error: 'Le réglage a changé. Rechargez.' }) };
      if (method === 'PUT' || method === 'POST') { if (body.revision !== revision) return { ok: false, json: async () => ({ error: 'Le réglage a changé. Rechargez.' }) }; if ('enabled' in body) enabled = body.enabled; if ('name' in body) name = body.name; if (body.resetLogo) logo = null; if (method === 'POST') logo = '/server/uploads/chatbot/logo-' + 'a'.repeat(32) + '.png'; revision = 'r' + (Number(revision.slice(1)) + 1); }
      return ok({ data: { enabled, name, logo }, revision });
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

test('nom et logo : enregistrement indépendant, retour au logo et conservation du brouillon après conflit', async () => {
  setup(); const dirty = []; const view = render(React.createElement(HomepageManager, { catalog, onToggle: async () => {}, onDirtyChange: value => dirty.push(value) }));
  fireEvent.click(view.getByRole('button', { name: 'Chatbot' }));
  await waitFor(() => view.getByLabelText('Nom du chatbot'));
  assert.ok(view.getByRole('img', { name: 'Logo par défaut : le chat Funbike' }).querySelector('svg'));
  assert.ok(view.getByText(/Vous pouvez le garder ou choisir une autre image/));
  assert.equal(view.queryByRole('button', { name: 'Rétablir le logo d’origine' }), null);
  const field = view.getByLabelText('Nom du chatbot'); assert.equal(field.value, 'Piston');
  fireEvent.change(field, { target: { value: 'Tiana' } }); assert.equal(dirty.at(-1), true);
  fail = true; fireEvent.click(view.getByRole('button', { name: 'Enregistrer le nom' }));
  await waitFor(() => view.getByRole('alert')); assert.equal(name, 'Piston'); assert.equal(field.value, 'Tiana');
  fail = false; fireEvent.click(view.getByRole('button', { name: 'Recharger le réglage' }));
  await waitFor(() => assert.equal(view.getByLabelText('Nom du chatbot').value, 'Tiana'));
  fireEvent.click(view.getByRole('button', { name: 'Enregistrer le nom' }));
  await waitFor(() => assert.equal(name, 'Tiana')); assert.equal(dirty.at(-1), false);
  const file = new File([new Uint8Array([137, 80, 78, 71])], 'logo.png', { type: 'image/png' });
  fireEvent.change(view.getByLabelText('Choisir une image'), { target: { files: [file] } });
  await waitFor(() => view.getByAltText('Logo actuel du chatbot'));
  assert.equal(logo, '/server/uploads/chatbot/logo-' + 'a'.repeat(32) + '.png');
  assert.equal(name, 'Tiana'); assert.equal(enabled, true);
  fireEvent.click(view.getByRole('button', { name: 'Rétablir le logo d’origine' }));
  await waitFor(() => view.getByRole('img', { name: 'Logo par défaut : le chat Funbike' })); assert.equal(logo, null); assert.equal(name, 'Tiana');
  fireEvent.click(view.getByRole('button', { name: 'Désactiver le chatbot' }));
  await waitFor(() => assert.equal(enabled, false)); assert.equal(name, 'Tiana');
});

test('le nom et logo publics sont validés et restaurent les valeurs par défaut pour les anciens serveurs', async () => {
  setup(); name = 'Tiana'; logo = '/server/uploads/chatbot/logo-' + 'b'.repeat(32) + '.webp';
  await homepage.loadHomepageData(); assert.equal(homepage.chatbotName, 'Tiana'); assert.equal(homepage.chatbotLogo, logo);
  globalThis.fetch = async () => ok({ data: defaults, chatbotName: '<invalide>', chatbotLogo: null });
  await assert.rejects(homepage.loadHomepageData(), /Nom du chatbot/); assert.equal(homepage.chatbotName, 'Tiana');
  globalThis.fetch = async () => ok({ data: defaults, chatbotName: 'Tiana', chatbotLogo: 'https://exemple.invalid/logo.png' });
  await assert.rejects(homepage.loadHomepageData(), /Logo du chatbot/); assert.equal(homepage.chatbotLogo, logo);
  globalThis.fetch = async () => ok({ data: defaults }); await homepage.loadHomepageData(); assert.equal(homepage.chatbotName, 'Piston'); assert.equal(homepage.chatbotLogo, null);
});

test('navigation depuis le nom non enregistré : confirmation et brouillon préservé', async () => {
  setup();
  const { AdminHomepage } = await server.ssrLoadModule('/src/pages/AdminHomepage.tsx');
  const { ConfirmationProvider } = await server.ssrLoadModule('/src/components/ConfirmationModal.tsx');
  function Harness() {
    const [dirty, setDirty] = React.useState(false), [saving, setSaving] = React.useState(false);
    return React.createElement(ConfirmationProvider, null, React.createElement(AdminHomepage, { catalog, onToggle: async () => {}, dirty, saving, onDirtyChange: setDirty, onSavingChange: setSaving }));
  }
  const view = render(React.createElement(Harness));
  fireEvent.click(view.getByRole('button', { name: 'Chatbot' }));
  await waitFor(() => view.getByLabelText('Nom du chatbot'));
  fireEvent.change(view.getByLabelText('Nom du chatbot'), { target: { value: 'Brouillon' } });
  fireEvent.click(view.getByRole('button', { name: 'Motos accueil' }));
  await waitFor(() => view.getByRole('alertdialog'));
  fireEvent.click(view.getByRole('button', { name: 'Continuer à modifier' }));
  await waitFor(() => assert.equal(view.queryByRole('alertdialog'), null));
  assert.equal(view.getByLabelText('Nom du chatbot').value, 'Brouillon');
  fireEvent.click(view.getByRole('button', { name: 'Motos accueil' }));
  await waitFor(() => view.getByRole('alertdialog'));
  fireEvent.click(view.getByRole('button', { name: 'Abandonner' }));
  await waitFor(() => assert.ok(view.queryByLabelText('Nom du chatbot') === null));
  assert.equal(name, 'Piston');
});

test('page Contact : nom personnalisé et aucun renvoi à la bulle lorsqu’elle est désactivée', async () => {
  setup(); name = 'Tiana'; const { default: Contact } = await server.ssrLoadModule('/src/pages/Contact.tsx');
  await homepage.loadHomepageData(); const view = render(React.createElement(Contact));
  assert.ok(view.getByText(/parler avec Tiana/)); view.unmount();
  enabled = false; await homepage.loadHomepageData(); const hidden = render(React.createElement(Contact));
  assert.equal(hidden.queryByText(/Ouvrez la bulle de discussion/), null); hidden.unmount();
  globalThis.fetch = async () => ok({ data: defaults }); await homepage.loadHomepageData();
});
