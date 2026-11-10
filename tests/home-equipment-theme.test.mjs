import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

test('section équipements : couleurs TVS jour et nuit isolées du thème Funbike', () => {
  const dom = new JSDOM('<!doctype html><html><head></head><body><section class="fb-home-equipment"></section><section class="other"></section></body></html>');
  const { document, getComputedStyle } = dom.window;
  const style = document.createElement('style');
  style.textContent = `.fb-home-equipment, .other { background-color: rgb(255, 249, 223); border: 1px solid rgb(232, 213, 116); }
    .dark .fb-home-equipment, .dark .other { background-color: rgb(28, 29, 25); border-color: rgb(40, 40, 40); }\n` + readFileSync('src/styles/tvs-theme.css', 'utf8');
  document.head.append(style);
  const target = document.querySelector('.fb-home-equipment'), other = document.querySelector('.other');
  for (const [theme, dark, background, border] of [
    ['funbike', false, 'rgb(255, 249, 223)', 'rgb(232, 213, 116)'],
    ['funbike', true, 'rgb(28, 29, 25)', 'rgb(40, 40, 40)'],
    ['tvs', false, 'rgb(243, 246, 252)', 'rgb(220, 228, 243)'],
    ['tvs', true, 'rgb(36, 40, 48)', 'rgba(255, 255, 255, 0.1)'],
  ]) {
    document.documentElement.dataset.siteTheme = theme;
    document.documentElement.classList.toggle('dark', dark);
    assert.equal(getComputedStyle(target).backgroundColor, background, `${theme} ${dark}`);
    assert.equal(getComputedStyle(target).borderTopColor, border, `${theme} ${dark}`);
    assert.equal(getComputedStyle(other).backgroundColor, dark ? 'rgb(28, 29, 25)' : 'rgb(255, 249, 223)');
  }
  dom.window.close();
});
