import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

let server;
let data;
let NewArrivals;

before(async () => {
  server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  data = await server.ssrLoadModule("/src/data/index.ts");
  NewArrivals = (await server.ssrLoadModule("/src/components/NewArrivals.tsx")).default;
});

after(async () => {
  await server?.close();
});

const escapeHtml = (text) => renderToStaticMarkup(React.createElement("span", null, text)).slice(6, -7);
const render = () => renderToStaticMarkup(React.createElement(NewArrivals, { go() {} }));

// Parcourt les éléments JSX avant leur rendu pour tester les deux boutons de chaque carte.
function descendants(element) {
  if (Array.isArray(element)) return element.flatMap(descendants);
  if (!React.isValidElement(element)) return [];
  return [element, ...descendants(element.props.children)];
}

test("chaque produit du catalogue possède un indicateur de mise en avant", () => {
  for (const product of data.products) {
    assert.equal(typeof product.isHomepageHighlight, "boolean", product.id);
  }
});

test("les produits publiés marqués sont limités aux trois premiers, dans l'ordre du catalogue", () => {
  const base = data.products[0];
  const product = (id, flag, status = "PUBLISHED") => ({ ...base, id, isHomepageHighlight: flag, status });
  const catalog = [product("a", false), product("b", true, "DRAFT"), product("c", true), product("d", true), product("e", true), product("f", true), product("g", true, "ARCHIVED")];
  assert.deepEqual(data.getHomepageHighlights(catalog).map(({ id }) => id), ["c", "d", "e"]);
  assert.deepEqual(data.getHomepageHighlights([product("a", false), product("b", true, "DRAFT")]), []);
  assert.deepEqual(data.getHomepageHighlights([product("a", true)]).map(({ id }) => id), ["a"]);
});

test("les cartes reprennent les données et les trois premières spécifications du produit", () => {
  const selected = data.getHomepageHighlights();
  assert.deepEqual(new Set(selected.map(({ id }) => id)), new Set(["sherco-sef-250-factory-2026", "tvs-200-4v", "t1"]));
  const html = render();
  for (const product of selected) {
    const brand = data.brands.find(({ id }) => id === product.brandId);
    const type = data.productTypes.find(({ id }) => id === product.productTypeId);
    assert.ok(brand && type, product.id);
    if (product.modelId) {
      const model = data.models.find(({ id }) => id === product.modelId);
      assert.ok(model, product.id);
      assert.equal(model.brandId, product.brandId);
    }
    assert.ok(html.includes(escapeHtml(`${brand.name} / ${type.name}`)));
    assert.ok(html.includes(escapeHtml(product.name)));
    assert.ok(data.mainProductImage(product)?.isMain);
    assert.ok(html.includes(escapeHtml(data.mainProductImage(product).url)));
    assert.ok(html.includes(escapeHtml(product.price ?? "Sur devis")));
    if (product.description) {
      const characters = Array.from(product.description);
      const preview = characters.length <= 112 ? product.description : `${characters.slice(0, 109).join("").trimEnd()}...`;
      assert.ok(html.includes(escapeHtml(preview)));
    }
    for (const { key, value } of product.specifications.slice(0, 3)) {
      assert.ok(html.includes(escapeHtml(`${key} : ${value}`)), `${product.id} : ${key}`);
    }
  }
});

test("la sélection et les spécifications changent avec les données du catalogue", () => {
  const initial = data.getHomepageHighlights()[0];
  const replacement = data.products.find((product) => !product.isHomepageHighlight && product.status === "PUBLISHED");
  const oldSpecs = replacement.specifications;
  const oldHighlight = replacement.isHomepageHighlight;
  try {
    initial.isHomepageHighlight = false;
    replacement.isHomepageHighlight = true;
    replacement.specifications = [{ key: "Test dynamique", value: "Valeur modifiée" }];
    const html = render();
    assert.ok(!html.includes(escapeHtml(initial.name)));
    assert.ok(html.includes(escapeHtml(replacement.name)));
    assert.ok(html.includes("Test dynamique : Valeur modifiée"));
    replacement.specifications = [];
    assert.ok(!render().includes("Test dynamique : Valeur modifiée"));
  } finally {
    initial.isHomepageHighlight = true;
    replacement.isHomepageHighlight = oldHighlight;
    replacement.specifications = oldSpecs;
  }
});

test("l'image et le bouton ouvrent la fiche du produit correspondant", () => {
  const calls = [];
  const tree = NewArrivals({ go: (page, id) => calls.push({ page, id }) });
  const elements = descendants(tree);
  for (const product of data.getHomepageHighlights()) {
    const card = elements.find((element) => element.key === product.id);
    assert.ok(card, product.id);
    const buttons = descendants(card).filter((element) => element.type === "button");
    assert.equal(buttons.length, 2, product.id);
    for (const button of buttons) button.props.onClick();
    const expected = { page: product.categoryId === "motos" ? "product" : "accessory", id: product.id };
    assert.deepEqual(calls.splice(0), [expected, expected]);
  }
});
