import { brands } from "./brands";
import { categories } from "./categories";
import { families } from "./families";
import { models } from "./models";
import { productTypes } from "./productTypes";
import { motorcycles, helmets, ridingGear, spareParts, products } from "./products";
import { DEALERS, dealerStatus, setDealerStatus } from "./dealers";
import { readPublicJson } from "../lib/publicDataRequest";
import { setContactInfo } from "./contact";
import type { Brand, Model, Product } from "../types/product";
import type { Dealer } from "../types";
import type { ProductType } from "./productTypes";

async function read(path: string, signal?: AbortSignal): Promise<Record<string, unknown>> {
  const value = await readPublicJson(path, signal);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Réponse du serveur invalide.");
  return value as Record<string, unknown>;
}

function list<T>(data: Record<string, unknown>, key: string): T[] {
  if (!Array.isArray(data[key])) throw new Error(`Les données ${key} sont invalides.`);
  return data[key] as T[];
}
// Tout remplacement externe invalide une empreinte précédemment vérifiée.
let dataGeneration = 0;
let loadSequence = 0;
let dealerSequence = 0;
export function getPublicDataGeneration() { return dataGeneration; }
function replace<T>(target: T[], values: T[]) { target.splice(0, target.length, ...values); }

const normalizeProducts = (input: Product[]) => input.filter((product) => product.status === "PUBLISHED").map((product) => ({
  ...product, price: "Sur devis", description: product.description ?? "", images: Array.isArray(product.images) ? product.images : [],
  specifications: Array.isArray(product.specifications) ? product.specifications : [], isNewArrival: product.isNewArrival === true,
}));
function validContact(data: Record<string, unknown>) {
  const contact = data.contact as Parameters<typeof setContactInfo>[0];
  if (!contact || typeof contact.email !== "string" || typeof contact.phone !== "string" || typeof contact.phoneHref !== "string" || typeof contact.address !== "string" || typeof contact.hours !== "string") throw new Error("Les coordonnées sont invalides.");
  return contact;
}
type Preloaded = Record<string, Record<string, unknown>>;
type BackgroundStatus = "ready" | "loading" | "error";
let backgroundStatus: BackgroundStatus = "ready";
let backgroundPromise: Promise<void> | undefined;
const backgroundListeners = new Set<() => void>();
export function getBackgroundStatus() { return backgroundStatus; }
export function subscribeBackgroundStatus(listener: () => void) { backgroundListeners.add(listener); return () => backgroundListeners.delete(listener); }
function setBackgroundStatus(status: BackgroundStatus) { backgroundStatus = status; backgroundListeners.forEach((listener) => listener()); }

/** D'abord les seules données indispensables à la page directement ouverte. */
export async function loadInitialCatalog(pathname: string, signal?: AbortSignal): Promise<Preloaded> {
  const path = pathname.replace(/\/+$/, "") || "/";
  const productFiles = path === "/" ? ["motorcycles", "helmets", "riding-gear", "spare-parts"]
    : /^\/motos(?:\/[^/]+)?$/.test(path) ? ["motorcycles"]
    : /^\/(?:equipements|casques)(?:\/[^/]+)?$/.test(path) ? ["helmets", "riding-gear"]
    : /^\/pieces-detachees(?:\/[^/]+)?$/.test(path) ? ["spare-parts"]
    : ["motorcycles", "helmets", "riding-gear", "spare-parts"];
  const paths = ["brands.php", "families.php", "product-types.php", ...productFiles.map((name) => `products/${name}.php`), "contacts.php"];
  const batch = new AbortController();
  const abort = () => batch.abort();
  if (signal?.aborted) throw new Error("Chargement annulé.");
  signal?.addEventListener("abort", abort, { once: true });
  const tasks = paths.map((name) => read(name, batch.signal));
  let values: Record<string, unknown>[];
  try { values = await Promise.all(tasks); }
  catch (error) { batch.abort(); await Promise.allSettled(tasks); throw error; }
  finally { signal?.removeEventListener("abort", abort); }
  const data: Preloaded = Object.fromEntries(paths.map((name, index) => [name, values[index]]));
  const newBrands = list<Brand>(data["brands.php"], "brands");
  const newFamilies = list<{ id: string; name: string; categoryId: string }>(data["families.php"], "families");
  const newTypes = list<ProductType>(data["product-types.php"], "productTypes");
  const contact = validContact(data["contacts.php"]);
  const lists = ["motorcycles", "helmets", "riding-gear", "spare-parts"].map((name) => data[`products/${name}.php`] ? normalizeProducts(list<Product>(data[`products/${name}.php`], "data")) : []);
  if (signal?.aborted) throw new Error("Chargement annulé.");
  ++loadSequence;
  replace(brands, newBrands); replace(families, newFamilies); replace(productTypes, newTypes);
  replace(motorcycles, lists[0]); replace(helmets, lists[1]); replace(ridingGear, lists[2]); replace(spareParts, lists[3]);
  replace(products, [...lists[0], ...lists[3], ...lists[1], ...lists[2]]);
  setContactInfo(contact); dataGeneration++;
  return data;
}
/** Les autres pages attendent les données complémentaires, avec réessai ciblé. */
export function startBackgroundCatalog(preloaded?: Preloaded) {
  if (backgroundPromise) return backgroundPromise;
  setBackgroundStatus("loading");
  const promise = loadServerData(undefined, undefined, true, preloaded).then(() => { setBackgroundStatus("ready"); }, (error) => { setBackgroundStatus("error"); throw error; });
  backgroundPromise = promise.finally(() => { backgroundPromise = undefined; });
  return backgroundPromise;
}
export async function waitForBackgroundCatalog(signal?: AbortSignal) {
  if (!backgroundPromise) return;
  if (signal?.aborted) throw new Error("Chargement annulé.");
  await new Promise<void>((resolve, reject) => {
    const abort = () => { cleanup(); reject(new Error("Chargement annulé.")); };
    const cleanup = () => signal?.removeEventListener("abort", abort);
    signal?.addEventListener("abort", abort, { once: true });
    backgroundPromise!.then(() => { cleanup(); resolve(); }, () => { cleanup(); resolve(); });
  });
}

