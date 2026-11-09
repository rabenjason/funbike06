import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCloudArrowUp } from "@fortawesome/free-solid-svg-icons";
import { useConfirmation } from "../components/ConfirmationModal";
import { json, request } from "../lib/adminApi";

type BannerImage = { id: string; url: string };
type BannerData = { images: BannerImage[]; selected: string | null };
const secondary = "rounded-md border border-black/20 px-3 py-2 text-sm font-semibold hover:bg-black/5 disabled:opacity-40";
const primary = "rounded-md bg-[#ffd100] px-4 py-2.5 text-sm font-bold text-[#171816] hover:bg-[#ffe36b] disabled:opacity-50";

function validImage(value: unknown): value is BannerImage {
  if (!value || typeof value !== "object") return false;
  const image = value as BannerImage;
  return typeof image.id === "string" && /^[a-f0-9]{32}$/.test(image.id) && typeof image.url === "string" && new RegExp(`^/server/uploads/homepage/sherco-${image.id}\\.(jpg|png|webp)$`).test(image.url);
}
function validData(value: unknown): value is BannerData {
  if (!value || typeof value !== "object") return false;
  const data = value as BannerData;
  return Array.isArray(data.images) && data.images.every(validImage) && (data.selected === null || data.images.some((image) => image.id === data.selected));
}
function validRetired(value: unknown): value is BannerImage[] {
  return Array.isArray(value) && value.every(validImage);
}

