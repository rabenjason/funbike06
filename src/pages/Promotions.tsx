import { useEffect, useState } from "react";
import { promotionCountdown } from "../lib/promotions";
import { products } from "../catalog/products";
import { brands } from "../catalog/brands";
import { productTypes } from "../catalog/productTypes";
import type { Product } from "../types/product";
import { BikeCard, PartCard } from "../components/Cards";
import { usePromotions } from "../components/PromotionsContext";
import type { Promotion, PromotionCategory } from "../lib/promotions";

const groups: { key: PromotionCategory; label: string; categories: string[] }[] = [
  { key: "motos", label: "Motos", categories: ["motos"] },
  { key: "equipements", label: "Équipements et casques", categories: ["equipements", "casques"] },
  { key: "pieces", label: "Pièces détachées", categories: ["pieces-detachees"] },
];
const perPage = 8;
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const typeKey = (product: Product) => `${product.categoryId}:${product.productTypeId}`;

/** The ticking clock is isolated here so the product cards do not rerender each second. */
function Countdown({ endDate, clockOffset }: { endDate: string; clockOffset: number }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const interval = window.setInterval(tick, 1000);
    const visible = () => { if (document.visibilityState === "visible") tick(); };
    document.addEventListener("visibilitychange", visible);
    return () => { window.clearInterval(interval); document.removeEventListener("visibilitychange", visible); };
  }, []);
  const remaining = promotionCountdown(endDate, now + clockOffset);
  if (!remaining) return null;
  const [hours, minutes, seconds] = remaining.split(':');
  return <div className="shrink-0 rounded-md border border-[#d3a900]/35 bg-[#ffd100]/10 px-3 py-2 text-[#171816] dark:border-[#ffd100]/30 dark:text-[#f2f0ea]">
    <p className="text-xs font-semibold">Se termine dans</p>
    <p role="timer" aria-live="off" aria-label={`${Number(hours)} heures, ${Number(minutes)} minutes et ${Number(seconds)} secondes restantes`} className="mt-0.5 font-display text-lg font-bold tabular-nums text-[#98741b] dark:text-[#ffd100]">{remaining}</p>
    <p className="text-[10px] text-black/55 dark:text-white/60">Heure de Madagascar</p>
  </div>;
}

