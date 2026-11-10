import { useEffect, useRef, useState, type FormEvent } from "react";
import { json, request } from "../lib/adminApi";

const secondary = "rounded-md border border-black/20 px-3 py-2 text-sm font-semibold hover:bg-black/5 disabled:opacity-50";
const primary = "rounded-md bg-[#ffd100] px-4 py-2.5 text-sm font-bold text-[#171816] hover:bg-[#ffe36b] disabled:opacity-50";
const input = "mt-1 block w-full max-w-sm rounded-md border border-black/20 bg-white px-3 py-2 text-sm text-[#171816]";
type Settings = { enabled: boolean; name: string; logo: string | null; revision: string };
function parse(result: Record<string, unknown>): Settings {
  const data = result.data as { enabled?: unknown; name?: unknown; logo?: unknown } | undefined;
  if (!data || typeof data.enabled !== "boolean" || typeof result.revision !== "string" || !result.revision) throw new Error("Réponse du serveur invalide. Rechargez pour vérifier le réglage.");
  const name = data.name ?? "Piston", logo = data.logo ?? null;
  if (typeof name !== "string" || !name.trim() || [...name].length > 40 || /[\x00-\x1f\x7f<>*]/.test(name) || (logo !== null && (typeof logo !== "string" || !/^\/server\/uploads\/chatbot\/logo-[a-f0-9]{32}\.(jpg|png|webp)$/.test(logo)))) throw new Error("Réponse du serveur invalide. Rechargez pour vérifier le réglage.");
  return { enabled: data.enabled, name, logo, revision: result.revision };
}
export function AdminChatbot({ onSavingChange, onDirtyChange }: { onSavingChange?: (saving: boolean) => void; onDirtyChange?: (dirty: boolean) => void }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [name, setName] = useState("");
  const nameRef = useRef("");
  const dirtyRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [attempt, setAttempt] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(""); setNotice("");
    request("chatbot-settings.php").then((result) => {
      const data = parse(result);
      if (active) {
        setSettings(data);
        if (!dirtyRef.current) { nameRef.current = data.name; setName(data.name); }
        const dirty = nameRef.current !== data.name; dirtyRef.current = dirty; onDirtyChange?.(dirty);
      }
    }).catch((err) => { if (active) { setSettings(null); setError((err as Error).message); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
    // Les callbacks du parent peuvent changer à chaque rendu ; une lecture ne doit pas effacer le brouillon.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);
  async function save(body: { enabled?: boolean; name?: string; resetLogo?: true } | { file: File }) {
    if (!settings || busy) return;
    setBusy(true); onSavingChange?.(true); setError(""); setNotice("");
    try {
      let options: RequestInit;
      if ("file" in body) { const form = new FormData(); form.set("revision", settings.revision); form.set("logo", body.file); options = { method: "POST", body: form }; }
      else options = json("PUT", { revision: settings.revision, ...body });
      const result = parse(await request("chatbot-settings.php", options));
      if (!("file" in body) && ((body.enabled !== undefined && result.enabled !== body.enabled) || (body.name !== undefined && result.name !== body.name) || (body.resetLogo && result.logo !== null))) throw new Error("Réponse inattendue. Rechargez pour vérifier le réglage.");
      if ("file" in body && (!result.logo || result.logo === settings.logo)) throw new Error("Réponse inattendue. Rechargez pour vérifier le logo.");
      setSettings(result);
      if (!("file" in body) && body.name !== undefined) { nameRef.current = result.name; setName(result.name); }
      const dirty = nameRef.current !== result.name; dirtyRef.current = dirty; onDirtyChange?.(dirty);
      setNotice("Réglage enregistré pour tous les visiteurs. Les pages déjà ouvertes doivent être actualisées.");
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); onSavingChange?.(false); if (fileRef.current) fileRef.current.value = ""; }
  }
  function saveName(event: FormEvent) {
    event.preventDefault(); const clean = name.trim();
    if (!clean || [...clean].length > 40 || /[\x00-\x1f\x7f<>*]/.test(clean)) { setError("Nom invalide : 1 à 40 caractères, sans <, > ou *."); return; }
    void save({ name: clean });
  }
  return <section className="rounded-xl border border-black/10 bg-white p-5 sm:p-6" aria-labelledby="chatbot-settings-title">
    <h2 id="chatbot-settings-title" className="text-lg font-bold">Chatbot</h2>
    <p className="mt-2 text-sm text-black/60">Affichez ou masquez l’assistant sur toutes les pages, et personnalisez son nom et son logo. Les conversations enregistrées dans les navigateurs ne sont pas supprimées.</p>
    {loading ? <p className="mt-4 text-sm">Chargement du réglage…</p> : <>
      {settings && <><p className="mt-5 text-sm font-semibold">État actuel : {settings.enabled ? "Activé — visible sur le site" : "Désactivé — masqué sur le site"}</p>
        <button type="button" className={`${primary} mt-4`} disabled={busy} onClick={() => void save({ enabled: !settings.enabled })}>{busy ? "Enregistrement…" : settings.enabled ? "Désactiver le chatbot" : "Activer le chatbot"}</button>
        <form onSubmit={saveName} className="mt-6 border-t border-black/10 pt-5">
          <label className="block text-sm font-semibold">Nom du chatbot<input className={input} maxLength={40} required value={name} disabled={busy} onChange={(event) => { const value = event.target.value; setName(value); nameRef.current = value; const dirty = value !== settings.name; dirtyRef.current = dirty; onDirtyChange?.(dirty); setNotice(""); }} /></label>
          <button type="submit" className={`${secondary} mt-3`} disabled={busy || name === settings.name}>Enregistrer le nom</button>
        </form>
        <div className="mt-6 border-t border-black/10 pt-5"><h3 className="text-sm font-semibold">Logo du chatbot</h3>
          {settings.logo ? <img src={settings.logo} alt="Logo actuel du chatbot" className="mt-3 h-16 w-16 rounded-full border border-black/15 bg-white object-contain" /> : <p className="mt-2 text-sm text-black/60">Logo d’origine : le chat Funbike.</p>}
          <label className="mt-3 block text-sm font-semibold">Choisir une image<input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className={`${input} cursor-pointer`} disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024 || file.size === 0) { setError("Choisissez une image JPEG, PNG ou WebP de 2 Mo maximum."); event.currentTarget.value = ""; return; } void save({ file }); }} /></label>
          <p className="mt-2 text-xs text-black/60">JPEG, PNG ou WebP, 2 Mo maximum. Le logo est enregistré dès sa sélection ; une image carrée est conseillée.</p>
          {settings.logo && <button type="button" className={`${secondary} mt-3`} disabled={busy} onClick={() => void save({ resetLogo: true })}>Rétablir le logo d’origine</button>}
        </div></>}
      {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
      {error && <button type="button" disabled={busy} className={`${secondary} mt-3`} onClick={() => setAttempt((n) => n + 1)}>Recharger le réglage</button>}
      {notice && <p role="status" className="mt-4 text-sm text-emerald-800">{notice}</p>}
    </>}
  </section>;
}
