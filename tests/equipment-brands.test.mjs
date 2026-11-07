import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

let server;
let data;
let Equipements;
let AccessoryBrandQuickLinks;
let AccessoryBrandSelector;

before(async () => {
  server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  data = await server.ssrLoadModule("/src/data/index.ts");
  ({ Equipements } = await server.ssrLoadModule("/src/pages/Catalog.tsx"));
  ({ AccessoryBrandQuickLinks, AccessoryBrandSelector } = await server.ssrLoadModule("/src/components/AccessoryBrands.tsx"));
});
after(async () => { await server?.close(); });

const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));
function descendants(element) {
  if (Array.isArray(element)) return element.flatMap(descendants);
  if (!React.isValidElement(element)) return [];
  return [element, ...descendants(element.props.children)];
}

test("les marques d'équipements proviennent du catalogue et de leur indicateur", () => {
  for (const brand of data.brands) assert.equal(typeof brand.isEquipmentBrand, "boolean", brand.id);
  assert.deepEqual(new Set(data.getEquipmentBrands().map(({ id }) => id)), new Set(["troy-lee-designs", "gaerne", "mt-helmets", "tvs", "bihr"]));
  const html = render(AccessoryBrandQuickLinks, { onSelect() {} });
  for (const brand of data.getAvailableEquipmentBrands()) {
    assert.ok(html.includes(brand.name), brand.id);
    if (brand.logo) assert.ok(html.includes(brand.logo.replaceAll("&", "&amp;")), brand.id);
  }
});

test("seuls les casques et équipements publiés de la marque sont sélectionnés", () => {
  const base = data.helmets[0];
  const item = (id, brandId, categoryId, status = "PUBLISHED") => ({ ...base, id, brandId, categoryId, status });
  const catalog = [item("casque", "x", "casques"), item("blouson", "x", "equipements"), item("moto", "x", "motos"), item("piece", "x", "pieces-detachees"), item("autre", "y", "casques"), item("brouillon", "x", "casques", "DRAFT"), item("archive", "x", "equipements", "ARCHIVED")];
  assert.deepEqual(data.getEquipmentProducts("x", catalog).map(({ id }) => id), ["casque", "blouson"]);
  assert.deepEqual(data.getEquipmentProducts("absente", catalog), []);
});

test("une nouvelle marque et ses produits sont utilisés sans autre liste", () => {
  const brand = { id: "test-marque", name: "Marque Test", isEquipmentBrand: true };
  const product = { ...data.helmets[0], id: "test-produit", brandId: brand.id, name: "Casque Test" };
  try {
    data.brands.push(brand);
    data.products.push(product);
    assert.ok(data.getEquipmentBrands().includes(brand));
    assert.ok(data.getEquipmentProducts(brand.id).includes(product));
    const quick = AccessoryBrandQuickLinks({ onSelect: (id) => { chosen = id; } });
    const buttons = descendants(quick).filter((element) => element.props?.onClick);
    let chosen;
    const button = buttons.find((element) => element.key === brand.id);
    assert.ok(button);
    button.props.onClick();
    assert.equal(chosen, brand.id);
    const quickHtml = render(AccessoryBrandQuickLinks, { onSelect() {} });
    assert.ok(quickHtml.includes("Marque Test"));
    assert.ok(!quickHtml.includes('src=""'));
    const page = render(Equipements, { go() {}, initialBrand: brand.id });
    assert.ok(page.includes("Équipements Marque Test"));
    assert.ok(page.includes("1 références"));
    brand.isEquipmentBrand = false;
    assert.ok(!render(AccessoryBrandQuickLinks, { onSelect() {} }).includes("Marque Test"));
  } finally {
    data.brands.pop();
    data.products.pop();
  }
});

test("les anciens liens tld et mt continuent à ouvrir la bonne marque", () => {
  for (const [alias, name] of [["tld", "Troy Lee Designs"], ["mt", "MT Helmets"]]) {
    const html = render(Equipements, { go() {}, initialBrand: alias });
    const selector = html.match(/<button[^>]*aria-pressed="true"[^>]*>[\s\S]*?<\/button>/)?.[0];
    assert.ok(selector?.includes(name), alias);
  }
  const bihr = render(Equipements, { go() {}, initialBrand: "bihr" });
  assert.ok(!bihr.includes("Équipements &amp; accessoires Bihr"));
  assert.ok(!data.getAvailableEquipmentBrands().some(({ id }) => id === "bihr"));
  const selected = render(AccessoryBrandSelector, { active: "tvs", onSelect() {} });
  assert.match(selected, /aria-pressed="true"/);
});
