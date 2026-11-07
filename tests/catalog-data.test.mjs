import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

let server;
let data;
let Catalogue;
let Equipements;
let AccessoryDetail;

before(async () => {
  server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  data = await server.ssrLoadModule("/src/data/index.ts");
  ({ Catalogue, Equipements } = await server.ssrLoadModule("/src/pages/Catalog.tsx"));
  AccessoryDetail = (await server.ssrLoadModule("/src/pages/AccessoryDetail.tsx")).default;
});
after(async () => { await server?.close(); });

const escapeHtml = (text) => renderToStaticMarkup(React.createElement("span", null, text)).slice(6, -7);
const go = () => {};

test("le catalogue regroupe toujours les motos, pièces, casques et équipements existants", () => {
  const expected = [...data.motorcycles, ...data.spareParts, ...data.helmets, ...data.ridingGear];
  assert.deepEqual(data.products, expected);
  assert.ok(expected.length > 0);
  for (const product of expected) {
    assert.equal(data.findProductById(product.id), product);
    assert.ok(data.categories.some(({ id }) => id === product.categoryId), product.id);
    assert.ok(data.productTypes.some(({ id }) => id === product.productTypeId), product.id);
  }
  assert.ok(!data.categories.some(({ id }) => id === "accessoires"));
  assert.ok(!data.productTypes.some(({ id }) => id === "accessoire-moto"));
});

test("la recherche du catalogue retrouve les pièces, casques et vêtements existants", () => {
  for (const product of [data.spareParts[0], data.helmets[0], data.ridingGear[0]]) {
    const html = renderToStaticMarkup(React.createElement(Catalogue, { go, initialQuery: product.name }));
    assert.ok(html.includes(escapeHtml(product.name)), product.id);
  }
});

test("les pages d'équipements et les fiches des produits non-moto restent accessibles", () => {
  const gearHtml = renderToStaticMarkup(React.createElement(Equipements, { go, initialBrand: "tvs" }));
  assert.ok(gearHtml.includes("Équipements TVS"));
  for (const product of [data.spareParts[0], data.helmets[0], data.ridingGear[0]]) {
    const html = renderToStaticMarkup(React.createElement(AccessoryDetail, { id: product.id, go, back() {}, canGoBack: true, backLabel: "Accueil" }));
    assert.ok(html.includes(escapeHtml(product.name)), product.id);
    assert.equal(data.productDetailPage(product), "accessory");
  }
});
