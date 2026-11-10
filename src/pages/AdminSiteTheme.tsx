import { useEffect, useState, type FormEvent } from "react";
import { json, request } from "../lib/adminApi";

type SiteTheme = "funbike" | "tvs";
export default function AdminSiteTheme({ onSavingChange }: { onSavingChange: (saving: boolean) => void }) {
  const [selected, setSelected] = useState<SiteTheme>("funbike");
  const [saved, setSaved] = useState<SiteTheme>("funbike");
  const [revision, setRevision] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function load() {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await request("site-theme.php");
      if (!["funbike", "tvs"].includes(result.data?.theme) || typeof result.revision !== "string") throw new Error("Réponse du serveur invalide.");
      setSelected(result.data.theme); setSaved(result.data.theme); setRevision(result.revision);
    } catch (err) { setRevision(""); setError((err as Error).message); }
    finally { setBusy(false); }
  }
  useEffect(() => { void load(); }, []);
  async function save(e: FormEvent) {
    e.preventDefault(); if (busy || !revision) return;
    setBusy(true); onSavingChange(true); setError(""); setNotice("");
    try {
      const result = await request("site-theme.php", json("PUT", { theme: selected, revision }));
      if (result.data?.theme !== selected || typeof result.revision !== "string") throw new Error("Réponse du serveur invalide. Rechargez pour vérifier le thème.");
      setSaved(selected); setRevision(result.revision); setNotice("Thème enregistré pour tous les visiteurs. Les pages déjà ouvertes doivent être actualisées.");
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); onSavingChange(false); }
  }
  return <form onSubmit={save} className="max-w-3xl rounded-xl border border-black/10 bg-white p-6">
    <h2 className="text-xl font-bold">Thème du site</h2>
    <p className="mt-2 text-sm text-black/65">Ce choix s’applique au site pour tous les visiteurs. Chaque visiteur conserve son choix jour ou nuit. Le mode jour ou nuit du dashboard se règle séparément, sur cet appareil.</p>
    <fieldset disabled={busy || !revision} className="mt-5 space-y-3"><legend className="mb-2 text-sm font-semibold">Choisir un thème</legend>
      {([{ id: "funbike", label: "Funbike — thème actuel", colors: ["#ffd100", "#171816", "#ffffff"] }, { id: "tvs", label: "TVS Motor", colors: ["#183883", "#e62d38", "#ffffff", "#2c2c2c"] }] as const).map((theme) => <label key={theme.id} className="flex cursor-pointer flex-wrap items-center gap-3 rounded-lg border border-black/15 p-4"><input type="radio" name="site-theme" value={theme.id} checked={selected === theme.id} onChange={() => { setSelected(theme.id); setNotice(""); }} /><span className="flex-1 font-semibold">{theme.label}{saved === theme.id ? " · Actif" : ""}</span><span aria-hidden="true" className="flex gap-1">{theme.colors.map((color) => <span key={color} className="h-6 w-6 rounded-full border border-black/15" style={{ backgroundColor: color }} />)}</span></label>)}
    </fieldset>
    {error && <p role="alert" className="mt-4 text-sm text-red-700">{error} <button type="button" className="underline" disabled={busy} onClick={() => void load()}>Recharger</button></p>}
    {notice && <p role="status" className="mt-4 text-sm text-emerald-800">{notice}</p>}
    <button disabled={busy || !revision || selected === saved} className="mt-5 rounded-md bg-[#ffd100] px-4 py-2.5 text-sm font-bold text-[#171816] disabled:opacity-50">{busy ? "Chargement…" : "Appliquer le thème"}</button>
  </form>;
}
