import { after, afterEach, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

let dom, server, Contact, render, fireEvent, waitFor, cleanup, oldFetch, oldFormData, calls, fail;
before(async () => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.HTMLElement = dom.window.HTMLElement; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  oldFetch = globalThis.fetch; oldFormData = globalThis.FormData; globalThis.FormData = dom.window.FormData;
  ({ render, fireEvent, waitFor, cleanup } = await import('@testing-library/react'));
  server = await createServer({ server: { middlewareMode: true }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
  ({ default: Contact } = await server.ssrLoadModule('/src/pages/Contact.tsx'));
});
beforeEach(() => {
  calls = []; fail = false;
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options, body: JSON.parse(options.body) });
    return fail ? { ok: false, json: async () => ({ error: 'Stockage indisponible' }) } : { ok: true, json: async () => ({ message: 'Votre demande a bien été reçue.' }) };
  };
});
afterEach(() => cleanup());
after(async () => { globalThis.fetch = oldFetch; globalThis.FormData = oldFormData; dom.window.close(); await server?.close(); });
function fill(view) {
  for (const [label, value] of [['Nom complet', 'Rivo Client'], ['Téléphone', '034 12 345 67'], ['Email', 'rivo@example.com'], ['WhatsApp', '+261 34 12 345 67'], ['Sujet', 'pieces'], ['Votre message', 'Bonjour,\nje cherche une pièce.']]) fireEvent.change(view.getByLabelText(label, { exact: false }), { target: { value } });
}
test('la demande est enregistrée par le site et confirmée seulement après succès', async () => {
  const view = render(React.createElement(Contact)); fill(view);
  fireEvent.submit(view.getByRole('button', { name: 'Envoyer la demande' }).closest('form'));
  await waitFor(() => assert.match(view.getByRole('status').textContent, /bien été reçue/));
  assert.equal(calls.length, 1); assert.equal(calls[0].url, '/server/api/messages.php'); assert.equal(calls[0].options.method, 'POST');
  assert.deepEqual(calls[0].body, { name: 'Rivo Client', phone: '034 12 345 67', email: 'rivo@example.com', whatsapp: '+261 34 12 345 67', subject: 'pieces', message: 'Bonjour,\nje cherche une pièce.', website: '' });
  assert.equal(view.getByLabelText('Nom complet').value, '');
  assert.ok(!view.container.textContent.includes('Votre messagerie va s’ouvrir'));
});
test('échec : les champs restent remplis et aucune confirmation ne s’affiche', async () => {
  fail = true; const view = render(React.createElement(Contact)); fill(view);
  fireEvent.submit(view.getByRole('button', { name: 'Envoyer la demande' }).closest('form'));
  await waitFor(() => assert.match(view.getByRole('alert').textContent, /Stockage indisponible/));
  assert.equal(view.getByLabelText('Nom complet').value, 'Rivo Client');
  assert.equal(view.getByLabelText('Votre message').value, 'Bonjour,\nje cherche une pièce.');
  assert.equal(view.queryByRole('status'), null);
});
test('une double soumission pendant l’envoi ne crée pas deux demandes', async () => {
  let resolve; globalThis.fetch = () => { calls.push({}); return new Promise((r) => { resolve = r; }); };
  const view = render(React.createElement(Contact)); fill(view);
  const form = view.getByRole('button', { name: 'Envoyer la demande' }).closest('form');
  fireEvent.submit(form); fireEvent.submit(form);
  assert.equal(calls.length, 1); assert.ok(view.getByRole('button', { name: 'Envoi en cours…' }).disabled);
  resolve({ ok: true, json: async () => ({ message: 'Reçu' }) });
  await waitFor(() => assert.ok(view.getByRole('status')));
});