export default function Promotions({ go }: { go: (page: string, id?: string, categoryId?: string) => void }) {
  const { campaigns, status, clockOffset, preferredCategory } = usePromotions();
  const [chosenCategory, setChosenCategory] = useState<PromotionCategory | null>(null);
  const [type, setType] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const items: { product: Product; campaign: Promotion }[] = campaigns.flatMap((campaign) => campaign.products.flatMap((item) => {
    const product = products.find((p) => p.id === item.productId && p.categoryId === item.categoryId);
    return product ? [{ product, campaign }] : [];
  }));
  const available = groups.filter((group) => items.some(({ product }) => group.categories.includes(product.categoryId)));
  const active = available.find((group) => group.key === chosenCategory) ?? available.find((group) => group.key === preferredCategory) ?? available[0];
  const inCategory = items.filter(({ product }) => active?.categories.includes(product.categoryId));
  const types = productTypes.filter((entry) => inCategory.some(({ product }) => product.categoryId === entry.categoryId && product.productTypeId === entry.id));
  const selectedType = types.some((entry) => `${entry.categoryId}:${entry.id}` === type) ? type : "";
  const terms = normalize(search).trim().split(/\s+/).filter(Boolean);
  const filtered = inCategory.filter(({ product }) => {
    const brand = brands.find((entry) => entry.id === product.brandId)?.name ?? "";
    const typeName = types.find((entry) => entry.categoryId === product.categoryId && entry.id === product.productTypeId)?.name ?? "";
    const haystack = normalize(`${product.name} ${brand} ${typeName} ${product.description}`);
    return (!selectedType || typeKey(product) === selectedType) && terms.every((word) => haystack.includes(word));
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const currentPage = Math.min(page, totalPages);
  useEffect(() => { setPage((current) => Math.min(current, totalPages)); }, [totalPages]);
  const visible = filtered.slice((currentPage - 1) * perPage, currentPage * perPage);
  // Five numbered buttons at most, even for very large campaigns.
  const firstPage = Math.max(1, Math.min(currentPage - 2, totalPages - 4));
  const pageNumbers = Array.from({ length: Math.min(5, totalPages) }, (_, index) => firstPage + index);
  return <div className="mx-auto w-full max-w-(--container-site) px-4 pb-10 pt-6 sm:px-6 sm:pt-8 md:px-8 lg:px-10">
    <h1 className="sr-only">Promotions</h1>
    {status === "loading" && <p role="status">Chargement des promotions…</p>}
    {status === "error" && <p role="alert">Les promotions sont momentanément indisponibles. Veuillez réessayer.</p>}
    {status === "ready" && campaigns.length === 0 && <div><h2 className="fluid-h2 font-display font-semibold">Promotions</h2><p className="mt-3 text-sm text-black/60 dark:text-white/60">Aucune promotion active pour le moment.</p><p className="mt-2 text-sm text-black/60 dark:text-white/60">Découvrez notre catalogue ou revenez bientôt.</p></div>}
    {status === "ready" && campaigns.length > 0 && <>
      <div className="space-y-6">{campaigns.map((campaign) => <section key={campaign.id} aria-labelledby={`promotion-${campaign.id}`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><h2 id={`promotion-${campaign.id}`} className="fluid-h2 font-display font-semibold text-[#171816] dark:text-[#f2f0ea]">{campaign.name}</h2>
          <p className="mt-2 text-sm text-black/60 dark:text-white/60">Offre du {campaign.startDate.split('-').reverse().join('/')} au {campaign.endDate.split('-').reverse().join('/')} inclus.</p></div>
          <Countdown endDate={campaign.endDate} clockOffset={clockOffset} />
        </div>
      </section>)}</div>
      {active && <section className="mt-7" aria-label="Produits en promotion">
        <div className="flex gap-5 overflow-x-auto border-b border-black/10 dark:border-white/10" aria-label="Catégories de promotions">
          {available.map((group) => <button key={group.key} type="button" aria-pressed={active.key === group.key} onClick={() => { setChosenCategory(group.key); setType(""); setPage(1); }} className={`shrink-0 border-b-2 px-1 pb-3 text-sm font-semibold transition ${active.key === group.key ? "border-[#ffd100] text-[#171816] dark:text-white" : "border-transparent text-black/55 hover:text-black dark:text-white/55 dark:hover:text-white"}`}>{group.label}</button>)}
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="min-w-48 flex-1 text-xs font-semibold text-black/65 dark:text-white/65">Rechercher une promotion<input type="search" className="mt-1 w-full rounded-md border border-black/20 bg-white px-3 py-2.5 text-sm text-[#171816] dark:border-white/20 dark:bg-[#1a1b18] dark:text-white" placeholder="Produit ou marque" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} /></label>
          {types.length > 0 && <label className="min-w-48 flex-1 text-xs font-semibold text-black/65 dark:text-white/65 sm:max-w-64">Filtrer par type<select className="mt-1 w-full rounded-md border border-black/20 bg-white px-3 py-2.5 text-sm text-[#171816] dark:border-white/20 dark:bg-[#1a1b18] dark:text-white" value={selectedType} onChange={(e) => { setType(e.target.value); setPage(1); }}><option value="">Tous les types</option>{types.map((entry) => <option key={`${entry.categoryId}:${entry.id}`} value={`${entry.categoryId}:${entry.id}`}>{entry.name}</option>)}</select></label>}
        </div>
        <div className="my-4 flex items-baseline justify-between gap-3"><h3 className="font-display text-lg font-semibold text-[#171816] dark:text-[#f2f0ea]">{active.label}</h3><span className="text-xs text-black/50 dark:text-white/50" aria-live="polite">{filtered.length} produit{filtered.length !== 1 ? "s" : ""}</span></div>
        {filtered.length === 0 ? <p className="py-5 text-sm text-black/60 dark:text-white/60">Aucun produit ne correspond à votre recherche ou à ce filtre.</p> : <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4">{visible.map(({ product, campaign }) => <div key={`${campaign.id}:${product.categoryId}:${product.id}`} className="min-w-0 [&>article]:h-full">{campaigns.length > 1 && <p className="mb-2 text-xs font-semibold text-black/60 dark:text-white/60">{campaign.name}</p>}{product.categoryId === "motos" ? <BikeCard bike={product} go={go} uniformLayout compact /> : <PartCard part={product} go={go} compact />}</div>)}</div>}
        {totalPages > 1 && <nav aria-label="Pagination des promotions" className="mt-8 flex flex-wrap items-center justify-center gap-1 border-t border-black/10 pt-4 dark:border-white/10">
          <button type="button" className="min-h-11 rounded px-3 text-sm font-semibold disabled:opacity-40" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Précédent</button>
          {pageNumbers.map((n) => <button key={n} type="button" aria-label={`Page ${n}`} aria-current={n === currentPage ? "page" : undefined} onClick={() => setPage(n)} className={`h-11 w-11 rounded text-sm font-semibold ${n === currentPage ? "bg-[#ffd100] text-[#171816]" : "text-black/65 hover:bg-black/5 dark:text-white/65 dark:hover:bg-white/10"}`}>{n}</button>)}
          <button type="button" className="min-h-11 rounded px-3 text-sm font-semibold disabled:opacity-40" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}>Suivant</button>
          <span className="sr-only">Page {currentPage} sur {totalPages}</span>
        </nav>}
      </section>}
    </>}
  </div>;
}
