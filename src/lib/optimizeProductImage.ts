import imageCompression, { type Options } from "browser-image-compression";

export type PhotoOptimization = "optimized" | "unchanged" | "animated" | "failed";
export type OptimizedPhoto = { file: File; status: PhotoOptimization };
const MIN_SIZE = 100 * 1024;
const MAX_SIDE = 2048;

// Les images animées ne doivent jamais être aplaties en une seule image.
// Si le format ne peut pas être inspecté, l'appelant conserve l'original.
async function isAnimated(file: File): Promise<boolean> {
  if (file.type === "image/jpeg") return false;
  if (file.type === "image/webp") {
    const bytes = new Uint8Array(await file.slice(0, 21).arrayBuffer());
    if (bytes.length < 20 || String.fromCharCode(...bytes.slice(0, 4)) !== "RIFF" || String.fromCharCode(...bytes.slice(8, 12)) !== "WEBP") throw new Error("WebP invalide");
    const chunk = String.fromCharCode(...bytes.slice(12, 16));
    if (chunk === "VP8X") {
      if (bytes.length < 21) throw new Error("WebP incomplet");
      return (bytes[20] & 0x02) !== 0;
    }
    return false;
  }
  if (file.type === "image/png") {
    const signature = new Uint8Array(await file.slice(0, 8).arrayBuffer());
    if (signature.length !== 8 || ![137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => signature[i] === v)) throw new Error("PNG invalide");
    let offset = 8;
    for (let i = 0; i < 2048 && offset + 12 <= file.size; i++) {
      const chunk = new Uint8Array(await file.slice(offset, offset + 8).arrayBuffer());
      if (chunk.length !== 8) throw new Error("PNG incomplet");
      const size = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength).getUint32(0);
      const name = String.fromCharCode(...chunk.slice(4, 8));
      if (offset + 12 + size > file.size) throw new Error("PNG incomplet");
      if (name === "acTL") return true;
      if (name === "IDAT") return false;
      offset += 12 + size;
    }
    throw new Error("PNG non reconnu");
  }
  throw new Error("Format non reconnu");
}

/** Optimise une copie locale. L'original reste intact si l'optimisation échoue ou n'est pas avantageuse. */
export async function optimizeProductImage(file: File, signal?: AbortSignal, compress: (file: File, options: Options) => Promise<File> = imageCompression): Promise<OptimizedPhoto> {
  if (signal?.aborted) throw new Error("Optimisation annulée.");
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || !file.size) return { file, status: "failed" };
  // Éviter de dégrader les petites photos déjà légères.
  if (file.size <= MIN_SIZE) return { file, status: "unchanged" };
  try {
    if (await isAnimated(file)) return { file, status: "animated" };
    if (signal?.aborted) throw new Error("Optimisation annulée.");
    const result = await compress(file, {
      fileType: "image/webp", maxWidthOrHeight: MAX_SIDE, initialQuality: 0.88,
      maxIteration: 1, maxSizeMB: Number.POSITIVE_INFINITY, alwaysKeepResolution: true,
      // L'option worker par défaut charge un script depuis un CDN externe.
      useWebWorker: false, preserveExif: false, signal,
    });
    if (signal?.aborted) throw new Error("Optimisation annulée.");
    // Certains navigateurs renvoient un PNG si WebP n'est pas pris en charge.
    if (result.type !== "image/webp" || !result.size) return { file, status: "failed" };
    if (result.size >= file.size) return { file, status: "unchanged" };
    const name = `${file.name.replace(/\.[^.]+$/, "") || "photo"}.webp`;
    return { file: new File([result], name, { type: "image/webp", lastModified: file.lastModified }), status: "optimized" };
  } catch (error) {
    if (signal?.aborted) throw error;
    return { file, status: "failed" };
  }
}

export function photoFileSize(size: number): string {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} Ko`;
  return `${(size / (1024 * 1024)).toFixed(2).replace(".", ",")} Mo`;
}
