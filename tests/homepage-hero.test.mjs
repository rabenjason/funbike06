import { seedCatalog } from "./helpers/catalog.mjs";
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
  data = await server.ssrLoadModule("/src/catalog/index.ts");
  await seedCatalog(server);
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
  const images = hero.match(/<img[^>]*>/g) ?? [];
  assert.equal(images.length, 1, "une seule image pour tout le bandeau");
  assert.ok(images[0].includes("object-cover"), "l'image remplit le bandeau");
  assert.ok(images[0].includes(escapeHtml(data.mainProductImage(bike).url)));
  assert.ok(!images[0].includes("blur-2xl"));
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

test('partenaires et marques exclusives suivent deux choix distincts et les marques publiées', () => {
  const snapshot = structuredClone(data.brands);
  try {
    data.brands.splice(0, data.brands.length,
      { id: 'tvs', name: 'TVS', logo: '/tvs.png', isEquipmentBrand: true },
      { id: 'sherco', name: 'Sherco', logo: '/sherco.png', isEquipmentBrand: false, isPublished: false, isPartner: true },
      { id: 'partenaire-test', name: 'Partenaire Test', logo: '/partner.png', isEquipmentBrand: false, isPartner: true },
      { id: 'sans-logo', name: 'Sans logo', isEquipmentBrand: false, isPartner: true },
    );
    let html = renderToStaticMarkup(React.createElement(Home, { go() {} }));
    assert.ok(html.includes('Nos partenaires'));
    assert.ok(html.includes('Logo Partenaire Test'));
    assert.ok(!html.includes('Logo Sans logo'));
    assert.ok(!html.includes('Logo Sherco'));
    assert.ok(html.includes('Logo TVS'), 'marque exclusive publiée même sans statut partenaire');
    assert.ok(!html.includes('L’univers Sherco'));
    data.brands.find((b) => b.id === 'partenaire-test').isPublished = false;
    html = renderToStaticMarkup(React.createElement(Home, { go() {} }));
    assert.ok(!html.includes('Nos partenaires'), 'section vide masquée');
    assert.ok(html.includes('Logo TVS'), 'la section exclusive reste indépendante');
    data.brands.splice(0, data.brands.length, { id: 'partenaire-test', name: 'Partenaire Test', logo: '/partner.png', isEquipmentBrand: false, isPartner: true });
    html = renderToStaticMarkup(React.createElement(Home, { go() {} }));
    assert.ok(html.includes('Nos partenaires'));
    assert.ok(!html.includes('Distributeur exclusif / Madagascar'), 'un partenaire ne devient pas automatiquement exclusif');
  } finally { data.brands.splice(0, data.brands.length, ...snapshot); }
});


test('le conseiller ne propose pas les marques retirées du catalogue public', async () => {
  const { respond, initialQuick, EMPTY_MEMORY } = await server.ssrLoadModule('/src/lib/assistant.ts');
  const snapshot = structuredClone(data.brands);
  try {
    data.brands.splice(0, data.brands.length, ...snapshot.filter((b) => !['tvs', 'sherco', 'gaerne'].includes(b.id)));
    assert.ok(!initialQuick().some((text) => /sherco/i.test(text)));
    for (const question of ['prix casque tvs', 'casque tvs', 'pièces tvs', 'quels équipements', 'catalogue', 'taille casque']) {
      const reply = respond(question, EMPTY_MEMORY).reply;
      assert.doesNotMatch([reply.text, ...(reply.quick ?? []), ...(reply.actions ?? []).map((a) => a.label)].join(' '), /\b(tvs|sherco|gaerne)\b/i);
    }
  } finally { data.brands.splice(0, data.brands.length, ...snapshot); }
});
