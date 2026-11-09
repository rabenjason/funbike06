import type { Brand } from "../types/product";
export const LOGO = "/server/public/assets/company/logo-funbike-720-a3ab2dc4.png";
export const brands: Brand[] = [];
export const getEquipmentBrands = (catalog: Brand[] = brands): Brand[] => catalog.filter((brand) => brand.isEquipmentBrand === true);
