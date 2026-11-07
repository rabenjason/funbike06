import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

let dom, server, PartnerMarquee, render, cleanup, act, oldObserver, oldRect;
let viewportWidth = 1000, setWidth = 168, observer;
const brand = (id) => ({ id, name: id, logo: `/${id}.png`, isPartner: true, isEquipmentBrand: false });

before(async () => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.HTMLElement = dom.window.HTMLElement; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  oldObserver = globalThis.ResizeObserver; oldRect = dom.window.HTMLElement.prototype.getBoundingClientRect;
  dom.window.HTMLElement.prototype.getBoundingClientRect = function () {
    const width = this.classList.contains('group/marquee') ? viewportWidth : this.classList.contains('fb-partner-set') ? setWidth : 0;
    return { width, height: 48, left: 0, right: width, top: 0, bottom: 48, x: 0, y: 0, toJSON() {} };
  };
  globalThis.ResizeObserver = class {
    constructor(callback) { this.callback = callback; this.observed = []; observer = this; }
    observe(element) { this.observed.push(element); }
    disconnect() { this.disconnected = true; }
  };
  ({ render, cleanup, act } = await import('@testing-library/react'));
  server = await createServer({ server: { middlewareMode: true }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
  ({ default: PartnerMarquee } = await server.ssrLoadModule('/src/components/PartnerMarquee.tsx'));
});
after(async () => {
  cleanup(); dom.window.HTMLElement.prototype.getBoundingClientRect = oldRect; globalThis.ResizeObserver = oldObserver;
  dom.window.close(); await server?.close();
});

function check(view, expectedCopies) {
  const halves = view.container.querySelectorAll('.fb-partner-half');
  assert.equal(halves.length, 2);
  assert.equal(halves[0].querySelectorAll('.fb-partner-set').length, expectedCopies);
  assert.equal(halves[1].querySelectorAll('.fb-partner-set').length, expectedCopies);
  assert.ok(expectedCopies * setWidth >= viewportWidth, 'la moitié de la bande remplit la fenêtre');
  const track = view.container.querySelector('.fb-partner-track');
  const seconds = Number.parseFloat(track.style.getPropertyValue('--partner-duration'));
  assert.ok(Math.abs((expectedCopies * setWidth) / seconds - 72) < 0.000001, 'la vitesse est constante en pixels par seconde');
  assert.equal(halves[1].getAttribute('aria-hidden'), 'true');
  assert.equal(halves[0].querySelectorAll('.fb-partner-set:not([aria-hidden])').length, 1, 'une seule copie accessible');
}

test('défilement continu à vitesse constante avec un ou plusieurs partenaires et après redimensionnement', () => {
  viewportWidth = 1000; setWidth = 168;
  const view = render(React.createElement(PartnerMarquee, { partners: [brand('TVS')] }));
  check(view, 6);
  assert.equal(observer.observed.length, 2);
  viewportWidth = 400;
  act(() => observer.callback());
  check(view, 3);
  viewportWidth = 1000; setWidth = 504;
  view.rerender(React.createElement(PartnerMarquee, { partners: [brand('TVS'), brand('Sherco'), brand('Fantic')] }));
  check(view, 2);
  const latestObserver = observer;
  view.unmount();
  assert.equal(latestObserver.disconnected, true);
});

test('le redimensionnement fonctionne aussi sans ResizeObserver', () => {
  const saved = globalThis.ResizeObserver;
  globalThis.ResizeObserver = undefined;
  try {
    viewportWidth = 600; setWidth = 168;
    const view = render(React.createElement(PartnerMarquee, { partners: [brand('TVS')] }));
    check(view, 4);
    viewportWidth = 300;
    act(() => window.dispatchEvent(new window.Event('resize')));
    check(view, 2);
    view.unmount();
  } finally { globalThis.ResizeObserver = saved; }
});
