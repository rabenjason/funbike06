import type { Product } from "../types/product";

/** Mélange une copie et évite de présenter exactement la même première page au retour. */
export function shuffleMotorcycles(bikes: Product[], previousIds: string[], pageSize: number, random = Math.random): Product[] {
  const shuffled = [...bikes];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  if (shuffled.length < 2 || previousIds.length === 0) return shuffled;
  const firstPage = shuffled.slice(0, pageSize).map((bike) => bike.id);
  const previousPage = previousIds.slice(0, pageSize);
  if (shuffled.length > pageSize) {
    // S'il existe plus d'une page, remplacer au moins une moto de la première.
    const oldIds = new Set(previousPage);
    if (firstPage.length === oldIds.size && firstPage.every((id) => oldIds.has(id))) {
      [shuffled[0], shuffled[pageSize]] = [shuffled[pageSize], shuffled[0]];
    }
  } else if (firstPage.length === previousPage.length && firstPage.every((id, i) => id === previousPage[i])) {
    // Une seule page : changer au moins l'ordre des cartes.
    [shuffled[0], shuffled[1]] = [shuffled[1], shuffled[0]];
  }
  return shuffled;
}
