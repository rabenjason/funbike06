import { after, afterEach, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
let dom, server, Admin, render, fireEvent, waitFor, cleanup, within, act, oldFetch, records, calls, fail;
const makeMessage = (n) => ({ id: n.toString(16).padStart(32, '0'), createdAt: `2024-01-${String(n).padStart(2, '0')}T10:00:00Z`, status: 'NEW', name: `Client ${String(n).padStart(2, '0')}`, phone: '034 12 345 67', email: 'client@example.com', whatsapp: n === 1 ? '' : '034 12 345 67', subject: 'pieces', subjectLabel: 'Pièces détachées', message: `Message ${n}\nLigne deux` });
const ok = (body) => ({ ok: true, json: async () => structuredClone(body) });
before(async () => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.HTMLElement = dom.window.HTMLElement; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  ({ render, fireEvent, waitFor, cleanup, within, act } = await import('@testing-library/react'));
  server = await createServer({ server: { middlewareMode: true }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
  ({ default: Admin } = await server.ssrLoadModule('/src/pages/Admin.tsx'));
  oldFetch = globalThis.fetch;
});
beforeEach(() => {
  records = Array.from({ length: 23 }, (_, i) => makeMessage(i + 1)); calls = []; fail = false;
  globalThis.fetch = async (url, options = {}) => {
    const path = String(url).replace('/server/api/', ''); const method = options.method ?? 'GET'; calls.push({ path, method });
    if (path.startsWith('messages.php')) {
      if (fail) return { ok: false, json: async () => ({ error: 'Erreur serveur' }) };
      const params = new URLSearchParams(path.split('?')[1]);
      if (method === 'GET' && params.get('count') === 'unread') return ok({ unreadCount: records.filter((message) => message.status === 'NEW').length });
      if (method === 'GET') {
        const order = params.get('order'); const sorted = [...records].sort((a, b) => order === 'asc' ? a.createdAt.localeCompare(b.createdAt) : b.createdAt.localeCompare(a.createdAt));
        const pages = Math.max(1, Math.ceil(sorted.length / 10)); const page = Math.min(Number(params.get('page')), pages);
        return ok({ messages: sorted.slice((page - 1) * 10, page * 10), page, pages, total: sorted.length });
      }
      const id = params.get('id');
      if (method === 'PUT') { const status = JSON.parse(options.body).status; records = records.map((r) => r.id === id ? { ...r, status } : r); return ok({ message: records.find((r) => r.id === id) }); }
      if (method === 'DELETE') { records = records.filter((r) => r.id !== id); return ok({ message: 'Supprimé' }); }
    }
    const fixed = { 'auth/me.php': { user: { id: 'admin', username: 'admin', role: 'superadmin', mustChangePassword: false } }, 'brands.php?includeDrafts=1': { brands: [] }, 'categories.php': { categories: [] }, 'families.php': { families: [] }, 'product-types.php': { productTypes: [] }, 'models.php?includeDrafts=1': { models: [] }, 'products/motorcycles.php?includeDrafts=1': { data: [] }, 'products/helmets.php?includeDrafts=1': { data: [] }, 'products/riding-gear.php?includeDrafts=1': { data: [] }, 'products/spare-parts.php?includeDrafts=1': { data: [] } };
    return fixed[path] ? ok(fixed[path]) : { ok: false, json: async () => ({ error: 'Route inconnue' }) };
  };
});
afterEach(() => cleanup());
after(async () => { globalThis.fetch = oldFetch; dom.window.close(); await server?.close(); });
async function open() {
  const view = render(React.createElement(Admin));
  await waitFor(() => assert.ok(view.getByRole('button', { name: 'Messages' })));
  fireEvent.click(view.getByRole('button', { name: 'Messages' }));
  await waitFor(() => assert.ok(view.getByText('Client 23')));
  return view;
}
test('liste paginée, tri par date et détail avec réponses manuelles', async () => {
  const view = await open();
  assert.match(view.container.textContent, /Page 1 \/ 3/);
  assert.ok(!view.queryByText('Client 13')); assert.ok(view.getByText('Client 14'));
  fireEvent.click(view.getByText('Client 23'));
  await waitFor(() => assert.equal(records[22].status, 'READ'));
  const detail = view.getByRole('region', { name: 'Détail du message' });
  assert.match(detail.textContent, /Client 23/); assert.match(detail.textContent, /034 12 345 67/); assert.match(detail.textContent, /client@example.com/); assert.match(detail.textContent, /Message 23\s*Ligne deux/);
  assert.match(within(detail).getByRole('link', { name: 'Répondre par e-mail' }).getAttribute('href'), /^mailto:client%40example.com\?subject=/);
  assert.equal(within(detail).getByRole('link', { name: 'Répondre par WhatsApp' }).getAttribute('href'), 'https://wa.me/261341234567');
  fireEvent.click(within(detail).getByRole('button', { name: 'Marquer comme traité' }));
  await waitFor(() => assert.equal(records[22].status, 'PROCESSED'));
  fireEvent.click(view.getByRole('button', { name: 'Suivant' }));
  await waitFor(() => assert.ok(view.getByText('Client 13')));
  assert.match(view.container.textContent, /Page 2 \/ 3/);
  fireEvent.click(view.getByRole('button', { name: 'Suivant' }));
  await waitFor(() => assert.ok(view.getByText('Client 01')));
  assert.match(view.container.textContent, /Page 3 \/ 3/);
  fireEvent.change(view.getByLabelText('Trier par date'), { target: { value: 'asc' } });
  await waitFor(() => assert.ok(view.getByText('Client 10')));
  assert.match(view.container.textContent, /Page 1 \/ 3/);
  assert.ok(view.getByText('Client 01')); assert.ok(!view.queryByText('Client 23'));
  fireEvent.click(view.getByText('Client 01'));
  await waitFor(() => assert.equal(records[0].status, 'READ'));
  assert.ok(!view.queryByRole('link', { name: 'Répondre par WhatsApp' }));
  assert.match(view.container.textContent, /n’a pas renseigné de numéro WhatsApp/);
  assert.ok(calls.some((call) => call.path === 'messages.php?page=1&order=asc'));
});
test('suppression seulement après confirmation, et échec sans perte de l’élément', async () => {
  const view = await open(); fireEvent.click(view.getByText('Client 23'));
  await waitFor(() => assert.equal(records[22].status, 'READ'));
  fireEvent.click(view.getByRole('button', { name: 'Supprimer' }));
  fireEvent.click(within(view.getByRole('alertdialog')).getByRole('button', { name: 'Annuler' }));
  assert.equal(calls.filter((call) => call.method === 'DELETE').length, 0);
  fireEvent.click(view.getByRole('button', { name: 'Supprimer' }));
  fireEvent.click(within(view.getByRole('alertdialog')).getByRole('button', { name: 'Supprimer' }));
  await waitFor(() => assert.equal(records.length, 22));
  await waitFor(() => assert.ok(!view.queryByText('Client 23')));
});
test('un échec de chargement n’est pas présenté comme une boîte vide et peut être réessayé', async () => {
  fail = true;
  const view = render(React.createElement(Admin));
  await waitFor(() => assert.ok(view.getByRole('button', { name: 'Messages' })));
  fireEvent.click(view.getByRole('button', { name: 'Messages' }));
  await waitFor(() => assert.match(view.getByRole('alert').textContent, /Erreur serveur/));
  assert.ok(!view.container.textContent.includes('Aucun message pour le moment'));
  fail = false; fireEvent.click(view.getByRole('button', { name: 'Réessayer le chargement' }));
  await waitFor(() => assert.ok(view.getByText('Client 23')));
});


test('les numéros WhatsApp sont construits sans deviner un indicatif étranger', async () => {
  const { whatsappNumber } = await server.ssrLoadModule('/src/pages/AdminMessages.tsx');
  assert.equal(whatsappNumber('+261 34 12 345 67'), '261341234567');
  assert.equal(whatsappNumber('034 12 345 67'), '261341234567');
  assert.equal(whatsappNumber('0033 6 12 34 56 78'), '33612345678');
  assert.equal(whatsappNumber(''), null);
  assert.equal(whatsappNumber('1234567890'), null);
  assert.equal(whatsappNumber('javascript:alert(1)'), null);
});


const badge = (view) => view.getByRole('button', { name: 'Messages' });
const countDescription = (view) => {
  const id = badge(view).getAttribute('aria-describedby');
  return id ? document.getElementById(id)?.textContent : null;
};
test('pastille compte tous les nouveaux messages et suit les changements de statut et la suppression', async () => {
  const view = await open();
  await waitFor(() => assert.equal(countDescription(view), '23 messages non lus'));
  assert.match(badge(view).textContent, /23/);
  fireEvent.click(view.getByText('Client 23'));
  await waitFor(() => assert.equal(countDescription(view), '22 messages non lus'));
  fireEvent.click(view.getByRole('button', { name: 'Marquer comme nouveau' }));
  await waitFor(() => assert.equal(countDescription(view), '23 messages non lus'));
  fireEvent.click(view.getByRole('button', { name: 'Supprimer' }));
  fireEvent.click(within(view.getByRole('alertdialog')).getByRole('button', { name: 'Supprimer' }));
  await waitFor(() => assert.equal(countDescription(view), '22 messages non lus'));
});

test('pastille absente à zéro, plafonnée visuellement à 99 et compteur exact accessible', async () => {
  records = records.map((message) => ({ ...message, status: 'READ' }));
  const view = await open();
  await waitFor(() => assert.ok(calls.some((call) => call.path === 'messages.php?count=unread')));
  await waitFor(() => assert.equal(countDescription(view), null));
  assert.equal(badge(view).textContent, 'Messages');
  records = Array.from({ length: 101 }, (_, i) => ({ ...makeMessage((i % 23) + 1), id: i.toString(16).padStart(32, '0') }));
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  fireEvent.focus(window);
  await waitFor(() => assert.equal(countDescription(view), '101 messages non lus'));
  assert.match(badge(view).textContent, /99\+/);
});

test('rafraîchissement périodique et au retour, erreur signalée, puis rétablissement', async () => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  const previousSet = window.setInterval; const previousClear = window.clearInterval;
  let tick, delay, cleared = false;
  window.setInterval = (callback, ms) => { tick = callback; delay = ms; return 1234; };
  window.clearInterval = (id) => { if (id === 1234) cleared = true; };
  try {
    const view = await open();
    await waitFor(() => assert.equal(countDescription(view), '23 messages non lus'));
    assert.equal(delay, 30000);
    records.push(makeMessage(24));
    act(() => tick());
    await waitFor(() => assert.equal(countDescription(view), '24 messages non lus'));
    fireEvent.click(view.getByRole('button', { name: 'Actualiser' }));
    await waitFor(() => assert.ok(view.getByText('Client 24')));
    fail = true; act(() => tick());
    await waitFor(() => assert.equal(countDescription(view), 'Compteur de messages non lus indisponible'));
    assert.match(badge(view).textContent, /!/);
    fail = false; fireEvent.focus(window);
    await waitFor(() => assert.equal(countDescription(view), '24 messages non lus'));
    view.unmount(); assert.equal(cleared, true);
  } finally { window.setInterval = previousSet; window.clearInterval = previousClear; }
});

test('une ancienne réponse ne remplace pas un compteur plus récent', async () => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  const original = globalThis.fetch; let resolveFirst; let countCalls = 0;
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).endsWith('messages.php?count=unread') && ++countCalls === 1) return new Promise((resolve) => { resolveFirst = resolve; });
    return original(url, options);
  };
  const view = render(React.createElement(Admin));
  await waitFor(() => assert.equal(countCalls, 1));
  records.push(makeMessage(24)); fireEvent.focus(window);
  await waitFor(() => assert.equal(countDescription(view), '24 messages non lus'));
  await act(async () => { resolveFirst(ok({ unreadCount: 23 })); await Promise.resolve(); });
  assert.equal(countDescription(view), '24 messages non lus');
});


test('le compteur ne se charge pas sans session ou avant le changement du mot de passe', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => String(url).endsWith('auth/me.php') ? { ok: false, json: async () => ({ error: 'Connexion requise' }) } : original(url, options);
  const loggedOut = render(React.createElement(Admin));
  await waitFor(() => assert.ok(loggedOut.getByRole('button', { name: 'Se connecter' })));
  assert.ok(!calls.some((call) => call.path === 'messages.php?count=unread'));
  loggedOut.unmount();
  globalThis.fetch = async (url, options) => String(url).endsWith('auth/me.php') ? ok({ user: { id: 'admin', username: 'admin', role: 'superadmin', mustChangePassword: true } }) : original(url, options);
  const mandatory = render(React.createElement(Admin));
  await waitFor(() => assert.ok(mandatory.getByText('Choisissez votre mot de passe')));
  assert.ok(!calls.some((call) => call.path === 'messages.php?count=unread'));
});
