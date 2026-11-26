import { useEffect, useState, type FormEvent } from "react";
import { json, request } from "../lib/adminApi";
import type { DisplayMode } from "../lib/theme";

export function AdminDefaultMode({ onDirtyChange, onSavingChange }: { onDirtyChange: (dirty: boolean) => void; onSavingChange: (busy: boolean) => void }) {
  const [selected, setSelected] = useState<DisplayMode>("dark");
  const [saved, setSaved] = useState<DisplayMode>("dark");
  const [theme, setTheme] = useState<"funbike" | "tvs">("funbike");
  const [revision, setRevision] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let active = true;
    request("site-theme.php").then((result) => {
      if (!["funbike", "tvs"].includes(result.data?.theme) || typeof result.revision !== "string" || (result.data?.defaultMode !== undefined && !["light", "dark"].includes(result.data.defaultMode))) throw new Error("Réponse invalide.");
      if (active) { const mode = result.data.defaultMode === "light" ? "light" : "dark"; setTheme(result.data.theme); setSaved(mode); setSelected(mode); setRevision(result.revision); }
    }).catch((err) => { if (active) setError((err as Error).message); });
    return () => { active = false; };
  }, []);
  async function save(event: FormEvent) {
    event.preventDefault(); if (busy || !revision || selected === saved) return;
    setBusy(true); onSavingChange(true); setError(""); setNotice("");
    try {
      const result = await request("site-theme.php", json("PUT", { theme, defaultMode: selected, revision }));
      if (result.data?.defaultMode !== selected || result.data?.theme !== theme || typeof result.revision !== "string") throw new Error("Enregistrement non confirmé. Quittez et rouvrez ce réglage pour vérifier.");
      setSaved(selected); setRevision(result.revision); onDirtyChange(false); setNotice("Mode initial enregistré. Il s’applique aux visiteurs sans préférence enregistrée après rechargement.");
    } catch (err) { setError((err as Error).message || "Enregistrement non confirmé. Quittez et rouvrez ce réglage pour vérifier."); }
    finally { setBusy(false); onSavingChange(false); }
  }
  return <form onSubmit={save} className="max-w-3xl rounded-xl border border-black/10 bg-white p-6">
    <h2 className="text-xl font-bold">Mode jour ou nuit par défaut</h2>
    <p className="mt-2 text-sm text-black/65">Ce mode s’applique au site pour les visiteurs sans préférence enregistrée, sur toutes les pages. Les visiteurs qui ont déjà un choix enregistré le conservent. Le mode du dashboard est indépendant.</p>
    <fieldset disabled={busy || !revision} className="mt-5 space-y-3"><legend className="mb-2 text-sm font-semibold">Mode initial du site</legend>
      {([{ value: "light", label: "Jour" }, { value: "dark", label: "Nuit" }] as const).map((option) => <label key={option.value} className="flex cursor-pointer items-center gap-3 rounded-lg border border-black/15 p-4"><input type="radio" name="default-mode" checked={selected === option.value} onChange={() => { setSelected(option.value); onDirtyChange(option.value !== saved); setNotice(""); }} />{option.label}{saved === option.value ? " · Actif" : ""}</label>)}
    </fieldset>
    {error && <p role="alert" className="mt-4 text-sm text-red-700">{error} Quittez et rouvrez ce réglage pour recharger.</p>}
    {notice && <p role="status" className="mt-4 text-sm text-emerald-800">{notice}</p>}
    <button disabled={busy || !revision || selected === saved} className="mt-5 rounded-md bg-[#ffd100] px-4 py-2.5 text-sm font-bold text-[#171816] disabled:opacity-50">{busy ? "Enregistrement…" : "Enregistrer le mode initial"}</button>
  </form>;
}
