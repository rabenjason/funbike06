import { useEffect, useRef, useState } from "react";
import { LOGO } from "../catalog/brands";
import { useConfirmation } from "../components/ConfirmationModal";
import { json, request } from "../lib/adminApi";

const primary = "rounded-md bg-[#ffd100] px-4 py-2.5 text-sm font-bold text-[#171816] hover:bg-[#ffe36b] disabled:opacity-50";
const secondary = "rounded-md border border-black/20 px-3 py-2 text-sm font-semibold hover:bg-black/5 disabled:opacity-50";
const control = "mt-1 w-full rounded-md border border-black/15 bg-white px-3 py-2.5 text-sm text-[#171816] focus:border-[#98741b] focus:outline-none";
type Image = { id: string; url: string; name?: string };
type Library = { images: Image[]; selected: string | null; revision: string };
const label = (image: Image, index: number) => image.name || `Logo sans nom ${index + 1}`;
function parse(result: Record<string, unknown>): Library {
  const data = result.data as { images?: unknown; selected?: unknown } | undefined;
  if (!data || !Array.isArray(data.images) || typeof result.revision !== "string" || !/^[a-f0-9]{64}$/.test(result.revision) || result.defaultLogo !== LOGO || (data.selected !== null && (typeof data.selected !== "string" || !/^[a-f0-9]{32}$/.test(data.selected)))) throw new Error("Réponse invalide. Rechargez la bibliothèque.");
  const seen = new Set<string>();
  for (const image of data.images) {
    if (!image || typeof image.id !== "string" || !/^[a-f0-9]{32}$/.test(image.id) || typeof image.url !== "string" || !new RegExp(`^/server/uploads/site-logo/logo-${image.id}[.](jpg|png|webp)$`).test(image.url) || seen.has(image.id) || (image.name !== undefined && (typeof image.name !== "string" || !image.name.trim()))) throw new Error("Réponse invalide. Rechargez la bibliothèque.");
    seen.add(image.id);
  }
  if (typeof data.selected === "string" && !seen.has(data.selected)) throw new Error("Logo sélectionné introuvable. Rechargez la bibliothèque.");
  return { images: data.images as Image[], selected: data.selected as string | null, revision: result.revision };
}

