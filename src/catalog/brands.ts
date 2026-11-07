import type { Brand } from "../types/product";
export const LOGO = "https://funbike.mg/wp-content/themes/funbike/images/logo-funbike.png";
export const brands: Brand[] = [];
export const getEquipmentBrands = (catalog: Brand[] = brands): Brand[] => catalog.filter((brand) => brand.isEquipmentBrand === true);
