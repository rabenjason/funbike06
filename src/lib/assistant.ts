import { brands, products, categories, productTypes, models, getProductFamily } from "../catalog";
import { CONTACT_EMAIL, CONTACT_PHONE, CONTACT_ADDRESS, CONTACT_HOURS } from "../catalog/contact";
import { DEALERS } from "../catalog/dealers";
import type { Product } from "../types/product";

export type ChatActionIcon = "catalog" | "contact" | "parts" | "phone" | "product" | "gear";
export type ChatAction = { label: string; page: string; id?: string; icon?: ChatActionIcon };
export type BotReply = { text: string; productIds?: string[]; reasons?: Record<string, string>; compare?: [string, string]; actions?: ChatAction[]; quick?: string[] };
export type Memory = {
  name?: string;
  lastIds: string[];
  misses: number;
  results?: string[];
  resultOffset?: number;
  resultTitle?: string;
  resultReasons?: Record<string, string>;
  waitingForUsage?: boolean;
  usageBrandId?: string;
  usageNumbers?: string[];
  pendingIntent?: "price" | "stock";
};
export const EMPTY_MEMORY: Memory = { lastIds: [], misses: 0 };

export function norm(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/['’]/g, " ").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}
const words = (s: string) => norm(s).split(" ").filter(Boolean);
const stem = (s: string) => s.length > 4 && s.endsWith("s") ? s.slice(0, -1) : s;
const contains = (text: string, expression: string) => (` ${norm(text)} `).includes(` ${norm(expression)} `);
const any = (text: string, expressions: string[]) => expressions.some((s) => contains(text, s));
const brandOf = (p: Product) => brands.find((b) => b.id === p.brandId && b.isPublished !== false);
const visible = () => products.filter((p) => p.status === "PUBLISHED" && !!brandOf(p));
const byId = (id: string) => visible().find((p) => p.id === id);
const typeName = (p: Product) => productTypes.find((t) => t.id === p.productTypeId && t.categoryId === p.categoryId)?.name ?? "";
const modelName = (p: Product) => models.find((m) => m.id === p.modelId && m.brandId === p.brandId)?.name ?? "";
const categoryName = (p: Product) => categories.find((c) => c.id === p.categoryId)?.name ?? p.categoryId;
const productText = (p: Product) => [p.name, brandOf(p)?.name, modelName(p), typeName(p), getProductFamily(p)?.name, categoryName(p), p.description, p.subDescription, ...(p.tags ?? []), ...(p.specifications ?? []).flatMap((s) => [s.key, s.value])].filter(Boolean).join(" ");
const STOP = new Set("bonjour salut hello bjr salama merci pour avec sans dans avez vous votre vos est sont quelles quels quel quelle une des les la le du de au aux et ou je veux voudrais cherche recherche pouvez moi me svp sil vous plait montre montrer voir afficher fiche informations information details detail parle parler produit produits modele modeles prix tarif cout coute combien coute cher coute devis promotion promo reduction disponible disponibilite stock neuf neuve nouveau nouvelle nouveaux nouvelles nouveaute nouveautes arrivage arrivages arrivee arrivees dernier derniers derniere dernieres propose proposes presente une un ce cette ces celui celle ses son sa mon ma mes notre leur leurs sont ils on il y a t il peut tu donner proposez disponible quelle lequel laquelle plus suite suivante suivants prochain suivante page ete avez vous nous affiche moi connais quoi catalogue gamme selection montre je souhaite connaitre savoir voudrais je cherche meilleur conseille recommande conseil recommandation comparer compare comparatif difference entre vs versus poids cylindre cylindree puissance consommation vitesse boite couleur couleur taille pointure moteur caracteristiques caracteristique specification specifications technique techniques possible avoir sil te plait aide aider parle demande mention est ce que ca avez vous premier premiere premiers premieres deuxieme second seconde troisieme quatrieme deux deuxieme 2e 3e 4e compatible compatibles compatibilite comparaison".split(/\s+/));
const queryTerms = (t: string) => words(t).filter((w) => !STOP.has(w) && w.length >= 2).map(stem);
const tokenMatch = (source: string, term: string) => words(source).map(stem).some((w) => w === term);
const categoryFilter = (t: string): string[] | null => {
  if (any(t, ["piece", "pieces", "pneu", "pneus", "plaquette", "plaquettes", "filtre", "filtres", "chaine", "chaines", "freinage"])) return ["pieces-detachees"];
  if (any(t, ["casque", "casques"])) return ["casques"];
  if (any(t, ["equipement", "equipements", "accessoire", "accessoires", "botte", "bottes", "gant", "gants", "veste", "vestes", "blouson", "blousons", "tenue", "tenues", "protection", "protections"])) return ["casques", "equipements"];
  if (any(t, ["moto", "motos", "motocyclette", "tuktuk", "trois roues", "3 roues"])) return ["motos"];
  return null;
};
const knownBrand = (t: string) => [...brands].filter((b) => b.id !== "unknown-brand" && b.isPublished !== false && norm(b.name) && contains(t, b.name)).sort((a, b) => b.name.length - a.name.length)[0];
const phrase = (t: string, terms: string[]) => terms.some((term) => contains(t, term));
const CONTACT: ChatAction = { label: "Contacter l’équipe", page: "contact", icon: "contact" };
const DEFAULT_QUICK = ["Les nouveautés", "Quelle moto pour la ville ?", "Horaires du showroom", "Pièces détachées"];
export function initialQuick() { return [...DEFAULT_QUICK]; }
export function greetingText(name?: string) { return `Bonjour${name ? ` ${name}` : ""} ! Je suis **Piston**, l’assistant automatique de Funbike. Je peux rechercher dans notre catalogue et vous orienter vers l’équipe.`; }

/** Les calculs se font sur les données publiques actuelles, jamais sur une liste figée. */
export function searchProducts(question: string): Product[] {
  const t = norm(question), brand = knownBrand(t), category = categoryFilter(t);
  const terms = queryTerms(t);
  const brandTerms = new Set(brand ? words(brand.name).map(stem) : []);
  const categoryTerms = new Set(["moto", "casque", "equipement", "accessoire", "piece"]);
  const relevant = terms.filter((word) => !brandTerms.has(word) && !categoryTerms.has(word));
  const numeric = relevant.filter((word) => /^\d+$/.test(word));
  const ranked = visible().flatMap((p) => {
    if (category && !category.includes(p.categoryId)) return [];
    // Une marque associée à une pièce est un fabricant ou une compatibilité indiquée.
    if (brand && p.brandId !== brand.id && !(p.categoryId === "pieces-detachees" && p.compatibleBrandIds?.includes(brand.id))) return [];
    const text = productText(p);
    if (numeric.some((n) => !tokenMatch(text, n))) return [];
    const name = `${p.name} ${modelName(p)}`;
    const matched = relevant.filter((term) => tokenMatch(text, term));
    // Ne pas retourner toute une marque pour un modèle inconnu.
    if (relevant.length && matched.length !== relevant.length) return [];
    if (!relevant.length && !brand && !category && !(words(p.name).length > 1 && contains(t, p.name))) return [];
    return [{ product: p, score: matched.reduce((sum, term) => sum + (tokenMatch(name, term) ? 4 : 1), 0) }];
  });
  const explicitNames = ranked.filter(({ product }) => words(product.name).length > 1 && contains(t, product.name));
  return (explicitNames.length ? explicitNames : ranked).sort((a, b) => b.score - a.score).map((entry) => entry.product);
}
export function searchBikes(t: string) { return searchProducts(t).filter((p) => p.categoryId === "motos"); }

// Les familles, types et champs Usage/terrain sont les seules preuves utilisées
// pour suggérer un usage : aucune affirmation sur le niveau ou le stock.
function suggestUsage(usage: string): { product: Product; reason: string }[] {
  const groups: { query: string[]; evidence: string[] }[] = [
    { query: ["ville", "urbain", "quotidien", "urbaine"], evidence: ["ville", "urbain", "urbaine"] },
    { query: ["cross", "motocross"], evidence: ["cross", "motocross"] },
    { query: ["enduro"], evidence: ["enduro"] },
    { query: ["tout terrain", "off road", "piste"], evidence: ["tout terrain", "off road", "offroad", "piste"] },
    { query: ["travail", "livraison", "utilitaire"], evidence: ["travail", "livraison", "utilitaire"] },
    { query: ["voyage", "aventure", "trail"], evidence: ["voyage", "aventure", "trail"] },
    { query: ["transport", "tuktuk", "3 roues"], evidence: ["transport", "3 roues", "trois roues", "tuktuk"] },
  ];
  const group = groups.find((g) => phrase(usage, g.query));
  if (!group) return [];
  return visible().flatMap((p) => {
    if (p.categoryId !== "motos") return [];
    const evidence = [
      ...(typeName(p) ? [`Type : ${typeName(p)}`] : []),
      ...(getProductFamily(p)?.name ? [`Famille : ${getProductFamily(p)!.name}`] : []),
      ...(p.tags ?? []).map((tag) => `Tag : ${tag}`),
      ...(p.specifications ?? []).filter((s) => /usage|utilisation|terrain/i.test(norm(s.key))).map((s) => `${s.key} : ${s.value}`),
    ];
    const reason = evidence.find((field) => group.evidence.some((term) => contains(field, term)));
    return reason ? [{ product: p, reason }] : [];
  });
}

const specGroups: { question: string[]; keys: string[] }[] = [
  { question: ["poids", "pese"], keys: ["poids"] },
  { question: ["cylindree", "cylindre", "combien de cc"], keys: ["cylindree"] },
  { question: ["puissance", "chevaux"], keys: ["puissance"] },
  { question: ["consommation", "consomme"], keys: ["consommation"] },
  { question: ["boite", "vitesse", "vitesses"], keys: ["boite", "vitesse"] },
  { question: ["couleur", "coloris"], keys: ["couleur", "coloris"] },
  { question: ["moteur"], keys: ["moteur"] },
  { question: ["taille", "tailles", "pointure"], keys: ["taille", "pointure"] },
  { question: ["frein", "freins", "freinage"], keys: ["frein"] },
  { question: ["suspension", "fourche"], keys: ["suspension", "fourche"] },
];

function resultPage(mem: Memory, offset: number): BotReply {
  const all = (mem.results ?? []).map(byId).filter((p): p is Product => !!p);
  const page = all.slice(offset, offset + 4);
  mem.results = all.map((p) => p.id); mem.resultOffset = offset; mem.lastIds = page.map((p) => p.id);
  if (!page.length) return { text: "Je n’ai pas trouvé de produit publié correspondant. L’équipe peut vous aider.", actions: [CONTACT] };
  return { text: `${mem.resultTitle ?? "Voici les produits trouvés"} (${offset + 1}–${offset + page.length} sur ${all.length}) :`, productIds: page.map((p) => p.id), reasons: mem.resultReasons, quick: [...(offset + 4 < all.length ? ["Voir la suite"] : []), "Prix du premier", "Contacter l’équipe"] };
}
function showResults(mem: Memory, found: Product[], title: string, reasons?: Record<string, string>): BotReply {
  mem.results = found.map((p) => p.id); mem.resultTitle = title; mem.resultReasons = reasons;
  return resultPage(mem, 0);
}
function reference(t: string, mem: Memory): Product | undefined {
  const index = any(t, ["deuxieme", "2e", "second", "seconde"]) ? 1 : any(t, ["troisieme", "3e"]) ? 2 : any(t, ["quatrieme", "4e"]) ? 3 : 0;
  const hasOrdinal = any(t, ["premier", "premiere", "deuxieme", "2e", "second", "seconde", "troisieme", "3e", "quatrieme", "4e"]);
  return (hasOrdinal || mem.lastIds.length === 1) && mem.lastIds[index] ? byId(mem.lastIds[index]) : undefined;
}
function wantsReference(t: string) {
  return any(t, ["premier", "premiere", "deuxieme", "second", "troisieme", "quatrieme", "celle", "celui", "cette moto", "ce modele", "ce produit", "sa", "son", "ses", "elle", "prix", "poids", "fiche", "voir la fiche", "premiere"]);
}

export function respond(raw: string, previous: Memory): { reply: BotReply; memory: Memory } {
  const mem: Memory = { ...previous, lastIds: [...(previous.lastIds ?? [])] };
  const t = norm(raw);
  const done = (reply: BotReply) => { mem.misses = 0; return { reply, memory: mem }; };
  if (!t) return done({ text: "Que recherchez-vous ?", quick: initialQuick() });
  if (phrase(t, ["bonjour", "salut", "salama", "bonsoir"]) && words(t).length <= 3) return done({ text: "Bonjour ! Comment puis-je vous aider ?", quick: initialQuick() });
  if (phrase(t, ["merci", "misaotra"]) && words(t).length <= 3) return done({ text: "Avec plaisir !", quick: initialQuick() });
  if (phrase(t, ["voir la suite", "suivant", "suivants", "page suivante"]) && mem.results) return done(resultPage(mem, (mem.resultOffset ?? 0) + 4));
  if (phrase(t, ["horaire", "horaires", "heure", "ouvert", "ouverture", "fermeture", "ferme", "adresse", "ou etes vous", "showroom"])) {
    return done({ text: `Showroom Funbike :\n• Adresse : ${CONTACT_ADDRESS || "non renseignée"}\n• Horaires : ${CONTACT_HOURS || "non renseignés"}\nPour savoir si nous sommes ouverts à cet instant, contactez l’équipe.`, actions: [CONTACT] });
  }
  if (phrase(t, ["revendeur", "revendeurs", "point de vente", "points de vente"])) {
    const names = DEALERS.filter((d) => !d.isDemo).map((d) => `${d.name} (${d.city})`);
    return done({ text: names.length ? `Points de vente enregistrés :\n${names.map((n) => `• ${n}`).join("\n")}` : "Aucun point de vente n’est renseigné pour le moment.", actions: [{ label: "Voir les revendeurs", page: "revendeurs", icon: "contact" }, CONTACT] });
  }
  if (phrase(t, ["un conseiller", "une conseillere", "humain", "contacter", "contact", "telephone", "appeler", "whatsapp", "email", "equipe"])) {
    return done({ text: `Vous pouvez joindre l’équipe Funbike :\n• Téléphone : ${CONTACT_PHONE || "non renseigné"}\n• E-mail : ${CONTACT_EMAIL || "non renseigné"}`, actions: [CONTACT] });
  }
  if (phrase(t, ["nouveaute", "nouveautes", "nouveau", "nouveaux", "nouvelle", "nouvelles", "nouveautes du catalogue", "arrivage", "arrivages", "arrivees", "quoi de neuf"])) {
    const constrained = !!knownBrand(t) || !!categoryFilter(t) || queryTerms(t).length > 0;
    const chosen = (constrained ? searchProducts(t) : visible()).filter((p) => p.isNewArrival === true);
    return done(chosen.length ? showResults(mem, chosen, "Voici les nouveautés sélectionnées") : { text: "Aucune nouveauté sélectionnée ne correspond pour le moment.", actions: [CONTACT] });
  }
  if (phrase(t, ["marques", "liste des marques"]) && !knownBrand(t)) {
    const category = categoryFilter(t);
    const brandNames = brands.filter((brand) => brand.id !== "unknown-brand" && brand.isPublished !== false && visible().some((p) => p.brandId === brand.id && (!category || category.includes(p.categoryId)))).map((brand) => brand.name);
    return done({ text: brandNames.length ? `Marques présentes dans le catalogue :\n${brandNames.map((name) => `• ${name}`).join("\n")}` : "Je ne trouve aucune marque correspondante dans le catalogue.", actions: [CONTACT] });
  }
  const found = searchProducts(t);
  const terms = queryTerms(t);
  const isReference = wantsReference(t) && terms.length === 0;
  const ref = isReference ? reference(t, mem) : undefined;
  const comparison = phrase(t, ["compare", "comparer", "comparaison", "comparatif", "difference", "versus", "vs"]);
  if (comparison) {
    const chunks = t.split(/\b(?:et|versus|vs|avec)\b/).filter(Boolean);
    let pair: Product[] = [];
    if (chunks.length >= 2) {
      const first = searchProducts(chunks[0]); const second = searchProducts(chunks[1]);
      if (first.length === 1 && second.length === 1 && first[0].id !== second[0].id) pair = [first[0], second[0]];
    } else if (phrase(t, ["les deux", "deux premieres", "deux premiers"])) {
      pair = mem.lastIds.slice(0, 2).map(byId).filter((p): p is Product => !!p);
    }
    if (pair.length === 2) { mem.lastIds = pair.map((p) => p.id); return done({ text: `Voici les caractéristiques renseignées pour **${pair[0].name}** et **${pair[1].name}**. Un tiret signifie que l’information manque.`, compare: [pair[0].id, pair[1].id], productIds: pair.map((p) => p.id) }); }
    return done({ text: "Indiquez les noms précis de deux produits à comparer, ou demandez « compare les deux » après une recherche.", actions: [CONTACT] });
  }
  const matches = ref ? [ref] : found;
  if (phrase(t, ["compatible", "compatibilite", "compatibles"])) {
    const pieces = found.filter((p) => p.categoryId === "pieces-detachees");
    const brand = knownBrand(t);
    const listed = brand ? pieces.filter((p) => p.compatibleBrandIds?.includes(brand.id)) : [];
    return done(listed.length ? { ...showResults(mem, listed, `Pièces indiquées compatibles avec la marque ${brand!.name}`), text: `La marque **${brand!.name}** est indiquée pour ${listed.length} pièce${listed.length > 1 ? "s" : ""}. Le modèle, l’année et les dimensions restent à confirmer auprès de l’équipe.\n${listed.length > 4 ? "Utilisez « Voir la suite » pour les autres." : ""}`, actions: [CONTACT] } : { text: "Je ne peux pas confirmer cette compatibilité avec les informations du catalogue. Indiquez le modèle et l’année à l’équipe.", actions: [CONTACT] });
  }
  const isPrice = phrase(t, ["prix", "tarif", "combien", "coute", "cout", "devis"]) || (mem.pendingIntent === "price" && matches.length === 1);
  const isStock = phrase(t, ["stock", "disponibilite", "disponible", "disponibles", "en stock"]) || (mem.pendingIntent === "stock" && matches.length === 1);
  const spec = specGroups.find((group) => phrase(t, group.question)) && !(categoryFilter(t)?.includes("pieces-detachees") && !phrase(t, ["caracteristique", "specification", "quel", "quelle", "combien"])) ? specGroups.find((group) => phrase(t, group.question)) : undefined;
  if (isPrice || isStock || spec) {
    if (matches.length > 1) { mem.pendingIntent = isPrice ? "price" : isStock ? "stock" : undefined; return done(showResults(mem, matches, "Plusieurs produits correspondent : choisissez un nom ou demandez « le premier »")); }
    if (matches.length === 1) {
      const p = matches[0]; mem.lastIds = [p.id]; mem.pendingIntent = undefined;
      if (isStock) return done({ text: `Je ne peux pas confirmer le stock de **${p.name}**. Contactez l’équipe pour connaître sa disponibilité.`, productIds: [p.id], actions: [CONTACT] });
      if (isPrice) return done({ text: p.price?.trim() ? `Prix indiqué pour **${p.name}** : **${p.price.trim()}**. L’équipe peut confirmer le tarif et la disponibilité.` : `Le prix de **${p.name}** n’est pas renseigné. L’équipe peut vous établir un devis.`, productIds: [p.id], actions: [CONTACT] });
      const match = (p.specifications ?? []).find((s) => spec!.keys.some((key) => norm(s.key).includes(key)) && s.value.trim());
      return done({ text: match ? `Pour **${p.name}**, ${match.key} : **${match.value}**.` : `Cette caractéristique n’est pas renseignée pour **${p.name}**. L’équipe peut vous aider.`, productIds: [p.id], actions: [CONTACT] });
    }
    return done({ text: "Je ne peux pas identifier le produit avec certitude. Indiquez son nom exact ou contactez l’équipe.", actions: [CONTACT] });
  }

  const wantsAdvice = phrase(t, ["conseil", "conseiller", "conseille", "recommande", "recommander", "quelle moto", "quelles motos", "quel modele de moto", "choisir", "debutant", "debuter"]);
  const filter = categoryFilter(t);
  const isMotoAdvice = wantsAdvice && (!filter || (filter.length === 1 && filter[0] === "motos"));
  const usageFollowUp = mem.waitingForUsage && !filter && words(t).length <= 3 && !knownBrand(t);
  if (!isMotoAdvice && !usageFollowUp) { mem.waitingForUsage = false; mem.usageBrandId = undefined; mem.usageNumbers = undefined; }
  if (isMotoAdvice || usageFollowUp) {
    if (phrase(t, ["budget", "moins de", "maximum", "prix maximum"])) {
      mem.waitingForUsage = false;
      return done({ text: "Je ne peux pas vérifier qu’une moto correspond à votre budget. Précisez votre budget à l’équipe pour obtenir un devis à jour.", actions: [CONTACT] });
    }
    const brandId = knownBrand(t)?.id ?? (usageFollowUp ? mem.usageBrandId : undefined);
    const numbers = usageFollowUp ? (mem.usageNumbers ?? []) : words(t).filter((word) => /^\d+$/.test(word));
    const suggestions = suggestUsage(t).filter(({ product }) => (!brandId || product.brandId === brandId) && numbers.every((number) => tokenMatch(productText(product), number)));
    if (!suggestions.length) { mem.waitingForUsage = true; mem.usageBrandId = brandId; mem.usageNumbers = numbers; return done({ text: "Je n’ai pas assez de données pour proposer une moto correspondant à ces critères. Pour vous orienter, indiquez l’usage principal : ville, travail, voyage, cross ou enduro. Je ne peux pas déduire le niveau ou le stock s’ils ne sont pas renseignés.", quick: ["Ville", "Travail", "Voyage", "Cross", "Enduro"], actions: [CONTACT] }); }
    mem.waitingForUsage = false; mem.usageBrandId = undefined; mem.usageNumbers = undefined;
    const reply = showResults(mem, suggestions.map((item) => item.product), "Voici des pistes selon la catégorie ou l’usage indiqué dans la fiche", Object.fromEntries(suggestions.map((item) => [item.product.id, item.reason])));
    reply.text += " Le choix et l’adaptation à votre expérience sont à confirmer avec l’équipe.";
    return done(reply);
  }
  if (matches.length) return done(showResults(mem, matches, "Voici les produits trouvés"));
  if (phrase(t, ["financement", "credit", "garantie", "essai", "atelier"])) return done({ text: "L’équipe pourra vous renseigner sur cette demande.", actions: [CONTACT] });
  if (phrase(t, ["catalogue", "gamme"]) && terms.length === 0) return done({ text: `Le catalogue contient ${visible().length} produit${visible().length === 1 ? "" : "s"} publié${visible().length === 1 ? "" : "s"}. Que cherchez-vous ?`, quick: ["Motos", "Casques", "Équipements", "Pièces détachées", "Les nouveautés"] });
  mem.misses++;
  return { reply: { text: "Je n’ai pas trouvé de correspondance certaine dans le catalogue. Précisez le nom, la marque ou le type de produit, ou contactez l’équipe.", actions: [CONTACT], quick: initialQuick() }, memory: mem };
}

export function typingDelay(reply: BotReply): number { return Math.min(2300, Math.max(650, 450 + reply.text.length * 11 + (reply.productIds?.length ?? 0) * 120 + (reply.compare ? 300 : 0))); }
