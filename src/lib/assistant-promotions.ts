import { schedulePublicOperation } from "./publicDataRequest";
import { calculatePromotionPrice, isPromotionActive, type Promotion } from "./promotions";

export type PromotionSnapshot = { campaigns: Promotion[]; now: number };
/** Une lecture fraîche et indépendante : une panne des promotions ne bloque pas les autres sujets. */
export async function loadAssistantPromotions(signal: AbortSignal): Promise<PromotionSnapshot | null> {
  try {
    const value = await schedulePublicOperation(async () => {
      const response = await fetch('/server/api/promotions.php', { credentials: 'same-origin', cache: 'no-store', signal });
      if (!response.ok) { try { await response.body?.cancel(); } catch { /* réponse déjà terminée */ } return null; }
      return await response.json();
    }, signal);
    if (!value) return null;
    const now = Date.parse(value.serverTime);
    if (!Number.isFinite(now) || !Array.isArray(value.campaigns)) return null;
    const campaigns: Promotion[] = [];
    for (const c of value.campaigns) {
      if (!c || typeof c !== 'object' || typeof c.name !== 'string' || typeof c.startDate !== 'string' || typeof c.endDate !== 'string' || typeof c.enabled !== 'boolean' || typeof c.published !== 'boolean' || !Array.isArray(c.products)) return null;
      for (const item of c.products) {
        if (!item || typeof item.productId !== 'string' || typeof item.categoryId !== 'string') return null;
        try { calculatePromotionPrice(item.originalPrice, item.discountPercent); } catch { return null; }
      }
      if (isPromotionActive(c, new Date(now))) campaigns.push(c);
    }
    return { campaigns, now };
  } catch { return null; }
}
