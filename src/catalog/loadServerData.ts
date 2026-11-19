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

/** Charge les données du catalogue ; les revendeurs peuvent être laissés au chargement indépendant du démarrage. */
export async function loadServerData(signal?: AbortSignal, confirmBeforeCommit?: () => Promise<void>, backgroundDealers = false) {
  const current = ++loadSequence;
  const currentDealer = backgroundDealers ? null : ++dealerSequence;
  if (signal?.aborted) throw new Error("Chargement annulé.");
  const batch = new AbortController();
  const abortBatch = () => batch.abort();
  signal?.addEventListener("abort", abortBatch, { once: true });
  const dealerRead = backgroundDealers ? Promise.resolve(null) : read("dealers.php", batch.signal);
  const tasks = [
    read("brands.php", batch.signal), read("categories.php", batch.signal), read("families.php", batch.signal), read("product-types.php", batch.signal), read("models.php", batch.signal),
    read("products/motorcycles.php", batch.signal), read("products/helmets.php", batch.signal), read("products/riding-gear.php", batch.signal), read("products/spare-parts.php", batch.signal),
    dealerRead, read("contacts.php", batch.signal),
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
    const normalizeProducts = (input: Product[]) => input.filter((product) => product.status === "PUBLISHED").map((product) => ({
      ...product, price: "Sur devis", description: product.description ?? "", images: Array.isArray(product.images) ? product.images : [],
      specifications: Array.isArray(product.specifications) ? product.specifications : [], isNewArrival: product.isNewArrival === true,
    }));
    const motos = normalizeProducts(list<Product>(motoData, "data"));
    const casques = normalizeProducts(list<Product>(helmetData, "data"));
    const gear = normalizeProducts(list<Product>(gearData, "data"));
    const parts = normalizeProducts(list<Product>(partsData, "data"));
    const newDealers = dealerData === null ? null : list<Dealer>(dealerData, "dealers");
    const contact = contactData.contact as Parameters<typeof setContactInfo>[0];
    if (!contact || typeof contact.email !== "string" || typeof contact.phone !== "string" || typeof contact.phoneHref !== "string" || typeof contact.address !== "string" || typeof contact.hours !== "string") throw new Error("Les coordonnées sont invalides.");
    if (signal?.aborted) throw new Error("Chargement annulé.");
    if (confirmBeforeCommit) await confirmBeforeCommit();
    if (signal?.aborted || current !== loadSequence || (currentDealer !== null && currentDealer !== dealerSequence)) throw new Error("Chargement annulé.");
    replace(brands, newBrands); replace(categories, newCategories); replace(families, newFamilies); replace(productTypes, newTypes); replace(models, newModels);
    replace(motorcycles, motos); replace(helmets, casques); replace(ridingGear, gear); replace(spareParts, parts);
    replace(products, [...motos, ...parts, ...casques, ...gear]);
    setContactInfo(contact);
    dataGeneration++;
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
