import { brands, getEquipmentBrands } from "./brands";
import { families } from "./families";
import { productTypes } from "./productTypes";
import { products, getEquipmentProducts } from "./products";
import type { Product } from "../types/product";

/** La famille d'une moto est déduite de son type, sans seconde valeur à synchroniser. */
export const getProductFamily = (product: Product) => {
  const type = productTypes.find((item) => item.id === product.productTypeId && item.categoryId === product.categoryId);
  return families.find((family) => family.id === type?.familyId && family.categoryId === product.categoryId);
};

export const getAvailableMotoFamilies = (catalog: Product[] = products) =>
  families.filter((family) => family.categoryId === "motos" && catalog.some((product) =>
    product.status === "PUBLISHED" && product.categoryId === "motos" && getProductFamily(product)?.id === family.id));

export const getAvailableEquipmentBrands = () =>
  getEquipmentBrands().filter((brand) => getEquipmentProducts(brand.id).length > 0);

/** Types réellement présents dans une sélection de produits publiés. */
export const getAvailableTypes = (catalog: Product[]) =>
  productTypes.filter((type) => catalog.some((product) => product.status === "PUBLISHED" && product.categoryId === type.categoryId && product.productTypeId === type.id));

/** Marques réelles : fabricant de la pièce ou marque de moto compatible. */
export const getAvailableSpareBrands = (catalog: Product[]) =>
  brands.filter((brand) => brand.id !== "unknown-brand" && catalog.some((part) =>
    part.status === "PUBLISHED" && part.categoryId === "pieces-detachees" &&
    (part.brandId === brand.id || part.compatibleBrandIds?.includes(brand.id))));
