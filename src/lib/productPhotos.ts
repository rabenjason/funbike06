import type { PhotoOptimization } from "./optimizeProductImage";
import type { ProductImage } from "../types/product";

export type EditablePhoto = {
  key: string;
  preview: string;
  image?: ProductImage;
  file?: File;
  originalName?: string;
  originalSize?: number;
  optimization?: PhotoOptimization | "processing";
};

/** Prépare une photo principale et conserve les autres photos pour l'API. */
export function prepareProductPhotos(photos: EditablePhoto[], mainKey: string | null) {
  const selected = photos.find((photo) => photo.key === mainKey);
  if (photos.length && !selected) throw new Error("Choisissez une photo principale avant d'enregistrer.");
  const existing = photos.filter((photo) => photo.image);
  if (selected?.image) existing.sort((a, b) => Number(b.key === mainKey) - Number(a.key === mainKey));
  const images = existing.map((photo, index) => ({
    ...photo.image!,
    isMain: photo.key === mainKey,
    // Une photo principale nouvellement envoyée occupe la position zéro.
    position: index + (selected?.file ? 1 : 0),
  }));
  return {
    images,
    mainImage: selected?.file,
    gallery: photos.filter((photo) => photo.file && photo.key !== mainKey).map((photo) => photo.file!),
  };
}
