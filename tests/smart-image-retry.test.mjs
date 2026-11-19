import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

test('une image temporairement indisponible est réessayée deux fois, puis remplacée par le secours',async()=>{
  const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost/',pretendToBeVisual:true});
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Element:dom.window.Element,SVGElement:dom.window.SVGElement,IS_REACT_ACT_ENVIRONMENT:true});
  const {render,fireEvent,waitFor,cleanup}=await import('@testing-library/react');
  const React=await import('react');
  const server=await createServer({server:{middlewareMode:true},appType:'custom',optimizeDeps:{noDiscovery:true,include:[]},logLevel:'silent'});
  try {
    const {default:SmartImage}=await server.ssrLoadModule('/src/components/SmartImage.tsx');
    const view=render(React.createElement(SmartImage,{src:'/server/uploads/test.webp',alt:'Moto'}));
    const first=view.getByRole('img',{name:'Moto'}); fireEvent.error(first);
    await waitFor(()=>assert.ok(view.getByRole('img',{name:'Moto'}) !== first),{timeout:4000});
    const second=view.getByRole('img',{name:'Moto'}); fireEvent.error(second);
    await waitFor(()=>assert.ok(view.getByRole('img',{name:'Moto'}) !== second),{timeout:6000});
    fireEvent.error(view.getByRole('img',{name:'Moto'}));
    assert.equal(view.queryByRole('img',{name:'Moto'}),null);
    assert.ok(view.container.querySelector('[aria-label="Moto"]'));
  } finally {cleanup(); dom.window.close();await server.close();}
});
