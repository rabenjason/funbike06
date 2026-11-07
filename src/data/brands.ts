import type { Brand } from "../types/product";

export const LOGO = "https://funbike.mg/wp-content/themes/funbike/images/logo-funbike.png";

export const brands: Brand[] = [
  {
    "id": "tvs",
    "isEquipmentBrand": true,
    "name": "TVS",
    "logo": "https://funbike.mg/wp-content/uploads/2026/02/tvs-logo.png"
  },
  {
    "id": "fantic",
    "isEquipmentBrand": false,
    "name": "Fantic",
    "logo": "https://funbike.mg/wp-content/themes/funbike/images/fantic.png"
  },
  {
    "id": "sherco",
    "isEquipmentBrand": false,
    "name": "Sherco",
    "logo": "https://funbike.mg/wp-content/uploads/2026/02/sherco.png"
  },
  {
    "id": "bihr",
    "isEquipmentBrand": true,
    "name": "Bihr",
    "logo": "https://funbike.mg/wp-content/uploads/2026/02/bihr-logo.jpg"
  },
  {
    "id": "trace",
    "isEquipmentBrand": false,
    "name": "Trace",
    "logo": "https://funbike.mg/wp-content/uploads/2026/02/Trace-1.png"
  },
  {
    "id": "gaerne",
    "isEquipmentBrand": true,
    "name": "Gaerne",
    "logo": "https://funbike.mg/wp-content/uploads/2026/02/gaerne-logo.jpg"
  },
  {
    "id": "galfer",
    "isEquipmentBrand": false,
    "name": "Galfer",
    "logo": "https://funbike.mg/wp-content/uploads/2026/02/Galfer-logo.png"
  },
  {
    "id": "mt-helmets",
    "isEquipmentBrand": true,
    "name": "MT Helmets",
    "logo": "https://funbike.mg/wp-content/uploads/2026/02/mt.png"
  },
  {
    "id": "troy-lee-designs",
    "isEquipmentBrand": true,
    "name": "Troy Lee Designs",
    "logo": "https://funbike.mg/wp-content/uploads/2026/02/sticker-troy-lee-designs-shield-logo-rouge-16cm.png"
  },
  {
    "id": "funbike",
    "isEquipmentBrand": false,
    "name": "Funbike"
  },
  {
    "id": "unknown-brand",
    "isEquipmentBrand": false,
    "name": "Marque non renseignée"
  }
];

/** Marques à afficher dans la section et la page Équipements, dans l'ordre des données. */
export const getEquipmentBrands = (catalog: Brand[] = brands): Brand[] =>
  catalog.filter((brand) => brand.isEquipmentBrand === true);
