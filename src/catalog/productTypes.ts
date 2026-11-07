export interface ProductType {
  id: string;
  name: string;
  categoryId: string;
  /** Famille pour les types de motos ; absente pour les autres catégories. */
  familyId?: string;
}

export const productTypes: ProductType[] = [];
