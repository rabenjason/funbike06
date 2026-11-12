import { brands, products, categories, productTypes, models, getProductFamily } from "../catalog";
import { CONTACT_EMAIL, CONTACT_PHONE, CONTACT_ADDRESS, CONTACT_HOURS, CONTACT_WHATSAPP } from "../catalog/contact";
import { DEALERS } from "../catalog/dealers";
import type { Product } from "../types/product";
import type { Dealer } from "../types";
import { calculatePromotionPrice, formatAriary, madagascarDate } from "./promotions";
import type { PromotionSnapshot } from "./assistant-promotions";

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
  resultKind?: "promotions";
  waitingForUsage?: boolean;
  usageBrandId?: string;
  usageNumbers?: string[];
  pendingIntent?: "price" | "stock";
  dealerKeys?: string[];
  lastDealerKey?: string;
  pendingCategoryQuery?: string;
  lastUsage?: string;
  lastUsageBrandId?: string;
  lastDisplacement?: string;
};
export const EMPTY_MEMORY: Memory = { lastIds: [], misses: 0 };

export function norm(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/['’]/g, " ").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}
const words = (s: string) => norm(s).split(" ").filter(Boolean);
const stem = (s: string) => /^[a-z]+$/.test(s) && s.length > 4 && s.endsWith("s") ? s.slice(0, -1) : s;
const contains = (text: string, expression: string) => (` ${norm(text)} `).includes(` ${norm(expression)} `);
const any = (text: string, expressions: string[]) => expressions.some((s) => contains(text, s));
const brandOf = (p: Product) => brands.find((b) => b.id === p.brandId && b.isPublished !== false);
const visible = () => products.filter((p) => p.status === "PUBLISHED" && !!brandOf(p));
const byId = (id: string) => visible().find((p) => p.id === id);
const typeName = (p: Product) => productTypes.find((t) => t.id === p.productTypeId && t.categoryId === p.categoryId)?.name ?? "";
const modelName = (p: Product) => models.find((m) => m.id === p.modelId && m.brandId === p.brandId)?.name ?? "";
const categoryName = (p: Product) => categories.find((c) => c.id === p.categoryId)?.name ?? p.categoryId;
const productText = (p: Product) => [p.name, brandOf(p)?.name, modelName(p), typeName(p), getProductFamily(p)?.name, categoryName(p), p.description, p.subDescription, ...(p.tags ?? []), ...(p.specifications ?? []).flatMap((s) => [s.key, s.value])].filter(Boolean).join(" ");
const STOP = new Set("bonjour salut hello bjr salama merci pour avec sans dans avez vous votre vos est sont quelles quels quel quelle une des les la le du de au aux et ou je veux voudrais cherche recherche pouvez moi me svp sil vous plait montre montrer voir afficher fiche informations information details detail parle parler produit produits modele modeles prix tarif cout coute combien coute cher coute devis promotion promo reduction disponible disponibilite stock neuf neuve nouveau nouvelle nouveaux nouvelles nouveaute nouveautes arrivage arrivages arrivee arrivees dernier derniers derniere dernieres propose proposes presente une un ce cette ces celui celle ses son sa mon ma mes notre leur leurs sont ils on il y a t il peut tu donner proposez disponible quelle lequel laquelle plus suite suivante suivants prochain suivante page ete avez vous nous affiche moi connais quoi catalogue gamme selection montre je souhaite connaitre savoir voudrais je cherche meilleur conseille recommande conseil recommandation comparer compare comparatif difference entre vs versus poids cylindre cylindree puissance consommation vitesse boite couleur couleur taille pointure moteur caracteristiques caracteristique specification specifications technique techniques possible avoir sil te plait aide aider parle demande mention est ce que ca avez vous sur en promotion promotions promos solde soldes remise remises actuel actuelle actuelles actuels actuellement cours cc cm3 faire pratique pratiquer rouler roulerai roules roulez utilise utiliser acheter achat besoin cherche recherche marque marques usage aller en chaque tous jours aimerais premiere mon premier premiere premiers premieres deuxieme second seconde troisieme quatrieme deux deuxieme 2e 3e 4e compatible compatibles compatibilite comparaison".split(/\s+/));
const queryTerms = (t: string) => words(t).filter((w) => !STOP.has(w) && w.length >= 2).map((w) => stem(w === "motocross" ? "cross" : w));
// Un nombre suivi d'une variante alphabétique (150X, 125cc) reste identifiable
// par le nombre seul, sans confondre 150 avec 1500 ni 150X avec 150XS.
const tokenMatch = (source: string, term: string) => words(source).map(stem).some((w) => {
  if (w === term) return true;
  if (!/^\d+$/.test(term)) return false;
  const match = w.match(/^(\d+)[a-z]+$/);
  return !!match && match[1] === term;
});
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
const DEFAULT_QUICK = ["Les nouveautés", "Quelle moto pour la ville ?", "Revendeurs", "Promotions"];
export function initialQuick() { return [...DEFAULT_QUICK]; }
export function greetingText(name?: string, assistantName = "Piston") { return `Bonjour${name ? ` ${name}` : ""} ! Je suis **${assistantName}**, l’assistant automatique de Funbike. Je peux rechercher dans notre catalogue et vous orienter vers l’équipe.`; }

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

// Les libellés du catalogue restent la preuve : ces synonymes interprètent
// la demande, sans transformer une famille vague en aptitude inventée.
const USAGES = [
  { id: "ville", label: "ville", query: ["ville", "urbain", "urbaine", "quotidien", "quotidienne", "trajets quotidiens", "aller au travail", "aller au boulot", "trajets quotidiens", "deplacement quotidien", "deplacements quotidiens"], evidence: ["ville", "urbain", "urbaine"] },
  { id: "cross", label: "cross", query: ["cross", "motocross", "moto cross", "mx"], evidence: ["cross", "motocross", "moto cross"] },
  { id: "enduro", label: "enduro", query: ["enduro"], evidence: ["enduro"] },
  { id: "terrain", label: "tout-terrain", query: ["tout terrain", "off road", "offroad", "hors route", "hors piste", "brousse", "piste"], evidence: ["tout terrain", "off road", "offroad", "hors route", "hors piste", "brousse", "piste"] },
  { id: "travail", label: "travail ou livraison", query: ["travail", "livraison", "livraisons", "livrer", "utilitaire"], evidence: ["travail", "livraison", "utilitaire"] },
  { id: "voyage", label: "voyage ou aventure", query: ["voyage", "voyager", "aventure", "trail"], evidence: ["voyage", "aventure", "trail"] },
  { id: "route", label: "route", query: ["route", "routes", "long trajet", "longs trajets", "longue distance", "longues distances"], evidence: ["route", "routes", "routiere", "routier"] },
  { id: "transport", label: "transport en trois roues", query: ["tuktuk", "tuk tuk", "3 roues", "trois roues"], evidence: ["3 roues", "trois roues", "tuktuk"] },
] as const;
type Usage = typeof USAGES[number];
const usageById = (id?: string): Usage | undefined => USAGES.find((item) => item.id === id);
function mentionedUsages(t: string): Usage[] {
  // Aller au travail décrit un trajet quotidien, pas forcément une livraison.
  const usageText = t.replace(/\b(?:aller|trajet|trajets) (?:au|pour le) (?:travail|boulot)\b/g, "trajets quotidiens");
  const matched = USAGES.filter((group) => phrase(usageText, [...group.query]));
  // « cross tout-terrain » et « enduro tout-terrain » précisent le même besoin.
  const specific = matched.some((g) => g.id === "cross" || g.id === "enduro");
  return matched.filter((g) => !(specific && g.id === "terrain") && !(g.id === "route" && phrase(usageText, ["hors route"])));
}
function displacement(t: string): string | undefined {
  const match = t.match(/\b(\d{2,3})\s*(?:cc|cm3|cm 3)\b/) ?? t.match(/\b(\d{2,3})\b/);
  return match?.[1];
}
function hasDisplacement(p: Product, amount: string) {
  return (p.specifications ?? []).some((s) => norm(s.key).includes("cylindree") && tokenMatch(s.value, amount));
}
function unhandledCriteria(t: string, brandId?: string): string[] {
  const usageWords = new Set(USAGES.flatMap((group) => group.query.flatMap(words)).map(stem));
  const brand = brands.find((item) => item.id === brandId);
  const brandWords = new Set(brand ? words(brand.name).map(stem) : []);
  const accepted = new Set(["moto", "motos", "motocyclette", "debutant", "debutante", "debuter", "debute", "commence", "cc", "cm3", "route", "routes", "all", "quotidien", "trajet", "trajets", "une", "premiere"]);
  return queryTerms(t).filter((term) => !usageWords.has(term) && !brandWords.has(term) && !accepted.has(term) && !/^\d{2,3}$/.test(term));
}
function suggestUsage(group: Usage, options: { brandId?: string; cc?: string }): { product: Product; reason: string }[] {
  return visible().flatMap((p) => {
    if (p.categoryId !== "motos" || (options.brandId && p.brandId !== options.brandId) || (options.cc && !hasDisplacement(p, options.cc))) return [];
    // Ne pas proposer un trois-roues à un client qui demande une moto.
    if (group.id !== "transport" && phrase(typeName(p), ["3 roues", "trois roues", "tuktuk"])) return [];
    const evidence = [
      ...(typeName(p) ? [`Type : ${typeName(p)}`] : []),
      ...(getProductFamily(p)?.name ? [`Famille : ${getProductFamily(p)!.name}`] : []),
      ...(p.tags ?? []).map((tag) => `Tag : ${tag}`),
      ...(p.specifications ?? []).filter((s) => /usage|utilisation|terrain/i.test(norm(s.key))).map((s) => `${s.key} : ${s.value}`),
    ];
    const negative = ["pas", "sans", "non", "interdit", "exclu", "incompatible"];
    let reason = evidence.find((field) => !phrase(field, negative) && group.evidence.some((term) => contains(field, term)));
    // La description est citée telle quelle uniquement si elle mentionne explicitement
    // l’usage et contient une formulation positive, sans négation dans la phrase.
    if (!reason) {
      const sentence = [p.description, p.subDescription ?? ""].flatMap((description) => description.split(/[.!?;\n]+/)).map((part) => part.trim()).find((part) =>
        part.length <= 220 && !phrase(part, negative) && phrase(part, ["pour", "usage", "polyvalence", "adapte", "adaptee", "adaptes", "adaptees", "destine", "destinee", "ideal", "ideale", "taille", "taillee"]) && group.evidence.some((term) => contains(part, term)),
      );
      if (sentence) reason = `Description : « ${sentence} »`;
    }
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
  mem.results = found.map((p) => p.id); mem.resultTitle = title; mem.resultReasons = reasons; mem.resultKind = undefined;
  return resultPage(mem, 0);
}
function reference(t: string, mem: Memory): Product | undefined {
  const index = any(t, ["deuxieme", "2e", "second", "seconde"]) ? 1 : any(t, ["troisieme", "3e"]) ? 2 : any(t, ["quatrieme", "4e"]) ? 3 : 0;
  const hasOrdinal = any(t, ["premier", "premiere", "deuxieme", "2e", "second", "seconde", "troisieme", "3e", "quatrieme", "4e"]);
  return (hasOrdinal || mem.lastIds.length === 1) && mem.lastIds[index] ? byId(mem.lastIds[index]) : undefined;
}
function wantsReference(t: string) {
  return any(t, ["premier", "premiere", "deuxieme", "second", "troisieme", "quatrieme", "celle", "celui", "cette moto", "ce modele", "ce produit", "sa", "son", "ses", "elle", "prix", "poids", "fiche", "voir la fiche", "premiere", "combien de cc", "cylindree"]);
}

const DEALER_INTENT = ["revendeur", "revendeurs", "point de vente", "points de vente", "concessionnaire", "concessionnaires", "magasin", "magasins"];
const DEALER_DETAIL = ["adresse", "ou", "horaire", "horaires", "heure", "ouvert", "ouverture", "fermeture", "telephone", "appeler", "contact", "contacter", "email", "services", "service", "itineraire", "carte"];
const PROMO_WORDS = ["promotion", "promotions", "promo", "promos", "reduction", "reductions", "solde", "soldes"];
const PROMO_ACTION: ChatAction = { label: "Voir les promotions", page: "promotions", icon: "catalog" };
export function needsPromotionData(text: string, memory: Memory): boolean {
  const t = norm(text);
  return phrase(t, PROMO_WORDS) || phrase(t, ["prix", "tarif", "coute", "cout", "devis", "combien"]) || memory.pendingIntent === "price" || (memory.resultKind === "promotions" && phrase(t, ["voir la suite", "suivant", "suivants", "page suivante"]));
}
function dealerAction(d: Dealer): ChatAction { return { label: `Voir ${d.name}`, page: "revendeurs", id: d.key, icon: "contact" }; }
function dealerReply(t: string, mem: Memory): BotReply | null {
  const dealers = DEALERS.filter((d) => !d.isDemo);
  const intent = phrase(t, DEALER_INTENT);
  const explicitProduct = !!categoryFilter(t) || !!knownBrand(t) || phrase(t, ["produit", "produits", "prix", "stock", ...PROMO_WORDS]);
  const named = dealers.filter((d) => {
    const name = norm(d.name);
    if (!name || !contains(t, name) || (words(name).length === 1 && t !== name && !intent)) return false;
    const rest = t.replace(name, " ");
    return intent || (!categoryFilter(rest) && !phrase(rest, ["produit", "produits", "prix", "stock", ...PROMO_WORDS]));
  });
  const cities = [...new Set(dealers.map((d) => norm(d.city)).filter(Boolean))].filter((city) => contains(t, city) && (intent || t === city || (!explicitProduct && phrase(t, DEALER_DETAIL))));
  let found = named.length ? named.filter((d) => !cities.length || cities.includes(norm(d.city))) : cities.length ? dealers.filter((d) => cities.includes(norm(d.city))) : [];
  if (named.length && cities.length && !found.length) return { text: "Je ne trouve pas ce revendeur dans cette ville. Vérifiez le nom ou la ville.", actions: [{ label: "Voir les revendeurs", page: "revendeurs", icon: "contact" }, CONTACT] };
  if (named.length && !intent && !phrase(t, DEALER_DETAIL) && visible().some((p) => norm(p.name) === t) && norm(named[0].name) === t) return { text: "Ce nom correspond à la fois à un produit et à un revendeur. Cherchez-vous le produit ou le revendeur ?", quick: ["Revendeurs", "Catalogue"], actions: [CONTACT] };
  const ordinal = any(t, ["premier", "premiere", "1er", "1ere"]) ? 0 : any(t, ["deuxieme", "second", "seconde", "2e"]) ? 1 : any(t, ["troisieme", "3e"]) ? 2 : any(t, ["quatrieme", "4e"]) ? 3 : -1;
  const followup = !named.length && !cities.length && !intent && !explicitProduct && !phrase(t, ["showroom", "funbike"]) && ((ordinal >= 0 && (mem.dealerKeys?.length ?? 0) > 0) || (phrase(t, DEALER_DETAIL) && (mem.dealerKeys?.length ?? 0) > 0));
  if (followup) {
    const key = ordinal >= 0 ? mem.dealerKeys?.[ordinal] : mem.lastDealerKey;
    found = dealers.filter((d) => d.key === key);
    if (!found.length) return { text: "Je ne peux pas identifier ce revendeur avec certitude. Indiquez son nom ou sa ville.", actions: [{ label: "Voir les revendeurs", page: "revendeurs", icon: "contact" }, CONTACT] };
  }
  if (!found.length && !intent) return null;
  if (!found.length && intent) {
    // Ne pas transformer une ville inconnue en liste de tous les revendeurs.
    const remainder = t.replace(/\b(?:revendeur|revendeurs|point|points|de|vente|concessionnaire|concessionnaires|magasin|magasins|ville|liste|tous|toutes|quel|quels|quelle|quelles|sont|les|la|le|des|du|un|une|a|en|sur|vers|dans|pour|je|cherche|recherche|voir|montre|donne|avez|vous|vos|et|ou|est|ce|que|il|y|pres|moi|bonjour|svp|funbike)\b/g, " ").trim();
    if (remainder) return { text: "Je ne trouve pas de revendeur correspondant à cette ville ou à ce nom. Vérifiez l’orthographe ou consultez la liste.", actions: [{ label: "Voir les revendeurs", page: "revendeurs", icon: "contact" }, CONTACT] };
    found = dealers;
  }
  mem.dealerKeys = found.map((d) => d.key); mem.lastDealerKey = found.length === 1 ? found[0].key : undefined;
  mem.pendingIntent = undefined; mem.results = undefined; mem.resultKind = undefined; mem.lastIds = [];
  if (found.length === 1) {
    const d = found[0];
    const field = (value: string | undefined) => value?.trim() || "non renseigné";
    return { text: `**${d.name}** (${d.city})\n• Adresse : ${field(d.address)}\n• Horaires : ${field(d.hours)}\n• Téléphone : ${field(d.phone)}\n• E-mail : ${field(d.email)}\n• Services : ${d.services?.filter((v) => v.trim()).join(", ") || "non renseignés"}\nPour vérifier une disponibilité ou savoir si le point de vente est ouvert maintenant, contactez Funbike ou le revendeur si ses coordonnées sont renseignées.`, actions: [dealerAction(d), CONTACT], quick: ["Adresse", "Horaires", "Revendeurs"] };
  }
  if (!found.length) return { text: "Aucun point de vente n’est renseigné pour le moment.", actions: [{ label: "Voir les revendeurs", page: "revendeurs", icon: "contact" }, CONTACT] };
  return { text: `${cities.length ? "Points de vente dans cette ville" : "Points de vente enregistrés"} :\n${found.map((d) => `• ${d.name} (${d.city})${d.address.trim() ? ` — ${d.address}` : " — adresse non renseignée"}`).join("\n")}\nIndiquez le nom du revendeur pour consulter ses coordonnées.`, actions: [{ label: "Voir les revendeurs", page: "revendeurs", icon: "contact" }, CONTACT] };
}

export function respond(raw: string, previous: Memory, promotions?: PromotionSnapshot | null): { reply: BotReply; memory: Memory } {
  const mem: Memory = { ...previous, lastIds: [...(previous.lastIds ?? [])] };
  let t = norm(raw);
  if (mem.pendingCategoryQuery) {
    const categoryChoice = categoryFilter(t);
    const saved = mem.pendingCategoryQuery;
    mem.pendingCategoryQuery = undefined;
    if (categoryChoice) t = norm(`${raw} ${saved}`);
  }
  const done = (reply: BotReply) => { mem.misses = 0; return { reply, memory: mem }; };
  if (!t) return done({ text: "Que recherchez-vous ?", quick: initialQuick() });
  if (phrase(t, ["bonjour", "salut", "salama", "bonsoir"]) && words(t).length <= 3) return done({ text: "Bonjour ! Comment puis-je vous aider ?", quick: initialQuick() });
  if (phrase(t, ["merci", "misaotra"]) && words(t).length <= 3) return done({ text: "Avec plaisir !", quick: initialQuick() });
  if (phrase(t, ["voir la suite", "suivant", "suivants", "page suivante"]) && mem.results) {
    if (mem.resultKind === "promotions") {
      if (!promotions) return done({ text: "Je ne peux pas vérifier les promotions pour le moment. Consultez la page Promotions ou contactez l’équipe.", actions: [PROMO_ACTION, CONTACT] });
      const active = mem.results.filter((id) => { const p = byId(id); return p && promotions.campaigns.some((c) => c.products.some((item) => item.productId === p.id && item.categoryId === p.categoryId)); });
      const date = madagascarDate(new Date(promotions.now)).split("-").reverse().join("/");
      mem.resultTitle = `Produits en promotion vérifiés le ${date}`;
      if (active.length !== mem.results.length) {
        mem.results = active; mem.resultOffset = 0;
        if (!active.length) return done({ text: "Ces promotions ne sont plus disponibles. Consultez les promotions actuelles.", actions: [PROMO_ACTION, CONTACT] });
        const reply = resultPage(mem, 0); reply.text = "Les promotions ont changé. " + reply.text; reply.actions = [PROMO_ACTION, CONTACT]; return done(reply);
      }
    }
    const reply = resultPage(mem, (mem.resultOffset ?? 0) + 4);
    if (mem.resultKind === "promotions") reply.actions = [PROMO_ACTION, CONTACT];
    return done(reply);
  }
  const dealer = dealerReply(t, mem);
  if (dealer) return done(dealer);
  // Une nouvelle question sans lien avec les revendeurs ne doit pas réutiliser une ancienne sélection.
  mem.lastDealerKey = undefined; mem.dealerKeys = undefined;
  if (phrase(t, PROMO_WORDS)) {
    if (!promotions) return done({ text: "Je ne peux pas vérifier les promotions pour le moment. Consultez la page Promotions ou contactez l’équipe.", actions: [PROMO_ACTION, CONTACT] });
    const offered = visible().filter((p) => promotions.campaigns.some((c) => c.products.some((item) => item.productId === p.id && item.categoryId === p.categoryId)));
    const filter = categoryFilter(t); const brand = knownBrand(t);
    const terms = queryTerms(t);
    const constrained = !!filter || !!brand || terms.length > 0;
    const matching = constrained ? searchProducts(t) : visible();
    const matches = new Set(matching.map((p) => `${p.categoryId}:${p.id}`));
    const candidates = offered.filter((p) => matches.has(`${p.categoryId}:${p.id}`));
    if (!candidates.length) return done({ text: "Je ne trouve aucune promotion active correspondant à cette sélection. Consultez la page Promotions ou contactez l’équipe.", actions: [PROMO_ACTION, CONTACT] });
    const date = madagascarDate(new Date(promotions.now)).split("-").reverse().join("/");
    mem.pendingIntent = undefined;
    const reply = showResults(mem, candidates, `Produits en promotion vérifiés le ${date}`);
    mem.resultKind = "promotions";
    reply.text += " Consultez les prix et les dates sur la page Promotions."; reply.actions = [PROMO_ACTION, CONTACT];
    return done(reply);
  }
  if (phrase(t, ["horaire", "horaires", "heure", "ouvert", "ouverture", "fermeture", "ferme", "adresse", "ou etes vous", "showroom"])) {
    return done({ text: `Showroom Funbike :\n• Adresse : ${CONTACT_ADDRESS || "non renseignée"}\n• Horaires : ${CONTACT_HOURS || "non renseignés"}\nPour savoir si nous sommes ouverts à cet instant, contactez l’équipe.`, actions: [CONTACT] });
  }
  if (phrase(t, ["un conseiller", "une conseillere", "humain", "contacter", "contact", "telephone", "appeler", "whatsapp", "email", "equipe"])) {
    return done({ text: `Vous pouvez joindre l’équipe Funbike :\n• Téléphone : ${CONTACT_PHONE || "non renseigné"}\n• E-mail : ${CONTACT_EMAIL || "non renseigné"}${CONTACT_WHATSAPP ? `\n• WhatsApp : ${CONTACT_WHATSAPP}` : ""}`, actions: [CONTACT] });
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
  const currentCategory = categoryFilter(t);
  if (currentCategory && !currentCategory.includes("motos")) {
    mem.lastUsage = undefined; mem.lastUsageBrandId = undefined; mem.lastDisplacement = undefined;
    mem.waitingForUsage = false; mem.usageBrandId = undefined; mem.usageNumbers = undefined;
  }
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
  if (mentionedUsages(t).length && phrase(t, ["pas", "sans", "sauf"])) {
    return done({ text: "Je préfère vérifier votre besoin plutôt que d’ignorer une exclusion. Qu’utiliserez-vous principalement, et quel type souhaitez-vous éviter ? Vous pouvez aussi contacter l’équipe.", actions: [CONTACT] });
  }
  const matchedSpec = specGroups.find((group) => phrase(t, group.question));
  const spec = matchedSpec && !(categoryFilter(t)?.includes("pieces-detachees") && !phrase(t, ["caracteristique", "specification", "quel", "quelle", "combien"])) ? matchedSpec : undefined;
  const isPrice = phrase(t, ["prix", "tarif", "coute", "cout", "devis"]) || (phrase(t, ["combien"]) && !spec) || (mem.pendingIntent === "price" && matches.length === 1 && !spec);
  const isStock = phrase(t, ["stock", "disponibilite", "disponible", "disponibles", "en stock"]) || (mem.pendingIntent === "stock" && matches.length === 1 && !spec);
  if (isPrice || isStock || spec) {
    if (matches.length > 1) { mem.pendingIntent = isPrice ? "price" : isStock ? "stock" : undefined; return done(showResults(mem, matches, "Plusieurs produits correspondent : choisissez un nom ou demandez « le premier »")); }
    if (matches.length === 1) {
      const p = matches[0]; mem.lastIds = [p.id]; mem.pendingIntent = undefined;
      if (isStock) return done({ text: `Je ne peux pas confirmer le stock de **${p.name}**. Contactez l’équipe pour connaître sa disponibilité.`, productIds: [p.id], actions: [CONTACT] });
      if (isPrice && promotions === null) return done({ text: `Je ne peux pas vérifier les prix promotionnels de **${p.name}** pour le moment. Consultez sa fiche ou contactez l’équipe.`, productIds: [p.id], actions: [PROMO_ACTION, CONTACT] });
      const campaign = promotions?.campaigns.find((c) => c.products.some((item) => item.productId === p.id && item.categoryId === p.categoryId));
      const offer = campaign?.products.find((item) => item.productId === p.id && item.categoryId === p.categoryId);
      if (isPrice && offer && campaign) {
        const { finalPrice } = calculatePromotionPrice(offer.originalPrice, offer.discountPercent);
        const end = campaign.endDate.split("-").reverse().join("/");
        const checked = madagascarDate(new Date(promotions!.now)).split("-").reverse().join("/");
        return done({ text: `Prix promotionnel de **${p.name}** vérifié le ${checked} : **${formatAriary(finalPrice)}** au lieu de ${formatAriary(offer.originalPrice)} (−${offer.discountPercent} %), promotion prévue jusqu’au ${end} inclus à Madagascar. Vérifiez la promotion et la disponibilité auprès de l’équipe.`, productIds: [p.id], actions: [PROMO_ACTION, CONTACT] });
      }
      if (isPrice) return done({ text: p.price?.trim().toLowerCase() === "sur devis" ? `Pour connaître le prix actuel de **${p.name}**, consultez sa fiche ou demandez un devis à l’équipe.` : p.price?.trim() ? `Prix indiqué pour **${p.name}** : **${p.price.trim()}**. L’équipe peut confirmer le tarif et la disponibilité.` : `Le prix de **${p.name}** n’est pas renseigné. L’équipe peut vous établir un devis.`, productIds: [p.id], actions: [CONTACT] });
      const match = (p.specifications ?? []).find((s) => spec!.keys.some((key) => norm(s.key).includes(key)) && s.value.trim());
      return done({ text: match ? `Pour **${p.name}**, ${match.key} : **${match.value}**.` : `Cette caractéristique n’est pas renseignée pour **${p.name}**. L’équipe peut vous aider.`, productIds: [p.id], actions: [CONTACT] });
    }
    return done({ text: "Je ne peux pas identifier le produit avec certitude. Indiquez son nom exact ou contactez l’équipe.", actions: [CONTACT] });
  }

  const wantsAdvice = phrase(t, ["conseil", "conseiller", "conseille", "recommande", "recommander", "quelle moto", "quelles motos", "quel modele de moto", "choisir", "debutant", "debutante", "debuter", "je debute", "premiere moto"]);
  const filter = categoryFilter(t);
  const mentioned = mentionedUsages(t);
  const motoCategory = !!filter && filter.length === 1 && filter[0] === "motos";
  if (phrase(t, ["autre usage"])) {
    mem.waitingForUsage = true; mem.usageBrandId = undefined; mem.usageNumbers = undefined;
    mem.lastUsage = undefined; mem.lastUsageBrandId = undefined; mem.lastDisplacement = undefined;
    return done({ text: "Pour quel usage cherchez-vous une moto ?", quick: ["Ville", "Travail", "Route", "Cross", "Enduro"] });
  }
  const changingUsage = !!mem.lastUsage && !filter && mentioned.length > 0 && words(t).length <= 3 && !knownBrand(t);
  const usageFollowUp = (!!mem.waitingForUsage || changingUsage) && !filter && mentioned.length > 0;
  const shortRefinement = !!mem.lastUsage && !filter && mentioned.length === 0 && (
    (!!displacement(t) && words(t).length <= 4) || (!!knownBrand(t) && words(t).length <= 4) || phrase(t, ["je debute", "debutant", "debutante", "je commence"])
  );

  // Un seul mot comme « cross » peut désigner une moto, un casque ou une pièce.
  if (!filter && mentioned.length && !wantsAdvice && !mem.waitingForUsage && !mem.lastUsage && !found.some((p) => contains(t, p.name))) {
    mem.pendingCategoryQuery = t;
    return done({ text: `Pour ${mentioned.map((g) => g.label).join(" / ")}, cherchez-vous une moto, un équipement ou une pièce ?`, quick: ["Moto", "Équipement", "Pièces"] });
  }
  const shoppingForMoto = motoCategory && !mentioned.length && phrase(t, ["je cherche", "je veux", "je voudrais", "j aimerais", "j ai besoin", "je souhaite", "besoin", "acheter", "achat", "quelle moto", "quel moto"]);
  const isMotoAdvice = (wantsAdvice && (!filter || motoCategory)) || (motoCategory && mentioned.length > 0) || shoppingForMoto || usageFollowUp || shortRefinement;
  if (!isMotoAdvice) { mem.waitingForUsage = false; mem.usageBrandId = undefined; mem.usageNumbers = undefined; }
  if (isMotoAdvice) {
    if (phrase(t, ["budget", "moins de", "maximum", "prix maximum"])) {
      mem.waitingForUsage = false;
      return done({ text: "Je ne peux pas vérifier qu’une moto correspond à votre budget. Précisez votre budget à l’équipe pour obtenir un devis à jour.", actions: [CONTACT] });
    }
    if (phrase(t, ["pas de", "pas une", "pas un", "sauf", "sans"])) {
      return done({ text: "Pour ne pas mal interpréter votre exclusion, indiquez ce que vous recherchez ou contactez l’équipe.", actions: [CONTACT] });
    }
    const usage = mentioned[0] ?? (shortRefinement ? usageById(mem.lastUsage) : undefined);
    const brandId = knownBrand(t)?.id ?? (mem.waitingForUsage && usageFollowUp ? mem.usageBrandId : (shortRefinement || changingUsage) ? mem.lastUsageBrandId : undefined);
    const cc = displacement(t) ?? (mem.waitingForUsage && usageFollowUp ? mem.usageNumbers?.[0] : (shortRefinement || changingUsage) ? mem.lastDisplacement : undefined);
    const unhandled = unhandledCriteria(t, brandId);
    if (unhandled.length) {
      const identifiedModels = found.length > 0 && found.every((product) => unhandled.every((term) => tokenMatch(`${product.name} ${modelName(product)}`, term)));
      if (identifiedModels) return done(showResults(mem, found, found.length === 1 ? "Voici le modèle correspondant" : "Voici les modèles correspondants"));
      return done({ text: "Pour ne pas ignorer vos critères, précisez le modèle, la marque ou le besoin à l’équipe : je ne peux pas interpréter toute la demande avec certitude.", actions: [CONTACT] });
    }
    if (mentioned.length > 1) {
      mem.waitingForUsage = true; mem.usageBrandId = brandId; mem.usageNumbers = cc ? [cc] : [];
      return done({ text: "Quel sera votre usage principal ? Cela m’aidera à chercher les fiches les plus pertinentes.", quick: mentioned.map((g) => g.label) });
    }
    if (!usage) {
      mem.waitingForUsage = true; mem.usageBrandId = brandId; mem.usageNumbers = cc ? [cc] : [];
      return done({ text: "Pour vous orienter, quel sera votre usage principal : ville, travail, route, cross ou enduro ? Je ne peux pas déduire le niveau ou le stock s’ils ne sont pas renseignés.", quick: ["Ville", "Travail", "Route", "Cross", "Enduro"], actions: [CONTACT] });
    }
    mem.waitingForUsage = false; mem.usageBrandId = undefined; mem.usageNumbers = undefined;
    mem.lastUsage = usage.id; mem.lastUsageBrandId = brandId; mem.lastDisplacement = cc;
    const suggestions = suggestUsage(usage, { brandId, cc });
    if (!suggestions.length) return done({ text: `Je ne trouve pas de fiche publiée qui indique un usage ${usage.label}${cc ? ` et une cylindrée de ${cc} cc` : ""}${brandId ? ` pour ${brands.find((b) => b.id === brandId)?.name ?? "cette marque"}` : ""}. L’équipe pourra vérifier d’autres possibilités.`, quick: ["Autre usage", "Contacter l’équipe"], actions: [CONTACT] });
    if (shortRefinement && phrase(t, ["je debute", "debutant", "debutante", "je commence"])) {
      return done({ text: `Merci pour la précision. Pour ${usage.label}, je peux montrer des fiches, mais je ne peux pas confirmer qu’une moto convient à un débutant. Voulez-vous préciser une cylindrée ou parler à un conseiller ?`, quick: ["Prix du premier", "Contacter l’équipe"], actions: [CONTACT] });
    }
    const reply = showResults(mem, suggestions.map((item) => item.product), `Voici des pistes pour ${usage.label}, selon les fiches`, Object.fromEntries(suggestions.map((item) => [item.product.id, item.reason])));
    reply.text += " Je ne peux pas confirmer le stock ni l’adaptation à votre expérience : l’équipe peut vous conseiller.";
    const amounts = [...new Set(suggestions.flatMap(({ product }) => (product.specifications ?? []).filter((spec) => norm(spec.key).includes("cylindree")).flatMap((spec) => {
      const match = norm(spec.value).match(/\b(\d{2,3})\s*(?:cc|cm3|cm 3)\b/); return match ? [match[1]] : [];
    })))];
    reply.quick = [...(reply.quick?.includes("Voir la suite") ? ["Voir la suite"] : []), "Prix du premier", ...(cc || !amounts[0] ? [] : [`${amounts[0]} cc`]), ...(phrase(t, ["debute", "debutant", "debutante"]) ? [] : ["Je débute"]), "Contacter l’équipe"];
    return done(reply);
  }
  if (matches.length) {
    mem.lastUsage = undefined; mem.lastUsageBrandId = undefined; mem.lastDisplacement = undefined;
    return done(showResults(mem, matches, "Voici les produits trouvés"));
  }
  if (phrase(t, ["financement", "credit", "garantie", "essai", "atelier"])) return done({ text: "L’équipe pourra vous renseigner sur cette demande.", actions: [CONTACT] });
  if (phrase(t, ["catalogue", "gamme"]) && terms.length === 0) return done({ text: `Le catalogue contient ${visible().length} produit${visible().length === 1 ? "" : "s"} publié${visible().length === 1 ? "" : "s"}. Que cherchez-vous ?`, quick: ["Motos", "Casques", "Équipements", "Pièces détachées", "Les nouveautés"] });
  mem.misses++;
  return { reply: { text: "Je n’ai pas trouvé de correspondance certaine dans le catalogue. Précisez le nom, la marque ou le type de produit, ou contactez l’équipe.", actions: [CONTACT], quick: initialQuick() }, memory: mem };
}

export function typingDelay(reply: BotReply): number { return Math.min(2300, Math.max(650, 450 + reply.text.length * 11 + (reply.productIds?.length ?? 0) * 120 + (reply.compare ? 300 : 0))); }
