import { useEffect, useState } from "react";
import { request } from "../lib/adminApi";

type Entry = { time: string; account: string; type: string; subject: string; fields: string[]; result: string };
type History = { entries: Entry[]; total: number; page: number; pages: number; accounts: string[]; types: string[] };
type Filters = { account: string; type: string; from: string; to: string; q: string };
const empty: Filters = { account: "", type: "", from: "", to: "", q: "" };
const input = "mt-1 block w-full rounded-md border border-black/20 bg-white px-3 py-2 text-sm text-[#171816]";
const button = "rounded-md border border-black/20 px-3 py-2 text-sm font-semibold hover:bg-black/5 disabled:opacity-50";
const labels: Record<string, string> = { name: "nom", description: "description", status: "statut", brandId: "marque", modelId: "modèle", categoryId: "catégorie", productTypeId: "type de produit", price: "prix", images: "photos", specifications: "caractéristiques", tags: "étiquettes", enabled: "activation", published: "publication", products: "produits", startDate: "date de début", endDate: "date de fin", bannerUrl: "photo de bannière", selected: "sélection", content: "contenu", links: "liens", exclusiveBrands: "marques officielles", bannerLink: "destination de la bannière", isNewArrival: "nouveauté", isHomepageHero: "mise en avant", isMotoAccueil: "motos à l’accueil", isEquipementAccueil: "équipements à l’accueil", phone: "téléphone", address: "adresse", email: "e-mail", city: "ville", hours: "horaires", logo: "logo", theme: "thème", preferredCategory: "catégorie initiale" };
function fieldName(value: string) { return value.split(".").map(part => labels[part] ?? part).join(" › "); }
function dateTime(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("fr-FR", { timeZone: "Indian/Antananarivo", dateStyle: "short", timeStyle: "medium" }).format(date); }

export function AdminHistory() {
  const [draft, setDraft] = useState<Filters>(empty);
  const [filters, setFilters] = useState<Filters>(empty);
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [data, setData] = useState<History | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setLoading(true); setError("");
    const params = new URLSearchParams({ ...filters, page: String(page) });
    request(`admin-history.php?${params}`).then((value) => {
      if (!Array.isArray(value.entries) || !Array.isArray(value.accounts) || !Array.isArray(value.types) || !Number.isInteger(value.total) || !Number.isInteger(value.pages) || !value.entries.every((e: Entry) => e && typeof e.time === "string" && typeof e.account === "string" && typeof e.type === "string" && typeof e.subject === "string" && typeof e.result === "string" && Array.isArray(e.fields))) throw new Error("Réponse de l’historique invalide.");
      if (active) setData(value as History);
    }).catch((err) => { if (active) { setData(null); setError((err as Error).message); } }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [filters, page, attempt]);
  function update(key: keyof Filters, value: string) { setDraft(previous => ({ ...previous, [key]: value })); }
  return <section>
    <div className="mb-5"><p className="text-xs font-bold uppercase tracking-widest text-[#98741b]">Administration</p><h1 className="mt-1 text-2xl font-bold">Historique</h1></div>
    <p className="mb-4 text-sm text-black/65">Actions enregistrées à partir du déploiement, heure de Madagascar. Le compte utilisé est indiqué, pas la personne. Ce journal n’est pas une sauvegarde et ne suit pas les changements directs sur le serveur.</p>
    <form className="rounded-xl border border-black/10 bg-white p-4" onSubmit={event => { event.preventDefault(); setPage(1); setFilters({ ...draft }); }}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="text-sm font-semibold">Compte<select className={input} value={draft.account} onChange={e => update("account", e.target.value)}><option value="">Tous</option>{data?.accounts.map(a => <option key={a} value={a}>{a}</option>)}</select></label>
        <label className="text-sm font-semibold">Type d’action<select className={input} value={draft.type} onChange={e => update("type", e.target.value)}><option value="">Tous</option>{data?.types.map(t => <option key={t} value={t}>{t}</option>)}</select></label>
        <label className="text-sm font-semibold">Du<input type="date" className={input} value={draft.from} onChange={e => update("from", e.target.value)} /></label>
        <label className="text-sm font-semibold">Au<input type="date" className={input} value={draft.to} onChange={e => update("to", e.target.value)} /></label>
        <label className="text-sm font-semibold">Recherche<input type="search" maxLength={200} placeholder="Produit, nom…" className={input} value={draft.q} onChange={e => update("q", e.target.value)} /></label>
      </div>
      <div className="mt-4 flex flex-wrap gap-2"><button className={button} type="submit">Filtrer</button><button className={button} type="button" onClick={() => { setDraft(empty); setFilters(empty); setPage(1); }}>Effacer les filtres</button><button className={button} type="button" onClick={() => setAttempt(n => n + 1)}>Actualiser</button></div>
    </form>
    {loading && <p role="status" className="mt-4 text-sm">Chargement de l’historique…</p>}
    {error && <p role="alert" className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {!loading && data && <div className="mt-4">
      <p className="mb-3 text-sm">{data.total} action{data.total !== 1 ? "s" : ""}</p>
      {!data.entries.length ? <p className="rounded-xl border border-black/10 bg-white p-5 text-sm">Aucune action pour ces critères.</p> : <ol className="space-y-3">{data.entries.map((entry, index) => <li key={`${entry.time}-${index}`} className="rounded-xl border border-black/10 bg-white p-4 text-sm"><div className="flex flex-wrap items-baseline justify-between gap-2"><strong>{entry.type}</strong><time dateTime={entry.time} className="tabular-nums text-black/65">{dateTime(entry.time)}</time></div><p className="mt-2 font-semibold break-words">{entry.subject}</p><p className="mt-1">Compte : {entry.account}</p>{entry.fields.length > 0 && <p className="mt-1 break-words">Champs modifiés : {entry.fields.map(fieldName).join(", ")}</p>}{entry.result && <p className="mt-1 break-words">Résultat : {entry.result}</p>}</li>)}</ol>}
      {data.pages > 1 && <nav aria-label="Pages de l’historique" className="mt-4 flex items-center gap-3"><button className={button} disabled={page <= 1} onClick={() => setPage(n => n - 1)}>Précédent</button><span className="text-sm">Page {page} / {data.pages}</span><button className={button} disabled={page >= data.pages} onClick={() => setPage(n => n + 1)}>Suivant</button></nav>}
    </div>}
  </section>;
}