type Props = { view: "settings" | "library"; onSavingChange?: (saving: boolean) => void; onDirtyChange?: (dirty: boolean) => void };
export function AdminSiteLogo({ view, onSavingChange, onDirtyChange }: Props) {
  const confirm = useConfirmation();
  const [data, setData] = useState<Library | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [preview, setPreview] = useState("");
  const [choice, setChoice] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let active = true; setLoading(true); setError("");
    request("site-logo.php").then((value) => { if (active) { const next = parse(value); setData(next); setChoice(next.selected ?? ""); } }).catch((err) => { if (active) { setData(null); setError((err as Error).message); } }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt]);
  useEffect(() => {
    if (!file) { setPreview(""); return; }
    const url = URL.createObjectURL(file); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const markDirty = (newFile: File | null, newText: string, rename: string | null) => onDirtyChange?.(!!newFile || !!newText.trim() || rename !== null);
  async function update(method: "POST" | "PUT" | "DELETE", id?: string | null, rename?: string) {
    if (!data || busy || (method === "POST" && (!file || !name.trim()))) return;
    const wasActive = method === "DELETE" && data.selected === id;
    if (method === "DELETE" && !await confirm({ title: "Supprimer définitivement ce logo ?", description: `${wasActive ? "Ce logo est affiché : le logo par défaut le remplacera automatiquement. " : ""}Le fichier sera supprimé du serveur. Les anciennes pages ou caches peuvent encore l’afficher temporairement.`, confirmLabel: "Oui, supprimer", cancelLabel: "Non", destructive: true })) return;
    setBusy(true); onSavingChange?.(true); setError(""); setNotice("");
    try {
      let options: RequestInit;
      if (method === "POST") { const form = new FormData(); form.set("revision", data.revision); form.set("name", name.trim()); form.set("image", file!); options = { method, body: form }; }
      else options = json(method, { revision: data.revision, id, ...(rename !== undefined ? { action: "rename", name: rename.trim() } : {}) });
      const result = await request("site-logo.php", options);
      const next = parse(result);
      if (method === "PUT" && rename === undefined && next.selected !== id) throw new Error("Réponse inattendue. Rechargez pour vérifier le logo choisi.");
      if (method === "DELETE" && (next.images.some((image) => image.id === id) || (wasActive && next.selected !== null))) throw new Error("Réponse inattendue. Rechargez pour vérifier la suppression.");
      if (rename !== undefined && next.images.find(image => image.id === id)?.name !== rename.trim()) throw new Error("Réponse inattendue. Rechargez pour vérifier le nom.");
      setData(next); setChoice(next.selected ?? "");
      if (method === "POST") { setFile(null); setName(""); onDirtyChange?.(false); if (fileInput.current) fileInput.current.value = ""; }
      if (rename !== undefined) { setRenaming(null); setNewName(""); onDirtyChange?.(false); }
      setNotice(method === "POST" ? "Logo ajouté. Choisissez-le pour l’afficher sur le site." : rename !== undefined ? "Nom du logo enregistré." : method === "PUT" ? "Logo choisi. Actualisez les pages déjà ouvertes." : result.fileStatus === "missing" ? (wasActive ? "Logo retiré : le fichier était déjà absent. Le logo par défaut est rétabli." : "Logo retiré : le fichier était déjà absent du serveur.") : wasActive ? "Logo supprimé définitivement. Le logo par défaut est rétabli." : "Logo supprimé définitivement de la bibliothèque et du serveur.");
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); onSavingChange?.(false); }
  }
  const active = data?.images.find(image => image.id === data.selected);
  return <section className="rounded-xl border border-black/10 bg-white p-5 sm:p-6">
    <p className="text-xs font-bold uppercase tracking-widest text-[#98741b]">Accueil</p>
    <h1 className="mt-1 text-2xl font-bold">{view === "settings" ? "Logo du site" : "Bibliothèque des logos"}</h1>
    <p className="mt-2 text-sm text-black/60">{view === "settings" ? "Le logo choisi apparaît en haut et en bas du site. L’écran de chargement et l’icône de l’onglet ne changent pas." : "Retrouvez, renommez ou supprimez les logos ajoutés. Le logo par défaut reste toujours disponible."}</p>
    {loading && <p role="status" className="mt-4 text-sm">Chargement des logos…</p>}
    {error && <div role="alert" className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error} <button type="button" className="underline" disabled={busy} onClick={() => setAttempt(n => n + 1)}>Recharger</button></div>}
    {notice && <p role="status" className="mt-4 rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    {data && (view === "settings" ? <div className="mt-5 grid gap-5 lg:grid-cols-2">
      <div className="space-y-4"><div className="rounded-lg border border-black/10 bg-[#faf9f5] p-4"><h2 className="font-bold">Logo par défaut</h2><div className="mt-3 flex h-28 items-center justify-center rounded-md bg-white p-3"><img src={LOGO} alt="Logo Funbike par défaut" className="max-h-full max-w-full object-contain" onError={() => setError("Le logo par défaut est indisponible. Vérifiez le serveur.")} /></div><p className="mt-2 text-xs text-black/60">Permanent et protégé contre la suppression.</p></div>
      <div className="rounded-lg border border-black/10 p-4"><h2 className="font-bold">Logo affiché sur le site</h2><div className="mt-3 flex h-28 items-center justify-center rounded-md bg-[#f9f8f4] p-3"><img src={active?.url ?? LOGO} alt="Logo actuellement affiché" className="max-h-full max-w-full object-contain" onError={() => setError("Le logo affiché est indisponible. Vérifiez le serveur.")} /></div><label className="mt-3 block text-sm font-semibold">Choisir un logo<select className={control} value={choice} disabled={busy} onChange={event => setChoice(event.target.value)}><option value="">Logo par défaut</option>{data.images.map((image, i) => <option key={image.id} value={image.id}>{label(image, i)}</option>)}</select></label><button type="button" className={`${primary} mt-3`} disabled={busy || choice === (data.selected ?? "")} onClick={() => void update("PUT", choice || null)}>Utiliser ce logo</button></div></div>
      <form className="rounded-lg border border-black/10 p-4" onSubmit={event => { event.preventDefault(); void update("POST"); }}><h2 className="font-bold">Ajouter un logo</h2><p className="mt-1 text-sm text-black/60">Donnez-lui un nom pour le retrouver dans le tableau de bord. L’ajout ne change pas le logo affiché.</p><label className="mt-4 block text-sm font-semibold">Nom du logo<input required maxLength={60} className={control} placeholder="Ex. Logo Christmas" value={name} disabled={busy} onChange={event => { setName(event.target.value); markDirty(file, event.target.value, renaming); }} /></label><label className="mt-4 block text-sm font-semibold">Choisir une image<input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} className="mt-2 block w-full text-sm" onChange={event => { const next = event.target.files?.[0] ?? null; setError(""); setNotice(""); if (next && (!['image/jpeg', 'image/png', 'image/webp'].includes(next.type) || next.size < 1 || next.size > 8 * 1024 * 1024)) { setFile(null); markDirty(null, name, renaming); event.currentTarget.value = ""; setError("Choisissez une image JPEG, PNG ou WebP de 8 Mo maximum."); return; } setFile(next); markDirty(next, name, renaming); }} /></label><p className="mt-2 text-xs text-black/60">JPEG, PNG ou WebP · 8 Mo maximum.</p>{preview && <div className="mt-4 flex h-32 items-center justify-center rounded-md bg-[#f9f8f4] p-3"><img src={preview} alt="Aperçu du logo à ajouter" className="max-h-full max-w-full object-contain" /></div>}<button type="submit" className={`${primary} mt-4`} disabled={!file || !name.trim() || busy}>{busy ? "Enregistrement…" : "Ajouter à la bibliothèque"}</button></form>
    </div> : <div className="mt-5">{data.images.length === 0 ? <p className="rounded-lg bg-[#f9f8f4] p-4 text-sm text-black/60">Aucun logo ajouté pour le moment.</p> : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{data.images.map((image, index) => <article key={image.id} className="rounded-lg border border-black/10 p-4"><div className="flex h-32 items-center justify-center rounded-md bg-[#f9f8f4] p-3"><img src={image.url} alt={`Aperçu ${label(image, index)}`} className="max-h-full max-w-full object-contain" onError={() => setError("Un fichier de logo est indisponible. Vérifiez le serveur et vos sauvegardes.")} /></div><h2 className="mt-3 break-words font-bold">{label(image, index)}</h2><p className="mt-1 text-xs text-black/60">{data.selected === image.id ? "Actuellement affiché" : "Disponible"}</p>{renaming === image.id ? <form className="mt-3" onSubmit={event => { event.preventDefault(); if (newName.trim()) void update("PUT", image.id, newName); }}><label className="block text-sm font-semibold">Nouveau nom<input className={control} required maxLength={60} value={newName} disabled={busy} onChange={event => setNewName(event.target.value)} /></label><div className="mt-2 flex flex-wrap gap-2"><button className={primary} disabled={busy || !newName.trim()}>Enregistrer</button><button type="button" className={secondary} disabled={busy} onClick={() => { setRenaming(null); setNewName(""); markDirty(file, name, null); }}>Annuler</button></div></form> : <div className="mt-3 flex flex-wrap gap-2">{data.selected !== image.id && <button type="button" className={secondary} disabled={busy || renaming !== null} onClick={() => void update("PUT", image.id)} aria-label={`Utiliser ${label(image, index)}`}>Utiliser</button>}<button type="button" className={secondary} disabled={busy || renaming !== null} onClick={() => { setRenaming(image.id); setNewName(image.name ?? ""); markDirty(file, name, image.id); }} aria-label={`Renommer ${label(image, index)}`}>Renommer</button><button type="button" className={secondary} disabled={busy || renaming !== null} onClick={() => void update("DELETE", image.id)} aria-label={`Supprimer ${label(image, index)}`}>Supprimer</button></div>}</article>)}</div>}</div>)}
  </section>;
}
