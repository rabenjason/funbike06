export type ProductStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

export interface ProductImage {
  id: string;
  url: string;
  altText: string;
  isMain: boolean;
  position: number;
}

export interface ProductSpecification {
  key: string;
  value: string;
}

export interface Brand {
  id: string;
  name: string;
  logo?: string;
  /** Afficher cette marque parmi les marques d’équipements. */
  isEquipmentBrand: boolean;
  /** Les anciennes marques sont publiées par défaut et ne sont pas partenaires. */
  isPublished?: boolean;
  isPartner?: boolean;
}

export interface Model {
  id: string;
  name: string;
  brandId: string;
}

/** Unified static catalog record, also suitable for a future API adapter. */
export interface Product {
  id: string;
  name: string;
  brandId: string;
  categoryId: string;
  productTypeId: string;
  modelId?: string;
  description: string;
  subDescription?: string;
  images: ProductImage[];
  specifications: ProductSpecification[];
  status: ProductStatus;
  /** Sélectionner ce produit parmi les nouveautés de l’accueil. */
  isNewArrival: boolean;
  /** Réservé aux motos sélectionnées pour le bandeau d’accueil. */
  isHomepageHero?: boolean;
  /** Sélectionner une moto pour la section motos de l’accueil. */
  isMotoAccueil?: boolean;
  /** Sélectionner un casque ou équipement pour la section équipements de l’accueil. */
  isEquipementAccueil?: boolean;
  price?: string;
  tags?: string[];
  badge?: string;
  /** Compatibility is separate from the product's manufacturer. */
  compatibleBrandIds?: string[];
  compatibilityNote?: string;
  sourceUrl?: string;
}
