import { useEffect, useState } from "react";
import type { AdminCatalog } from "./AdminCatalog";
import type { Product } from "../types/product";
import { calculatePromotionPrice, formatAriary, type PromotionProduct } from "../lib/promotions";
import { useConfirmation } from "../components/ConfirmationModal";

const input = "mt-1 w-full rounded-md border border-black/20 bg-white px-3 py-2 text-sm";
const button = "rounded-md border border-black/20 px-3 py-2 text-sm font-semibold hover:bg-black/5 disabled:opacity-50";
const pageSize = 8;
const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const same = (item: PromotionProduct, product: Product) => item.productId === product.id && item.categoryId === product.categoryId;

function Pager({ count, page, onPage, label }: { count: number; page: number; onPage: (page: number) => void; label: string }) {
  const total = Math.max(1, Math.ceil(count / pageSize));
  if (total <= 1) return null;
  return <nav aria-label={label} className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-black/10 pt-3">
    <span className="text-xs text-black/60">Page {page} sur {total} · {count} produits</span>
    <div className="flex gap-2"><button type="button" className={button} disabled={page <= 1} onClick={() => onPage(page - 1)}>Précédent</button><button type="button" className={button} disabled={page >= total} onClick={() => onPage(page + 1)}>Suivant</button></div>
  </nav>;
}