export function AdminShercoBanner({ onDirtyChange, onSavingChange }: { onDirtyChange: (value: boolean) => void; onSavingChange: (value: boolean) => void }) {
  const [data, setData] = useState<BannerData | null>(null);
  const [retired, setRetired] = useState<BannerImage[]>([]);
  const [legacy, setLegacy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const confirm = useConfirmation();
  useEffect(() => {
    let active = true;
    setData(null); setError("");
    request("sherco-banner.php").then((result) => {
      if (!validData(result.data) || !validRetired(result.retired) || typeof result.legacy !== "boolean") throw new Error("Réponse du serveur invalide.");
      if (active) { setData(result.data); setRetired(result.retired); setLegacy(result.legacy); }
    }).catch((err) => { if (active) setError((err as Error).message); });
    return () => { active = false; };
  }, [attempt]);
  useEffect(() => {
    if (!file) { setPreview(""); return; }
    const url = URL.createObjectURL(file); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  function chooseFile(next: File | null) {
    setError(""); setNotice("");
    if (next && (!['image/jpeg', 'image/png', 'image/webp'].includes(next.type) || next.size > 8 * 1024 * 1024 || next.size === 0)) {
      setError("Choisissez une image JPEG, PNG ou WebP de 8 Mo maximum."); return;
    }
    setFile(next); onDirtyChange(!!next);
  }
  async function perform(path: string, options: RequestInit, message: string) {
    if (busy) return;
    setBusy(true); onSavingChange(true); setError(""); setNotice("");
    try {
      const result = await request(path, options);
      if (!validData(result.data) || !validRetired(result.retired) || typeof result.legacy !== "boolean") throw new Error("Réponse invalide : rechargez pour vérifier l’enregistrement.");
      setData(result.data); setRetired(result.retired); setLegacy(result.legacy); setFile(null); onDirtyChange(false); setNotice(message);
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); onSavingChange(false); }
  }
  async function upload() {
    if (!file) return;
    const form = new FormData(); form.set("image", file);
    await perform("sherco-banner.php", { method: "POST", body: form }, "Image ajoutée. La première image locale est automatiquement affichée ; rechargez le site pour la voir.");
  }
  async function remove(image: BannerImage) {
    if (file) { setError("Enregistrez ou annulez d’abord la photo en attente."); return; }
    const selected = data?.selected === image.id;
    if (!await confirm({ title: "Retirer cette image de la bibliothèque ?", description: selected ? "Cette image est affichée sur le site. La bannière restera sans photo jusqu’à la sélection d’une autre image. Vous pourrez la retrouver dans les photos retirées." : "Vous pourrez retrouver cette image dans les photos retirées.", confirmLabel: "Retirer l’image", destructive: true })) return;
    await perform("sherco-banner.php", json("DELETE", { id: image.id }), "Image retirée. Vous pouvez la restaurer ou la supprimer définitivement ci-dessous.");
  }
  async function restore(image: BannerImage) {
    await perform("sherco-banner.php", json("PUT", { action: "restore", id: image.id, url: image.url }), "Photo restaurée dans la bibliothèque. Sélectionnez-la pour l’afficher.");
  }
  async function purge(image: BannerImage) {
    if (!await confirm({ title: "Supprimer définitivement cette photo ?", description: "Le fichier sera supprimé du serveur sans possibilité de le restaurer depuis ce tableau de bord. Vérifiez d’abord qu’il n’est utilisé nulle part ailleurs et que vous disposez d’une sauvegarde. Des copies en cache peuvent subsister.", confirmLabel: "Supprimer définitivement", destructive: true })) return;
    await perform("sherco-banner.php", json("DELETE", { action: "purge", id: image.id, url: image.url }), "Photo supprimée du serveur. Des copies en cache peuvent subsister.");
  }
  if (!data) return <div className="rounded-xl bg-white p-5">{error ? <><p role="alert" className="text-red-700">{error}</p><button type="button" className={`${secondary} mt-3`} onClick={() => setAttempt((n) => n + 1)}>Réessayer</button></> : <p>Chargement de la bibliothèque…</p>}</div>;
  return <section className="space-y-4 rounded-xl border border-black/10 bg-white p-4">
    <div><h1 className="text-2xl font-bold">Photos de la bannière</h1><p className="mt-1 text-sm text-black/60">Ajoutez des photos autorisées et choisissez celle à afficher. La bannière garde son cadrage et ses animations. Les photos des produits ne sont pas modifiées.</p></div>
    {legacy && <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">L’image actuelle est encore hébergée chez Sherco. Ajoutez une photo autorisée : la première photo locale la remplacera.</p>}
    {!legacy && !data.selected && <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">Aucune photo n’est sélectionnée : la bannière s’affiche sans image. Choisissez une photo ci-dessous.</p>}
    {error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {notice && <p role="status" className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    <label className={`flex w-full max-w-lg items-center gap-4 rounded-lg border-2 border-dashed border-black/25 bg-[#faf9f5] p-4 text-left transition focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[#98741b] ${busy ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:border-[#98741b] hover:bg-[#fff9df]"}`}>
      <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} aria-label="Ajouter une photo" aria-describedby="sherco-photo-hint" className="sr-only" onChange={(e) => { chooseFile(e.currentTarget.files?.[0] ?? null); e.currentTarget.value = ""; }} />
      <span aria-hidden="true" className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#ffd100] text-lg text-[#171816]"><FontAwesomeIcon icon={faCloudArrowUp} /></span>
      <span className="min-w-0">
        <span className="block text-sm font-bold text-[#171816]">Choisir une photo à ajouter</span>
        <span id="sherco-photo-hint" className="mt-1 block text-xs leading-5 text-black/65">JPEG, PNG ou WebP · 8 Mo maximum. Confirmez l’ajout après l’aperçu.</span>
      </span>
    </label>
    {file && <div className="space-y-2 rounded-lg border border-black/10 p-3"><p className="text-sm">Aperçu avant enregistrement : {file.name}</p>{preview && <img src={preview} alt="Aperçu de la nouvelle photo" className="max-h-56 max-w-full object-contain" />}<div className="flex gap-2"><button type="button" className={primary} disabled={busy} onClick={() => void upload()}>{busy ? "Envoi…" : "Ajouter la photo"}</button><button type="button" className={secondary} disabled={busy} onClick={() => chooseFile(null)}>Annuler</button></div></div>}
    {data.images.length === 0 ? <p className="text-sm text-black/60">Aucune photo locale enregistrée.</p> : <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{data.images.map((image, index) => <li key={image.id} className="rounded-lg border border-black/10 p-3"><img src={image.url} alt={`Photo de bannière ${index + 1}`} loading="lazy" className="aspect-video w-full object-cover" /><p className="mt-2 text-sm font-semibold">{data.selected === image.id ? "Photo affichée" : `Photo ${index + 1}`}</p><div className="mt-2 flex flex-wrap gap-2"><button type="button" className={primary} disabled={busy || !!file || data.selected === image.id} onClick={() => void perform("sherco-banner.php", json("PUT", { id: image.id }), "Photo sélectionnée. Rechargez le site pour la voir.")}>Afficher cette photo</button><button type="button" className={secondary} disabled={busy || !!file} onClick={() => void remove(image)}>Retirer</button></div></li>)}</ul>}
    <details className="rounded-lg border border-black/15 p-4">
      <summary className="cursor-pointer text-sm font-bold">Photos retirées ou retrouvées ({retired.length})</summary>
      <p className="mt-2 text-sm text-black/60">Ces fichiers ne sont pas dans la bibliothèque de la bannière. Certains peuvent avoir été retirés avant cette mise à jour ou être utilisés ailleurs : vérifiez avant toute suppression définitive. Ils restent sur le serveur jusqu’à votre confirmation.</p>
      {retired.length === 0 ? <p className="mt-3 text-sm text-black/60">Aucune photo retirée ou retrouvée.</p> : <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{retired.map((image, index) => <li key={image.url} className="rounded-lg border border-black/10 p-3"><img src={image.url} alt={`Photo retirée ${index + 1}`} loading="lazy" className="aspect-video w-full object-cover" /><p className="mt-2 break-all text-xs text-black/60">{image.url.split('/').pop()}</p><div className="mt-2 flex flex-wrap gap-2"><button type="button" className={secondary} disabled={busy || !!file} aria-label={`Restaurer la photo retirée ${index + 1}`} onClick={() => void restore(image)}>Restaurer</button><button type="button" className={secondary} disabled={busy || !!file} aria-label={`Supprimer définitivement la photo retirée ${index + 1}`} onClick={() => void purge(image)}>Supprimer définitivement</button></div></li>)}</ul>}
    </details>
  </section>;
}
