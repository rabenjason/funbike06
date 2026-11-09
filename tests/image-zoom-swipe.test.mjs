import { after, afterEach, before, test } from 'node:test';
import assert from 'node:assert/strict';
import React, { useState } from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

let dom, server, Viewer, render, cleanup, fireEvent;
const images = ['/one.jpg', '/two.jpg', '/three.jpg', '/four.jpg'];

before(async () => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
  globalThis.window = dom.window; globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement; globalThis.Element = dom.window.Element; globalThis.SVGElement = dom.window.SVGElement;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window); globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  class PointerEvent extends window.MouseEvent {
    constructor(type, options = {}) { super(type, options); this.pointerId = options.pointerId ?? 1; this.pointerType = options.pointerType ?? 'touch'; this.isPrimary = options.isPrimary ?? true; }
  }
  window.PointerEvent = PointerEvent;
  ({ render, cleanup, fireEvent } = await import('@testing-library/react'));
  server = await createServer({ server: { middlewareMode: true }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] }, logLevel: 'silent' });
  ({ default: Viewer } = await server.ssrLoadModule('/src/components/ImageZoomViewer.tsx'));
});
afterEach(() => cleanup());
after(async () => { dom.window.close(); await server?.close(); });

function Harness({ photos = images, onClose = () => {} }) {
  const [active, setActive] = useState(0);
  return React.createElement(Viewer, { open: true, images: photos, active, alt: 'Moto test', onActiveChange: setActive, onClose });
}
function gesture(stage, from, to, extra = {}) {
  const shared = { pointerType: 'touch', pointerId: 1, isPrimary: true, bubbles: true, ...extra };
  fireEvent.pointerDown(stage, { ...shared, clientX: from[0], clientY: from[1] });
  fireEvent.pointerUp(stage, { ...shared, clientX: to[0], clientY: to[1] });
}
const selected = (view) => view.getByRole('dialog').querySelector('header').textContent;

test('visionneuse : glissement tactile gauche et droite, boucle et pas de zoom accidentel', () => {
  const view = render(React.createElement(Harness)); const stage = view.getByRole('main');
  assert.match(selected(view), /Photo 1 \/ 4/);
  gesture(stage, [240, 180], [100, 185]);
  assert.match(selected(view), /Photo 2 \/ 4/);
  fireEvent.click(stage, { detail: 1, clientX: 100, clientY: 185 });
  assert.match(selected(view), /100%/, 'le clic synthétique après glissement ne zoome pas');
  gesture(stage, [100, 180], [230, 185]); assert.match(selected(view), /Photo 1 \/ 4/);
  gesture(stage, [100, 180], [230, 185]); assert.match(selected(view), /Photo 4 \/ 4/);
  gesture(stage, [230, 180], [100, 185]); assert.match(selected(view), /Photo 1 \/ 4/);
});

test('gestes verticaux, courts, annulés, multitouch ou souris ne changent pas de photo', () => {
  const view = render(React.createElement(Harness)); const stage = view.getByRole('main');
  gesture(stage, [100, 100], [125, 100]);
  gesture(stage, [100, 100], [160, 220]);
  gesture(stage, [200, 100], [70, 100], { pointerType: 'mouse' });
  fireEvent.pointerDown(stage, { pointerType: 'touch', pointerId: 1, isPrimary: true, clientX: 200, clientY: 100 });
  fireEvent.pointerCancel(stage, { pointerType: 'touch', pointerId: 1, isPrimary: true });
  fireEvent.pointerUp(stage, { pointerType: 'touch', pointerId: 1, isPrimary: true, clientX: 70, clientY: 100 });
  fireEvent.pointerDown(stage, { pointerType: 'touch', pointerId: 1, isPrimary: true, clientX: 200, clientY: 100 });
  fireEvent.pointerDown(stage, { pointerType: 'touch', pointerId: 2, isPrimary: false, clientX: 180, clientY: 100 });
  fireEvent.pointerUp(stage, { pointerType: 'touch', pointerId: 1, isPrimary: true, clientX: 70, clientY: 100 });
  assert.match(selected(view), /Photo 1 \/ 4/);
});

test('zoom, flèches, miniatures et fermeture restent utilisables', () => {
  let closed = false;
  const view = render(React.createElement(Harness, { onClose: () => { closed = true; } })); const stage = view.getByRole('main');
  fireEvent.click(view.getByRole('button', { name: 'Agrandir l’image' }));
  assert.match(selected(view), /150%/);
  gesture(stage, [230, 100], [70, 100]); assert.match(selected(view), /Photo 1 \/ 4/, 'un geste en zoom explore au lieu de changer de photo');
  fireEvent.click(view.getByRole('button', { name: 'Photo suivante' })); assert.match(selected(view), /Photo 2 \/ 4/); assert.match(selected(view), /100%/);
  fireEvent.click(view.getByRole('button', { name: 'Afficher la photo 4' })); assert.match(selected(view), /Photo 4 \/ 4/);
  fireEvent.keyDown(window, { key: 'ArrowLeft' }); assert.match(selected(view), /Photo 3 \/ 4/);
  fireEvent.click(view.getByRole('button', { name: 'Fermer la visionneuse' })); assert.equal(closed, true);
});

test('une seule photo reste zoomable et ne glisse pas', () => {
  const view = render(React.createElement(Harness, { photos: ['/one.jpg'] })); const stage = view.getByRole('main');
  gesture(stage, [230, 100], [70, 100]); assert.match(selected(view), /Photo 1 \/ 1/);
  fireEvent.click(view.getByRole('button', { name: 'Agrandir l’image' })); assert.match(selected(view), /150%/);
  assert.equal(view.queryByRole('button', { name: 'Photo suivante' }), null);
});
