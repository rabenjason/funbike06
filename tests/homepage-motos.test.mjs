import { seedCatalog } from "./helpers/catalog.mjs";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

let server;
let data;
let Home;
let BikeCard;

before(async () => {
  server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  data = await server.ssrLoadModule("/src/catalog/index.ts");
  await seedCatalog(server);
  Home = (await server.ssrLoadModule("/src/pages/Home.tsx")).default;
  BikeCard = (await server.ssrLoadModule("/src/components/Cards.tsx")).BikeCard;
});
after(async () => { await server?.close(); });

const escapeHtml = (text) => renderToStaticMarkup(React.createElement("span", null, text)).slice(6, -7);
function renderMotosSection() {
  const html = renderToStaticMarkup(React.createElement(Home, { go() {} }));
  const title = html.indexOf("À chaque terrain, sa machine.");
  assert.notEqual(title, -1);
  return html.slice(html.lastIndexOf("<section", title), html.indexOf("</section>", title) + "</section>".length);
}

test("chaque moto possède son indicateur et les motos choisies sont distinctes des nouveautés", () => {
  for (const bike of data.motorcycles) assert.equal(typeof bike.isMotoAccueil, "boolean", bike.id);
  const motos = data.getMotosAccueil();
  assert.deepEqual(motos.map(({ id }) => id), ["tvs-125-hlx-5g", "sherco-sef-300-factory-2026", "offroad-trail"]);
  assert.ok(motos.every((bike) => !data.getNewArrivals().some((product) => product.id === bike.id)));
});

test("la sélection accepte uniquement les motos publiées marquées et s'arrête à trois", () => {
  const base = data.motorcycles[0];
  const product = (id, flag, status = "PUBLISHED", categoryId = "motos") => ({ ...base, id, isMotoAccueil: flag, status, categoryId });
  const catalog = [product("a", false), product("b", true, "DRAFT"), product("c", true, "ARCHIVED"), product("d", true, "PUBLISHED", "casques"), product("e", true), product("f", true), product("g", true), product("h", true)];
  assert.deepEqual(data.getMotosAccueil(catalog).map(({ id }) => id), ["e", "f", "g"]);
  assert.deepEqual(data.getMotosAccueil(catalog.slice(0, 4)), []);
  assert.deepEqual(data.getMotosAccueil([product("e", true)]).map(({ id }) => id), ["e"]);
});

test("les cartes motos suivent leur propre sélection indépendamment des nouveautés et du bandeau", () => {
  const flags = data.motorcycles.map((bike) => bike.isMotoAccueil);
  const initialNewArrivals = data.getNewArrivals().map(({ id }) => id);
  const initialHero = data.getHomepageHeroProducts().map(({ id }) => id);
  const chosen = data.motorcycles.find((bike) => bike.id === "tvs-200-4v");
  try {
    data.motorcycles.forEach((bike) => { bike.isMotoAccueil = false; });
    let html = renderMotosSection();
    assert.ok(!html.includes(escapeHtml(chosen.name)));
    assert.ok(html.includes("Toutes les motos"));
    chosen.isMotoAccueil = true;
    html = renderMotosSection();
    assert.ok(html.includes(escapeHtml(chosen.name)));
    assert.ok(html.includes(escapeHtml(data.mainProductImage(chosen).url)));
    assert.deepEqual(data.getMotosAccueil().map(({ id }) => id), [chosen.id]);
    assert.deepEqual(data.getNewArrivals().map(({ id }) => id), initialNewArrivals);
    assert.deepEqual(data.getHomepageHeroProducts().map(({ id }) => id), initialHero);
    assert.ok(data.getNewArrivals().some(({ id }) => id === chosen.id), "un produit peut être sélectionné dans les deux sections");
  } finally {
    data.motorcycles.forEach((bike, index) => { bike.isMotoAccueil = flags[index]; });
  }
});


test("les cartes motos de l'accueil conservent des espaces réguliers pour les titres, descriptions et actions", () => {
  const html = renderMotosSection();
  const cards = html.match(/<article\b[\s\S]*?<\/article>/g) ?? [];
  assert.equal(cards.length, data.getMotosAccueil().length);
  for (const card of cards) {
    assert.match(card, /<h3[^>]*line-clamp-2 min-h-\[2\.1em\]/);
    assert.match(card, /<p[^>]*line-clamp-2[^>]*min-h-\[3\.2em\]/);
    assert.match(card, /class="[^"]*mt-auto pt-5/);
  }
});

test("la forme reste stable pour des noms et descriptions de longueurs différentes", () => {
  const base = data.motorcycles[0];
  for (const bike of [
    { ...base, name: "Moto", description: "" },
    { ...base, name: "Une moto avec un nom particulièrement long et plusieurs mots pour le pilote", description: "Une description longue. ".repeat(20), price: "Tarif sur demande auprès de l'équipe" },
  ]) {
    const html = renderToStaticMarkup(React.createElement(BikeCard, { bike, go() {}, uniformLayout: true }));
    assert.ok(html.includes(escapeHtml(bike.name)));
    assert.match(html, /title="[^"]+"[^>]*line-clamp-2 min-h-\[2\.1em\]/);
    assert.match(html, /<p[^>]*line-clamp-2[^>]*min-h-\[3\.2em\]/);
    assert.match(html, /mt-auto pt-5/);
    assert.match(html, /max-w-\[45%\] break-words text-right/);
  }
  const otherPage = renderToStaticMarkup(React.createElement(BikeCard, { bike: base, go() {} }));
  assert.ok(!otherPage.includes("min-h-[2.1em]"), "les autres pages gardent leur présentation actuelle");
});
