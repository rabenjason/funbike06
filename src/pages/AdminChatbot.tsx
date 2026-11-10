import { useEffect, useState } from "react";
import { json, request } from "../lib/adminApi";

const secondary = "rounded-md border border-black/20 px-3 py-2 text-sm font-semibold hover:bg-black/5 disabled:opacity-50";
const primary = "rounded-md bg-[#ffd100] px-4 py-2.5 text-sm font-bold text-[#171816] hover:bg-[#ffe36b] disabled:opacity-50";
type Settings = { enabled: boolean; revision: string };
function parse(result: Record<string, unknown>): Settings {
  const data = result.data as { enabled?: unknown } | undefined;
  if (!data || typeof data.enabled !== "boolean" || typeof result.revision !== "string" || !result.revision) throw new Error("Réponse du serveur invalide. Rechargez pour vérifier le réglage.");
  return { enabled: data.enabled, revision: result.revision };
}
export function AdminChatbot({ onSavingChange }: { onSavingChange?: (saving: boolean) => void }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(""); setNotice("");
    request("chatbot-settings.php").then((result) => { const data = parse(result); if (active) setSettings(data); })
      .catch((err) => { if (active) { setSettings(null); setError((err as Error).message); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt]);
  async function save(enabled: boolean) {
    if (!settings || busy) return;
    setBusy(true); onSavingChange?.(true); setError(""); setNotice("");
    try {
      const result = parse(await request("chatbot-settings.php", json("PUT", { enabled, revision: settings.revision })));
      if (result.enabled !== enabled) throw new Error("Réponse inattendue. Rechargez pour vérifier le réglage.");
      setSettings(result); setNotice("Réglage enregistré pour tous les visiteurs. Les pages déjà ouvertes doivent être actualisées.");
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); onSavingChange?.(false); }
  }
  return <section className="rounded-xl border border-black/10 bg-white p-5 sm:p-6" aria-labelledby="chatbot-settings-title">
    <h2 id="chatbot-settings-title" className="text-lg font-bold">Chatbot Piston</h2>
    <p className="mt-2 text-sm text-black/60">Affichez ou masquez Piston sur toutes les pages du site, pour tous les visiteurs. Ce réglage ne supprime pas les conversations enregistrées dans leur navigateur.</p>
    {loading ? <p className="mt-4 text-sm">Chargement du réglage…</p> : <>
      {settings && <><p className="mt-5 text-sm font-semibold">État actuel : {settings.enabled ? "Activé — visible sur le site" : "Désactivé — masqué sur le site"}</p>
        <button type="button" className={`${primary} mt-4`} disabled={busy} onClick={() => void save(!settings.enabled)}>{busy ? "Enregistrement…" : settings.enabled ? "Désactiver le chatbot" : "Activer le chatbot"}</button></>}
      {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
      {error && <button type="button" disabled={busy} className={`${secondary} mt-3`} onClick={() => setAttempt((n) => n + 1)}>Recharger le réglage</button>}
      {notice && <p role="status" className="mt-4 text-sm text-emerald-800">{notice}</p>}
    </>}
  </section>;
}
