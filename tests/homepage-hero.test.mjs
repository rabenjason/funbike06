import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

let server;
let data;
let Home;

before(async () => {
  server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  data = await server.ssrLoadModule("/src/data/index.ts");
  Home = (await server.ssrLoadModule("/src/pages/Home.tsx")).default;
});

after(async () => { await server?.close(); });

const escapeHtml = (text) => renderToStaticMarkup(React.createElement("span", null, text)).slice(6, -7);
const renderHero = () => {
  const html = renderToStaticMarkup(React.createElement(Home, { go() {} }));
  return html.slice(html.indexOf("<section"), html.indexOf("</section>") + "</section>".length);
};

test("toutes les motos possèdent le champ de sélection et les trois motos choisies apparaissent", () => {
  for (const bike of data.motorcycles) assert.equal(typeof bike.isHomepageHero, "boolean", bike.id);
  assert.deepEqual(new Set(data.getHomepageHeroProducts().map(({ id }) => id)), new Set([
    "tvs-200-4v", "sherco-sef-250-factory-2026", "xx-125-2026",
  ]));
});

test("le bandeau sélectionne au maximum trois motos publiées et marquées, dans l'ordre du catalogue", () => {
  const base = data.motorcycles[0];
  const make = (id, flag, status = "PUBLISHED", categoryId = "motos") => ({ ...base, id, status, categoryId, isHomepageHero: flag });
  const items = [make("a", false), make("b", true, "DRAFT"), make("c", true, "ARCHIVED"), make("d", true, "PUBLISHED", "casques"), make("e", true), make("f", true), make("g", true), make("h", true)];
  assert.deepEqual(data.getHomepageHeroProducts(items).map(({ id }) => id), ["e", "f", "g"]);
  assert.deepEqual(data.getHomepageHeroProducts(items.slice(0, 4)), []);
  assert.deepEqual(data.getHomepageHeroProducts([make("a", true)]).map(({ id }) => id), ["a"]);
});

test("le bandeau utilise le nom, la marque et l'image du produit sélectionné", () => {
  const bike = data.getHomepageHeroProducts()[0];
  const brand = data.brands.find(({ id }) => id === bike.brandId);
  const hero = renderHero();
  assert.ok(hero.includes(escapeHtml(bike.name)));
  assert.ok(hero.includes(escapeHtml(brand.name)));
  assert.ok(hero.includes(escapeHtml(data.mainProductImage(bike).url)));
  assert.match(hero, /<img[^>]*class="[^"]*object-contain[^"]*"/);
  assert.equal((hero.match(/aria-pressed=/g) ?? []).length, 3);
});

test("le bandeau s'adapte aux changements et reste utilisable sans moto sélectionnée", () => {
  const selected = data.motorcycles.map((bike) => bike.isHomepageHero);
  try {
    data.motorcycles.forEach((bike) => { bike.isHomepageHero = false; });
    const empty = renderHero();
    assert.ok(empty.includes("Explorer le catalogue"));
    assert.ok(!empty.includes("hero-secondary-cta"));
    assert.ok(!empty.includes("aria-pressed="));
    const bike = data.motorcycles.find((item) => item.status === "PUBLISHED" && item.brandId === "tvs");
    bike.isHomepageHero = true;
    const hero = renderHero();
    assert.ok(hero.includes(escapeHtml(bike.name)));
    assert.ok(hero.includes("TVS"));
    assert.equal((hero.match(/aria-pressed=/g) ?? []).length, 1);
    assert.match(hero, />01<\/span>/);
  } finally {
    data.motorcycles.forEach((bike, index) => { bike.isHomepageHero = selected[index]; });
  }
});
