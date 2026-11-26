import { useEffect, useRef, useState, type ReactNode } from "react";
import type { AdminCatalog } from "./AdminCatalog";
import type { Product } from "../types/product";
import { defaultPromotionAppearance, isPromotionAppearance, isPromotionCategory, type PromotionAppearance, type PromotionCategory, type Promotion } from "../lib/promotions";
import { PromotionCampaignHeader } from "../components/PromotionCampaignHeader";
import { request, json } from "../lib/adminApi";
import { optimizeProductImage, photoOptimizationMessage } from "../lib/optimizeProductImage";
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
  const [showCardDescription, setShowCardDescription] = useState(false);
  const [savedShowCardDescription, setSavedShowCardDescription] = useState(false);
  const [displayRevision, setDisplayRevision] = useState("");
  const [displayError, setDisplayError] = useState("");
  const [displayNotice, setDisplayNotice] = useState("");
  const displayDirty = !!displayRevision && (preferred !== savedPreferred || showCardDescription !== savedShowCardDescription);
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const [imageStatus, setImageStatus] = useState("");
  const uploadController = useRef<AbortController | null>(null);
  useEffect(() => () => { uploadController.current?.abort(); uploadController.current = null; }, []);
  async function load() { setError(""); try { const result = await request("promotions.php?admin=1"); if (!Array.isArray(result.campaigns)) throw new Error("Réponse invalide."); setCampaigns(result.campaigns); setLoaded(true); } catch (err) { setError((err as Error).message); } }
  async function loadDisplay() {
    setDisplayError("");
    try {
      const result = await request("promotions-display.php");
      if (!isPromotionCategory(result.data?.preferredCategory) || typeof result.revision !== "string") throw new Error("Réponse de réglage invalide.");
      setPreferred(result.data.preferredCategory); setSavedPreferred(result.data.preferredCategory);
      setShowCardDescription(result.data.showCardDescription === true); setSavedShowCardDescription(result.data.showCardDescription === true); setDisplayRevision(result.revision);
    } catch (err) { setDisplayError((err as Error).message); }
  }
  async function saveDisplay() {
    if (!displayRevision || busy) return;
    setBusy(true); setDisplayError(""); setDisplayNotice("");
    try {
      const result = await request("promotions-display.php", json("PUT", { preferredCategory: preferred, showCardDescription, revision: displayRevision }));
      if (!isPromotionCategory(result.data?.preferredCategory) || typeof result.data?.showCardDescription !== "boolean" || typeof result.revision !== "string") throw new Error("Réponse invalide. Rechargez pour vérifier l’enregistrement.");
      setPreferred(result.data.preferredCategory); setSavedPreferred(result.data.preferredCategory); setShowCardDescription(result.data.showCardDescription); setSavedShowCardDescription(result.data.showCardDescription); setDisplayRevision(result.revision); setDisplayNotice("Affichage enregistré.");
    } catch (err) { setDisplayError((err as Error).message); } finally { setBusy(false); }
  }
  useEffect(() => { void load(); void loadDisplay(); }, []);
  useEffect(() => { onDirtyChange(draft !== null || displayDirty); return () => onDirtyChange(false); }, [draft !== null, displayDirty, onDirtyChange]);
  useEffect(() => { onSavingChange(busy || productBusy); return () => onSavingChange(false); }, [busy, productBusy, onSavingChange]);
  const set = <K extends keyof Promotion>(key: K, value: Promotion[K]) => setDraft((current) => current ? { ...current, [key]: value } : current);
  function setAppearance<K extends keyof PromotionAppearance>(key: K, value: PromotionAppearance[K]) {
    setDraft((current) => current && isPromotionAppearance(current.appearance) ? { ...current, appearance: { ...current.appearance, [key]: value } } : current);
  }
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
    if (!file || busy || uploadController.current) return;
    setError(""); setImageStatus("");
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || !file.size) { setError("Choisissez une image JPEG, PNG ou WebP valide."); return; }
    const controller = new AbortController(); uploadController.current = controller;
    setBusy(true); setImageStatus("Optimisation de la bannière en cours…");
    try {
      const optimized = await optimizeProductImage(file, controller.signal);
      if (controller.signal.aborted) return;
      setImageStatus(photoOptimizationMessage(file.size, optimized));
      if (optimized.file.size > 8 * 1024 * 1024) throw new Error("La bannière dépasse 8 Mo après optimisation. Choisissez une image plus légère ; la limite du serveur peut être inférieure.");
      const form = new FormData(); form.set("banner", optimized.file);
      const result = await request("promotions.php", { method: "POST", body: form, signal: controller.signal });
      if (!controller.signal.aborted) set("bannerUrl", result.url);
    } catch (err) { if (!controller.signal.aborted) setError((err as Error).message); }
    finally { if (uploadController.current === controller) uploadController.current = null; if (!controller.signal.aborted) setBusy(false); }
  }
  return <section className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-bold">Promotions</h1>{loaded && !draft && <button className={primary} disabled={displayDirty || busy} onClick={() => { setDraft(empty()); setError(""); setImageStatus(""); }}>Créer une promotion</button>}</div>
    {error && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {!loaded && <button className={button} onClick={() => void load()}>Charger les promotions / Réessayer</button>}
    {loaded && !draft && <div className="rounded-lg bg-white p-4">
      <h2 className="font-bold">Affichage de la page Promotions</h2>
      <p className="mt-1 text-sm text-black/60">Choisissez la catégorie affichée en premier pour toutes les campagnes. Si elle est vide, une catégorie disponible sera affichée.</p>
      {displayRevision && <div className="mt-3 flex flex-wrap items-end gap-3"><label className="text-sm font-semibold">Catégorie affichée en premier<select disabled={busy} className={input} value={preferred} onChange={(e) => { const value = e.target.value; if (isPromotionCategory(value)) setPreferred(value); setDisplayNotice(""); }}><option value="tous">Tous</option><option value="motos">Motos</option><option value="equipements">Équipements et casques</option><option value="pieces">Pièces détachées</option></select></label><button type="button" className={primary} disabled={!displayDirty || busy} onClick={() => void saveDisplay()}>Enregistrer l’affichage</button>{displayDirty && <button type="button" className={button} disabled={busy} onClick={() => { setPreferred(savedPreferred); setShowCardDescription(savedShowCardDescription); setDisplayError(""); }}>Annuler</button>}</div>}
      {displayRevision && <label className="mt-4 flex items-center gap-2 text-sm font-semibold"><input type="checkbox" disabled={busy} checked={showCardDescription} onChange={(e) => { setShowCardDescription(e.target.checked); setDisplayNotice(""); }} /> Afficher la description sur toutes les cartes Promotions</label>}
      <p className="mt-1 text-xs text-black/60">Ce réglage concerne toutes les catégories de la page Promotions, sans modifier les descriptions enregistrées ni les autres pages.</p>
      {displayError && <p role="alert" className="mt-2 text-sm text-red-700">{displayError}{!displayRevision && <> <button type="button" className="underline" onClick={() => void loadDisplay()}>Réessayer</button></>}</p>}
      {displayNotice && <p role="status" className="mt-2 text-sm text-emerald-700">{displayNotice}</p>}
    </div>}
    {loaded && !draft && <div className="space-y-2">{campaigns.length === 0 && <p className="text-sm">Aucune campagne enregistrée.</p>}{campaigns.map((c) => <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white p-4"><div><h2 className="font-bold">{c.name}</h2><p className="text-sm text-black/60">{c.startDate} — {c.endDate} · {c.enabled ? 'Activée' : 'Désactivée'} · {c.published ? 'Publiée' : 'Brouillon'} · {c.products.length} produit(s)</p></div><div className="flex gap-2"><button disabled={displayDirty || busy} className={button} onClick={() => { setDraft(structuredClone(c)); setError(""); setImageStatus(""); }}>Modifier</button><button disabled={displayDirty || busy} className={button} onClick={() => void remove(c)}>Supprimer</button></div></div>)}</div>}
    {draft && <>
      <div className="space-y-4 rounded-lg bg-white p-5"><h2 className="text-lg font-bold">{draft.id ? 'Modifier la campagne' : 'Nouvelle campagne'}</h2>
        <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold">Nom<input required maxLength={150} className={input} value={draft.name} onChange={(e) => set('name', e.target.value)} /></label><label className="text-sm font-semibold">Bannière facultative<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy || productBusy} className={input} onChange={(e) => { void upload(e.target.files?.[0]); e.currentTarget.value = ''; }} /></label>
        <label className="text-sm font-semibold">Début (Madagascar)<input type="date" required className={input} value={draft.startDate} onChange={(e) => set('startDate', e.target.value)} /></label><label className="text-sm font-semibold">Fin incluse (Madagascar)<input type="date" required className={input} value={draft.endDate} onChange={(e) => set('endDate', e.target.value)} /></label></div>
        <label className="block text-sm font-semibold">Description<textarea maxLength={5000} className={input} value={draft.description} onChange={(e) => set('description', e.target.value)} /></label>
        <p className="text-xs text-black/60">La nouvelle image est optimisée sur cet appareil avant l’envoi (8 Mo maximum après optimisation). L’original et les images déjà enregistrées restent inchangés. Sans personnalisation, la description et la bannière restent enregistrées sans être affichées.</p>{imageStatus && <p aria-live="polite" className="text-xs text-black/60">{imageStatus}</p>}
        {draft.bannerUrl && <div><img src={draft.bannerUrl} alt="Bannière de la campagne" className="max-h-48 max-w-full object-contain" /><button type="button" className={`${button} mt-2`} disabled={busy} onClick={() => set('bannerUrl', '')}>Retirer la bannière</button></div>}
        <fieldset className="space-y-4 border-t border-black/10 pt-4"><legend className="font-bold">Présentation du titre</legend>
          <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={isPromotionAppearance(draft.appearance)} disabled={busy} onChange={(e) => set('appearance', e.target.checked ? defaultPromotionAppearance() : null)} /> Personnaliser la présentation</label>
          <p className="text-xs text-black/60">Désactivé : présentation actuelle conservée. Chaque campagne possède son propre style.</p>
          {isPromotionAppearance(draft.appearance) && <>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-semibold">Style du titre<select className={input} disabled={busy} value={draft.appearance.style} onChange={(e) => { const style = e.target.value; if (style === 'sobre' || style === 'sportif' || style === 'festif' || style === 'black-friday') setAppearance('style', style); }}><option value="sobre">Sobre</option><option value="sportif">Sportif</option><option value="festif">Festif</option><option value="black-friday">Black Friday</option></select></label>
              <label className="text-sm font-semibold">Fond<select className={input} disabled={busy} value={draft.appearance.showBanner ? 'photo' : 'sans'} onChange={(e) => setAppearance('showBanner', e.target.value === 'photo')}><option value="sans">Sans photo</option><option value="photo">Avec la photo de bannière</option></select></label>
            </div>
            {draft.appearance.showBanner && !draft.bannerUrl && <p className="text-xs text-amber-700">Aucune photo choisie : un fond sans photo sera affiché jusqu’à l’ajout d’une bannière.</p>}
            <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={draft.appearance.showDescription} disabled={busy} onChange={(e) => setAppearance('showDescription', e.target.checked)} /> Afficher la description sous le titre</label>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label className="block text-sm font-semibold">Couleur du titre<input type="color" aria-label="Couleur du titre" disabled={busy} className="ml-2 h-10 w-14 align-middle" value={draft.appearance.titleColor || '#171816'} onChange={(e) => setAppearance('titleColor', e.target.value)} /></label><button type="button" className="mt-1 text-xs underline" disabled={busy || !draft.appearance.titleColor} onClick={() => setAppearance('titleColor', '')}>Utiliser la couleur du thème</button></div>
              <div><label className="block text-sm font-semibold">Couleur des mots mis en valeur<input type="color" aria-label="Couleur des mots mis en valeur" disabled={busy} className="ml-2 h-10 w-14 align-middle" value={draft.appearance.highlightColor || '#ffd100'} onChange={(e) => setAppearance('highlightColor', e.target.value)} /></label><button type="button" className="mt-1 text-xs underline" disabled={busy || !draft.appearance.highlightColor} onClick={() => setAppearance('highlightColor', '')}>Utiliser la couleur d’accent du thème</button></div>
            </div>
            <label className="block text-sm font-semibold">Mots du titre à mettre en valeur (facultatif)<input className={input} maxLength={150} disabled={busy} value={draft.appearance.highlight} onChange={(e) => setAppearance('highlight', e.target.value)} placeholder="Exemple : Noël" /></label>
            {draft.appearance.highlight && !draft.name.includes(draft.appearance.highlight) && <p className="text-xs text-amber-700">Ces mots doivent être présents dans le titre, avec la même orthographe, pour être mis en couleur.</p>}
            <div><p className="mb-2 text-sm font-semibold">Aperçu indicatif</p><div className="fb-promotion-preview"><PromotionCampaignHeader campaign={{ ...draft, name: draft.name || 'Aperçu de la promotion' }} preview /></div><p className="mt-2 text-xs text-black/60">Vérifiez la lisibilité des couleurs sur mobile et avec les thèmes clair et sombre. Les couleurs automatiques suivent le thème du site.</p></div>
          </>}
        </fieldset>
        <div className="flex flex-wrap gap-5 text-sm"><label><input type="checkbox" checked={draft.enabled} onChange={(e) => set('enabled', e.target.checked)} /> Activée</label><label><input type="checkbox" checked={draft.published} onChange={(e) => set('published', e.target.checked)} /> Publiée</label></div><p className="text-xs text-black/60">Visible uniquement si activée et publiée, pendant les dates choisies. Une même fiche ne peut pas avoir deux offres publiées et activées aux mêmes dates.</p>
      </div>
      <PromotionProducts catalog={catalog} items={draft.products} onChange={(items) => set("products", items)} onCreate={() => setCreatingProduct(true)} />
      {creatingProduct && productEditor(() => setCreatingProduct(false), (product, refreshFailed) => { add(product); setCreatingProduct(false); if (refreshFailed) setError("Le produit est enregistré, mais le catalogue n’a pas pu être actualisé. Rechargez l’administration avant de poursuivre ; ne recréez pas le produit."); }, setProductBusy)}
      <div className="flex flex-wrap gap-2"><button disabled={busy || creatingProduct} className={primary} onClick={() => void save()}>{busy ? 'Enregistrement…' : 'Enregistrer la campagne'}</button><button disabled={busy || productBusy} className={button} onClick={async () => { if (!await confirm({ title: "Abandonner la campagne ?", description: "Les modifications non enregistrées seront perdues. Les produits déjà créés restent dans le catalogue.", confirmLabel: "Abandonner", destructive: true })) return; setDraft(null); setCreatingProduct(false); setError(''); }}>Annuler</button></div>
    </>}
  </section>;
}
