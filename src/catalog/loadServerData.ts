import { brands } from "./brands";
import { categories } from "./categories";
import { families } from "./families";
import { models } from "./models";
import { productTypes } from "./productTypes";
import { motorcycles, helmets, ridingGear, spareParts, products } from "./products";
import { DEALERS } from "./dealers";
import { setContactInfo } from "./contact";
import type { Brand, Model, Product } from "../types/product";
import type { Dealer } from "../types";
import type { ProductType } from "./productTypes";

async function read(path: string, signal?: AbortSignal): Promise<Record<string, unknown>> {
  const res = await fetch(`/server/api/${path}`, { credentials: "same-origin", cache: "no-store", signal });
  if (!res.ok) throw new Error(`Le serveur est indisponible (${res.status}).`);
  const value: unknown = await res.json();
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Réponse du serveur invalide.");
  return value as Record<string, unknown>;
}

function list<T>(data: Record<string, unknown>, key: string): T[] {
  if (!Array.isArray(data[key])) throw new Error(`Les données ${key} sont invalides.`);
  return data[key] as T[];
}
function replace<T>(target: T[], values: T[]) { target.splice(0, target.length, ...values); }

/** Charge toutes les données publiques avant de démarrer React, sans afficher de copie périmée en cas d'erreur. */
export async function loadServerData(signal?: AbortSignal) {
  const [brandData, categoryData, familyData, typeData, modelData, motoData, helmetData, gearData, partsData, dealerData, contactData] = await Promise.all([
    read("brands.php", signal), read("categories.php", signal), read("families.php", signal), read("product-types.php", signal), read("models.php", signal),
    read("products/motorcycles.php", signal), read("products/helmets.php", signal), read("products/riding-gear.php", signal), read("products/spare-parts.php", signal),
    read("dealers.php", signal), read("contacts.php", signal),
  ]);
  const newBrands = list<Brand>(brandData, "brands");
  const newCategories = list<{ id: string; name: string }>(categoryData, "categories");
  const newFamilies = list<{ id: string; name: string; categoryId: string }>(familyData, "families");
  const newTypes = list<ProductType>(typeData, "productTypes");
  const newModels = list<Model>(modelData, "models");
  const normalizeProducts = (input: Product[]) => input.filter((product) => product.status === "PUBLISHED").map((product) => ({
    ...product, description: product.description ?? "", images: Array.isArray(product.images) ? product.images : [],
    specifications: Array.isArray(product.specifications) ? product.specifications : [], isNewArrival: product.isNewArrival === true,
  }));
  const motos = normalizeProducts(list<Product>(motoData, "data"));
  const casques = normalizeProducts(list<Product>(helmetData, "data"));
  const gear = normalizeProducts(list<Product>(gearData, "data"));
  const parts = normalizeProducts(list<Product>(partsData, "data"));
  const newDealers = list<Dealer>(dealerData, "dealers");
  const contact = contactData.contact as Parameters<typeof setContactInfo>[0];
  if (!contact || typeof contact.email !== "string" || typeof contact.phone !== "string" || typeof contact.phoneHref !== "string" || typeof contact.address !== "string" || typeof contact.hours !== "string") throw new Error("Les coordonnées sont invalides.");
  if (signal?.aborted) throw new Error("Chargement annulé.");
  replace(brands, newBrands); replace(categories, newCategories); replace(families, newFamilies); replace(productTypes, newTypes); replace(models, newModels);
  replace(motorcycles, motos); replace(helmets, casques); replace(ridingGear, gear); replace(spareParts, parts);
  replace(products, [...motos, ...parts, ...casques, ...gear]);
  replace(DEALERS, newDealers); setContactInfo(contact);
}
