import { useEffect, useState } from "react";
import { request } from "../lib/adminApi";
import { openingsClientEnabled } from "../lib/openings";

type Month = { month: string; count: number; visitors: number };
type Data = { enabled: boolean; currentMonth: string; months: Month[]; years: { year: string; visitors: number }[] };
const names = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
const secondary = "rounded-md border border-black/20 px-3 py-2 text-sm font-semibold hover:bg-black/5 disabled:opacity-50";

export function AdminOpenings() {
  const [data, setData] = useState<Data | null>(null);
  const [year, setYear] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true; setLoading(true); setError("");
    request("openings.php").then((result) => {
      if (typeof result.enabled !== "boolean" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(result.currentMonth) || !Array.isArray(result.months) || !result.months.every((m: Month) => m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m.month) && Number.isSafeInteger(m.count) && m.count >= 0 && Number.isSafeInteger(m.visitors) && m.visitors >= 0) || !Array.isArray(result.years) || !result.years.every((y: { year: string; visitors: number }) => y && /^\d{4}$/.test(y.year) && Number.isSafeInteger(y.visitors) && y.visitors >= 0)) throw new Error("Réponse des statistiques invalide.");
      if (result.months.some((m: Month) => !result.years.some((y: { year: string }) => y.year === m.month.slice(0, 4)))) throw new Error("Réponse des statistiques invalide.");
      if (active) { setData(result as Data); setYear((previous) => previous && (previous === result.currentMonth.slice(0, 4) || result.months.some((m: Month) => m.month.startsWith(`${previous}-`))) ? previous : result.currentMonth.slice(0, 4)); }
    }).catch((err) => { if (active) { setData(null); setError((err as Error).message); } }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt]);
  const active = !!data?.enabled && openingsClientEnabled;
  const years = data ? [...new Set([data.currentMonth.slice(0, 4), ...data.months.map((item) => item.month.slice(0, 4))])].sort().reverse() : [];
  const byMonth = new Map(data?.months.filter((item) => item.month.startsWith(`${year}-`)).map((item) => [item.month, item]) ?? []);
  const total = [...byMonth.values()].reduce((sum, value) => sum + value.count, 0);
  const maximum = Math.max(1, ...[...byMonth.values()].map((value) => value.count));
  return <section>
    <div className="mb-5"><p className="text-xs font-bold uppercase tracking-widest text-[#98741b]">Administration</p><h1 className="mt-1 text-2xl font-bold">Statistiques du site</h1><p className="mt-1 text-sm text-black/55">Ouvertures par mois et par année.</p></div>
    {loading && <p role="status" className="text-sm">Chargement des statistiques…</p>}
    {error && <p role="alert" className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <button type="button" className={secondary} disabled={loading} onClick={() => setAttempt((n) => n + 1)}>{error ? "Réessayer" : "Actualiser"}</button>
    {data && <div className="mt-4 rounded-xl border border-black/10 bg-white p-5 sm:p-6">
      <p role="status" className={`rounded-md px-3 py-2 text-sm ${active ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>{active ? "Comptage activé." : !data.enabled ? "Comptage désactivé sur le serveur : aucune ouverture n’est enregistrée. L’activation exige une vérification légale et technique préalable." : "Comptage désactivé dans cette version du site, mais activé sur le serveur. Vérifiez les autres versions et la configuration."}</p>
      <p className="mt-3 text-sm text-black/60">Le comptage des visiteurs uniques est suspendu. Les ouvertures comprennent les actualisations ; robots, blocages et erreurs peuvent fausser les chiffres. La limite de 120 requêtes par minute peut sous-estimer les pics. Heure de Madagascar.</p>
      <div className="mt-5 flex flex-wrap items-end gap-4"><label className="text-sm font-semibold">Année<select aria-label="Année des statistiques" value={year} onChange={(e) => setYear(e.target.value)} className="ml-2 rounded-md border border-black/20 bg-white px-3 py-2 text-sm text-[#171816]">{years.map((value) => <option key={value} value={value}>{value}</option>)}</select></label><p className="text-sm">Total des mois enregistrés : <strong className="text-lg">{byMonth.size ? total.toLocaleString("fr-FR") : "—"}</strong></p></div>
      <p className="mt-3 text-xs text-black/55">Les données commencent à l’activation et couvrent au plus les 36 derniers mois. Une année peut être incomplète. « — » indique qu’aucune donnée n’a été enregistrée pour ce mois.</p>
      <div className="mt-4 overflow-x-auto"><table className="w-full min-w-64 text-left text-sm"><caption className="sr-only">Ouvertures mensuelles pour {year}</caption><thead><tr className="border-b border-black/10"><th className="py-2 pr-4">Mois</th><th className="py-2 pr-4">Ouvertures</th><th className="py-2">Répartition</th></tr></thead><tbody>{names.map((name, index) => {
        const value = byMonth.get(`${year}-${String(index + 1).padStart(2, "0")}`);
        return <tr key={name} className="border-b border-black/5"><th scope="row" className="py-2 pr-4 font-normal">{name}</th><td className="py-2 pr-4 tabular-nums">{value === undefined ? "—" : value.count.toLocaleString("fr-FR")}</td><td className="py-2"><div aria-hidden="true" className="h-2 max-w-72 rounded bg-black/5"><div className="h-2 rounded bg-[#b58b16]" style={{ width: `${value === undefined ? 0 : value.count / maximum * 100}%` }} /></div></td></tr>;
      })}</tbody></table></div>
    </div>}
  </section>;
}
