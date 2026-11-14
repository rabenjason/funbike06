import { useEffect, useRef, useState } from "react";
import { LOGO } from "../catalog/brands";
import { useConfirmation } from "../components/ConfirmationModal";
import { json, request } from "../lib/adminApi";

const primary = "rounded-md bg-[#ffd100] px-4 py-2 text-sm font-bold text-[#171816] hover:bg-[#ffe36b] disabled:opacity-50";
const secondary = "rounded-md border border-black/20 px-3 py-2 text-sm font-semibold hover:bg-black/5 disabled:opacity-50";
type Image = { id: string; url: string };
type Library = { images: Image[]; selected: string | null; revision: string };
function parse(result: Record<string, unknown>): Library {
  const data = result.data as { images?: unknown; selected?: unknown } | undefined;
  if (!data || !Array.isArray(data.images) || typeof result.revision !== "string" || !/^[a-f0-9]{64}$/.test(result.revision) || result.defaultLogo !== LOGO || (data.selected !== null && (typeof data.selected !== "string" || !/^[a-f0-9]{32}$/.test(data.selected)))) throw new Error("Réponse invalide. Rechargez la bibliothèque.");
  const seen = new Set<string>();
  for (const image of data.images) {
    if (!image || typeof image.id !== "string" || !/^[a-f0-9]{32}$/.test(image.id) || typeof image.url !== "string" || !new RegExp(`^/server/uploads/site-logo/logo-${image.id}[.](jpg|png|webp)$`).test(image.url) || seen.has(image.id)) throw new Error("Réponse invalide. Rechargez la bibliothèque.");
    seen.add(image.id);
  }
  if (typeof data.selected === "string" && !seen.has(data.selected)) throw new Error("Logo sélectionné introuvable. Rechargez la bibliothèque.");
  return { images: data.images as Image[], selected: data.selected as string | null, revision: result.revision };
}

export function AdminSiteLogo({ onSavingChange, onDirtyChange }: { onSavingChange?: (saving: boolean) => void; onDirtyChange?: (dirty: boolean) => void }) {
  const confirm = useConfirmation();
  const [data, setData] = useState<Library | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let active = true; setLoading(true); setError("");
    request("site-logo.php").then((value) => { if (active) setData(parse(value)); }).catch((err) => { if (active) { setData(null); setError((err as Error).message); } }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt]);
  useEffect(() => {
    if (!file) { setPreview(""); return; }
    const url = URL.createObjectURL(file); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  async function update(method: "POST" | "PUT" | "DELETE", id?: string | null) {
    if (!data || busy || (method === "POST" && !file)) return;
    if (method === "DELETE") {
      if (!await confirm({ title: "Supprimer définitivement ce logo ?", description: "Le fichier sera supprimé du serveur. Les anciennes pages ou caches peuvent encore l’afficher temporairement. Le logo par défaut reste conservé.", confirmLabel: "Oui, supprimer", cancelLabel: "Non", destructive: true })) return;
    }
    setBusy(true); onSavingChange?.(true); setError(""); setNotice("");
    try {
      let options: RequestInit;
      if (method === "POST") { const form = new FormData(); form.set("revision", data.revision); form.set("image", file!); options = { method, body: form }; }
      else options = json(method, { revision: data.revision, id });
      const next = parse(await request("site-logo.php", options));
      if (method === "PUT" && next.selected !== id) throw new Error("Réponse inattendue. Rechargez pour vérifier le logo choisi.");
      if (method === "DELETE" && next.images.some((image) => image.id === id)) throw new Error("Réponse inattendue. Rechargez pour vérifier la suppression.");
      setData(next);
      if (method === "POST") { setFile(null); onDirtyChange?.(false); if (fileInput.current) fileInput.current.value = ""; }
      setNotice(method === "POST" ? "Logo ajouté. Choisissez-le pour l’afficher sur le site." : method === "PUT" ? "Logo choisi. Les pages déjà ouvertes doivent être actualisées." : "Logo supprimé de la bibliothèque et du serveur.");
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); onSavingChange?.(false); }
  }
  return <section className="rounded-xl border border-black/10 bg-white p-5 sm:p-6">
    <h1 className="text-2xl font-bold">Logo du site</h1>
    <p className="mt-2 text-sm text-black/60">Choisissez le logo affiché en haut et en bas du site. Le logo d’origine reste toujours disponible et ne peut pas être supprimé. L’écran de chargement et l’icône de l’onglet ne changent pas.</p>
    {loading && <p role="status" className="mt-4 text-sm">Chargement des logos…</p>}
    {error && <div role="alert" className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error} <button type="button" className="underline" disabled={busy} onClick={() => setAttempt((n) => n + 1)}>Recharger</button></div>}
    {notice && <p role="status" className="mt-4 rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    {data && <>
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <article className="rounded-lg border border-black/15 p-4"><img src={LOGO} alt="Logo Funbike par défaut" onError={() => setError("Le fichier du logo par défaut est indisponible. Vérifiez le serveur.")} className="h-24 w-full bg-white object-contain" /><p className="mt-2 font-semibold">Logo par défaut · permanent</p><p className="text-xs text-black/60">Ce logo ne peut pas être supprimé.</p>{data.selected === null ? <p className="mt-3 text-sm font-semibold">Logo affiché</p> : <button type="button" className={`${secondary} mt-3`} disabled={busy} onClick={() => void update("PUT", null)}>Utiliser le logo par défaut</button>}</article>
        {data.images.map((image, index) => <article key={image.id} className="rounded-lg border border-black/15 p-4"><img src={image.url} alt={`Logo ajouté ${index + 1}`} onError={() => setError("Un fichier de logo est indisponible. Vérifiez le serveur et vos sauvegardes.")} className="h-24 w-full bg-white object-contain" /><p className="mt-2 break-all text-xs text-black/60">{image.url.split('/').pop()}</p>{data.selected === image.id ? <p className="mt-3 text-sm font-semibold">Logo affiché</p> : <div className="mt-3 flex flex-wrap gap-2"><button type="button" className={secondary} disabled={busy} onClick={() => void update("PUT", image.id)} aria-label={`Utiliser le logo ajouté ${index + 1}`}>Utiliser</button><button type="button" className={secondary} disabled={busy} onClick={() => void update("DELETE", image.id)} aria-label={`Supprimer le logo ajouté ${index + 1}`}>Supprimer</button></div>}</article>)}
      </div>
      <form className="mt-6 border-t border-black/10 pt-5" onSubmit={(event) => { event.preventDefault(); void update("POST"); }}><label className="block text-sm font-semibold">Ajouter un logo<input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} className="mt-2 block w-full max-w-md text-sm" onChange={(event) => { const next = event.target.files?.[0] ?? null; setError(""); setNotice(""); if (next && (!['image/jpeg', 'image/png', 'image/webp'].includes(next.type) || next.size < 1 || next.size > 8 * 1024 * 1024)) { setFile(null); onDirtyChange?.(false); event.currentTarget.value = ""; setError("Choisissez une image JPEG, PNG ou WebP de 8 Mo maximum."); return; } setFile(next); onDirtyChange?.(!!next); }} /></label><p className="mt-2 text-xs text-black/60">PNG, JPEG ou WebP, 8 Mo maximum. L’ajout ne change pas le logo affiché.</p>{preview && <img src={preview} alt="Aperçu du logo à ajouter" className="mt-3 h-24 max-w-64 bg-white object-contain" />}<button type="submit" className={`${primary} mt-3`} disabled={!file || busy}>{busy ? "Enregistrement…" : "Ajouter à la bibliothèque"}</button></form>
    </>}
  </section>;
}
