import { useEffect, useMemo, useRef, useState } from "react";
import type { Brand, Model, Product } from "../types/product";
import type { ProductType } from "../catalog/productTypes";

type Category = { id: string; name: string };
type Family = { id: string; name: string; categoryId: string };
export type AdminCatalog = { brands: Brand[]; categories: Category[]; families: Family[]; types: ProductType[]; models: Model[]; products: Product[] };
export type HomepageField = "isNewArrival" | "isMotoAccueil" | "isHomepageHero" | "isEquipementAccueil";

const control = "mt-1.5 w-full rounded-md border border-black/15 bg-white px-3 py-2.5 text-sm text-[#171816] focus:border-[#98741b] focus:outline-none";
const secondary = "rounded-md border border-black/20 px-3 py-2 text-sm font-semibold hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40";
const selectedButton = "rounded-md bg-[#171816] px-3 py-2 text-sm font-semibold text-white";
const PAGE_SIZE = 10;
const statusLabel: Record<Product['status'], string> = { PUBLISHED: "Publié", DRAFT: "Brouillon", ARCHIVED: "Archivé" };

function normalize(text: string) { return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim(); }
function productMatches(product: Product, query: string, catalog: AdminCatalog) {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  const brand = catalog.brands.find((item) => item.id === product.brandId)?.name ?? product.brandId;
  const category = catalog.categories.find((item) => item.id === product.categoryId)?.name ?? product.categoryId;
  const type = catalog.types.find((item) => item.id === product.productTypeId && item.categoryId === product.categoryId)?.name ?? product.productTypeId;
  const text = normalize([product.name, product.id, brand, category, type].join(" "));
  return words.every((word) => text.includes(word));
}
function Pagination({ count, page, setPage }: { count: number; page: number; setPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  if (!count) return null;
  return <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3 border-t border-black/10 px-4 py-4">
    <p className="text-xs text-black/60">{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, count)} sur {count} · Page {page} / {pages}</p>
    <div className="flex items-center gap-2"><button type="button" className={secondary} disabled={page <= 1} onClick={() => setPage(page - 1)}>Précédent</button><button type="button" className={secondary} disabled={page >= pages} onClick={() => setPage(page + 1)}>Suivant</button></div>
  </nav>;
}
function ProductInfo({ product, catalog, extra }: { product: Product; catalog: AdminCatalog; extra?: React.ReactNode }) {
  const brand = catalog.brands.find((b) => b.id === product.brandId)?.name ?? product.brandId;
  const category = catalog.categories.find((c) => c.id === product.categoryId)?.name ?? product.categoryId;
  const type = catalog.types.find((t) => t.id === product.productTypeId && t.categoryId === product.categoryId)?.name;
  const image = product.images?.find((v) => v.isMain) ?? product.images?.[0];
  return <div className="flex min-w-0 items-center gap-3"><div className="flex h-14 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-black/10 bg-white text-[10px] text-black/40">{image?.url ? <img src={image.url} alt="" className="h-full w-full object-contain" onError={(e) => { e.currentTarget.style.display = "none"; }} /> : "Sans photo"}</div><div className="min-w-0"><p className="break-words text-sm font-semibold">{product.name}</p><p className="mt-1 text-xs leading-5 text-black/55">{[brand, category, type].filter(Boolean).join(" · ")}</p><span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${product.status === "PUBLISHED" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>{statusLabel[product.status] ?? product.status}</span>{extra}</div></div>;
}
function FilterLabel({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-xs font-semibold text-black/65">{label}{children}</label>; }

export function ProductList({ catalog, onEdit, onDelete, onAdd, editor }: { catalog: AdminCatalog; onEdit: (product: Product) => void; onDelete: (product: Product) => void; onAdd: () => void; editor?: React.ReactNode }) {
  const [query, setQuery] = useState(""); const [category, setCategory] = useState(""); const [family, setFamily] = useState("");
  const [type, setType] = useState(""); const [brand, setBrand] = useState(""); const [status, setStatus] = useState(""); const [page, setPage] = useState(1);
  const editorRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (editor) editorRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" }); }, [editor]);
  const filtered = useMemo(() => catalog.products.filter((p) => {
    const productType = catalog.types.find((t) => t.id === p.productTypeId && t.categoryId === p.categoryId);
    return productMatches(p, query, catalog) && (!category || p.categoryId === category) && (!family || productType?.familyId === family) && (!type || p.productTypeId === type) && (!brand || p.brandId === brand) && (!status || p.status === status);
  }), [catalog, query, category, family, type, brand, status]);
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)));
  const shown = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const clear = () => { setQuery(""); setCategory(""); setFamily(""); setType(""); setBrand(""); setStatus(""); setPage(1); };
  const types = catalog.types.filter((v) => (!category || v.categoryId === category) && (!family || v.familyId === family));
  return <>
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-[#98741b]">Catalogue</p><h1 className="mt-1 text-2xl font-bold">Produits</h1><p className="mt-1 text-sm text-black/55">Retrouvez et gérez tous vos produits.</p></div><button type="button" onClick={onAdd} className="rounded-md bg-[#ffd100] px-4 py-2.5 text-sm font-bold text-[#171816] hover:bg-[#ffe36b]">+ Ajouter un produit</button></div>
    {editor && <div ref={editorRef} className="mb-5">{editor}</div>}
    <div className="mb-4 rounded-xl border border-black/10 bg-white p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-bold">Recherche et filtres</h2><button type="button" className="text-xs font-semibold underline" onClick={clear}>Effacer les filtres</button></div><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      <div className="sm:col-span-2"><FilterLabel label="Recherche"><input type="search" className={control} placeholder="Nom, marque ou type" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} /></FilterLabel></div>
      <FilterLabel label="Catégorie"><select className={control} value={category} onChange={(e) => { setCategory(e.target.value); setType(""); setFamily(""); setPage(1); }}><option value="">Toutes</option>{catalog.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></FilterLabel>
      <FilterLabel label="Famille"><select className={control} value={family} onChange={(e) => { setFamily(e.target.value); setType(""); setPage(1); }}><option value="">Toutes</option>{catalog.families.filter((f) => !category || f.categoryId === category).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></FilterLabel>
      <FilterLabel label="Type"><select className={control} value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}><option value="">Tous</option>{types.map((t) => <option key={`${t.categoryId}-${t.id}`} value={t.id}>{t.name}</option>)}</select></FilterLabel>
      <FilterLabel label="Marque"><select className={control} value={brand} onChange={(e) => { setBrand(e.target.value); setPage(1); }}><option value="">Toutes</option>{catalog.brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></FilterLabel>
      <FilterLabel label="Statut"><select className={control} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">Tous</option><option value="PUBLISHED">Publié</option><option value="DRAFT">Brouillon</option><option value="ARCHIVED">Archivé</option></select></FilterLabel>
    </div></div>
    <div className="overflow-hidden rounded-xl border border-black/10 bg-white"><div className="border-b border-black/10 px-4 py-3 text-sm font-semibold">{filtered.length} produit{filtered.length !== 1 ? "s" : ""} trouvé{filtered.length !== 1 ? "s" : ""}</div><div className="divide-y divide-black/10">{shown.map((p) => <div key={`${p.categoryId}-${p.id}`} className="flex flex-wrap items-center justify-between gap-3 p-4"><ProductInfo product={p} catalog={catalog} /><div className="flex gap-2"><button type="button" className={secondary} onClick={() => onEdit(p)}>Modifier</button><button type="button" className={secondary} onClick={() => onDelete(p)}>Supprimer</button></div></div>)}</div>{!filtered.length && <p className="p-5 text-sm text-black/50">Aucun produit ne correspond à ces critères.</p>}<Pagination count={filtered.length} page={currentPage} setPage={setPage} /></div>
  </>;
}

const sections: { field: HomepageField; label: string; description: string; limit: number; accepts: (p: Product) => boolean }[] = [
  { field: "isNewArrival", label: "Nouveautés", description: "Produits de la section Nouveautés / Arrivages.", limit: 3, accepts: () => true },
  { field: "isMotoAccueil", label: "Motos accueil", description: "Motos de la section en bas de l’accueil.", limit: 3, accepts: (p) => p.categoryId === "motos" },
  { field: "isHomepageHero", label: "Bandeau", description: "Motos du grand bandeau en haut de l’accueil.", limit: 3, accepts: (p) => p.categoryId === "motos" },
  { field: "isEquipementAccueil", label: "Équipements accueil", description: "Casques et équipements de la section Prêt pour la suite.", limit: 4, accepts: (p) => p.categoryId === "casques" || p.categoryId === "equipements" },
];

export function HomepageManager({ catalog, onToggle }: { catalog: AdminCatalog; onToggle: (product: Product, field: HomepageField, value: boolean) => Promise<void> }) {
  const [field, setField] = useState<HomepageField>("isNewArrival"); const [mode, setMode] = useState<"selected" | "all">("selected");
  const [query, setQuery] = useState(""); const [page, setPage] = useState(1); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  const section = sections.find((item) => item.field === field)!;
  const eligible = catalog.products.filter(section.accepts);
  const selected = eligible.filter((p) => p[field] === true);
  const published = selected.filter((p) => p.status === "PUBLISHED").length;
  // Même ordre que le catalogue public : motos, pièces, casques puis équipements.
  const categoryOrder: Record<string, number> = { motos: 0, "pieces-detachees": 1, casques: 2, equipements: 3 };
  const visible = new Set(selected.filter((p) => p.status === "PUBLISHED")
    .sort((a, b) => (categoryOrder[a.categoryId] ?? 99) - (categoryOrder[b.categoryId] ?? 99))
    .slice(0, section.limit).map((p) => `${p.categoryId}:${p.id}`));
  const filtered = eligible.filter((p) => (mode === "all" || p[field] === true) && productMatches(p, query, catalog));
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)));
  const shown = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  function chooseSection(next: HomepageField) { setField(next); setMode("selected"); setQuery(""); setPage(1); setMessage(""); setError(""); }
  async function toggle(product: Product) {
    setBusy(true); setError(""); setMessage("");
    const next = product[field] !== true;
    try { await onToggle(product, field, next); setMessage(`${product.name} ${next ? "ajouté à" : "retiré de"} la sélection.`); }
    catch (err) { setError((err as Error).message || "Impossible de mettre à jour la sélection."); }
    finally { setBusy(false); }
  }
  return <div><div className="mb-5"><p className="text-xs font-bold uppercase tracking-widest text-[#98741b]">Mise en avant</p><h1 className="mt-1 text-2xl font-bold">Accueil</h1><p className="mt-1 text-sm text-black/55">Choisissez les produits de chaque section, indépendamment les uns des autres.</p></div>
    <nav aria-label="Sections de l’accueil" className="mb-5 flex flex-wrap gap-2">{sections.map((item) => <button type="button" disabled={busy} key={item.field} onClick={() => chooseSection(item.field)} aria-pressed={field === item.field} className={field === item.field ? selectedButton : secondary}>{item.label}</button>)}</nav>
    <div className="rounded-xl border border-black/10 bg-white"><div className="border-b border-black/10 p-4 sm:p-5"><h2 className="text-lg font-bold">{section.label}</h2><p className="mt-1 text-sm text-black/55">{section.description}</p><p className="mt-3 text-sm font-semibold">{selected.length} sélectionné{selected.length !== 1 ? "s" : ""} · {published} publié{published !== 1 ? "s" : ""}</p><p className="mt-1 text-xs leading-5 text-black/55">Tous les produits sélectionnés sont visibles ici. Le site affiche les {section.limit} premiers produits publiés sélectionnés dans l’ordre du catalogue. Les brouillons et produits archivés ne sont pas visibles sur le site.</p>{published > section.limit && <p className="mt-2 text-xs font-semibold text-amber-800">{published - section.limit} produit{published - section.limit > 1 ? "s" : ""} publié{published - section.limit > 1 ? "s" : ""} en plus ne {published - section.limit > 1 ? "seront" : "sera"} pas affiché{published - section.limit > 1 ? "s" : ""} sur le site.</p>}</div>
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-black/10 p-4"><div className="flex flex-wrap gap-2"><button type="button" aria-pressed={mode === "selected"} className={mode === "selected" ? selectedButton : secondary} onClick={() => { setMode("selected"); setPage(1); }}>Sélectionnés ({selected.length})</button><button type="button" aria-pressed={mode === "all"} className={mode === "all" ? selectedButton : secondary} onClick={() => { setMode("all"); setPage(1); }}>Tous les produits ({eligible.length})</button></div><div className="w-full sm:w-64"><FilterLabel label="Rechercher dans cette section"><input type="search" className={control} value={query} placeholder="Nom, marque ou type" onChange={(e) => { setQuery(e.target.value); setPage(1); }} /></FilterLabel></div></div>
      {message && <p role="status" className="mx-4 mt-3 rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}{error && <p role="alert" className="mx-4 mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div className="divide-y divide-black/10">{shown.map((p) => <div key={`${p.categoryId}-${p.id}`} className="flex flex-wrap items-center justify-between gap-3 p-4"><ProductInfo product={p} catalog={catalog} extra={p[field] && p.status === "PUBLISHED" ? <span className={`ml-2 mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${visible.has(`${p.categoryId}:${p.id}`) ? "bg-sky-50 text-sky-800" : "bg-amber-50 text-amber-800"}`}>{visible.has(`${p.categoryId}:${p.id}`) ? "Affiché sur le site" : "Hors limite d’affichage"}</span> : undefined} /><button type="button" disabled={busy} className={p[field] ? secondary : "rounded-md bg-[#ffd100] px-4 py-2 text-sm font-bold hover:bg-[#ffe36b] disabled:opacity-50"} aria-label={`${p[field] ? "Retirer" : "Ajouter"} ${p.name} ${p[field] ? "de" : "à"} ${section.label}`} onClick={() => void toggle(p)}>{p[field] ? "Retirer de la sélection" : "Ajouter à la sélection"}</button></div>)}</div>
      {!filtered.length && <p className="p-5 text-sm text-black/50">{query ? "Aucun produit ne correspond à cette recherche." : mode === "selected" ? "Aucun produit sélectionné. Ouvrez « Tous les produits » pour en ajouter." : "Aucun produit disponible dans cette section."}</p>}
      <Pagination count={filtered.length} page={currentPage} setPage={setPage} />
    </div>
  </div>;
}
