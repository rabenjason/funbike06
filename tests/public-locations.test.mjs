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

test('footer : icône Facebook uniquement pour une adresse renseignée et fiable', async () => {
  const { isFacebookUrl } = await server.ssrLoadModule('/src/lib/socialLinks.ts');
  for (const url of ['https://www.facebook.com/funbike', 'https://m.facebook.com/funbike', 'https://fb.me/funbike', 'https://fb.com/funbike']) assert.equal(isFacebookUrl(url), true, url);
  for (const url of ['javascript:alert(1)', 'https://facebook.com.evil.example/', 'https://evil.example/facebook.com', 'https://facebook.com@evil.example/', 'https://user@facebook.com/', 'https://evilfb.me/', '']) assert.equal(isFacebookUrl(url), false, url);
  const renderFooter = () => renderToStaticMarkup(React.createElement(Footer, { go() {}, onCookies() {} }));
  setContactInfo({ ...contact, socialLinks: [] });
  assert.doesNotMatch(renderFooter(), /Notre page Facebook/);
  setContactInfo({ ...contact, socialLinks: [{ label: 'Facebook', url: 'https://facebook.com.evil.example/' }, { label: 'Instagram', url: 'https://instagram.com/funbike' }] });
  assert.doesNotMatch(renderFooter(), /Notre page Facebook/, 'une adresse trompeuse ne devient pas un lien Facebook');
  setContactInfo({ ...contact, socialLinks: [{ label: 'Autre', url: 'https://example.com' }, { label: 'Notre page', url: 'https://www.facebook.com/funbike' }, { label: 'Facebook secondaire', url: 'https://facebook.com/second' }] });
  const html = renderFooter();
  assert.match(html, /href="https:\/\/www\.facebook\.com\/funbike"/);
  assert.match(html, /aria-label="Notre page Facebook \(nouvel onglet\)"/);
  assert.match(html, /target="_blank" rel="noopener noreferrer"/);
  assert.match(html, /data-icon="facebook"/);
  assert.doesNotMatch(html, /facebook\.com\/second/, 'un seul lien dans le footer');
});
