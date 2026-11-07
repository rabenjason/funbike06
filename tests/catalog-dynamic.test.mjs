import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

let server, data, Catalogue, Equipements, Spares, Product;
const render = (component, props = {}) => renderToStaticMarkup(React.createElement(component, { go() {}, ...props }));
before(async () => {
  server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  data = await server.ssrLoadModule("/src/data/index.ts");
  ({ Catalogue, Equipements, Spares } = await server.ssrLoadModule("/src/pages/Catalog.tsx"));
  Product = (await server.ssrLoadModule("/src/pages/Product.tsx")).default;
});
after(async () => { await server?.close(); });

test("les motos tirent leur famille de leur type et conservent leur classification", () => {
  const expected = { "tvs-125-hlx-5g": "Urbain", "sherco-sef-300-factory-2026": "Off-road", "tuktuk": "3 roues", "offroad-trail": "Off-road" };
  for (const bike of data.motorcycles) {
    const type = data.productTypes.find((item) => item.id === bike.productTypeId);
    assert.equal(type?.categoryId, "motos", bike.id);
    assert.ok(data.getProductFamily(bike), bike.id);
    if (expected[bike.id]) assert.equal(data.getProductFamily(bike).name, expected[bike.id]);
  }
  const bike = data.motorcycles.find(({ id }) => id === "sherco-sef-300-factory-2026");
  assert.match(render(Product, { id: bike.id, back() {} }), /Off-road/);
});

test("une nouvelle famille et un nouveau type créent le filtre uniquement avec une moto publiée", () => {
  const family = { id: "scooter-test", name: "Scooter Test", categoryId: "motos" };
  const type = { id: "scooter-test", name: "Scooter Test", categoryId: "motos", familyId: family.id };
  const bike = { ...data.motorcycles[0], id: "moto-test", productTypeId: type.id, status: "DRAFT" };
  try {
    data.families.push(family); data.productTypes.push(type); data.motorcycles.push(bike);
    assert.equal(data.getProductFamily(bike), family);
    assert.ok(!render(Catalogue, { motosOnly: true }).includes(family.name));
    bike.status = "PUBLISHED";
    assert.ok(render(Catalogue, { motosOnly: true }).includes(family.name));
    assert.ok(data.getAvailableMotoFamilies(data.motorcycles).includes(family));
    bike.status = "ARCHIVED";
    assert.ok(!data.getAvailableMotoFamilies(data.motorcycles).includes(family));
  } finally { data.motorcycles.pop(); data.productTypes.pop(); data.families.pop(); }
});

test("les filtres équipements suivent les marques et types réellement publiés", () => {
  const brand = { id: "test-equip", name: "Marque Essai", isEquipmentBrand: true };
  const type = { id: "test-tenue", name: "Tenue Essai", categoryId: "equipements" };
  const item = { ...data.ridingGear[0], id: "test-vetement", brandId: brand.id, productTypeId: type.id, status: "DRAFT" };
  try {
    data.brands.push(brand); data.productTypes.push(type); data.products.push(item);
    assert.ok(!data.getAvailableEquipmentBrands().includes(brand));
    item.status = "PUBLISHED";
    assert.ok(data.getAvailableEquipmentBrands().includes(brand));
    const html = render(Equipements, { initialBrand: brand.id });
    assert.ok(html.includes(brand.name));
    assert.ok(html.includes(type.name));
    assert.ok(!html.includes("Équipements &amp; accessoires Bihr"));
    item.status = "ARCHIVED";
    assert.ok(!data.getAvailableEquipmentBrands().includes(brand));
  } finally { data.products.pop(); data.productTypes.pop(); data.brands.pop(); }
});

test("les filtres pièces suivent les types et les marques fabricant ou compatibles sans panneau Bihr", () => {
  const brand = { id: "test-pieces", name: "Marque Pièces Test", isEquipmentBrand: false };
  const type = { id: "test-piece-type", name: "Pièce Test", categoryId: "pieces-detachees" };
  const part = { ...data.spareParts[0], id: "piece-test", brandId: "unknown-brand", compatibleBrandIds: [brand.id], productTypeId: type.id, status: "PUBLISHED" };
  try {
    data.brands.push(brand); data.productTypes.push(type); data.spareParts.push(part);
    let html = render(Spares, { initialBrand: brand.id });
    assert.ok(html.includes(brand.name)); assert.ok(html.includes(type.name));
    assert.ok(!html.includes("Pièces &amp; consommables Bihr"));
    part.compatibleBrandIds = []; part.brandId = brand.id;
    assert.ok(data.getAvailableSpareBrands(data.spareParts).includes(brand));
    part.status = "DRAFT";
    html = render(Spares);
    assert.ok(!html.includes(brand.name)); assert.ok(!html.includes(type.name));
  } finally { data.spareParts.pop(); data.productTypes.pop(); data.brands.pop(); }
});
