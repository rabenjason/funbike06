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

test("les sélections pointent vers des produits et leurs données de catalogue", () => {
  for (const highlight of data.homepageHighlights) {
    const product = data.findProductById(highlight.productId);
    assert.ok(product, `Produit absent : ${highlight.productId}`);
    assert.ok(data.brands.some(({ id }) => id === product.brandId), product.id);
    assert.ok(data.productTypes.some(({ id }) => id === product.productTypeId), product.id);
    if (product.modelId) {
      const model = data.models.find(({ id }) => id === product.modelId);
      assert.ok(model, product.id);
      assert.equal(model.brandId, product.brandId, product.id);
    }
    assert.ok(data.mainProductImage(product)?.isMain, product.id);
  }
});

test("les cartes affichent les données du produit, son type et les puces éditoriales", () => {
  const html = renderToStaticMarkup(React.createElement(NewArrivals, { go() {} }));
  for (const highlight of data.homepageHighlights) {
    const product = data.findProductById(highlight.productId);
    const brand = data.brands.find(({ id }) => id === product.brandId);
    const type = data.productTypes.find(({ id }) => id === product.productTypeId);
    assert.ok(html.includes(`${brand.name} / ${type.name}`));
    assert.ok(html.includes(product.name));
    if (product.description) {
      const characters = Array.from(product.description);
      const preview = characters.length <= 112 ? product.description : `${characters.slice(0, 109).join("").trimEnd()}...`;
      assert.ok(html.includes(renderToStaticMarkup(React.createElement("span", null, preview)).slice(6, -7)));
    }
    assert.ok(html.includes(product.price ?? "Sur devis"));
    assert.ok(html.includes(data.mainProductImage(product).url.replaceAll("&", "&amp;")));
    for (const bullet of highlight.bullets) assert.ok(html.includes(bullet));
  }
});

test("les informations des puces figurent aussi dans les spécifications", () => {
  const expectations = {
    "sherco-sef-250-factory-2026": [/KYB/i, /Galfer/i, /Deux cartographies/i],
    "tvs-200-4v": [/ABS/i, /Sport \/ Urbain \/ Pluie/i, /Tableau de bord.*Digital/i],
    t1: [/Coque.*Légère/i, /Ventilation.*Travaillée/i, /Graphismes.*Inédits/i],
  };
  for (const [id, patterns] of Object.entries(expectations)) {
    const specs = data.findProductById(id).specifications.map(({ key, value }) => `${key} : ${value}`).join("\n");
    for (const pattern of patterns) assert.match(specs, pattern, id);
  }
});
