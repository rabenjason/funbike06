import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
let server, setContactInfo, DEALERS, Contact, Dealers, Footer;
const hours = 'Lundi à vendredi : 8h30 – 17h30\nSamedi : 8h30 – 12h00\nDimanche : fermé';
const contact = { email: 'bonjour@example.com', phone: '+261 34 12 345 67', phoneHref: 'tel:+261341234567', address: 'Adresse test', hours, whatsapp: null, socialLinks: [] };
before(async () => {
  server = await createServer({ server: { middlewareMode: true }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
  ({ setContactInfo } = await server.ssrLoadModule('/src/catalog/contact.ts'));
  ({ DEALERS } = await server.ssrLoadModule('/src/catalog/dealers.ts'));
  ({ default: Contact } = await server.ssrLoadModule('/src/pages/Contact.tsx'));
  ({ default: Dealers } = await server.ssrLoadModule('/src/pages/Dealers.tsx'));
  ({ Footer } = await server.ssrLoadModule('/src/components/Layout.tsx'));
});
after(async () => await server?.close());

test('horaires multilignes et coordonnées apparaissent sur les pages publiques', () => {
  setContactInfo(contact);
  DEALERS.splice(0, DEALERS.length, { key: 'ville-test', city: 'Ville test', name: 'Revendeur test', kind: 'Magasin', address: 'Adresse revendeur', hours, phone: '+261341234567', email: 'dealer@example.com', desc: 'Description', lat: -18.9, lon: 47.5, services: ['Atelier'] });
  const page = renderToStaticMarkup(React.createElement(Contact));
  const footer = renderToStaticMarkup(React.createElement(Footer, { go() {}, onCookies() {} }));
  const dealers = renderToStaticMarkup(React.createElement(Dealers, { go() {} }));
  for (const html of [page, footer, dealers]) { assert.ok(html.includes(hours)); assert.match(html, /whitespace-pre-line/); }
  assert.match(page, /mailto:bonjour@example.com/);
  assert.match(dealers, /Revendeur test/); assert.match(dealers, /-18\.9/);
  assert.ok(!page.includes('https://wa.me/'));
});

test('liens optionnels seulement s’ils sont renseignés et sans protocole dangereux', () => {
  setContactInfo({ ...contact, whatsapp: '+261 34 12 345 67', socialLinks: [{ label: 'Facebook', url: 'https://facebook.com/funbike' }, { label: 'Indésirable', url: 'javascript:alert(1)' }] });
  const page = renderToStaticMarkup(React.createElement(Contact));
  assert.ok(page.includes('https://wa.me/261341234567'));
  assert.ok(page.includes('https://facebook.com/funbike'));
  assert.ok(!page.includes('Indésirable'));
  DEALERS.splice(0);
  const empty = renderToStaticMarkup(React.createElement(Dealers, { go() {} }));
  assert.match(empty, /Aucun revendeur renseigné/);
  assert.ok(!empty.includes('Revendeur test'));
});
