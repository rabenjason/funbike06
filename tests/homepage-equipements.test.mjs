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
function sectionEquipements() {
  const html = renderToStaticMarkup(React.createElement(Home, { go() {} }));
  const title = html.indexOf("Prêt pour la suite.");
  assert.notEqual(title, -1);
  return html.slice(html.lastIndexOf("<section", title), html.indexOf("</section>", title) + "</section>".length);
}

test("les casques et équipements possèdent un indicateur de sélection pour l'accueil", () => {
  for (const product of [...data.helmets, ...data.ridingGear]) assert.equal(typeof product.isEquipementAccueil, "boolean", product.id);
  const selection = data.getEquipementsAccueil();
  assert.deepEqual(selection.map(({ id }) => id), ["tvs-helmet-raider", "tvs-helmet-anti-matter", "tvs-jacket-tech-core", "tvs-gloves-city"]);
  const html = sectionEquipements();
  assert.equal((html.match(/<article\b/g) ?? []).length, 4);
  for (const product of selection) assert.ok(html.includes(escapeHtml(product.name)));
  assert.ok(!html.includes("Pneu avant route TVS"));
});

test("la sélection ne retient que quatre casques ou équipements publiés et marqués", () => {
  const base = data.helmets[0];
  const product = (id, flag, status = "PUBLISHED", categoryId = "casques") => ({ ...base, id, isEquipementAccueil: flag, status, categoryId });
  const catalog = [product("a", false), product("b", true, "DRAFT"), product("c", true, "ARCHIVED"), product("d", true, "PUBLISHED", "pieces-detachees"), product("e", true), product("f", true, "PUBLISHED", "equipements"), product("g", true), product("h", true), product("i", true)];
  assert.deepEqual(data.getEquipementsAccueil(catalog).map(({ id }) => id), ["e", "f", "g", "h"]);
  assert.deepEqual(data.getEquipementsAccueil(catalog.slice(0, 4)), []);
});

test("les cartes suivent la sélection et ne dépendent pas des nouveautés", () => {
  const all = [...data.helmets, ...data.ridingGear];
  const flags = all.map((product) => product.isEquipementAccueil);
  const arrivals = data.getNewArrivals().map(({ id }) => id);
  const chosen = data.ridingGear.find((product) => product.id === "tvs-jacket-aegis");
  try {
    all.forEach((product) => { product.isEquipementAccueil = false; });
    let html = sectionEquipements();
    assert.equal((html.match(/<article\b/g) ?? []).length, 0);
    assert.ok(html.includes("Voir tous les équipements"));
    chosen.isEquipementAccueil = true;
    html = sectionEquipements();
    assert.equal((html.match(/<article\b/g) ?? []).length, 1);
    assert.ok(html.includes(escapeHtml(chosen.name)));
    assert.ok(html.includes(escapeHtml(data.mainProductImage(chosen).url)));
    assert.ok(!html.includes(escapeHtml(data.spareParts.find((part) => part.id === "tvs-part-tyre-front").name)));
    assert.deepEqual(data.getNewArrivals().map(({ id }) => id), arrivals);
  } finally {
    all.forEach((product, index) => { product.isEquipementAccueil = flags[index]; });
  }
});