export function PromotionProducts({ catalog, items, onChange, onCreate }: { catalog: AdminCatalog; items: PromotionProduct[]; onChange: (items: PromotionProduct[]) => void; onCreate: () => void }) {
  const [tab, setTab] = useState<"selected" | "list">("selected");
  const [quickSearch, setQuickSearch] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState("name-asc");
  const [listPage, setListPage] = useState(1);
  const [selectedPage, setSelectedPage] = useState(1);
  const [limitError, setLimitError] = useState("");
  const confirm = useConfirmation();
  const brandName = (product: Product) => catalog.brands.find((brand) => brand.id === product.brandId)?.name ?? product.brandId;
  const categoryName = (id: string) => catalog.categories.find((value) => value.id === id)?.name ?? id;
  const matches = quickSearch.trim() ? catalog.products.filter((product) => normalize(`${product.name} ${brandName(product)}`).includes(normalize(quickSearch.trim()))).slice(0, 40) : [];
  const list = catalog.products.filter((product) => {
    const value = normalize(`${product.name} ${product.id} ${brandName(product)} ${categoryName(product.categoryId)}`);
    return (!category || product.categoryId === category) && normalize(query).trim().split(/\s+/).filter(Boolean).every((word) => value.includes(word));
  }).slice().sort((a, b) => {
    const name = a.name.localeCompare(b.name, "fr", { sensitivity: "base" });
    if (sort === "name-desc") return -name || a.id.localeCompare(b.id);
    if (sort === "brand") return brandName(a).localeCompare(brandName(b), "fr", { sensitivity: "base" }) || name || a.id.localeCompare(b.id);
    return name || a.id.localeCompare(b.id);
  });
  const listCurrent = Math.min(listPage, Math.max(1, Math.ceil(list.length / pageSize)));
  const selectedCurrent = Math.min(selectedPage, Math.max(1, Math.ceil(items.length / pageSize)));
  const categories = [...new Set(catalog.products.map((product) => product.categoryId))].sort((a, b) => categoryName(a).localeCompare(categoryName(b), "fr"));
  useEffect(() => { setSelectedPage((page) => Math.min(page, Math.max(1, Math.ceil(items.length / pageSize)))); }, [items.length]);
  useEffect(() => { setListPage((page) => Math.min(page, Math.max(1, Math.ceil(list.length / pageSize)))); }, [list.length]);
  const firstInvalid = items.findIndex((item) => {
    try { calculatePromotionPrice(item.originalPrice, item.discountPercent); return false; } catch { return true; }
  });
  function add(product: Product) {
    if (items.some((item) => same(item, product))) { setQuickSearch(""); return; }
    if (items.length >= 500) { setLimitError("Une campagne peut contenir au maximum 500 produits."); return; }
    setLimitError(""); onChange([...items, { productId: product.id, categoryId: product.categoryId, originalPrice: NaN, discountPercent: NaN }]); setQuickSearch("");
  }
  function remove(item: PromotionProduct) {
    onChange(items.filter((value) => value.productId !== item.productId || value.categoryId !== item.categoryId));
  }
  async function toggle(product: Product, checked: boolean) {
    const selected = items.find((item) => same(item, product));
    if (checked && !selected) add(product);
    if (!checked && selected) {
      if ((Number.isFinite(selected.originalPrice) || Number.isFinite(selected.discountPercent)) && !await confirm({ title: "Retirer ce produit de la promotion ?", description: "Son prix et sa réduction saisis seront retirés de cette campagne. La fiche du catalogue ne sera pas modifiée.", confirmLabel: "Retirer le produit", destructive: true })) return;
      remove(selected);
    }
  }
  function priceEditor(item: PromotionProduct) {
    let calculation: ReturnType<typeof calculatePromotionPrice> | undefined;
    try { calculation = calculatePromotionPrice(item.originalPrice, item.discountPercent); } catch { /* champ invalide */ }
    const change = (patch: Partial<PromotionProduct>) => onChange(items.map((value) => value.productId === item.productId && value.categoryId === item.categoryId ? { ...value, ...patch } : value));
    return <><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold">Prix original (Ar)<input type="number" min="1" max="1000000000000" step="1" className={input} value={Number.isFinite(item.originalPrice) ? item.originalPrice : ''} onChange={(event) => change({ originalPrice: event.target.value === '' ? NaN : Number(event.target.value) })} /></label><label className="text-xs font-semibold">Réduction (%)<input type="number" min="0.01" max="100" step="0.01" className={input} value={Number.isFinite(item.discountPercent) ? item.discountPercent : ''} onChange={(event) => change({ discountPercent: event.target.value === '' ? NaN : Number(event.target.value) })} /></label></div>
      <p className="mt-2 text-sm">{calculation ? <>Réduction : {formatAriary(calculation.reduction)} · Prix promotionnel : <strong>{formatAriary(calculation.finalPrice)}</strong> · −{item.discountPercent} %</> : 'Renseignez un prix et une réduction valides.'}</p></>;
  }
  return <div className="rounded-lg bg-white p-5"><h2 className="font-bold">Produits de la promotion</h2><p className="mt-1 text-xs text-black/60">Seuls les produits publiés et les marques visibles apparaissent sur le site. Le prix de la promotion ne modifie pas la fiche du catalogue.</p>
    <div className="mt-4 flex flex-wrap gap-2" aria-label="Gestion des produits de la promotion"><button type="button" aria-pressed={tab === "selected"} className={tab === "selected" ? "rounded-md bg-[#171816] px-3 py-2 text-sm font-semibold text-white" : button} onClick={() => setTab("selected")}>Produits sélectionnés ({items.length})</button><button type="button" aria-pressed={tab === "list"} className={tab === "list" ? "rounded-md bg-[#171816] px-3 py-2 text-sm font-semibold text-white" : button} onClick={() => setTab("list")}>Liste des produits</button><button type="button" className={button} onClick={onCreate}>Créer un produit</button></div>
    {limitError && <p role="alert" className="mt-2 text-sm text-red-700">{limitError}</p>}
    {firstInvalid >= 0 && <p className="mt-3 text-xs text-amber-800">Certains produits ont besoin d’un prix ou d’une réduction valides. <button type="button" className="font-semibold underline" onClick={() => { setTab("selected"); setSelectedPage(Math.floor(firstInvalid / pageSize) + 1); }}>Voir le premier produit à compléter</button></p>}
    {tab === "selected" ? <>
      <div className="mt-4"><input aria-label="Rechercher un produit par nom ou marque" placeholder="Rechercher par nom ou marque" className={`${input} !mt-0`} value={quickSearch} onChange={(event) => setQuickSearch(event.target.value)} /></div>
      {quickSearch.trim() && <div className="mt-2 max-h-56 overflow-auto border border-black/10">{matches.length === 0 && <p className="p-3 text-sm">Aucun produit trouvé.</p>}{matches.map((product) => <button type="button" key={`${product.categoryId}:${product.id}`} className="block w-full border-b border-black/5 p-2 text-left text-sm hover:bg-amber-50" onClick={() => add(product)}>{product.name} · {brandName(product)} · {product.status === 'PUBLISHED' ? 'Publié' : 'Non publié'}</button>)}</div>}
      {items.length === 0 && <p className="mt-4 text-sm text-black/60">Aucun produit sélectionné. Recherchez un produit ou ouvrez la liste.</p>}
      <div className="mt-4 grid gap-3">{items.slice((selectedCurrent - 1) * pageSize, selectedCurrent * pageSize).map((item) => {
        const product = catalog.products.find((value) => same(item, value));
        const image = product?.images?.find((value) => value.isMain) ?? product?.images?.[0];
        return <div key={`${item.categoryId}:${item.productId}`} className="rounded border border-black/10 p-3"><div className="flex gap-3">{image && <img src={image.url} alt="" className="h-20 w-20 object-contain" />}<div className="min-w-0 flex-1"><strong>{product?.name ?? `Produit introuvable : ${item.productId}`}</strong><p className="text-xs text-black/60">{product?.status !== 'PUBLISHED' ? 'Produit non publié ou indisponible' : ''}</p><button type="button" className="mt-1 text-xs text-red-700 underline" onClick={() => remove(item)}>Retirer de la promotion</button></div></div>{priceEditor(item)}</div>;
      })}</div>
      <Pager label="Pagination des produits sélectionnés" count={items.length} page={selectedCurrent} onPage={setSelectedPage} />
    </> : <>
      <div className="mt-4 grid gap-3 sm:grid-cols-3"><label className="text-xs font-semibold">Rechercher dans la liste<input type="search" className={input} value={query} onChange={(event) => { setQuery(event.target.value); setListPage(1); }} placeholder="Nom, marque ou référence" /></label><label className="text-xs font-semibold">Catégorie<select className={input} value={category} onChange={(event) => { setCategory(event.target.value); setListPage(1); }}><option value="">Toutes les catégories</option>{categories.map((id) => <option key={id} value={id}>{categoryName(id)}</option>)}</select></label><label className="text-xs font-semibold">Trier par<select className={input} value={sort} onChange={(event) => { setSort(event.target.value); setListPage(1); }}><option value="name-asc">Nom A à Z</option><option value="name-desc">Nom Z à A</option><option value="brand">Marque A à Z</option></select></label></div>
      <p className="mt-3 text-xs text-black/60">{list.length} produit{list.length !== 1 ? 's' : ''} · Cochez les produits à ajouter, puis renseignez leur prix et leur réduction.</p>
      {list.length === 0 && <p className="mt-4 text-sm text-black/60">Aucun produit ne correspond à votre recherche.</p>}
      <div className="mt-3 grid gap-3">{list.slice((listCurrent - 1) * pageSize, listCurrent * pageSize).map((product) => {
        const item = items.find((value) => same(value, product));
        const image = product.images?.find((value) => value.isMain) ?? product.images?.[0];
        return <div key={`${product.categoryId}:${product.id}`} className="rounded border border-black/10 p-3"><label className="flex items-center gap-3 text-sm"><input type="checkbox" className="h-4 w-4 shrink-0" checked={!!item} onChange={(event) => void toggle(product, event.target.checked)} aria-label={`Sélectionner ${product.name}`} />{image && <img src={image.url} alt="" className="h-14 w-16 shrink-0 object-contain" />}<span className="min-w-0"><strong className="block break-words">{product.name}</strong><span className="text-xs text-black/60">{brandName(product)} · {categoryName(product.categoryId)} · {product.status === 'PUBLISHED' ? 'Publié' : 'Non publié'}</span></span></label>{item && priceEditor(item)}</div>;
      })}</div>
      <Pager label="Pagination de la liste des produits" count={list.length} page={listCurrent} onPage={setListPage} />
    </>}
  </div>;
}
