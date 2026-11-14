import { after, afterEach, before, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

let dom, server, render, fireEvent, waitFor, cleanup, AdminOpenings, Admin, recordSiteOpening, clearOldAudienceId, getBrowserId, CookieConsent, calls, oldFetch;
before(async () => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.localStorage = dom.window.localStorage; globalThis.HTMLElement = dom.window.HTMLElement; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  ({ render, fireEvent, waitFor, cleanup } = await import('@testing-library/react'));
  server = await createServer({ server: { middlewareMode: true }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
  ({ AdminOpenings } = await server.ssrLoadModule('/src/pages/AdminOpenings.tsx'));
  ({ default: Admin } = await server.ssrLoadModule('/src/pages/Admin.tsx'));
  ({ recordSiteOpening, clearOldAudienceId, getBrowserId } = await server.ssrLoadModule('/src/lib/openings.ts'));
  ({ default: CookieConsent } = await server.ssrLoadModule('/src/components/CookieConsent.tsx'));
  oldFetch = globalThis.fetch;
});
afterEach(() => cleanup());
after(async () => { globalThis.fetch = oldFetch; dom.window.close(); await server.close(); });

test('identifiant de navigateur stable, comptage unique et préférences cookies préservées', async () => {
  calls = []; localStorage.clear();
  const consent = JSON.stringify({necessary:true,stats:true,marketing:false,date:new Date().toISOString()});
  localStorage.setItem('fb_cookie_consent', consent);
  localStorage.setItem('fb_audience_id_v2', 'ancien identifiant');
  clearOldAudienceId();
  assert.equal(localStorage.getItem('fb_audience_id_v2'), null);
  assert.equal(localStorage.getItem('fb_cookie_consent'), consent);
  const send = async (...args) => { calls.push(args); return { ok: true }; };
  recordSiteOpening(false, send); assert.equal(calls.length, 0);
  recordSiteOpening(true, send); recordSiteOpening(true, send);
  assert.equal(calls.length, 1);
  const payload = JSON.parse(calls[0][1].body);
  assert.equal(payload.kind, 'opening'); assert.match(payload.browserId, /^[a-f0-9]{64}$/);
  assert.equal(getBrowserId(), payload.browserId);
  assert.equal(JSON.parse(localStorage.getItem('fb_stats_browser_v1')).id, payload.browserId);
  assert.equal(calls[0][1].credentials, 'omit');
  assert.equal(localStorage.getItem('fb_audience_id_v2'), null);
  assert.equal(localStorage.getItem('fb_cookie_consent'), consent);
});

test('renouvellement annuel, stockage indisponible et navigateurs distincts', () => {
  localStorage.clear();
  const first = getBrowserId(); assert.match(first, /^[a-f0-9]{64}$/);
  const saved = JSON.parse(localStorage.getItem('fb_stats_browser_v1'));
  localStorage.setItem('fb_stats_browser_v1', JSON.stringify({...saved, year: '1990'}));
  const renewed = getBrowserId(); assert.notEqual(renewed, first);
  localStorage.removeItem('fb_stats_browser_v1');
  const second = getBrowserId(); assert.notEqual(second, renewed);
  localStorage.removeItem('fb_stats_browser_v1');
  const original = window.Storage.prototype.setItem;
  try { window.Storage.prototype.setItem = () => { throw new Error('storage blocked'); }; assert.equal(getBrowserId(), null); }
  finally { window.Storage.prototype.setItem = original; }
});

test('bandeau cookies original, sans nouvelle information sur les visiteurs', () => {
  localStorage.clear();
  const view = render(React.createElement(CookieConsent, {open:true, onClose:()=>{}}));
  assert.match(view.container.textContent, /Cookies & expérience/);
  assert.match(view.container.textContent, /Essentiels & mesure d'audience/);
  assert.doesNotMatch(view.container.textContent, /identifiant aléatoire/);
  assert.ok(view.getByRole('button', {name:'Refuser'}));
  assert.ok(view.getByRole('button', {name:'Accepter'}));
});

test('statistiques mensuelles, annuelles, données manquantes et état désactivé', async () => {
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ enabled: false, currentMonth: '2026-11', months: [{ month: '2026-01', count: 4, visitors: 2, browsers: 3 }, { month: '2026-02', count: 7, visitors: 2, browsers: 2 }, { month: '2025-12', count: 12, visitors: 1, browsers: null }], years: [{year:'2026', visitors: 3, browsers: 4}, {year:'2025', visitors:1, browsers:null}] }) });
  const view = render(React.createElement(AdminOpenings));
  await waitFor(() => assert.match(view.container.textContent, /Comptage désactivé/));
  assert.match(view.container.textContent, /Visiteurs estimés sur l’année :\s*4/);
  assert.match(view.container.textContent, /pas des personnes/);
  assert.match(view.container.textContent, /Total des mois enregistrés :\s*11/);
  assert.equal(view.getAllByText('—').length, 30);
  fireEvent.change(view.getByLabelText('Année des statistiques'), { target: { value: '2025' } });
  assert.match(view.container.textContent, /Total des mois enregistrés :\s*12/);
  assert.equal(view.getAllByText('—').length, 35);
});

test('erreur serveur visible, sans inventer de nombres', async () => {
  globalThis.fetch = async () => ({ ok: false, json: async () => ({ message: 'Statistiques indisponibles.' }) });
  const view = render(React.createElement(AdminOpenings));
  await waitFor(() => assert.match(view.getByRole('alert').textContent, /indisponibles/));
  assert.ok(view.getByText('Réessayer')); assert.equal(view.queryByText(/Total des mois enregistrés/), null);
});


test('l’onglet Statistiques est accessible dans l’administration sans collecte publique', async () => {
  calls = [];
  globalThis.fetch = async (url, options = {}) => {
    const path = String(url).replace('/server/api/', ''); calls.push({ path, method: options.method || 'GET' });
    const fixed = { 'auth/me.php': { user: { id: 'admin', username: 'admin', role: 'admin', mustChangePassword: false } }, 'brands.php?includeDrafts=1': { brands: [] }, 'categories.php': { categories: [] }, 'families.php': { families: [] }, 'product-types.php': { productTypes: [] }, 'models.php?includeDrafts=1': { models: [] }, 'products/motorcycles.php?includeDrafts=1': { data: [] }, 'products/helmets.php?includeDrafts=1': { data: [] }, 'products/riding-gear.php?includeDrafts=1': { data: [] }, 'products/spare-parts.php?includeDrafts=1': { data: [] }, 'openings.php': { enabled: false, currentMonth: '2026-11', months: [], years: [] }, 'messages.php?count=unread': { unreadCount: 0 } };
    return fixed[path] ? { ok: true, json: async () => fixed[path] } : { ok: false, json: async () => ({ message: 'Route inconnue' }) };
  };
  const view = render(React.createElement(Admin));
  await waitFor(() => assert.ok(view.getByRole('button', { name: 'Statistiques' })));
  fireEvent.click(view.getByRole('button', { name: 'Statistiques' }));
  await waitFor(() => assert.match(view.container.textContent, /Comptage désactivé sur le serveur/));
  assert.ok(calls.some((call) => call.path === 'openings.php' && call.method === 'GET'));
  assert.ok(!calls.some((call) => call.path === 'openings.php' && call.method === 'POST'));
});
