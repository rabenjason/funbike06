import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { seedCatalog } from './helpers/catalog.mjs';

let dom, server, catalog, Equipements, AccessoryBrandQuickLinks, render, cleanup, fireEvent, within, waitFor;
before(async () => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Element = dom.window.Element; globalThis.SVGElement = dom.window.SVGElement;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
  globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  window.scrollTo = () => {};
  globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  ({ render, cleanup, fireEvent, within, waitFor } = await import('@testing-library/react'));
  server = await createServer({ server: { middlewareMode: true }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] }, logLevel: 'silent' });
  await seedCatalog(server);
  catalog = await server.ssrLoadModule('/src/catalog/index.ts');
  ({ Equipements } = await server.ssrLoadModule('/src/pages/Catalog.tsx'));
  ({ AccessoryBrandQuickLinks } = await server.ssrLoadModule('/src/components/AccessoryBrands.tsx'));
});
after(() => { cleanup(); dom.window.close(); return server?.close(); });

function useFixture() {
  const oldBrands = [...catalog.brands], oldProducts = [...catalog.products];
  const brand = (id, name, extra = {}) => ({ id, name, isEquipmentBrand: true, isPublished: true, isPartner: false, ...extra });
  const item = (id, brandId, categoryId = 'equipements', status = 'PUBLISHED') => ({ ...catalog.ridingGear[0], id, name: id, brandId, categoryId, status });
  catalog.brands.splice(0, catalog.brands.length,
    brand('beta', 'Bêta'), brand('shot', 'SHOT'), brand('alpha', 'Alpha'),
    brand('hidden', 'Masquée', { isPublished: false }), brand('not-gear', 'Moto', { isEquipmentBrand: false }), brand('empty', 'Vide'));
  catalog.products.splice(0, catalog.products.length,
    item('shot-1', 'shot'), item('shot-2', 'shot', 'casques'), item('shot-3', 'shot'),
    item('alpha-1', 'alpha'), item('alpha-2', 'alpha', 'casques'),
    item('beta-1', 'beta'), item('beta-2', 'beta'),
    item('beta-draft', 'beta', 'equipements', 'DRAFT'), item('beta-archived', 'beta', 'casques', 'ARCHIVED'),
    item('beta-moto', 'beta', 'motos'), item('beta-part', 'beta', 'pieces-detachees'),
    item('hidden-1', 'hidden'), item('not-gear-1', 'not-gear'));
  return {
    item,
    restore() { catalog.brands.splice(0, catalog.brands.length, ...oldBrands); catalog.products.splice(0, catalog.products.length, ...oldProducts); },
  };
}

test('classe les marques publiées par casques et équipements publiés, puis par nom, sans modifier le catalogue', () => {
  const fixture = useFixture();
  try {
    const originalOrder = catalog.brands.map((brand) => brand.id);
    assert.deepEqual(catalog.getEquipmentBrandsByProductCount().map((brand) => brand.id), ['shot', 'alpha', 'beta', 'not-gear']);
    assert.deepEqual(catalog.brands.map((brand) => brand.id), originalOrder);
    // Une publication change immédiatement le classement et l'égalité reste alphabétique.
    catalog.products.push(fixture.item('alpha-3', 'alpha'));
    assert.deepEqual(catalog.getEquipmentBrandsByProductCount().map((brand) => brand.id), ['alpha', 'shot', 'beta', 'not-gear']);
    catalog.products.find((item) => item.id === 'alpha-1').status = 'ARCHIVED';
    assert.deepEqual(catalog.getEquipmentBrandsByProductCount().map((brand) => brand.id), ['shot', 'alpha', 'beta', 'not-gear']);
  } finally { fixture.restore(); }
});

test('la page commence par Toutes, montre le classement et respecte les choix et liens directs', async () => {
  const fixture = useFixture();
  try {
    const view = render(React.createElement(Equipements, { go() {} }));
    const brandButtons = [...view.container.querySelectorAll('button[aria-pressed]')];
    assert.deepEqual(brandButtons.map((button) => button.querySelector('span.block.truncate').textContent), ['Toutes', 'SHOT', 'Alpha', 'Bêta', 'Moto']);
    assert.equal(brandButtons[0].getAttribute('aria-pressed'), 'true');
    assert.ok(view.getByRole('heading', { name: 'Équipements' }));
    assert.ok(view.getByText(/8 références/));
    fireEvent.click(within(view.container).getByRole('button', { name: 'Alpha' }));
    assert.equal(view.getByRole('button', { name: 'Alpha' }).getAttribute('aria-pressed'), 'true');
    assert.ok(await view.findByRole('heading', { name: 'Équipements Alpha' }, { timeout: 3000 }));
    assert.ok(view.getByText(/2 références/));
    view.unmount();
    const linked = render(React.createElement(Equipements, { go() {}, initialBrand: 'beta' }));
    assert.equal(linked.getByRole('button', { name: 'Bêta' }).getAttribute('aria-pressed'), 'true');
    assert.ok(linked.getByRole('heading', { name: 'Équipements Bêta' }));
    linked.unmount();
  } finally { fixture.restore(); }
});

test('un catalogue sans équipement publié reste utilisable sans marque sélectionnée', () => {
  const fixture = useFixture();
  try {
    catalog.products.splice(0, catalog.products.length);
    assert.deepEqual(catalog.getEquipmentBrandsByProductCount(), []);
    const view = render(React.createElement(Equipements, { go() {} }));
    assert.equal(view.container.querySelectorAll('button[aria-pressed]').length, 1);
    assert.equal(view.getByRole('button', {name:'Toutes'}).getAttribute('aria-pressed'), 'true');
    assert.ok(view.getByRole('heading', { name: 'Équipements' }));
    assert.ok(view.getByText(/0 références/));
    view.unmount();
  } finally { fixture.restore(); }
});

