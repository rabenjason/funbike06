import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Product } from "../types/product";
import { products } from "../catalog/products";
import { calculatePromotionPrice, formatAriary, isPromotionActive, isPromotionCategory, type PromotionCategory, type Promotion, type PromotionProduct } from "../lib/promotions";

const Context = createContext<{ campaigns: Promotion[]; status: "loading" | "ready" | "error"; clockOffset: number; preferredCategory: PromotionCategory; offer: (product: Product) => PromotionProduct | undefined }>({ campaigns: [], status: "loading", clockOffset: 0, preferredCategory: "motos", offer: () => undefined });
export const usePromotions = () => useContext(Context);
export function PromotionsProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Promotion[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [offset, setOffset] = useState(0);
  const [preferredCategory, setPreferredCategory] = useState<PromotionCategory>("motos");
  const [clock, setClock] = useState(Date.now());
  useEffect(() => {
    let alive = true; let sequence = 0; let midnight: number | undefined;
    async function refresh() {
      const number = ++sequence;
      try {
        const response = await fetch('/server/api/promotions.php', { cache: 'no-store', credentials: 'same-origin' });
        if (!response.ok) throw new Error();
        const result = await response.json();
        if (!Array.isArray(result.campaigns) || !Number.isFinite(Date.parse(result.serverTime))) throw new Error();
        if (alive && number === sequence) {
          const serverNow = Date.parse(result.serverTime);
          setOffset(serverNow - Date.now()); setPreferredCategory(isPromotionCategory(result.preferredCategory) ? result.preferredCategory : "motos"); setData(result.campaigns); setStatus("ready"); setClock(Date.now());
          window.clearTimeout(midnight);
          const elapsed = ((serverNow + 3 * 3600000) % 86400000 + 86400000) % 86400000;
          midnight = window.setTimeout(() => { setClock(Date.now()); void refresh(); }, 86400000 - elapsed + 1000);
        }
      } catch { if (alive && number === sequence) { setData([]); setStatus("error"); } }
    }
    void refresh();
    const timer = window.setInterval(() => { setClock(Date.now()); void refresh(); }, 30000);
    const visible = () => { if (document.visibilityState === 'visible') { setClock(Date.now()); void refresh(); } };
    document.addEventListener('visibilitychange', visible);
    return () => { alive = false; window.clearInterval(timer); window.clearTimeout(midnight); document.removeEventListener('visibilitychange', visible); };
  }, []);
  const value = useMemo(() => {
    const now = new Date(clock + offset);
    const campaigns = data.filter((c) => isPromotionActive(c, now) && Array.isArray(c.products) && c.products.some((item) => products.some((p) => p.id === item.productId && p.categoryId === item.categoryId)));
    const offer = (product: Product) => campaigns.flatMap((c) => c.products).find((item) => item.productId === product.id && item.categoryId === product.categoryId);
    return { campaigns, offer, status, clockOffset: offset, preferredCategory };
  }, [data, offset, clock, status, preferredCategory]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function PromotionBadge({ product }: { product: Product }) {
  const item = usePromotions().offer(product);
  if (!item) return null;
  try { calculatePromotionPrice(item.originalPrice, item.discountPercent); } catch { return null; }
  return <span className="pointer-events-none absolute right-3 top-3 z-10 bg-[#ffd100] px-3 py-1.5 text-sm font-extrabold tracking-tight text-[#171816] shadow-sm" aria-label={`Réduction de ${item.discountPercent} %`}>−{item.discountPercent} %</span>;
}

export function PromotionPrice({ product, card = false }: { product: Product; card?: boolean }) {
  const item = usePromotions().offer(product);
  if (!item) return <>Sur devis</>;
  try {
    const { finalPrice } = calculatePromotionPrice(item.originalPrice, item.discountPercent);
    if (card) return <span className="inline-flex min-w-0 max-w-full flex-wrap items-baseline gap-x-2 gap-y-0.5 normal-case tracking-normal"><del className="min-w-0 text-xs font-medium text-black/50 [overflow-wrap:anywhere] dark:text-white/55"><span className="sr-only">Prix original : </span>{formatAriary(item.originalPrice)}</del><strong className="min-w-0 text-base font-extrabold text-[#171816] [overflow-wrap:anywhere] dark:text-[#ffd100]"><span className="sr-only">Prix promotionnel : </span>{formatAriary(finalPrice)}</strong></span>;
    return <span className="inline-flex flex-wrap items-baseline gap-x-2 gap-y-1"><del>{formatAriary(item.originalPrice)}</del><strong>{formatAriary(finalPrice)}</strong><span className="bg-[#ffd100] px-1.5 py-0.5 font-bold text-[#171816]">−{item.discountPercent} %</span></span>;
  } catch { return <>Sur devis</>; }
}