/** Charge les données du catalogue ; les revendeurs peuvent être laissés au chargement indépendant du démarrage. */
export async function loadServerData(signal?: AbortSignal, confirmBeforeCommit?: () => Promise<void>, backgroundDealers = false, preloaded?: Preloaded) {
  const current = ++loadSequence;
  const currentDealer = backgroundDealers ? null : ++dealerSequence;
  if (signal?.aborted) throw new Error("Chargement annulé.");
  const batch = new AbortController();
  const abortBatch = () => batch.abort();
  signal?.addEventListener("abort", abortBatch, { once: true });
  const readOnce = (path: string) => preloaded?.[path] ? Promise.resolve(preloaded[path]) : read(path, batch.signal);
  const dealerRead = backgroundDealers ? Promise.resolve(null) : readOnce("dealers.php");
  const tasks = [
    readOnce("brands.php"), readOnce("categories.php"), readOnce("families.php"), readOnce("product-types.php"), readOnce("models.php"),
    readOnce("products/motorcycles.php"), readOnce("products/helmets.php"), readOnce("products/riding-gear.php"), readOnce("products/spare-parts.php"),
    dealerRead, readOnce("contacts.php"),
  ] as const;
  try {
    const [brandData, categoryData, familyData, typeData, modelData, motoData, helmetData, gearData, partsData, dealerData, contactData] = await Promise.all(tasks)
      .catch(async (error: unknown) => { batch.abort(); await Promise.allSettled(tasks); throw error; })
      .finally(() => signal?.removeEventListener("abort", abortBatch));
    const newBrands = list<Brand>(brandData, "brands");
    const newCategories = list<{ id: string; name: string }>(categoryData, "categories");
    const newFamilies = list<{ id: string; name: string; categoryId: string }>(familyData, "families");
    const newTypes = list<ProductType>(typeData, "productTypes");
    const newModels = list<Model>(modelData, "models");
    const motos = normalizeProducts(list<Product>(motoData, "data"));
    const casques = normalizeProducts(list<Product>(helmetData, "data"));
    const gear = normalizeProducts(list<Product>(gearData, "data"));
    const parts = normalizeProducts(list<Product>(partsData, "data"));
    const newDealers = dealerData === null ? null : list<Dealer>(dealerData, "dealers");
    const contact = validContact(contactData);
    if (signal?.aborted) throw new Error("Chargement annulé.");
    if (confirmBeforeCommit) await confirmBeforeCommit();
    if (signal?.aborted || current !== loadSequence || (currentDealer !== null && currentDealer !== dealerSequence)) throw new Error("Chargement annulé.");
    replace(brands, newBrands); replace(categories, newCategories); replace(families, newFamilies); replace(productTypes, newTypes); replace(models, newModels);
    replace(motorcycles, motos); replace(helmets, casques); replace(ridingGear, gear); replace(spareParts, parts);
    replace(products, [...motos, ...parts, ...casques, ...gear]);
    setContactInfo(contact);
    dataGeneration++;
    if (currentDealer !== null && backgroundStatus === "error") setBackgroundStatus("ready");
    if (currentDealer !== null && currentDealer === dealerSequence && newDealers !== null) {
      replace(DEALERS, newDealers); setDealerStatus("ready");
    }
    return dataGeneration;
  } finally {
    if (currentDealer !== null && currentDealer === dealerSequence && dealerStatus() === "loading") setDealerStatus("error");
  }
}

/** Réessai ciblé des revendeurs, sans exposer une ancienne réponse. */
export async function reloadDealers(signal?: AbortSignal) {
  const current = ++dealerSequence;
  setDealerStatus("loading");
  try {
    const dealers = list<Dealer>(await read("dealers.php", signal), "dealers");
    if (signal?.aborted || current !== dealerSequence) return;
    replace(DEALERS, dealers);
    dataGeneration++;
    setDealerStatus("ready");
  } catch {
    if (current === dealerSequence) { replace(DEALERS, []); dataGeneration++; setDealerStatus("error"); }
  }
}
