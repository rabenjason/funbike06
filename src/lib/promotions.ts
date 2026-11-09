export interface PromotionProduct {
  productId: string;
  categoryId: string;
  originalPrice: number;
  discountPercent: number;
}
export interface Promotion {
  id: string;
  name: string;
  description: string;
  bannerUrl?: string;
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
/** Prix entier en ariary ; réduction arrondie à l'ariary le plus proche. */
export function calculatePromotionPrice(originalPrice: number, discountPercent: number): { reduction: number; finalPrice: number } {
  const bp = Math.round(discountPercent * 100);
  if (!Number.isSafeInteger(originalPrice) || originalPrice <= 0 || originalPrice > 1_000_000_000_000 || !Number.isFinite(discountPercent) || discountPercent <= 0 || discountPercent > 100 || Math.abs(discountPercent * 100 - bp) > 1e-8) throw new RangeError("Prix ou pourcentage invalide.");
  const reduction = Number((BigInt(originalPrice) * BigInt(bp) + 5000n) / 10000n);
  return { reduction, finalPrice: originalPrice - reduction };
}
export const formatAriary = (value: number) => `${new Intl.NumberFormat("fr-FR").format(value)} Ar`;
