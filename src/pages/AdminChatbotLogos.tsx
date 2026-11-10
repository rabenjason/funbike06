import { useEffect, useState } from "react";
import { useConfirmation } from "../components/ConfirmationModal";
import { json, request } from "../lib/adminApi";

const validLogo = (value: unknown): value is string => typeof value === "string" && /^\/server\/uploads\/chatbot\/logo-[a-f0-9]{32}\.(jpg|png|webp)$/.test(value);
function parse(result: Record<string, unknown>): { logos: string[]; current: string | null } {
  if (!Array.isArray(result.logos) || !result.logos.every(validLogo) || (result.current !== null && !validLogo(result.current))) throw new Error("Réponse du serveur invalide. Rechargez la liste.");
  return { logos: result.logos, current: result.current as string | null };
}

export function AdminChatbotLogos({ selectedLogo, busy, onSavingChange }: { selectedLogo: string | null; busy: boolean; onSavingChange?: (saving: boolean) => void }) {
  const confirm = useConfirmation();
  const [data, setData] = useState<{ logos: string[]; current: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError("");
    request("chatbot-logos.php").then((result) => { if (active) setData(parse(result)); })
      .catch((err) => { if (active) { setData(null); setError((err as Error).message); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [selectedLogo, attempt]);
  async function remove(url: string) {
    if (busy || deleting) return;
    if (!await confirm({ title: "Supprimer définitivement ce logo ?", description: "Le fichier sera supprimé du serveur sans possibilité de restauration depuis le dashboard. Vérifiez qu’il n’est utilisé nulle part ailleurs et que vous disposez d’une sauvegarde. Des copies en cache peuvent subsister.", confirmLabel: "Supprimer définitivement", destructive: true })) return;
    setDeleting(true); onSavingChange?.(true); setError(""); setNotice("");
    try {
      const result = parse(await request("chatbot-logos.php", json("DELETE", { url })));
      if (result.logos.includes(url)) throw new Error("Réponse inattendue. Rechargez la liste pour vérifier la suppression.");
      setData(result); setNotice("Logo supprimé du serveur. Des copies en cache peuvent subsister.");
    } catch (err) { setError((err as Error).message); }
    finally { setDeleting(false); onSavingChange?.(false); }
  }
  return <div className="mt-3">
    <p className="text-sm text-black/60">Les anciens logos restent sur le serveur. Le logo utilisé ne peut pas être supprimé ; choisissez d’abord un autre logo ou rétablissez le chat d’origine.</p>
    {loading && <p className="mt-3 text-sm">Chargement des logos…</p>}
    {error && <div className="mt-3"><p role="alert" className="text-sm text-red-700">{error}</p><button type="button" className="mt-2 rounded-md border border-black/20 px-3 py-2 text-sm font-semibold" disabled={busy || deleting} onClick={() => setAttempt((n) => n + 1)}>Recharger les logos</button></div>}
    {notice && <p role="status" className="mt-3 text-sm text-emerald-800">{notice}</p>}
    {!loading && data && (data.logos.length === 0 ? <p className="mt-3 text-sm text-black/60">Aucun logo ajouté sur le serveur.</p> : <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{data.logos.map((url, index) => <li key={url} className="min-w-0 rounded-lg border border-black/10 p-3">
      <img src={url} alt={`Logo ajouté ${index + 1}`} loading="lazy" className="h-20 w-full bg-white object-contain" />
      <p className="mt-2 break-all text-xs text-black/60">{url.split('/').pop()}</p>
      {data.current === url || selectedLogo === url ? <p className="mt-2 text-sm font-semibold">Logo actuel</p> : <button type="button" disabled={busy || deleting} aria-label={`Supprimer définitivement le logo ajouté ${index + 1}`} onClick={() => void remove(url)} className="mt-2 rounded-md border border-black/20 px-3 py-2 text-sm font-semibold hover:bg-black/5 disabled:opacity-50">Supprimer</button>}
    </li>)}</ul>)}
  </div>;
}
