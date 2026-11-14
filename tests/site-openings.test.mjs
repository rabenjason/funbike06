import { after, afterEach, before, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

let dom, server, render, fireEvent, waitFor, cleanup, AdminOpenings, Admin, recordSiteOpening, updateAudienceConsent, CookieConsent, calls, oldFetch;
before(async () => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.localStorage = dom.window.localStorage; globalThis.HTMLElement = dom.window.HTMLElement; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  ({ render, fireEvent, waitFor, cleanup } = await import('@testing-library/react'));
  server = await createServer({ server: { middlewareMode: true }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
  ({ AdminOpenings } = await server.ssrLoadModule('/src/pages/AdminOpenings.tsx'));
  ({ default: Admin } = await server.ssrLoadModule('/src/pages/Admin.tsx'));
  ({ recordSiteOpening, updateAudienceConsent } = await server.ssrLoadModule('/src/lib/openings.ts'));
  ({ default: CookieConsent } = await server.ssrLoadModule('/src/components/CookieConsent.tsx'));
  oldFetch = globalThis.fetch;
});
afterEach(() => cleanup());
after(async () => { globalThis.fetch = oldFetch; dom.window.close(); await server.close(); });

test('ouvertures sans identifiant, choix Audience, retrait et ancien consentement', async () => {
  calls = []; localStorage.clear();
  const send = async (...args) => { calls.push(args); return { ok: true }; };
  localStorage.setItem('fb_cookie_consent', JSON.stringify({necessary:true,stats:true,marketing:false,date:new Date().toISOString()}));
  recordSiteOpening(false, send); assert.equal(calls.length, 0);
  recordSiteOpening(true, send); recordSiteOpening(true, send);
  assert.equal(calls.length, 1);
  assert.deepEqual(JSON.parse(calls[0][1].body), {kind:'opening'});
  assert.equal(calls[0][1].credentials, 'omit');
  assert.equal(localStorage.getItem('fb_audience_id_v2'), null);
  localStorage.setItem('fb_cookie_consent', JSON.stringify({version:2,necessary:true,stats:true,marketing:false,date:new Date().toISOString()}));
  updateAudienceConsent(true, send); updateAudienceConsent(true, send);
  assert.equal(calls.length, 2); const id = JSON.parse(calls[1][1].body).id;
  assert.match(id, /^[a-f0-9]{64}$/); assert.equal(JSON.parse(calls[1][1].body).kind, 'visitor');
  localStorage.setItem('fb_cookie_consent', JSON.stringify({version:2,necessary:true,stats:false,marketing:false,date:new Date().toISOString()}));
  updateAudienceConsent(true, send); assert.equal(localStorage.getItem('fb_audience_id_v2'), null); assert.equal(calls.length, 2);
  localStorage.setItem('fb_cookie_consent', JSON.stringify({version:2,necessary:true,stats:true,marketing:false,date:new Date(Date.now()-181*86400000).toISOString()}));
  updateAudienceConsent(true, send); assert.equal(calls.length, 2);
});

test('le bandeau explique le choix, refuser ne crée pas d’identifiant et le retrait agit immédiatement', async () => {
  localStorage.clear(); calls = [];
  const send = async (...args) => { calls.push(args); return {ok:true}; };
  const update = () => updateAudienceConsent(true, send);
  window.addEventListener('fb-consent-change', update);
  try {
    const view = render(React.createElement(CookieConsent, {open:true, onClose:()=>{}}));
    assert.match(view.container.textContent, /identifiant aléatoire/);
    assert.match(view.container.textContent, /36 mois/);
    fireEvent.click(view.getByRole('button', {name:'Refuser'}));
    assert.equal(JSON.parse(localStorage.getItem('fb_cookie_consent')).stats, false);
    assert.equal(localStorage.getItem('fb_audience_id_v2'), null);
    assert.equal(calls.length, 0);
    view.unmount();
    const accept = render(React.createElement(CookieConsent, {open:true, onClose:()=>{}}));
    fireEvent.click(accept.getByRole('button', {name:'Accepter'}));
    assert.equal(JSON.parse(localStorage.getItem('fb_cookie_consent')).stats, true);
    assert.ok(localStorage.getItem('fb_audience_id_v2')); assert.equal(calls.length, 1);
    accept.unmount();
    const withdraw = render(React.createElement(CookieConsent, {open:true, onClose:()=>{}}));
    fireEvent.click(withdraw.getByRole('button', {name:'Refuser'}));
    assert.equal(localStorage.getItem('fb_audience_id_v2'), null); assert.equal(calls.length, 1);
  } finally { window.removeEventListener('fb-consent-change', update); }
});

test('statistiques mensuelles, annuelles, données manquantes et état désactivé', async () => {
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ enabled: false, currentMonth: '2026-11', months: [{ month: '2026-01', count: 4, visitors: 2 }, { month: '2026-02', count: 7, visitors: 2 }, { month: '2025-12', count: 12, visitors: 1 }], years: [{year:'2026', visitors: 3}, {year:'2025', visitors:1}] }) });
  const view = render(React.createElement(AdminOpenings));
  await waitFor(() => assert.match(view.container.textContent, /Comptage désactivé/));
  assert.match(view.container.textContent, /Visiteurs uniques estimés sur l’année :\s*3/);
  assert.match(view.container.textContent, /Total des mois enregistrés :\s*11/);
  assert.equal(view.getAllByText('—').length, 20);
  fireEvent.change(view.getByLabelText('Année des statistiques'), { target: { value: '2025' } });
  assert.match(view.container.textContent, /Total des mois enregistrés :\s*12/);
  assert.equal(view.getAllByText('—').length, 22);
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
