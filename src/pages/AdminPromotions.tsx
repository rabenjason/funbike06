import { useEffect, useState, type ReactNode } from "react";
import type { AdminCatalog } from "./AdminCatalog";
import type { Product } from "../types/product";
import { isPromotionCategory, type PromotionCategory, type Promotion } from "../lib/promotions";
import { request, json } from "../lib/adminApi";
import { useConfirmation } from "../components/ConfirmationModal";
import { PromotionProducts } from "./PromotionProducts";

const input = "mt-1 w-full rounded-md border border-black/20 bg-white px-3 py-2 text-sm";
const button = "rounded-md border border-black/20 px-3 py-2 text-sm font-semibold hover:bg-black/5 disabled:opacity-50";
const primary = "rounded-md bg-[#ffd100] px-4 py-2 text-sm font-bold disabled:opacity-50";
const empty = (): Promotion => ({ id: "", name: "", description: "", bannerUrl: "", startDate: "", endDate: "", enabled: false, published: false, products: [] });

export default function AdminPromotions({ catalog, productEditor, onDirtyChange, onSavingChange }: { catalog: AdminCatalog; onDirtyChange: (dirty: boolean) => void; onSavingChange: (saving: boolean) => void; productEditor: (close: () => void, saved: (p: Product, refreshFailed?: boolean) => void, onBusy: (busy: boolean) => void) => ReactNode }) {
  const confirm = useConfirmation();
  const [campaigns, setCampaigns] = useState<Promotion[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState<Promotion | null>(null);
  const [creatingProduct, setCreatingProduct] = useState(false);
  const [productBusy, setProductBusy] = useState(false);
  const [preferred, setPreferred] = useState<PromotionCategory>("motos");
  const [savedPreferred, setSavedPreferred] = useState<PromotionCategory>("motos");
  const [displayRevision, setDisplayRevision] = useState("");
  const [displayError, setDisplayError] = useState("");
  const [displayNotice, setDisplayNotice] = useState("");
  const displayDirty = !!displayRevision && preferred !== savedPreferred;
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function load() { setError(""); try { const result = await request("promotions.php?admin=1"); if (!Array.isArray(result.campaigns)) throw new Error("Réponse invalide."); setCampaigns(result.campaigns); setLoaded(true); } catch (err) { setError((err as Error).message); } }
  async function loadDisplay() {
    setDisplayError("");
    try {
      const result = await request("promotions-display.php");
      if (!isPromotionCategory(result.data?.preferredCategory) || typeof result.revision !== "string") throw new Error("Réponse de réglage invalide.");
      setPreferred(result.data.preferredCategory); setSavedPreferred(result.data.preferredCategory); setDisplayRevision(result.revision);
    } catch (err) { setDisplayError((err as Error).message); }
  }
  async function saveDisplay() {
    if (!displayRevision || busy) return;
    setBusy(true); setDisplayError(""); setDisplayNotice("");
    try {
      const result = await request("promotions-display.php", json("PUT", { preferredCategory: preferred, revision: displayRevision }));
      if (!isPromotionCategory(result.data?.preferredCategory) || typeof result.revision !== "string") throw new Error("Réponse invalide. Rechargez pour vérifier l’enregistrement.");
      setPreferred(result.data.preferredCategory); setSavedPreferred(result.data.preferredCategory); setDisplayRevision(result.revision); setDisplayNotice("Catégorie enregistrée.");
    } catch (err) { setDisplayError((err as Error).message); } finally { setBusy(false); }
  }
  useEffect(() => { void load(); void loadDisplay(); }, []);
  useEffect(() => { onDirtyChange(draft !== null || displayDirty); return () => onDirtyChange(false); }, [draft !== null, displayDirty, onDirtyChange]);
  useEffect(() => { onSavingChange(busy || productBusy); return () => onSavingChange(false); }, [busy, productBusy, onSavingChange]);
  const set = <K extends keyof Promotion>(key: K, value: Promotion[K]) => setDraft((current) => current ? { ...current, [key]: value } : current);
  function add(product: Product) {
    if (draft && draft.products.length >= 500 && !draft.products.some((item) => item.productId === product.id && item.categoryId === product.categoryId)) {
      setError("Le produit est conservé dans le catalogue, mais une campagne ne peut pas dépasser 500 produits."); return;
    }
    setDraft((current) => current && !current.products.some((v) => v.productId === product.id && v.categoryId === product.categoryId) ? { ...current, products: [...current.products, { productId: product.id, categoryId: product.categoryId, originalPrice: NaN, discountPercent: NaN }] } : current);
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
  return <section className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-bold">Promotions</h1>{loaded && !draft && <button className={primary} disabled={displayDirty || busy} onClick={() => { setDraft(empty()); setError(""); }}>Créer une promotion</button>}</div>
    {error && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {!loaded && <button className={button} onClick={() => void load()}>Charger les promotions / Réessayer</button>}
    {loaded && !draft && <div className="rounded-lg bg-white p-4">
      <h2 className="font-bold">Affichage de la page Promotions</h2>
      <p className="mt-1 text-sm text-black/60">Choisissez la catégorie affichée en premier pour toutes les campagnes. Si elle est vide, une catégorie disponible sera affichée.</p>
      {displayRevision && <div className="mt-3 flex flex-wrap items-end gap-3"><label className="text-sm font-semibold">Catégorie affichée en premier<select disabled={busy} className={input} value={preferred} onChange={(e) => { const value = e.target.value; if (isPromotionCategory(value)) setPreferred(value); setDisplayNotice(""); }}><option value="motos">Motos</option><option value="equipements">Équipements et casques</option><option value="pieces">Pièces détachées</option></select></label><button type="button" className={primary} disabled={!displayDirty || busy} onClick={() => void saveDisplay()}>Enregistrer l’affichage</button>{displayDirty && <button type="button" className={button} disabled={busy} onClick={() => { setPreferred(savedPreferred); setDisplayError(""); }}>Annuler</button>}</div>}
      {displayError && <p role="alert" className="mt-2 text-sm text-red-700">{displayError}{!displayRevision && <> <button type="button" className="underline" onClick={() => void loadDisplay()}>Réessayer</button></>}</p>}
      {displayNotice && <p role="status" className="mt-2 text-sm text-emerald-700">{displayNotice}</p>}
    </div>}
    {loaded && !draft && <div className="space-y-2">{campaigns.length === 0 && <p className="text-sm">Aucune campagne enregistrée.</p>}{campaigns.map((c) => <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white p-4"><div><h2 className="font-bold">{c.name}</h2><p className="text-sm text-black/60">{c.startDate} — {c.endDate} · {c.enabled ? 'Activée' : 'Désactivée'} · {c.published ? 'Publiée' : 'Brouillon'} · {c.products.length} produit(s)</p></div><div className="flex gap-2"><button disabled={displayDirty || busy} className={button} onClick={() => { setDraft(structuredClone(c)); setError(""); }}>Modifier</button><button disabled={displayDirty || busy} className={button} onClick={() => void remove(c)}>Supprimer</button></div></div>)}</div>}
    {draft && <>
      <div className="space-y-4 rounded-lg bg-white p-5"><h2 className="text-lg font-bold">{draft.id ? 'Modifier la campagne' : 'Nouvelle campagne'}</h2>
        <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold">Nom<input required maxLength={150} className={input} value={draft.name} onChange={(e) => set('name', e.target.value)} /></label><label className="text-sm font-semibold">Bannière facultative<input type="file" accept="image/jpeg,image/png,image/webp" className={input} onChange={(e) => { void upload(e.target.files?.[0]); e.currentTarget.value = ''; }} /></label>
        <label className="text-sm font-semibold">Début (Madagascar)<input type="date" required className={input} value={draft.startDate} onChange={(e) => set('startDate', e.target.value)} /></label><label className="text-sm font-semibold">Fin incluse (Madagascar)<input type="date" required className={input} value={draft.endDate} onChange={(e) => set('endDate', e.target.value)} /></label></div>
        <label className="block text-sm font-semibold">Description<textarea maxLength={5000} className={input} value={draft.description} onChange={(e) => set('description', e.target.value)} /></label>
        <p className="text-xs text-black/60">La description et la bannière restent enregistrées, mais ne sont pas affichées sur la page Promotions.</p>
        {draft.bannerUrl && <div><img src={draft.bannerUrl} alt="Bannière de la campagne" className="max-h-48 max-w-full object-contain" /><button className={`${button} mt-2`} onClick={() => set('bannerUrl', '')}>Retirer la bannière</button></div>}
        <div className="flex flex-wrap gap-5 text-sm"><label><input type="checkbox" checked={draft.enabled} onChange={(e) => set('enabled', e.target.checked)} /> Activée</label><label><input type="checkbox" checked={draft.published} onChange={(e) => set('published', e.target.checked)} /> Publiée</label></div><p className="text-xs text-black/60">Visible uniquement si activée et publiée, pendant les dates choisies. Une même fiche ne peut pas avoir deux offres publiées et activées aux mêmes dates.</p>
      </div>
      <PromotionProducts catalog={catalog} items={draft.products} onChange={(items) => set("products", items)} onCreate={() => setCreatingProduct(true)} />
      {creatingProduct && productEditor(() => setCreatingProduct(false), (product, refreshFailed) => { add(product); setCreatingProduct(false); if (refreshFailed) setError("Le produit est enregistré, mais le catalogue n’a pas pu être actualisé. Rechargez l’administration avant de poursuivre ; ne recréez pas le produit."); }, setProductBusy)}
      <div className="flex flex-wrap gap-2"><button disabled={busy || creatingProduct} className={primary} onClick={() => void save()}>{busy ? 'Enregistrement…' : 'Enregistrer la campagne'}</button><button disabled={busy || productBusy} className={button} onClick={async () => { if (!await confirm({ title: "Abandonner la campagne ?", description: "Les modifications non enregistrées seront perdues. Les produits déjà créés restent dans le catalogue.", confirmLabel: "Abandonner", destructive: true })) return; setDraft(null); setCreatingProduct(false); setError(''); }}>Annuler</button></div>
    </>}
  </section>;
}
