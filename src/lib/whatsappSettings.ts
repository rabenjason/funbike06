import type { Product } from "../types/product";
import { productPath } from "./routes";

export type WhatsappTexts = {
  intentTitle: string; priceLabel: string; infoLabel: string; choiceTitle: string; siteLabel: string;
  whatsappLabel: string; continueLabel: string; priceTemplate: string; infoTemplate: string; directTemplate: string;
};
export type WhatsappPerson = { id: string; name: string; phone: string };
export type WhatsappTeam = { activeId: string | null; people: WhatsappPerson[] };
export type WhatsappSettings = { enabled: boolean; askIntent: boolean; texts: WhatsappTexts; sales: WhatsappTeam; parts: WhatsappTeam };
export type PublicWhatsappSettings = { enabled: boolean; askIntent: boolean; texts: WhatsappTexts; sales: { phone: string } | null; parts: { phone: string } | null };
export const defaultWhatsappSettings: WhatsappSettings = {
  enabled: false, askIntent: true,
  texts: {
    intentTitle: "Que souhaitez-vous demander ?", priceLabel: "Prix et disponibilité", infoLabel: "Informations",
    choiceTitle: "Comment souhaitez-vous vous renseigner ?", siteLabel: "Via le site", whatsappLabel: "Par WhatsApp", continueLabel: "Continuer sur WhatsApp",
    priceTemplate: "Bonjour, je souhaite connaître le prix et la disponibilité de {produit}.\n{lien}",
    infoTemplate: "Bonjour, je souhaite obtenir des informations sur {produit}.\n{lien}",
    directTemplate: "Bonjour, je souhaite me renseigner sur {produit}.\n{lien}",
  }, sales: { activeId: null, people: [] }, parts: { activeId: null, people: [] },
};
export const phoneDigits = (phone: string) => phone.replace(/\D/g, "");
export const validPhone = (phone: string) => /^\+[\d\s().-]+$/.test(phone) && /^[1-9]\d{7,14}$/.test(phoneDigits(phone));
export function validTexts(texts: WhatsappTexts): boolean {
  return Object.entries(defaultWhatsappSettings.texts).every(([key]) => {
    const value = texts?.[key as keyof WhatsappTexts]; const template = key.endsWith("Template");
    return typeof value === "string" && !!value.trim() && [...value].length <= (template ? 1200 : 120)
      && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value)
      && (!template || (value.includes("{produit}") && value.includes("{lien}")));
  });
}
export function validSettings(data: WhatsappSettings): boolean {
  if (!data || typeof data.enabled !== "boolean" || typeof data.askIntent !== "boolean" || !validTexts(data.texts)) return false;
  return ([data.sales, data.parts]).every((team) => {
    if (!team || !Array.isArray(team.people) || team.people.length > 30) return false;
    const ids = new Set<string>();
    for (const p of team.people) {
      if (!p || typeof p.id !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(p.id) || ids.has(p.id) || typeof p.name !== "string" || !p.name.trim() || [...p.name].length > 80 || /[\x00-\x1f\x7f]/.test(p.name) || typeof p.phone !== "string" || !validPhone(p.phone)) return false;
      ids.add(p.id);
    }
    return team.activeId === null || (typeof team.activeId === "string" && ids.has(team.activeId));
  });
}
export function validPublicSettings(data: PublicWhatsappSettings): boolean {
  return !!data && typeof data.enabled === "boolean" && typeof data.askIntent === "boolean" && validTexts(data.texts)
    && [data.sales, data.parts].every((team) => team === null || (!!team && typeof team.phone === "string" && validPhone(team.phone)));
}
export function whatsappMessage(template: string, product: Product, origin: string): string {
  const link = new URL(productPath(product), origin).href;
  return template.replace(/\{produit\}/g, () => product.name).replace(/\{lien\}/g, () => link);
}
export function whatsappUrl(phone: string, message: string): string {
  return `https://wa.me/${phoneDigits(phone)}?text=${encodeURIComponent(message)}`;
}
