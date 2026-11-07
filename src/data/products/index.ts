import { motorcycles } from "./motorcycles";
import { spareParts } from "./spareParts";
import { helmets } from "./helmets";
import { ridingGear } from "./ridingGear";
import { accessories } from "./accessories";
import type { Product } from "../../types/product";

export { motorcycles, spareParts, helmets, ridingGear, accessories };
export const products: Product[] = [
  ...motorcycles,
  ...spareParts,
  ...helmets,
  ...ridingGear,
  ...accessories,
];

export const findProductById = (id?: string): Product | undefined =>
  id ? products.find((product) => product.id === id) : undefined;
export const getProductsByBrand = (brandId: string): Product[] =>
  products.filter((product) => product.brandId === brandId);
export const getProductsByCategory = (categoryId: string): Product[] =>
  products.filter((product) => product.categoryId === categoryId);
export const getProductsByType = (productTypeId: string): Product[] =>
  products.filter((product) => product.productTypeId === productTypeId);
export const mainProductImage = (product: Product) =>
  [...product.images].sort((a, b) => a.position - b.position).find((image) => image.isMain) ?? product.images[0];
export const productGallery = (product: Product) =>
  [...product.images].sort((a, b) => a.position - b.position).map((image) => image.url);

/** Les trois premiers produits publiés marqués, dans l'ordre du catalogue. */
export const getHomepageHighlights = (catalog: Product[] = products): Product[] =>
  catalog.filter((product) => product.isHomepageHighlight === true && product.status === "PUBLISHED").slice(0, 3);

/** Les trois premières motos publiées sélectionnées, dans l'ordre du catalogue. */
export const getHomepageHeroProducts = (catalog: Product[] = motorcycles): Product[] =>
  catalog.filter((product) => product.categoryId === "motos" && product.isHomepageHero === true && product.status === "PUBLISHED").slice(0, 3);

/** Les motos et les autres produits ont des pages de détail distinctes. */
export const productDetailPage = (product: Product): "product" | "accessory" =>
  product.categoryId === "motos" ? "product" : "accessory";
