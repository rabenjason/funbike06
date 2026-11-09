import { useEffect, useState, type ReactNode } from "react";
import type { AdminCatalog } from "./AdminCatalog";
import type { Product } from "../types/product";
import { calculatePromotionPrice, formatAriary, type Promotion } from "../lib/promotions";
import { request, json } from "../lib/adminApi";
import { useConfirmation } from "../components/ConfirmationModal";

const input = "mt-1 w-full rounded-md border border-black/20 bg-white px-3 py-2 text-sm";
const button = "rounded-md border border-black/20 px-3 py-2 text-sm font-semibold hover:bg-black/5 disabled:opacity-50";
const primary = "rounded-md bg-[#ffd100] px-4 py-2 text-sm font-bold disabled:opacity-50";
const empty = (): Promotion => ({ id: "", name: "", description: "", bannerUrl: "", startDate: "", endDate: "", enabled: false, published: false, products: [] });
const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export default function AdminPromotions({ catalog, productEditor, onDirtyChange, onSavingChange }: { catalog: AdminCatalog; onDirtyChange: (dirty: boolean) => void; onSavingChange: (saving: boolean) => void; productEditor: (close: () => void, saved: (p: Product, refreshFailed?: boolean) => void, onBusy: (busy: boolean) => void) => ReactNode }) {
  const confirm = useConfirmation();
  const [campaigns, setCampaigns] = useState<Promotion[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState<Promotion | null>(null);
  const [creatingProduct, setCreatingProduct] = useState(false);
  const [productBusy, setProductBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function load() { setError(""); try { const result = await request("promotions.php?admin=1"); if (!Array.isArray(result.campaigns)) throw new Error("Réponse invalide."); setCampaigns(result.campaigns); setLoaded(true); } catch (err) { setError((err as Error).message); } }
  useEffect(() => { void load(); }, []);
  useEffect(() => { onDirtyChange(draft !== null); return () => onDirtyChange(false); }, [draft !== null, onDirtyChange]);
  useEffect(() => { onSavingChange(busy || productBusy); return () => onSavingChange(false); }, [busy, productBusy, onSavingChange]);
  const set = <K extends keyof Promotion>(key: K, value: Promotion[K]) => setDraft((current) => current ? { ...current, [key]: value } : current);
  function add(product: Product) {
    setDraft((current) => current && !current.products.some((v) => v.productId === product.id && v.categoryId === product.categoryId) ? { ...current, products: [...current.products, { productId: product.id, categoryId: product.categoryId, originalPrice: NaN, discountPercent: NaN }] } : current);
    setSearch("");
  }
  async function save() {
    if (!draft || busy) return;
    setError(""); setBusy(true);
    try {
      const result = await request("promotions.php", json(draft.id ? "PUT" : "POST", { campaign: draft }));
      setCampaigns(result.campaigns); setDraft(null);
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  async function remove(campaign: Promotion) {
    if (!await confirm({ title: `Supprimer « ${campaign.name} » ?`, description: "La campagne sera supprimée, mais les produits et les photos du catalogue seront conservés.", confirmLabel: "Supprimer", destructive: true })) return;
    setBusy(true); setError("");
    try { const result = await request("promotions.php", json("DELETE", { id: campaign.id })); setCampaigns(result.campaigns); }
    catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  async function upload(file: File | undefined) {
    if (!file) return; setBusy(true); setError("");
    try { const form = new FormData(); form.set("banner", file); const result = await request("promotions.php", { method: "POST", body: form }); set("bannerUrl", result.url); }
    catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  const matches = search.trim() ? catalog.products.filter((p) => normalize(`${p.name} ${catalog.brands.find((b) => b.id === p.brandId)?.name ?? ""}`).includes(normalize(search.trim()))).slice(0, 40) : [];
  return <section className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-bold">Promotions</h1>{loaded && !draft && <button className={primary} onClick={() => { setDraft(empty()); setError(""); }}>Créer une promotion</button>}</div>
    {error && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {!loaded && <button className={button} onClick={() => void load()}>Charger les promotions / Réessayer</button>}
    {loaded && !draft && <div className="space-y-2">{campaigns.length === 0 && <p className="text-sm">Aucune campagne enregistrée.</p>}{campaigns.map((c) => <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white p-4"><div><h2 className="font-bold">{c.name}</h2><p className="text-sm text-black/60">{c.startDate} — {c.endDate} · {c.enabled ? 'Activée' : 'Désactivée'} · {c.published ? 'Publiée' : 'Brouillon'} · {c.products.length} produit(s)</p></div><div className="flex gap-2"><button className={button} onClick={() => { setDraft(structuredClone(c)); setError(""); }}>Modifier</button><button disabled={busy} className={button} onClick={() => void remove(c)}>Supprimer</button></div></div>)}</div>}
    {draft && <>
      <div className="space-y-4 rounded-lg bg-white p-5"><h2 className="text-lg font-bold">{draft.id ? 'Modifier la campagne' : 'Nouvelle campagne'}</h2>
        <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold">Nom<input required maxLength={150} className={input} value={draft.name} onChange={(e) => set('name', e.target.value)} /></label><label className="text-sm font-semibold">Bannière facultative<input type="file" accept="image/jpeg,image/png,image/webp" className={input} onChange={(e) => { void upload(e.target.files?.[0]); e.currentTarget.value = ''; }} /></label>
        <label className="text-sm font-semibold">Début (Madagascar)<input type="date" required className={input} value={draft.startDate} onChange={(e) => set('startDate', e.target.value)} /></label><label className="text-sm font-semibold">Fin incluse (Madagascar)<input type="date" required className={input} value={draft.endDate} onChange={(e) => set('endDate', e.target.value)} /></label></div>
        <label className="block text-sm font-semibold">Description<textarea maxLength={5000} className={input} value={draft.description} onChange={(e) => set('description', e.target.value)} /></label>
        <p className="text-xs text-black/60">La description et la bannière restent enregistrées, mais ne sont pas affichées sur la page Promotions.</p>
        {draft.bannerUrl && <div><img src={draft.bannerUrl} alt="Bannière de la campagne" className="max-h-48 max-w-full object-contain" /><button className={`${button} mt-2`} onClick={() => set('bannerUrl', '')}>Retirer la bannière</button></div>}
        <div className="flex flex-wrap gap-5 text-sm"><label><input type="checkbox" checked={draft.enabled} onChange={(e) => set('enabled', e.target.checked)} /> Activée</label><label><input type="checkbox" checked={draft.published} onChange={(e) => set('published', e.target.checked)} /> Publiée</label></div><p className="text-xs text-black/60">Visible uniquement si activée et publiée, pendant les dates choisies. Une même fiche ne peut pas avoir deux offres publiées et activées aux mêmes dates.</p>
      </div>
      <div className="rounded-lg bg-white p-5"><h2 className="font-bold">Produits de la promotion</h2><p className="mt-1 text-xs text-black/60">Seuls les produits publiés et les marques visibles apparaissent sur le site. Le prix de la promotion ne modifie pas la fiche du catalogue.</p>
        <div className="mt-4 flex flex-wrap gap-2"><input aria-label="Rechercher un produit par nom ou marque" placeholder="Rechercher par nom ou marque" className={`${input} !mt-0 min-w-48 flex-1`} value={search} onChange={(e) => setSearch(e.target.value)} /><button type="button" className={button} onClick={() => setCreatingProduct(true)}>Créer un produit</button></div>
        {search.trim() && <div className="mt-2 max-h-56 overflow-auto border border-black/10">{matches.length === 0 && <p className="p-3 text-sm">Aucun produit trouvé.</p>}{matches.map((p) => <button type="button" key={`${p.categoryId}:${p.id}`} className="block w-full border-b border-black/5 p-2 text-left text-sm hover:bg-amber-50" onClick={() => add(p)}>{p.name} · {catalog.brands.find((b) => b.id === p.brandId)?.name ?? 'Marque inconnue'} · {p.status === 'PUBLISHED' ? 'Publié' : 'Non publié'}</button>)}</div>}
        <div className="mt-4 grid gap-3">{draft.products.map((item, index) => {
          const product = catalog.products.find((p) => p.id === item.productId && p.categoryId === item.categoryId);
          let calculation: ReturnType<typeof calculatePromotionPrice> | undefined; try { calculation = calculatePromotionPrice(item.originalPrice, item.discountPercent); } catch { /* champ invalide */ }
          const change = (patch: Partial<typeof item>) => set('products', draft.products.map((v, i) => i === index ? { ...v, ...patch } : v));
          return <div key={`${item.categoryId}:${item.productId}`} className="rounded border border-black/10 p-3"><div className="flex gap-3">{product?.images?.[0] && <img src={(product.images.find((img) => img.isMain) ?? product.images[0]).url} alt="" className="h-20 w-20 object-contain" />}<div className="min-w-0 flex-1"><strong>{product?.name ?? `Produit introuvable : ${item.productId}`}</strong><p className="text-xs text-black/60">{product?.status !== 'PUBLISHED' ? 'Produit non publié ou indisponible' : ''}</p><button type="button" className="mt-1 text-xs text-red-700 underline" onClick={() => set('products', draft.products.filter((_, i) => i !== index))}>Retirer de la promotion</button></div></div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold">Prix original (Ar)<input type="number" min="1" max="1000000000000" step="1" className={input} value={Number.isFinite(item.originalPrice) ? item.originalPrice : ''} onChange={(e) => change({ originalPrice: e.target.value === '' ? NaN : Number(e.target.value) })} /></label><label className="text-xs font-semibold">Réduction (%)<input type="number" min="0.01" max="100" step="0.01" className={input} value={Number.isFinite(item.discountPercent) ? item.discountPercent : ''} onChange={(e) => change({ discountPercent: e.target.value === '' ? NaN : Number(e.target.value) })} /></label></div>
            <p className="mt-2 text-sm">{calculation ? <>Réduction : {formatAriary(calculation.reduction)} · Prix promotionnel : <strong>{formatAriary(calculation.finalPrice)}</strong> · −{item.discountPercent} %</> : 'Renseignez un prix et une réduction valides.'}</p>
          </div>;
        })}</div>
      </div>
      {creatingProduct && productEditor(() => setCreatingProduct(false), (product, refreshFailed) => { add(product); setCreatingProduct(false); if (refreshFailed) setError("Le produit est enregistré, mais le catalogue n’a pas pu être actualisé. Rechargez l’administration avant de poursuivre ; ne recréez pas le produit."); }, setProductBusy)}
      <div className="flex flex-wrap gap-2"><button disabled={busy || creatingProduct} className={primary} onClick={() => void save()}>{busy ? 'Enregistrement…' : 'Enregistrer la campagne'}</button><button disabled={busy || productBusy} className={button} onClick={async () => { if (!await confirm({ title: "Abandonner la campagne ?", description: "Les modifications non enregistrées seront perdues. Les produits déjà créés restent dans le catalogue.", confirmLabel: "Abandonner", destructive: true })) return; setDraft(null); setCreatingProduct(false); setError(''); }}>Annuler</button></div>
    </>}
  </section>;
}
