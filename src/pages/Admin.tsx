import { AdminOpenings } from "./AdminOpenings";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import type { Product } from "../types/product";
import { prepareProductPhotos, type EditablePhoto } from "../lib/productPhotos";
import { optimizeProductImage, photoFileSize } from "../lib/optimizeProductImage";
import { ProductList, type AdminCatalog, type HomepageField, type BulkDeleteResult } from "./AdminCatalog";
import { ConfirmationProvider, useConfirmation } from "../components/ConfirmationModal";
import { request, json } from "../lib/adminApi";
import { DealersManager, ContactManager } from "./AdminLocations";
import { AdminMessages } from "./AdminMessages";
import { useUnreadMessages } from "../lib/useUnreadMessages";
import { AdminHomepage } from "./AdminHomepage";
import AdminPromotions from "./AdminPromotions";
import AdminSiteTheme from "./AdminSiteTheme";
import "../styles/admin-theme.css";

type User = { id: string; username: string; role: string; mustChangePassword: boolean };
type Category = { id: string; name: string };
const paths: Record<string, string> = { motos: "motorcycles", casques: "helmets", equipements: "riding-gear", "pieces-detachees": "spare-parts" };
const productKinds: Category[] = [ { id: "motos", name: "Motos" }, { id: "casques", name: "Casques" }, { id: "equipements", name: "Équipements" }, { id: "pieces-detachees", name: "Pièces détachées" } ];
const control = "mt-1 w-full rounded-md border border-black/15 bg-white px-3 py-2.5 text-sm text-[#171816] focus:border-[#98741b] focus:outline-none";
const primary = "rounded-md bg-[#ffd100] px-4 py-2.5 text-sm font-bold text-[#171816] hover:bg-[#ffe36b] disabled:opacity-50";
const secondary = "rounded-md border border-black/20 px-3 py-2 text-sm font-semibold hover:bg-black/5";

function Label({ children, title }: { children: React.ReactNode; title: string }) { return <label className="block text-xs font-semibold text-black/65">{title}{children}</label>; }

function Login({ onLogin, themeButton }: { onLogin: (user: User) => void; themeButton: React.ReactNode }) {
  const [username, setUsername] = useState(""); const [password, setPassword] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) { e.preventDefault(); setBusy(true); setError(""); try { const res = await request("auth/login.php", json("POST", { username, password })); setPassword(""); onLogin(res.user); } catch (err) { setError((err as Error).message); } finally { setBusy(false); } }
  return <main className="grid min-h-screen place-items-center bg-[#171816] p-5"><form onSubmit={submit} className="w-full max-w-md rounded-xl bg-white p-7 text-[#171816] shadow-2xl sm:p-10"><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs font-bold uppercase tracking-widest text-[#98741b]">Funbike / Administration</p>{themeButton}</div><h1 className="mt-3 text-3xl font-bold text-[#171816]">Connexion</h1><p className="mt-2 text-sm text-black/55">Accès réservé à l’équipe Funbike.</p><div className="mt-7 space-y-4"><Label title="Nom d’utilisateur"><input required autoComplete="username" className={control} value={username} onChange={(e) => setUsername(e.target.value)} /></Label><Label title="Mot de passe"><input required type="password" autoComplete="current-password" className={control} value={password} onChange={(e) => setPassword(e.target.value)} /></Label></div>{error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}<button disabled={busy} className={`${primary} mt-6 w-full`}>{busy ? "Connexion…" : "Se connecter"}</button><a href="/" className="mt-5 block text-center text-xs text-black/55 underline">Retour au site</a></form></main>;
}
function PasswordForm({ onDone, mandatory }: { onDone: (u: User) => void; mandatory: boolean }) {
  const [currentPassword, setCurrent] = useState(""); const [newPassword, setNew] = useState(""); const [newPasswordConfirmation, setConfirmation] = useState(""); const [message, setMessage] = useState("");
  async function submit(e: FormEvent) { e.preventDefault(); setMessage(""); try { const r = await request("auth/change-password.php", json("POST", { currentPassword, newPassword, newPasswordConfirmation })); setCurrent(""); setNew(""); setConfirmation(""); onDone(r.user); } catch (err) { setMessage((err as Error).message); } }
  return <form onSubmit={submit} className="max-w-xl rounded-xl border border-black/10 bg-white p-6"><h2 className="text-xl font-bold">{mandatory ? "Choisissez votre mot de passe" : "Changer le mot de passe"}</h2><p className="mt-2 text-sm text-black/55">{mandatory ? "Votre mot de passe temporaire doit être changé avant de continuer." : "Utilisez au moins 12 caractères."}</p><div className="mt-5 grid gap-4"><Label title="Mot de passe actuel"><input required type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrent(e.target.value)} className={control} /></Label><Label title="Nouveau mot de passe"><input required minLength={12} type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNew(e.target.value)} className={control} /></Label><Label title="Confirmation"><input required minLength={12} type="password" autoComplete="new-password" value={newPasswordConfirmation} onChange={(e) => setConfirmation(e.target.value)} className={control} /></Label></div>{message && <p role="alert" className="mt-4 text-sm text-red-700">{message}</p>}<button className={`${primary} mt-5`}>Enregistrer le mot de passe</button></form>;
}

