export const defaultHomeSignText = "Promotions disponibles !";
export const isHomeSignText = (value: unknown): value is string => typeof value === "string" && !!value.trim() && Array.from(value).length <= 100 && !/[\x00-\x1f\x7f]/.test(value);
export const isPromotionPriceColor = (value: unknown): value is string => typeof value === "string" && /^(?:|#[0-9a-fA-F]{6})$/.test(value);
export type PromotionCategory = "tous" | "motos" | "equipements" | "pieces";
export const isPromotionCategory = (value: unknown): value is PromotionCategory => value === "tous" || value === "motos" || value === "equipements" || value === "pieces";

export interface PromotionProduct {
  productId: string;
  categoryId: string;
  originalPrice: number;
  discountPercent: number;
}
export type PromotionStyle = "sobre" | "sportif" | "festif" | "black-friday";
export interface PromotionAppearance {
  style: PromotionStyle;
  showBanner: boolean;
  showDescription: boolean;
  /** Absente sur les campagnes créées avant cette option. */
  titleItalic?: boolean;
  titleColor: string;
  highlight: string;
  highlightColor: string;
}
export const defaultPromotionAppearance = (): PromotionAppearance => ({ style: "sobre", showBanner: false, showDescription: false, titleItalic: false, titleColor: "", highlight: "", highlightColor: "" });
export function isPromotionAppearance(value: unknown): value is PromotionAppearance {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return typeof item.style === "string" && ["sobre", "sportif", "festif", "black-friday"].includes(item.style)
    && typeof item.showBanner === "boolean" && typeof item.showDescription === "boolean"
    && (item.titleItalic === undefined || typeof item.titleItalic === "boolean")
    && typeof item.highlight === "string" && Array.from(item.highlight).length <= 150
    && typeof item.titleColor === "string" && /^(?:|#[0-9a-fA-F]{6})$/.test(item.titleColor)
    && typeof item.highlightColor === "string" && /^(?:|#[0-9a-fA-F]{6})$/.test(item.highlightColor);
}

export interface Promotion {
  id: string;
  name: string;
  description: string;
  bannerUrl?: string;
  /** Absente ou nulle : conserver le rendu historique. */
  appearance?: PromotionAppearance | null;
  startDate: string;
  endDate: string;
  enabled: boolean;
  published: boolean;
  products: PromotionProduct[];
}

export function isValidPromotionDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}
export function madagascarDate(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Indian/Antananarivo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function isPromotionActive(p: Promotion, now: Date = new Date()): boolean {
  if (!p.enabled || !p.published || !isValidPromotionDate(p.startDate) || !isValidPromotionDate(p.endDate) || p.startDate > p.endDate) return false;
  const today = madagascarDate(now);
  return today >= p.startDate && today <= p.endDate;
}
/** Temps restant depuis la veille du dernier jour inclus, à Madagascar (UTC+3). */
export function promotionCountdown(endDate: string, now: number): string | null {
  if (!isValidPromotionDate(endDate) || !Number.isFinite(now)) return null;
  // Minuit suivant à Antananarivo correspond à 21 h UTC le jour de fin.
  const end = Date.parse(`${endDate}T21:00:00.000Z`);
  const remaining = end - now;
  if (!Number.isFinite(end) || remaining <= 0 || remaining > 48 * 60 * 60 * 1000) return null;
  const seconds = Math.ceil(remaining / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return [hours, minutes, seconds % 60].map((part) => String(part).padStart(2, '0')).join(':');
}
/** Prix entier en ariary ; réduction arrondie à l'ariary le plus proche. */
export function calculatePromotionPrice(originalPrice: number, discountPercent: number): { reduction: number; finalPrice: number } {
  const bp = Math.round(discountPercent * 100);
  if (!Number.isSafeInteger(originalPrice) || originalPrice <= 0 || originalPrice > 1_000_000_000_000 || !Number.isFinite(discountPercent) || discountPercent <= 0 || discountPercent > 100 || Math.abs(discountPercent * 100 - bp) > 1e-8) throw new RangeError("Prix ou pourcentage invalide.");
  const reduction = Number((BigInt(originalPrice) * BigInt(bp) + 5000n) / 10000n);
  return { reduction, finalPrice: originalPrice - reduction };
}
export const formatAriary = (value: number) => `${new Intl.NumberFormat("fr-FR").format(value)} Ar`;
