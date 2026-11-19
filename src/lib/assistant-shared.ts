export type ChatActionIcon = "catalog" | "contact" | "parts" | "phone" | "product" | "gear";
export type ChatAction = { label: string; page: string; id?: string; icon?: ChatActionIcon };
export type BotReply = { text: string; productIds?: string[]; reasons?: Record<string, string>; compare?: [string, string]; actions?: ChatAction[]; quick?: string[] };
export type Memory = {
  name?: string;
  lastIds: string[];
  misses: number;
  results?: string[];
  resultOffset?: number;
  resultTitle?: string;
  resultReasons?: Record<string, string>;
  resultKind?: "promotions";
  waitingForUsage?: boolean;
  usageBrandId?: string;
  usageNumbers?: string[];
  pendingIntent?: "price" | "stock";
  dealerKeys?: string[];
  lastDealerKey?: string;
  pendingCategoryQuery?: string;
  lastUsage?: string;
  lastUsageBrandId?: string;
  lastDisplacement?: string;
};
export const EMPTY_MEMORY: Memory = { lastIds: [], misses: 0 };


const DEFAULT_QUICK = ["Les nouveautés", "Quelle moto pour la ville ?", "Revendeurs", "Promotions"];
export function initialQuick() { return [...DEFAULT_QUICK]; }
export function greetingText(name?: string, assistantName = "Piston") { return `Bonjour${name ? ` ${name}` : ""} ! Je suis **${assistantName}**, l’assistant automatique de Funbike. Je peux rechercher dans notre catalogue et vous orienter vers l’équipe.`; }

export function typingDelay(reply: BotReply): number { return Math.min(2300, Math.max(650, 450 + reply.text.length * 11 + (reply.productIds?.length ?? 0) * 120 + (reply.compare ? 300 : 0))); }