type Catalog = AdminCatalog;
const emptyCatalog: Catalog = { brands: [], categories: [], families: [], types: [], models: [], products: [] };
async function readCatalog(): Promise<Catalog> {
  const [b, c, f, t, m, ...p] = await Promise.all([
    request("brands.php?includeDrafts=1"), request("categories.php"), request("families.php"), request("product-types.php"), request("models.php?includeDrafts=1"),
    ...Object.values(paths).map((name) => request(`products/${name}.php?includeDrafts=1`)),
  ]);
  if (![b.brands, c.categories, f.families, t.productTypes, m.models, ...p.map((v) => v.data)].every(Array.isArray)) throw new Error("Données du catalogue invalides.");
  return { brands: b.brands, categories: c.categories, families: f.families, types: t.productTypes, models: m.models, products: p.flatMap((v) => v.data) };
}
function defaultProduct(categoryId: string): Product {
  return { id: "", name: "", brandId: "", categoryId, productTypeId: "", description: "", images: [], specifications: [], status: "DRAFT", price: "Sur devis", isNewArrival: false, isHomepageHero: false, isMotoAccueil: false, isEquipementAccueil: false };
}
type ProductCleanupFile = { name: string; url: string; size: number };
type ProductCleanupList = { removable: ProductCleanupFile[]; referenced: ProductCleanupFile[]; ignored: number };
export function ProductEditor({ catalog, current, close, refresh, onSaved, onBusyChange }: { catalog: Catalog; current?: Product; close: () => void; refresh: () => Promise<void>; onSaved?: (product: Product, refreshFailed?: boolean) => void; onBusyChange?: (busy: boolean) => void }) {
  const confirm = useConfirmation();
  const [item, setItem] = useState<Product>(() => current ? { ...current } : defaultProduct("motos"));
  const [familyId, setFamilyId] = useState(() => catalog.types.find((t) => t.id === current?.productTypeId)?.familyId ?? "");
  const [photos, setPhotos] = useState<EditablePhoto[]>(() => (current?.images ?? []).map((image, index) => ({ key: `saved-${index}`, preview: image.url, image })));
  const [mainKey, setMainKey] = useState<string | null>(() => { const index = (current?.images ?? []).findIndex((image) => image.isMain); return current?.images.length ? `saved-${index < 0 ? 0 : index}` : null; });
  const photoCounter = useRef(0);
  const previewUrls = useRef(new Set<string>());
  const optimizationController = useRef<AbortController | null>(null);
  const [message, setMessage] = useState(""); const [photoMessage, setPhotoMessage] = useState(""); const [photoMessageInfo, setPhotoMessageInfo] = useState(false); const [busy, setBusy] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [cleanup, setCleanup] = useState<ProductCleanupList | null>(null);
  useEffect(() => { const urls = previewUrls.current; return () => { optimizationController.current?.abort(); for (const url of urls) URL.revokeObjectURL(url); urls.clear(); }; }, []);
  function addPhotos(files: FileList | null) {
    if (!files?.length || optimizationController.current || busy) return;
    const added: EditablePhoto[] = Array.from(files).map((file) => {
      const preview = URL.createObjectURL(file); previewUrls.current.add(preview);
      return { key: `new-${photoCounter.current++}`, preview, file, originalName: file.name, originalSize: file.size, optimization: file.size <= 100 * 1024 ? "unchanged" : "processing" };
    });
    setPhotos((previous) => [...previous, ...added]);
    if (!photos.length && !mainKey) setMainKey(added[0].key);
    setMessage("");
    if (!added.some((photo) => photo.optimization === "processing")) return;
    const controller = new AbortController(); optimizationController.current = controller;
    setOptimizing(true); onBusyChange?.(true);
    void (async () => {
      try {
        // Une photo à la fois pour limiter l'utilisation mémoire sur mobile.
        for (const photo of added) {
          if (controller.signal.aborted) return;
          if (photo.optimization !== "processing" || !photo.file) continue;
          const result = await optimizeProductImage(photo.file, controller.signal);
          if (controller.signal.aborted) return;
          let preview = photo.preview;
          if (result.file !== photo.file) {
            preview = URL.createObjectURL(result.file); previewUrls.current.add(preview);
            URL.revokeObjectURL(photo.preview); previewUrls.current.delete(photo.preview);
          }
          setPhotos((previous) => previous.map((item) => item.key === photo.key ? { ...item, file: result.file, preview, optimization: result.status } : item));
        }
      } catch {
        if (!controller.signal.aborted) setPhotos((previous) => previous.map((item) => item.optimization === "processing" ? { ...item, optimization: "failed" } : item));
      } finally {
        if (!controller.signal.aborted) { optimizationController.current = null; setOptimizing(false); onBusyChange?.(false); }
      }
    })();
  }
  async function removePhoto(photo: EditablePhoto) {
    const saved = !!photo.image && !!current;
    if (!await confirm({ title: "Supprimer cette photo ?", description: saved ? "Le retrait de cette fiche est définitif et immédiat, même si vous fermez sans enregistrer. Le fichier sera supprimé s’il n’est pas utilisé ailleurs et si les vérifications le permettent ; sinon il sera conservé. Vérifiez votre sauvegarde : des copies en cache peuvent subsister." : "Cette photo sera retirée de la sélection. Le fichier original sur votre appareil ne sera pas supprimé.", confirmLabel: "Oui", cancelLabel: "Non", destructive: true })) return;
    if (saved) {
      setPhotoMessage(""); setPhotoMessageInfo(false); setBusy(true); onBusyChange?.(true);
      try {
        const result = await request("products/photo.php", json("DELETE", { categoryId: current!.categoryId, productId: current!.id, url: photo.image!.url, imageId: photo.image!.id }));
        setPhotos((previous) => previous.filter((item) => item.key !== photo.key).map((item) => {
          if (!item.image || !Array.isArray(result.renumbered)) return item;
          const entry = result.renumbered.find((r: { oldId: string; url: string }) => r.oldId === item.image!.id && r.url === item.image!.url);
          return entry ? { ...item, image: { ...item.image, id: entry.id, position: entry.position } } : item;
        }));
        if (mainKey === photo.key) setMainKey(null);
        setCleanup(null);
        if (result.deleted) {
          setPhotoMessageInfo(true);
          setPhotoMessage(result.message || "Photo retirée et fichier supprimé définitivement.");
        } else {
          setPhotoMessageInfo(["missing", "shared", "external"].includes(result.fileStatus));
          setPhotoMessage((result.message || "Photo retirée, mais fichier encore présent sur le serveur.") + (["failed", "unverified"].includes(result.fileStatus) ? ` ${photo.image!.url}` : ""));
        }
        try { await refresh(); } catch { setPhotoMessageInfo(false); setPhotoMessage((result.deleted ? "Photo supprimée. " : (result.message || "Photo retirée. ") + " ") + "Impossible d’actualiser la liste des produits."); }
      } catch (err) { setPhotoMessageInfo(false); setPhotoMessage((err as Error).message + " Rechargez la fiche si le résultat est incertain."); }
      finally { setBusy(false); onBusyChange?.(false); }
      return;
    }
    if (photo.file) { URL.revokeObjectURL(photo.preview); previewUrls.current.delete(photo.preview); }
    setPhotos((previous) => previous.filter((item) => item.key !== photo.key));
    if (mainKey === photo.key) setMainKey(null);
  }
  async function checkCleanup() {
    if (!current) return;
    setPhotoMessage(""); setPhotoMessageInfo(false); setBusy(true); onBusyChange?.(true);
    try {
      const params = new URLSearchParams({ categoryId: current.categoryId, productId: current.id });
      const result = await request(`products/photo.php?action=cleanup&${params}`);
      setCleanup({ removable: result.removable, referenced: result.referenced, ignored: result.ignored });
    } catch (err) { setCleanup(null); setPhotoMessage((err as Error).message); }
    finally { setBusy(false); onBusyChange?.(false); }
  }
  async function cleanRetired() {
    if (!current || !cleanup?.removable.length) return;
    const selected = cleanup.removable.slice(0, 500);
    if (!await confirm({ title: `Supprimer définitivement ${selected.length} fichier${selected.length > 1 ? "s" : ""} ?`, description: "Ces photos retirées seront effacées immédiatement du serveur, sans possibilité d’annulation. Vérifiez votre sauvegarde et leurs autres utilisations : les liens externes ne sont pas détectables et des copies en cache peuvent subsister.", confirmLabel: "Oui", cancelLabel: "Non", destructive: true })) return;
    setPhotoMessage(""); setPhotoMessageInfo(false); setBusy(true); onBusyChange?.(true);
    try {
      const result = await request("products/photo.php?action=cleanup", json("POST", { categoryId: current.categoryId, productId: current.id, files: selected.map((file) => file.name) }));
      setCleanup(null);
      if (result.failed.length) setPhotoMessage(`${result.deleted.length} fichier(s) supprimé(s). Impossible de supprimer : ${result.failed.join(", ")}. Vérifiez les permissions puis relancez la vérification.`);
      else { setPhotoMessageInfo(true); setPhotoMessage(`${result.deleted.length} fichier(s) supprimé(s) définitivement. Vérifiez à nouveau pour voir les fichiers restants.`); }
    } catch (err) { setCleanup(null); setPhotoMessage((err as Error).message + " Vérifiez à nouveau la liste avant de réessayer."); }
    finally { setBusy(false); onBusyChange?.(false); }
  }
  const types = catalog.types.filter((t) => t.categoryId === item.categoryId && (item.categoryId !== "motos" || t.familyId === familyId));
  const set = <K extends keyof Product>(key: K, value: Product[K]) => setItem((p) => ({ ...p, [key]: value }));
  async function submit(e: FormEvent) {
    e.preventDefault(); if (busy || optimizationController.current) return; setMessage(""); setBusy(true); onBusyChange?.(true);
    try {
      const { images, mainImage, gallery } = prepareProductPhotos(photos, mainKey);
      if ([mainImage, ...gallery].some((file) => file && file.size > 8 * 1024 * 1024)) throw new Error("Une photo dépasse 8 Mo après optimisation. Choisissez une image plus légère ; la limite de votre serveur peut être inférieure.");
      const form = new FormData(); const { id, ...fields } = item;
      form.set("product", JSON.stringify({ ...fields, images })); if (current) form.set("_method", "PUT"); if (mainImage) form.set("mainImage", mainImage); for (const file of gallery) form.append("gallery[]", file);
      const result = await request(`products/${paths[item.categoryId]}.php${current ? `?id=${encodeURIComponent(id)}` : ""}`, { method: "POST", body: form });
      if (onSaved) { let failed = false; try { await refresh(); } catch { failed = true; } onSaved(result.data, failed); return; }
      await refresh(); close();
    } catch (err) { setMessage((err as Error).message); } finally { setBusy(false); onBusyChange?.(false); }
  }
  return <form onSubmit={submit} className="rounded-xl border border-black/10 bg-white p-5 sm:p-6"><div className="flex items-center justify-between gap-3"><h2 className="text-xl font-bold">{current ? "Modifier le produit" : "Ajouter un produit"}</h2><button type="button" disabled={busy || optimizing} onClick={close} className={secondary}>Fermer</button></div><div className="mt-5 grid gap-4 sm:grid-cols-2">
    <Label title="Catégorie"><select disabled={!!current} className={control} value={item.categoryId} onChange={(e) => { setItem(defaultProduct(e.target.value)); setFamilyId(""); }}>{productKinds.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></Label>
    <Label title="Nom"><input required className={control} value={item.name} onChange={(e) => set("name", e.target.value)} /></Label>
    <Label title="Marque"><select required className={control} value={item.brandId} onChange={(e) => setItem((p) => ({ ...p, brandId: e.target.value, modelId: undefined }))}><option value="">Choisir une marque</option>{catalog.brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Label>
    {item.categoryId === "motos" && <Label title="Famille"><select required className={control} value={familyId} onChange={(e) => { setFamilyId(e.target.value); set("productTypeId", ""); }}><option value="">Choisir une famille</option>{catalog.families.filter((f) => f.categoryId === "motos").map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></Label>}
    <Label title="Type"><select required className={control} value={item.productTypeId} onChange={(e) => set("productTypeId", e.target.value)}><option value="">Choisir un type</option>{types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Label>
    {item.categoryId === "motos" && <Label title="Modèle (facultatif)"><select className={control} value={item.modelId ?? ""} onChange={(e) => set("modelId", e.target.value || undefined)}><option value="">Aucun modèle</option>{catalog.models.filter((m) => m.brandId === item.brandId).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Label>}
    <Label title="Statut"><select className={control} value={item.status} onChange={(e) => set("status", e.target.value as Product["status"])}><option value="DRAFT">Brouillon</option><option value="PUBLISHED">Publié</option><option value="ARCHIVED">Archivé</option></select></Label>
    <Label title="Prix ou mention"><input className={control} value={item.price ?? ""} onChange={(e) => set("price", e.target.value)} /></Label>
    <fieldset className="sm:col-span-2 rounded-lg border border-amber-200 bg-amber-50/60 p-4"><legend className="px-1 text-sm font-bold">Afficher sur l’accueil</legend><p className="text-xs leading-5 text-black/60">Chaque choix est indépendant. Vous pouvez aussi gérer toutes les sélections dans l’onglet Accueil. Seuls les produits publiés sont visibles sur le site.</p><div className="mt-3 flex flex-wrap gap-x-5 gap-y-3 text-sm"><label><input type="checkbox" checked={item.isNewArrival} onChange={(e) => set("isNewArrival", e.target.checked)} /> Nouveautés</label>{item.categoryId === "motos" && <><label><input type="checkbox" checked={!!item.isHomepageHero} onChange={(e) => set("isHomepageHero", e.target.checked)} /> Bandeau principal</label><label><input type="checkbox" checked={!!item.isMotoAccueil} onChange={(e) => set("isMotoAccueil", e.target.checked)} /> Motos accueil</label></>}{["casques", "equipements"].includes(item.categoryId) && <label><input type="checkbox" checked={!!item.isEquipementAccueil} onChange={(e) => set("isEquipementAccueil", e.target.checked)} /> Équipements accueil</label>}</div></fieldset>
    <div className="sm:col-span-2"><Label title="Description"><textarea rows={3} className={control} value={item.description} onChange={(e) => set("description", e.target.value)} /></Label></div>
    <fieldset className="sm:col-span-2 rounded-lg border border-black/10 p-4">
      <legend className="px-1 text-sm font-bold">Photos du produit</legend>
      <p className="text-xs leading-5 text-black/60">Ajoutez une ou plusieurs photos, puis choisissez celle qui sera affichée en premier sur le site. Les nouvelles photos sont optimisées sur cet appareil avant l’envoi. Votre fichier original et les photos déjà enregistrées ne sont pas modifiés par cette optimisation. Les autres modifications seront appliquées après enregistrement. La suppression d’une photo enregistrée est immédiate après confirmation.</p>
      <Label title="Ajouter des photos (JPG, PNG ou WebP)"><input type="file" multiple disabled={busy || optimizing} accept="image/jpeg,image/png,image/webp" className={control} onChange={(e) => { addPhotos(e.target.files); e.currentTarget.value = ""; }} /></Label>
      {photoMessage && <p role={photoMessageInfo ? "status" : "alert"} className={`mt-3 text-sm ${photoMessageInfo ? "text-black/70" : "text-red-700"}`}>{photoMessage}</p>}
      {optimizing && <p role="status" className="mt-3 text-xs text-black/60">Optimisation des photos en cours…</p>}
      {photos.length > 0 ? <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{photos.map((image) => <div key={image.key} className={`rounded-lg border p-2 ${mainKey === image.key ? "border-[#b58b16] bg-amber-50" : "border-black/10 bg-white"}`}>
        <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded bg-white"><img src={image.preview} alt={image.image?.altText || image.originalName || image.file?.name || "Photo du produit"} className="h-full w-full object-contain" /></div>
        <p className="mt-2 truncate text-xs font-semibold" title={image.originalName || image.file?.name}>{image.file ? (image.originalName || image.file.name) : "Photo enregistrée"}</p>
        {image.file && image.originalSize !== undefined && <p className="mt-1 text-xs text-black/60">{image.optimization === "processing" ? "Optimisation en cours…" : image.optimization === "optimized" ? `${photoFileSize(image.originalSize)} → ${photoFileSize(image.file.size)} (optimisée)` : image.optimization === "animated" ? `${photoFileSize(image.file.size)} · Animation conservée, non optimisée` : image.optimization === "failed" ? `${photoFileSize(image.file.size)} · Optimisation impossible, original conservé` : `${photoFileSize(image.file.size)} · Original conservé`}</p>}
        {mainKey === image.key ? <span className="mt-2 block text-xs font-bold text-amber-800">✓ Photo principale</span> : <button type="button" disabled={busy || optimizing} className="mt-2 block text-left text-xs font-semibold underline disabled:opacity-50" onClick={() => { setMainKey(image.key); setMessage(""); }}>Définir comme principale</button>}
        <button type="button" disabled={busy || optimizing} className="mt-2 block text-xs text-red-700 underline disabled:opacity-50" onClick={() => removePhoto(image)}>Retirer</button>
      </div>)}</div> : <p className="mt-3 text-xs text-black/50">Aucune photo sélectionnée.</p>}
      {photos.length > 0 && !mainKey && <p role="status" className="mt-3 text-xs font-semibold text-amber-800">Choisissez une nouvelle photo principale avant d’enregistrer.</p>}
      {current && <div className="mt-4 border-t border-black/10 pt-4">
        <p className="text-xs leading-5 text-black/60">Des fichiers retirés auparavant peuvent encore se trouver sur le serveur utilisé par cette page. Vous pouvez les vérifier et les supprimer définitivement.</p>
        <button type="button" disabled={busy || optimizing} className={`${secondary} mt-2`} onClick={checkCleanup}>Vérifier les photos retirées</button>
        {cleanup && <div className="mt-3" aria-label="Photos retirées du produit">
          {cleanup.removable.length ? <><p className="text-xs font-semibold">{cleanup.removable.length} fichier(s) sans référence détectée :</p><div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{cleanup.removable.map((file) => <div key={file.name} className="rounded-lg border border-black/10 p-2"><img src={file.url} alt={`Photo retirée ${file.name}`} className="aspect-[4/3] w-full rounded bg-white object-contain" /><p className="mt-1 break-all text-xs">{file.name} · {photoFileSize(file.size)}</p></div>)}</div><button type="button" disabled={busy || optimizing} className="mt-3 rounded-md bg-red-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" onClick={cleanRetired}>Supprimer définitivement {Math.min(cleanup.removable.length, 500)} fichier(s)</button></> : <p className="text-xs">Aucune photo retirée sans référence détectée.</p>}
          {cleanup.referenced.length > 0 && <div className="mt-2 text-xs text-amber-800"><p>{cleanup.referenced.length} fichier(s) encore référencé(s) dans les données du site sont conservés :</p><ul className="mt-1 list-inside list-disc break-all">{cleanup.referenced.map((file) => <li key={file.name}>{file.name}</li>)}</ul></div>}
          {cleanup.ignored > 0 && <p className="mt-2 text-xs text-amber-800">{cleanup.ignored} élément(s) non reconnus ou non accessibles sont conservés.</p>}
        </div>}
      </div>}
    </fieldset>
    <fieldset className="sm:col-span-2"><legend className="text-xs font-semibold text-black/65">Caractéristiques</legend><div className="mt-2 space-y-2">{item.specifications.map((spec, index) => <div key={index} className="flex flex-wrap gap-2"><input aria-label={`Nom de la caractéristique ${index + 1}`} placeholder="Ex. Cylindrée" value={spec.key} onChange={(e) => set("specifications", item.specifications.map((v, i) => i === index ? { ...v, key: e.target.value } : v))} className="min-w-36 flex-1 rounded-md border border-black/15 px-3 py-2 text-sm" /><input aria-label={`Valeur de la caractéristique ${index + 1}`} placeholder="Ex. 125 cc" value={spec.value} onChange={(e) => set("specifications", item.specifications.map((v, i) => i === index ? { ...v, value: e.target.value } : v))} className="min-w-36 flex-1 rounded-md border border-black/15 px-3 py-2 text-sm" /><button type="button" className={secondary} onClick={() => set("specifications", item.specifications.filter((_, i) => i !== index))}>Retirer</button></div>)}</div><button type="button" className={`${secondary} mt-2`} onClick={() => set("specifications", [...item.specifications, { key: "", value: "" }])}>+ Ajouter une caractéristique</button></fieldset>
    {item.categoryId === "pieces-detachees" && <fieldset className="sm:col-span-2"><legend className="text-xs font-semibold text-black/65">Marques compatibles</legend><div className="mt-2 flex flex-wrap gap-3">{catalog.brands.filter((b) => b.id !== "unknown-brand").map((b) => <label key={b.id} className="text-sm"><input type="checkbox" checked={(item.compatibleBrandIds ?? []).includes(b.id)} onChange={(e) => set("compatibleBrandIds", e.target.checked ? [...(item.compatibleBrandIds ?? []), b.id] : (item.compatibleBrandIds ?? []).filter((id) => id !== b.id))} /> {b.name}</label>)}</div></fieldset>}

  </div>{message && <p role="alert" className="mt-4 text-sm text-red-700">{message}</p>}<button disabled={busy || optimizing} className={`${primary} mt-5`}>{busy ? "Enregistrement…" : optimizing ? "Optimisation…" : "Enregistrer"}</button></form>;
}

type Taxonomy = "brands" | "categories" | "families" | "types" | "models";
function BrandLogo({ src, alt }: { src?: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return <div className="flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md border border-black/10 bg-white p-1 text-center text-[10px] text-black/50">{src && !failed ? <img src={src} alt={alt} className="h-full w-full object-contain" onError={() => setFailed(true)} /> : <span>{src ? "Logo indisponible" : "Aucun logo"}</span>}</div>;
}
function CatalogSettings({ catalog, refresh }: { catalog: Catalog; refresh: () => Promise<void> }) {
  const confirm = useConfirmation();
  const [kind, setKind] = useState<Taxonomy>("brands"); const [selected, setSelected] = useState<string>("");
  const [name, setName] = useState(""); const [category, setCategory] = useState("motos"); const [family, setFamily] = useState(""); const [equipment, setEquipment] = useState(false); const [published, setPublished] = useState(true); const [partner, setPartner] = useState(false); const [brandId, setBrandId] = useState(""); const [logo, setLogo] = useState<File | null>(null); const [message, setMessage] = useState("");
  const [logoPreview, setLogoPreview] = useState(""); const [logoInvalid, setLogoInvalid] = useState(false); const [notice, setNotice] = useState(""); const [busy, setBusy] = useState(false);
  const logoInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!logo) { setLogoPreview(""); return; }
    const url = URL.createObjectURL(logo); setLogoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [logo]);
  function clearLogo() { setLogo(null); setLogoInvalid(false); if (logoInput.current) logoInput.current.value = ""; }
  function chooseLogo(file: File | null) {
    setMessage(""); setNotice("");
    if (file && (!/\.(png|jpe?g|webp)$/i.test(file.name) || (file.type && !["image/png", "image/jpeg", "image/webp"].includes(file.type)))) { clearLogo(); setLogoInvalid(true); setMessage("Choisissez une image PNG, JPG ou WEBP."); return; }
    if (file && file.size > 8 * 1024 * 1024) { clearLogo(); setLogoInvalid(true); setMessage("Le logo doit peser au maximum 8 Mo. La limite de votre serveur peut être inférieure."); return; }
    setLogoInvalid(false); setLogo(file);
  }
  const resources = { brands: "brands.php", categories: "categories.php", families: "families.php", types: "product-types.php", models: "models.php" };
  const records = catalog[kind];
  const currentBrand = kind === "brands" ? catalog.brands.find((brand) => brand.id === selected) : undefined;
  function reset() { setSelected(""); setName(""); setFamily(""); setCategory("motos"); setEquipment(false); setPublished(true); setPartner(false); setBrandId(""); clearLogo(); setMessage(""); setNotice(""); }
  function edit(id: string) {
    const entry = records.find((r) => r.id === id); if (!entry) return;
    const fields = entry as { categoryId?: string; familyId?: string; isEquipmentBrand?: boolean; isPublished?: boolean; isPartner?: boolean; brandId?: string };
    setSelected(id); setName(entry.name); setCategory(fields.categoryId ?? "motos");
    setFamily(fields.familyId ?? ""); setEquipment(fields.isEquipmentBrand ?? false); setPublished(fields.isPublished !== false); setPartner(fields.isPartner === true); setBrandId(fields.brandId ?? ""); clearLogo(); setMessage(""); setNotice("");
  }
  async function save(e: FormEvent) {
    e.preventDefault(); if (busy || logoInvalid) return; setMessage(""); setNotice(""); setBusy(true); let saved = false;
    try {
      if (kind === "brands") {
        if (!selected && !logo) throw new Error("Ajoutez un logo pour cette nouvelle marque.");
        const form = new FormData(); form.set("name", name); form.set("isEquipmentBrand", String(equipment)); form.set("isPublished", String(published)); form.set("isPartner", String(partner)); if (logo) form.set("logo", logo); if (selected) form.set("_method", "PUT");
        await request(`${resources[kind]}${selected ? `?id=${encodeURIComponent(selected)}` : ""}`, { method: "POST", body: form });
      } else {
        const value = kind === "categories" ? { name } : kind === "families" ? { name, categoryId: category } : kind === "models" ? { name, brandId } : { name, categoryId: category, familyId: family || null };
        await request(`${resources[kind]}${selected ? `?id=${encodeURIComponent(selected)}` : ""}`, json(selected ? "PUT" : "POST", value));
      }
      saved = true;
      await refresh(); reset(); setNotice(kind === "brands" ? `La marque « ${name} » a été enregistrée.` : "L’élément a été enregistré.");
    } catch (err) { setMessage(saved ? "La modification a été enregistrée, mais la liste n’a pas pu être actualisée. Rechargez la page pour vérifier." : (err as Error).message); }
    finally { setBusy(false); }
  }
  async function remove(id: string) {
    const itemName = records.find((record) => record.id === id)?.name ?? id;
    if (!await confirm({ title: `Supprimer « ${itemName} » ?`, description: "Les éléments utilisés par des produits ou d’autres éléments du catalogue ne peuvent pas être supprimés.", confirmLabel: "Supprimer", destructive: true })) return;
    setMessage(""); setNotice(""); try { await request(`${resources[kind]}?id=${encodeURIComponent(id)}`, json("DELETE")); await refresh(); if (selected === id) reset(); } catch (err) { setMessage((err as Error).message); }
  }
  return <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]"><div className="rounded-xl border border-black/10 bg-white p-5"><div className="flex flex-wrap gap-2">{([{ id: "brands", name: "Marques" }, { id: "categories", name: "Catégories" }, { id: "families", name: "Familles" }, { id: "types", name: "Types" }, { id: "models", name: "Modèles" }] as const).map((tab) => <button key={tab.id} type="button" disabled={busy} onClick={() => { setKind(tab.id); reset(); }} className={kind === tab.id ? primary : secondary}>{tab.name}</button>)}</div><div className="mt-5 divide-y divide-black/10">{records.map((record) => <div key={record.id} className="flex flex-wrap items-center justify-between gap-2 py-3"><div className="flex min-w-0 items-center gap-3">{kind === "brands" && <BrandLogo src={(record as { logo?: string }).logo} alt={`Logo ${record.name}`} />}<div className="min-w-0"><p className="truncate text-sm font-semibold">{record.name}</p><p className="text-xs text-black/45">{record.id}{kind === "brands" ? ` · ${(record as { isPublished?: boolean }).isPublished === false ? "Non publiée" : "Publiée"}${(record as { isPartner?: boolean }).isPartner === true ? " · Partenaire" : ""}` : ""}{"categoryId" in record ? ` · ${record.categoryId}` : ""}{"familyId" in record && record.familyId ? ` · ${record.familyId}` : ""}</p></div></div><div className="flex shrink-0 gap-1"><button type="button" disabled={busy} className={secondary} onClick={() => edit(record.id)}>Modifier</button><button type="button" disabled={busy} className={secondary} onClick={() => remove(record.id)}>Supprimer</button></div></div>)}</div></div>
  <form onSubmit={save} className="h-fit rounded-xl border border-black/10 bg-white p-5"><h2 className="text-lg font-bold">{selected ? "Modifier" : "Ajouter"} {kind === "brands" ? "une marque" : kind === "categories" ? "une catégorie" : kind === "families" ? "une famille" : kind === "models" ? "un modèle" : "un type"}</h2><div className="mt-4 grid gap-4"><Label title="Nom"><input required className={control} value={name} onChange={(e) => setName(e.target.value)} /></Label>{["families", "types"].includes(kind) && <Label title="Catégorie"><select required className={control} value={category} onChange={(e) => { setCategory(e.target.value); setFamily(""); }}>{catalog.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Label>}{kind === "types" && category === "motos" && <Label title="Famille"><select required className={control} value={family} onChange={(e) => setFamily(e.target.value)}><option value="">Choisir une famille</option>{catalog.families.filter((f) => f.categoryId === category).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></Label>}{kind === "models" && <Label title="Marque"><select required className={control} value={brandId} onChange={(e) => setBrandId(e.target.value)}><option value="">Choisir une marque</option>{catalog.brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></Label>}{kind === "brands" && <>{selected && <div><p className="mb-2 text-xs font-semibold text-black/65">Logo actuel</p><BrandLogo src={currentBrand?.logo} alt={`Logo actuel ${name}`} /></div>}<Label title={selected ? "Nouveau logo (facultatif)" : "Logo"}><input ref={logoInput} type="file" accept="image/png,image/jpeg,image/webp" required={!selected} className={control} onChange={(e) => chooseLogo(e.target.files?.[0] ?? null)} /></Label><p className="-mt-2 text-xs text-black/55">PNG, JPG ou WEBP. Maximum 8 Mo (la limite du serveur peut être inférieure).</p>{logoPreview && <div><p className="mb-2 text-xs font-semibold text-black/65">Aperçu du nouveau logo — pas encore enregistré</p><BrandLogo src={logoPreview} alt="Aperçu du nouveau logo" /><p className="mt-2 break-all text-xs text-black/55">{logo?.name}</p></div>}{selected && (logo || logoInvalid) && <button type="button" disabled={busy} className={`${secondary} w-fit`} onClick={() => { clearLogo(); setMessage(""); }}>Ne pas changer le logo</button>}<label className="text-sm"><input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} /> Publiée</label><p className="-mt-2 text-xs text-black/55">Une marque non publiée et ses produits sont masqués sur le site, sans être supprimés.</p><label className="text-sm"><input type="checkbox" checked={partner} onChange={(e) => setPartner(e.target.checked)} /> Partenaire</label><p className="-mt-2 text-xs text-black/55">Son logo apparaît dans « Nos partenaires » si la marque est publiée et possède un logo.</p><label className="text-sm"><input type="checkbox" checked={equipment} onChange={(e) => setEquipment(e.target.checked)} /> Marque d’équipements</label></>}</div>{message && <p role="alert" className="mt-4 text-sm text-red-700">{message}</p>}{notice && <p role="status" className="mt-4 rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}<div className="mt-5 flex gap-2"><button disabled={busy || logoInvalid} className={primary}>{busy ? "Enregistrement…" : "Enregistrer"}</button>{selected && <button type="button" disabled={busy} className={secondary} onClick={reset}>Annuler</button>}</div></form></div>;
}
function UserManager({ user, onUserChanged }: { user: User; onUserChanged: (user: User) => void }) {
  const confirm = useConfirmation();
  const [users, setUsers] = useState<User[]>([]); const [username, setUsername] = useState(""); const [error, setError] = useState(""); const [temporary, setTemporary] = useState("");
  const [renaming, setRenaming] = useState<User | null>(null); const [newUsername, setNewUsername] = useState(""); const [currentPassword, setCurrentPassword] = useState(""); const [busy, setBusy] = useState(false); const [notice, setNotice] = useState("");
  const load = useCallback(async () => { try { const result = await request("auth/users.php"); setUsers(result.users); } catch (err) { setError((err as Error).message); } }, []);
  useEffect(() => { void load(); }, [load]);
  async function create(e: FormEvent) { e.preventDefault(); setError(""); setTemporary(""); try { const result = await request("auth/users.php", json("POST", { username })); setTemporary(result.temporaryPassword); setUsername(""); await load(); } catch (err) { setError((err as Error).message); } }
  async function action(target: User, method: "PUT" | "DELETE") { if (!await confirm(method === "DELETE" ? { title: `Supprimer le compte « ${target.username} » ?`, description: "Ce compte ne pourra plus accéder à l’administration. Cette action est définitive.", confirmLabel: "Supprimer le compte", destructive: true } : { title: `Réinitialiser le mot de passe de « ${target.username} » ?`, description: "Un nouveau mot de passe temporaire sera affiché une seule fois. Les anciennes sessions de ce compte seront déconnectées.", confirmLabel: "Réinitialiser" })) return; setError(""); setTemporary(""); try { const result = await request(`auth/users.php?id=${encodeURIComponent(target.id)}`, json(method)); if (result.temporaryPassword) setTemporary(result.temporaryPassword); await load(); } catch (err) { setError((err as Error).message); } }
  async function rename(e: FormEvent) {
    e.preventDefault(); if (!renaming || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await request("auth/username.php", json("PUT", { id: renaming.id, username: newUsername, currentPassword }));
      if (!result.user || result.user.id !== renaming.id || typeof result.user.username !== "string") throw new Error("Réponse invalide. Rechargez la liste pour vérifier.");
      if (result.user.id === user.id) onUserChanged(result.user);
      setUsers((previous) => previous.map((item) => item.id === result.user.id ? result.user : item));
      setNotice(`Nom d’utilisateur modifié : ${result.user.username}. Les autres sessions de ce compte sont déconnectées.`);
      setRenaming(null); setNewUsername("");
    } catch (err) { setError((err as Error).message); }
    finally { setCurrentPassword(""); setBusy(false); }
  }
  return <div className="max-w-3xl rounded-xl border border-black/10 bg-white p-6"><h2 className="text-xl font-bold">Comptes administrateurs</h2><p className="mt-2 text-sm text-black/55">Seul le superadmin peut gérer les comptes et leurs noms d’utilisateur.</p><form onSubmit={create} className="mt-5 flex flex-wrap items-end gap-2"><div className="min-w-52 flex-1"><Label title="Nom du nouvel admin"><input required className={control} value={username} onChange={(e) => setUsername(e.target.value)} /></Label></div><button disabled={busy} className={primary}>Créer un admin</button></form>{temporary && <div role="status" className="mt-4 rounded-md bg-amber-50 p-4 text-sm"><p className="font-semibold">Mot de passe temporaire — affiché une seule fois. Transmets-le en privé.</p><code className="mt-2 block break-all">{temporary}</code><button type="button" className="mt-2 underline" onClick={() => setTemporary("")}>Masquer</button></div>}{error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}{notice && <p role="status" className="mt-4 text-sm text-emerald-800">{notice}</p>}
    <div className="mt-5 divide-y divide-black/10">{users.map((u) => <div key={u.id} className="py-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold">{u.username} <span className="font-normal text-black/45">· {u.role}</span></p><div className="flex flex-wrap gap-2"><button type="button" disabled={busy} className={secondary} onClick={() => { setRenaming(u); setNewUsername(u.username); setCurrentPassword(""); setError(""); setNotice(""); }}>Changer le nom</button>{u.id !== user.id && u.role === "admin" && <><button type="button" disabled={busy} className={secondary} onClick={() => action(u, "PUT")}>Réinitialiser</button><button type="button" disabled={busy} className={secondary} onClick={() => action(u, "DELETE")}>Supprimer</button></>}</div></div>
    {renaming?.id === u.id && <form onSubmit={rename} className="mt-4 space-y-3 rounded-md bg-black/[0.03] p-4"><Label title="Nouveau nom d’utilisateur"><input autoComplete="off" required maxLength={32} className={control} value={newUsername} onChange={(e) => setNewUsername(e.target.value)} /></Label><p className="text-xs text-black/60">3 à 32 caractères : lettres, chiffres, point, tiret ou underscore. Les lettres sont enregistrées en minuscules.</p><Label title="Votre mot de passe superadmin"><input type="password" autoComplete="current-password" required className={control} value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} /></Label><p className="text-xs text-black/60">Le mot de passe du compte reste inchangé. Ses autres sessions seront déconnectées ; communiquez le nouvel identifiant à la personne concernée.</p><div className="flex gap-2"><button disabled={busy || newUsername.trim().toLowerCase() === u.username} className={primary}>{busy ? "Enregistrement…" : "Enregistrer le nom"}</button><button type="button" disabled={busy} className={secondary} onClick={() => { setRenaming(null); setCurrentPassword(""); setError(""); }}>Annuler</button></div></form>}</div>)}</div></div>;
}

const ADMIN_THEME_KEY = "fb-admin-theme";
function readAdminTheme(): boolean {
  try { return window.localStorage.getItem(ADMIN_THEME_KEY) === "dark"; } catch { return false; }
}

export default function Admin() {
  const [dark, setDark] = useState(readAdminTheme);
  useLayoutEffect(() => {
    document.documentElement.dataset.adminTheme = dark ? "dark" : "light";
    try { window.localStorage.setItem(ADMIN_THEME_KEY, dark ? "dark" : "light"); } catch { /* Le choix reste actif pour la session. */ }
    return () => { delete document.documentElement.dataset.adminTheme; };
  }, [dark]);
  const themeButton = <button type="button" aria-label={dark ? "Activer le mode jour du dashboard" : "Activer le mode nuit du dashboard"} onClick={() => setDark((value) => !value)} className="admin-theme-toggle rounded-md border px-3 py-2 text-sm font-semibold">{dark ? "☀ Mode jour" : "☾ Mode nuit"}</button>;
  return <div className="fb-admin"><ConfirmationProvider><AdminContent themeButton={themeButton} /></ConfirmationProvider></div>;
}

function AdminContent({ themeButton }: { themeButton: React.ReactNode }) {
  const confirm = useConfirmation();
  const [user, setUser] = useState<User | null>(null); const [checking, setChecking] = useState(true); const [section, setSection] = useState<"products" | "promotions" | "home" | "settings" | "users" | "theme" | "password" | "dealers" | "contact" | "messages" | "openings">("products"); const [catalog, setCatalog] = useState<Catalog>(emptyCatalog); const [error, setError] = useState(""); const [editing, setEditing] = useState<Product | "new" | null>(null); const [bulkBusy, setBulkBusy] = useState(false); const [loggingOut, setLoggingOut] = useState(false); const logoutPending = useRef(false);
  const unread = useUnreadMessages(user && !user.mustChangePassword ? user.id : null);
  const [homeDirty, setHomeDirty] = useState(false);
  const [promotionsDirty, setPromotionsDirty] = useState(false);
  const [promotionsSaving, setPromotionsSaving] = useState(false);
  const [homeSaving, setHomeSaving] = useState(false);
  const [themeSaving, setThemeSaving] = useState(false);
  useEffect(() => {
    if (!homeDirty && !promotionsDirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [homeDirty, promotionsDirty]);
  async function changeSection(next: typeof section) {
    if (next === section || homeSaving || promotionsSaving || themeSaving) return;
    if ((homeDirty || promotionsDirty) && !await confirm({ title: "Abandonner les modifications ?", description: "Les modifications non enregistrées seront perdues.", confirmLabel: "Abandonner", cancelLabel: "Continuer à modifier", destructive: true })) return;
    setHomeDirty(false); setSection(next); setError(""); setEditing(null);
  }
  useEffect(() => { request("auth/me.php").then((r) => setUser(r.user)).catch(() => setUser(null)).finally(() => setChecking(false)); }, []);
  const refresh = useCallback(async () => { const result = await readCatalog(); setCatalog(result); }, []);
  useEffect(() => { if (user && !user.mustChangePassword) { refresh().catch((err) => setError((err as Error).message)); } }, [user, refresh]);
  async function logout() {
    if (logoutPending.current || homeSaving || promotionsSaving || themeSaving) return;
    logoutPending.current = true;
    try {
      if (!await confirm({ title: "Voulez-vous vous déconnecter ?", description: (homeDirty || promotionsDirty) ? "Les modifications non enregistrées seront perdues. Vous devrez vous reconnecter pour accéder à l’administration." : "Vous devrez vous reconnecter pour accéder à l’administration.", confirmLabel: "Oui", cancelLabel: "Non" })) return;
      setLoggingOut(true); setError("");
      await request("auth/logout.php", json("POST"));
      setUser(null); setCatalog(emptyCatalog); setEditing(null); setHomeDirty(false);
    } catch (err) { setError((err as Error).message); }
    finally { logoutPending.current = false; setLoggingOut(false); }
  }
  async function remove(product: Product) { if (!await confirm({ title: `Supprimer « ${product.name} » ?`, description: "Ce produit et ses images seront supprimés définitivement. Cette action est irréversible.", confirmLabel: "Supprimer le produit", destructive: true })) return; setError(""); try { await request(`products/${paths[product.categoryId]}.php?id=${encodeURIComponent(product.id)}`, json("DELETE")); await refresh(); } catch (err) { setError((err as Error).message); } }
  async function removeSelected(products: Product[]): Promise<BulkDeleteResult | null> {
    if (!products.length || bulkBusy) return null;
    setBulkBusy(true);
    try {
      if (!await confirm({ title: `Supprimer ${products.length} produit${products.length > 1 ? "s" : ""} ?`, description: "Les produits sélectionnés, y compris ceux des autres pages ou masqués par les filtres, et leurs images seront supprimés définitivement. Cette action est irréversible.", confirmLabel: "Supprimer la sélection", destructive: true })) return null;
      const result: BulkDeleteResult = { deleted: [], failures: [] };
      setError("");
      // Les écritures sont séquentielles : chaque catégorie utilise le même fichier JSON.
      for (const product of products) {
        try {
          if (!paths[product.categoryId]) throw new Error("Catégorie inconnue.");
          await request(`products/${paths[product.categoryId]}.php?id=${encodeURIComponent(product.id)}`, json("DELETE"));
          result.deleted.push(product);
        } catch (err) { result.failures.push({ product, message: (err as Error).message || "Erreur inconnue." }); }
      }
      const removed = new Set(result.deleted.map((product) => JSON.stringify([product.categoryId, product.id])));
      setCatalog((previous) => ({ ...previous, products: previous.products.filter((product) => !removed.has(JSON.stringify([product.categoryId, product.id]))) }));
      if (editing && editing !== "new" && removed.has(JSON.stringify([editing.categoryId, editing.id]))) setEditing(null);
      try { await refresh(); } catch (err) { result.refreshError = (err as Error).message || "Erreur inconnue"; }
      return result;
    } finally { setBulkBusy(false); }
  }
  async function toggleHomepage(product: Product, field: HomepageField, value: boolean) {
    const result = await request("homepage-selections.php", json("PUT", { id: product.id, categoryId: product.categoryId, field, value }));
    if (!result.data || result.data.id !== product.id || result.data.categoryId !== product.categoryId || result.data[field] !== value) throw new Error("Réponse du serveur invalide : rechargez la page pour vérifier la sélection.");
    setCatalog((previous) => ({ ...previous, products: previous.products.map((p) => p.id === product.id && p.categoryId === product.categoryId ? result.data : p) }));
  }
  if (checking) return <main className="grid min-h-screen place-items-center bg-[#171816] text-white">Vérification de la session…</main>;
  if (!user) return <Login onLogin={setUser} themeButton={themeButton} />;
  return <main className="min-h-screen bg-[#f5f3eb] text-[#171816]">
    <header className="border-b border-white/10 bg-[#171816] px-5 py-5 text-white"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-widest text-[#ffd100]">Funbike / Administration</p><p className="mt-1 text-sm text-white/60">{user.username} · {user.role}</p></div><div className="flex flex-wrap gap-3">{themeButton}<a href="/" className="rounded-md border border-white/30 px-3 py-2 text-sm">Voir le site</a><button disabled={bulkBusy || loggingOut || homeSaving || promotionsSaving || themeSaving} className="rounded-md border border-white/30 px-3 py-2 text-sm disabled:opacity-50" onClick={logout}>{loggingOut ? "Déconnexion…" : "Déconnexion"}</button></div></div></header>
    <div className="mx-auto max-w-7xl px-5 py-7">{error && <p role="alert" className="mb-5 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}{user.mustChangePassword ? <PasswordForm mandatory onDone={setUser} /> : <>
      <nav className="mb-7 flex flex-wrap gap-2" aria-label="Administration">{([{ id: "products", name: "Produits" }, { id: "promotions", name: "Promotions" }, { id: "home", name: "Accueil" }, { id: "theme", name: "Thème du site" }, { id: "settings", name: "Marques et classement" }, { id: "dealers", name: "Revendeurs" }, { id: "contact", name: "Contact" }, { id: "messages", name: "Messages" }, { id: "openings", name: "Statistiques" }, ...(user.role === "superadmin" ? [{ id: "users" as const, name: "Administrateurs" }] : []), { id: "password", name: "Mot de passe" }] as const).map((tab) => <button key={tab.id} type="button" disabled={bulkBusy || homeSaving || promotionsSaving || themeSaving} aria-describedby={tab.id === "messages" && (unread.failed || (unread.count !== null && unread.count > 0)) ? "unread-messages-description" : undefined} title={tab.id === "messages" && unread.failed ? "Compteur indisponible : réessayez dans quelques instants." : undefined} onClick={() => void changeSection(tab.id)} className={section === tab.id ? primary : secondary}>{tab.name}{tab.id === "messages" && (unread.failed || (unread.count !== null && unread.count > 0)) && <><span aria-hidden="true" className={`ml-2 inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-bold leading-none text-white ${unread.failed ? "bg-neutral-600" : "bg-red-700"}`}>{unread.failed ? "!" : unread.count! > 99 ? "99+" : unread.count}</span></>}</button>)}{(unread.failed || (unread.count !== null && unread.count > 0)) && <span id="unread-messages-description" className="sr-only">{unread.failed ? "Compteur de messages non lus indisponible" : `${unread.count} message${unread.count === 1 ? "" : "s"} non lu${unread.count === 1 ? "" : "s"}`}</span>}</nav>
      {section === "password" && <PasswordForm mandatory={false} onDone={(u) => { setUser(u); setSection("products"); }} />}
      {section === "users" && user.role === "superadmin" && <UserManager user={user} onUserChanged={setUser} />}
      {section === "theme" && <AdminSiteTheme onSavingChange={setThemeSaving} />}
      {section === "settings" && <CatalogSettings catalog={catalog} refresh={refresh} />}
      {section === "dealers" && <DealersManager />}
      {section === "contact" && <ContactManager />}
      {section === "messages" && <AdminMessages onChanged={unread.refresh} />}
      {section === "openings" && <AdminOpenings />}
      {section === "promotions" && <AdminPromotions catalog={catalog} onDirtyChange={setPromotionsDirty} onSavingChange={setPromotionsSaving} productEditor={(close, saved, onBusy) => <ProductEditor catalog={catalog} close={close} refresh={refresh} onSaved={saved} onBusyChange={onBusy} />} />}
      {section === "home" && <AdminHomepage catalog={catalog} onToggle={toggleHomepage} dirty={homeDirty} saving={homeSaving} onDirtyChange={setHomeDirty} onSavingChange={setHomeSaving} />}
      {section === "products" && <ProductList catalog={catalog} onAdd={() => setEditing("new")} onEdit={setEditing} onDelete={remove} onDeleteSelected={removeSelected} editor={editing ? <ProductEditor key={editing === "new" ? "new" : editing.id} catalog={catalog} current={editing === "new" ? undefined : editing} close={() => setEditing(null)} refresh={refresh} /> : undefined} />}
    </>}</div>
  </main>;
}
