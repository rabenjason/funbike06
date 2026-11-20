import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import React from 'react';

let dom,server,HeroImage,render,fireEvent,waitFor,cleanup;
before(async()=>{
  dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost/',pretendToBeVisual:true});
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Element:dom.window.Element,SVGElement:dom.window.SVGElement,requestAnimationFrame:dom.window.requestAnimationFrame.bind(dom.window),IS_REACT_ACT_ENVIRONMENT:true});
  ({render,fireEvent,waitFor,cleanup}=await import('@testing-library/react'));
  server=await createServer({server:{middlewareMode:true},appType:'custom',optimizeDeps:{noDiscovery:true,include:[]},logLevel:'silent'});
  ({default:HeroImage}=await server.ssrLoadModule('/src/components/HeroImage.tsx'));
});
after(async()=>{cleanup();dom.window.close();await server.close();});

test('squelette visible pendant le chargement, puis disparition douce à la réception',async()=>{
  const view=render(React.createElement(HeroImage,{src:'/image-a.webp',alt:'Moto A',priority:true}));
  const skeleton=view.container.querySelector('.hero-image-skeleton');
  assert.ok(skeleton); assert.equal(skeleton.getAttribute('aria-hidden'),'true');
  const image=view.getByRole('img',{name:'Moto A'});assert.equal(image.getAttribute('fetchpriority'),'high');
  fireEvent.load(image);
  await waitFor(()=>assert.ok(!view.container.querySelector('.hero-image-skeleton')),{timeout:3000});
  assert.ok(view.getByRole('img',{name:'Moto A'}));
  view.rerender(React.createElement(HeroImage,{src:'/image-b.webp',alt:'Moto B',priority:false}));
  assert.ok(view.container.querySelector('.hero-image-skeleton'),'nouvelle photo, nouveau chargement');
  assert.equal(view.getByRole('img',{name:'Moto B'}).getAttribute('fetchpriority'),'auto');
  view.unmount();
});

test('le squelette reste pendant deux réessais, puis indique l’échec sans animation infinie',async()=>{
  const view=render(React.createElement(HeroImage,{src:'/erreur.webp',alt:'Moto',priority:true}));
  let image=view.getByRole('img',{name:'Moto'});fireEvent.error(image);
  assert.ok(view.container.querySelector('.hero-image-skeleton'));
  await waitFor(()=>assert.ok(view.getByRole('img',{name:'Moto'})!==image),{timeout:4000});
  image=view.getByRole('img',{name:'Moto'});fireEvent.error(image);
  assert.ok(view.container.querySelector('.hero-image-skeleton'));
  await waitFor(()=>assert.ok(view.getByRole('img',{name:'Moto'})!==image),{timeout:6000});
  fireEvent.error(view.getByRole('img',{name:'Moto'}));
  assert.ok(!view.container.querySelector('.hero-image-skeleton'));
  assert.ok(!view.queryByRole('img',{name:'Moto'}));
  assert.match(view.getByRole('status').textContent,/Image indisponible/);
  view.unmount();
});

test('image déjà en cache : la fin du chargement ne dépend pas d’un nouvel événement load',async()=>{
  const complete=Object.getOwnPropertyDescriptor(dom.window.HTMLImageElement.prototype,'complete');
  const width=Object.getOwnPropertyDescriptor(dom.window.HTMLImageElement.prototype,'naturalWidth');
  Object.defineProperty(dom.window.HTMLImageElement.prototype,'complete',{configurable:true,get:()=>true});
  Object.defineProperty(dom.window.HTMLImageElement.prototype,'naturalWidth',{configurable:true,get:()=>640});
  try {
    const view=render(React.createElement(HeroImage,{src:'/cache.webp',alt:'En cache',priority:true}));
    await waitFor(()=>assert.ok(!view.container.querySelector('.hero-image-skeleton')),{timeout:3000});
    view.unmount();
  } finally {
    Object.defineProperty(dom.window.HTMLImageElement.prototype,'complete',complete);
    Object.defineProperty(dom.window.HTMLImageElement.prototype,'naturalWidth',width);
  }
});

test('le squelette est superposé et respecte la réduction des animations',()=>{
  const css=readFileSync('src/index.css','utf8');
  assert.match(css,/\.skeleton\.absolute\s*\{\s*position:\s*absolute/);
  assert.match(css,/\.skeleton\.hero-image-skeleton\s*\{[^}]*position:\s*absolute[^}]*inset:\s*0/s);
  assert.match(css,/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{\s*\.skeleton\.hero-image-skeleton::after\s*\{\s*animation:\s*none/s);
});
