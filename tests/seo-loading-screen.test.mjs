import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const template = readFileSync('index.html', 'utf8');
const html = template.replace('<div id="root"></div>', '<div id="seo-fallback"><main><nav><a href="/motos">Nos motos</a></nav><h1>Moto test</h1><p>Description publique</p></main></div><div id="root"></div>');

test('sans JavaScript, le contenu SEO et ses liens restent visibles et lisibles', () => {
  const dom = new JSDOM(html, { url: 'https://funbike.mg/motos/test', runScripts: 'outside-only' });
  try {
    assert.equal(dom.window.document.documentElement.classList.contains('fb-booting'), false);
    assert.equal(dom.window.getComputedStyle(dom.window.document.getElementById('funbike-boot')).display, 'none');
    const fallback = dom.window.document.getElementById('seo-fallback');
    assert.notEqual(dom.window.getComputedStyle(fallback).display, 'none');
    assert.equal(fallback.querySelector('h1').textContent, 'Moto test');
    assert.equal(fallback.querySelector('a').getAttribute('href'), '/motos');
  } finally { dom.window.close(); }
});

test('avec JavaScript, le chargement couvre immédiatement la page et libère le contenu après un délai de sécurité', () => {
  const timers = [];
  const dom = new JSDOM(html, { url: 'https://funbike.mg/motos/test', runScripts: 'dangerously', beforeParse(window) { window.setTimeout = (callback, delay) => { timers.push({ callback, delay }); return 1; }; } });
  try {
    const doc = dom.window.document;
    const overlay = doc.getElementById('funbike-boot');
    const fallback = doc.getElementById('seo-fallback');
    assert.ok(doc.documentElement.classList.contains('fb-booting'));
    assert.equal(dom.window.getComputedStyle(overlay).display, 'flex');
    assert.equal(dom.window.getComputedStyle(overlay).position, 'fixed');
    assert.equal(overlay.getAttribute('role'), 'status');
    assert.match(overlay.textContent, /Mise en route/);
    assert.doesNotMatch(overlay.textContent, /Chargement du site/);
    assert.ok(doc.documentElement.classList.contains('dark'), 'le thème sombre est celui par défaut');
    assert.equal(fallback.querySelector('h1').textContent, 'Moto test', 'le HTML SEO est conservé');
    assert.notEqual(dom.window.getComputedStyle(fallback).display, 'none');
    const safety = timers.find((timer) => timer.delay === 15000);
    assert.ok(safety, 'un délai de sécurité évite de bloquer la page');
    safety.callback();
    assert.equal(dom.window.getComputedStyle(overlay).display, 'none');
    assert.equal(fallback.querySelector('p').textContent, 'Description publique');
  } finally { dom.window.close(); }
});

test('le même écran respecte le thème clair enregistré', () => {
  const dom = new JSDOM(html, { url: 'https://funbike.mg/', runScripts: 'dangerously', beforeParse(window) { window.localStorage.setItem('fb-theme-v2', 'light'); } });
  try {
    const doc = dom.window.document;
    assert.ok(doc.documentElement.classList.contains('fb-booting'));
    assert.equal(doc.documentElement.classList.contains('dark'), false);
    assert.equal(dom.window.getComputedStyle(doc.getElementById('funbike-boot')).backgroundColor, 'rgb(255, 255, 255)');
    assert.match(doc.getElementById('funbike-boot').textContent, /Mise en route/);
  } finally { dom.window.close(); }
});
