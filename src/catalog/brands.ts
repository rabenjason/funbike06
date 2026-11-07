import type { Brand } from "../types/product";
export const LOGO = "/server/public/assets/company/logo-funbike.png";
export const brands: Brand[] = [];
export const getEquipmentBrands = (catalog: Brand[] = brands): Brand[] => catalog.filter((brand) => brand.isEquipmentBrand === true);