test('toutes les marques publiées sont visibles sans sélection à l’accueil ; casques en premier et types filtrés', async () => {
  const fixture = useFixture();
  const savedTypes = [...catalog.productTypes];
  const helmet = (id, brandId, type) => ({...fixture.item(id, brandId, 'casques'), productTypeId:type});
  try {
    catalog.productTypes.splice(0, catalog.productTypes.length,
      {id:'coudiere', name:'Coudières', categoryId:'equipements'},
      {id:'integral', name:'Intégral', categoryId:'casques'},
      {id:'cross', name:'Cross', categoryId:'casques'});
    catalog.products.splice(0, catalog.products.length,
      helmet('Casque Alpha', 'alpha', 'integral'), helmet('Casque MX', 'not-gear', 'cross'),
      {...fixture.item('Coudière MX', 'not-gear'), productTypeId:'coudiere'},
      {...fixture.item('Coudière cachée', 'hidden'), productTypeId:'coudiere'},
      {...fixture.item('Brouillon MX', 'not-gear', 'equipements', 'DRAFT'), productTypeId:'coudiere'});
    const homepage = render(React.createElement(AccessoryBrandQuickLinks, {onSelect(){}}));
    assert.ok(homepage.getByRole('button', {name:'Alpha'}));
    assert.equal(homepage.queryByRole('button', {name:'Moto'}), null, 'marque décochée absente des raccourcis de l’accueil');
    homepage.unmount();
    const view = render(React.createElement(Equipements, {go(){}}));
    assert.equal(view.getByRole('button',{name:'Toutes'}).getAttribute('aria-pressed'),'true');
    assert.deepEqual(within(view.getByRole('tablist',{name:'Types des équipements'})).getAllByRole('tab').map(button=>button.textContent), ['Tous','Casques','Coudières']);
    assert.ok(view.getByText(/3 références/));
    assert.ok(await view.findByRole('heading',{name:'Coudière MX'}));
    assert.equal(view.queryByText('Coudière cachée'),null); assert.equal(view.queryByText('Brouillon MX'),null);
    fireEvent.click(view.getByRole('tab',{name:'Casques'}));
    await waitFor(()=>assert.ok(view.getByText(/2 références/)));
    assert.ok(await view.findByRole('heading',{name:'Casque Alpha'}));
    assert.ok(view.getByRole('heading',{name:'Casque MX'})); assert.equal(view.queryByRole('heading',{name:'Coudière MX'}),null);
    fireEvent.click(view.getByRole('button',{name:'Moto'}));
    await waitFor(()=>assert.ok(view.getByRole('heading',{name:'Équipements Moto'})));
    assert.equal(view.getByRole('tab',{name:'Tous'}).getAttribute('aria-selected'),'true');
    assert.ok(view.getByText(/2 références/));
    fireEvent.click(view.getByRole('tab',{name:'Coudières'}));
    assert.ok(await view.findByRole('heading',{name:'Coudière MX'}));
    assert.equal(view.queryByRole('heading',{name:'Casque MX'}),null);
    view.unmount();
    const linked = render(React.createElement(Equipements, {go(){}, initialBrand:'not-gear'}));
    assert.equal(linked.getByRole('button',{name:'Moto'}).getAttribute('aria-pressed'),'true');
    assert.ok(linked.getByRole('heading',{name:'Équipements Moto'})); linked.unmount();
    catalog.brands.find(brand=>brand.id==='not-gear').isEquipmentBrand=true;
    const enabledHome = render(React.createElement(AccessoryBrandQuickLinks, {onSelect(){}}));
    assert.ok(enabledHome.getByRole('button',{name:'Moto'})); enabledHome.unmount();
  } finally { cleanup(); catalog.productTypes.splice(0,catalog.productTypes.length,...savedTypes); fixture.restore(); }
});

test('casques absents : seuls les types publiés apparaissent et les pages reviennent à la première sélection', async () => {
  const fixture=useFixture(); const savedTypes=[...catalog.productTypes];
  try {
    catalog.productTypes.splice(0,catalog.productTypes.length,{id:'coudiere',name:'Coudières',categoryId:'equipements'});
    catalog.products.splice(0,catalog.products.length,...Array.from({length:10},(_,i)=>({...fixture.item(`Coudière ${i}`, 'not-gear'),productTypeId:'coudiere'})));
    const view=render(React.createElement(Equipements,{go(){}}));
    assert.deepEqual(within(view.getByRole('tablist',{name:'Types des équipements'})).getAllByRole('tab').map(b=>b.textContent),['Tous','Coudières']);
    fireEvent.click(view.getByRole('button',{name:'Page 2'}));
    assert.ok(view.getByText(/page 2\/2/));
    fireEvent.click(view.getByRole('tab',{name:'Coudières'}));
    assert.ok(view.getByText(/page 1\/2/));
    fireEvent.click(view.getByRole('button',{name:'Moto'}));
    await waitFor(()=>assert.equal(view.getByRole('tab',{name:'Tous'}).getAttribute('aria-selected'),'true'));
    assert.ok(view.getByText(/page 1\/2/)); view.unmount();
  } finally { cleanup(); catalog.productTypes.splice(0,catalog.productTypes.length,...savedTypes); fixture.restore(); }
});
