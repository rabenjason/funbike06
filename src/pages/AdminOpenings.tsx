import { useEffect, useState } from "react";
import { request } from "../lib/adminApi";
import { openingsClientEnabled } from "../lib/openings";

type Month = { month: string; count: number; visitors: number; browsers?: number | null };
type Day = { date: string; visitors: number };
type Data = { enabled: boolean; currentMonth: string; months: Month[]; years: { year: string; visitors: number; browsers?: number | null }[]; days?: Day[] };
const names = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
const secondary = "rounded-md border border-black/20 px-3 py-2 text-sm font-semibold hover:bg-black/5 disabled:opacity-50";
const selectStyle = "ml-2 rounded-md border border-black/20 bg-white px-3 py-2 text-sm text-[#171816]";
const number = (value: number | null | undefined) => value == null ? "—" : value.toLocaleString("fr-FR");

export function AdminOpenings() {
  const [data, setData] = useState<Data | null>(null);
  const [year, setYear] = useState("");
  const [month, setMonth] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true; setLoading(true); setError("");
    request("openings.php").then((result) => {
      if (typeof result.enabled !== "boolean" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(result.currentMonth) || !Array.isArray(result.months) || !result.months.every((m: Month) => m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m.month) && Number.isSafeInteger(m.count) && m.count >= 0 && Number.isSafeInteger(m.visitors) && m.visitors >= 0 && (m.browsers == null || (Number.isSafeInteger(m.browsers) && m.browsers >= 0))) || !Array.isArray(result.years) || !result.years.every((y: { year: string; visitors: number; browsers?: number | null }) => y && /^\d{4}$/.test(y.year) && Number.isSafeInteger(y.visitors) && y.visitors >= 0 && (y.browsers == null || (Number.isSafeInteger(y.browsers) && y.browsers >= 0)))) throw new Error("Réponse des statistiques invalide.");
      if (result.months.some((m: Month) => !result.years.some((y: { year: string }) => y.year === m.month.slice(0, 4)))) throw new Error("Réponse des statistiques invalide.");
      if (result.days !== undefined && (!Array.isArray(result.days) || !result.days.every((d: Day) => {
        if (!d || !/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(d.date) || !Number.isSafeInteger(d.visitors) || d.visitors < 1 || !result.months.some((m: Month) => m.month === d.date.slice(0, 7))) return false;
        const [y, m, day] = d.date.split("-").map(Number);
        return day <= new Date(Date.UTC(y, m, 0)).getUTCDate() && d.date.slice(0, 7) <= result.currentMonth;
      }) || new Set(result.days.map((d: Day) => d.date)).size !== result.days.length)) throw new Error("Réponse des statistiques invalide.");
      if (active) {
        setData(result as Data);
        setYear((previous) => previous && (previous === result.currentMonth.slice(0, 4) || result.months.some((m: Month) => m.month.startsWith(`${previous}-`))) ? previous : result.currentMonth.slice(0, 4));
        setMonth((previous) => previous || result.currentMonth.slice(5, 7));
      }
    }).catch((err) => { if (active) { setData(null); setError((err as Error).message); } }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt]);
  const active = !!data?.enabled && openingsClientEnabled;
  const years = data ? [...new Set([data.currentMonth.slice(0, 4), ...data.months.map((item) => item.month.slice(0, 4))])].sort().reverse() : [];
  const byMonth = new Map(data?.months.filter((item) => item.month.startsWith(`${year}-`)).map((item) => [item.month, item]) ?? []);
  const total = byMonth.size ? [...byMonth.values()].reduce((sum, value) => sum + value.count, 0) : null;
  const annual = data?.years.find((item) => item.year === year);
  const daily = new Map(data?.days?.filter((item) => item.date.startsWith(`${year}-${month}-`)).map((item) => [item.date, item.visitors]) ?? []);
  const dayCount = year && month ? new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate() : 0;
  return <section>
    <div className="mb-5"><p className="text-xs font-bold uppercase tracking-widest text-[#98741b]">Administration</p><h1 className="mt-1 text-2xl font-bold">Fréquentation du site</h1></div>
    {loading && <p role="status" className="text-sm">Chargement des statistiques…</p>}
    {error && <p role="alert" className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <button type="button" className={secondary} disabled={loading} onClick={() => setAttempt((n) => n + 1)}>{error ? "Réessayer" : "Actualiser"}</button>
    {data && <div className="mt-4 rounded-xl border border-black/10 bg-white p-5 sm:p-6">
      <p role="status" className={`rounded-md px-3 py-2 text-sm ${active ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>{active ? "Comptage activé." : !data.enabled ? "Comptage désactivé sur le serveur : aucune ouverture n’est enregistrée. L’activation exige une vérification légale et technique préalable." : "Comptage désactivé dans cette version du site, mais activé sur le serveur. Vérifiez les autres versions et la configuration."}</p>
      <div className="mt-5"><label className="text-sm font-semibold">Année<select aria-label="Année des statistiques" value={year} onChange={(e) => setYear(e.target.value)} className={selectStyle}>{years.map((value) => <option key={value} value={value}>{value}</option>)}</select></label></div>
      <div className="mt-5 flex flex-wrap items-baseline gap-x-8 gap-y-3">
        <p><strong className="text-3xl tabular-nums">{number(annual?.visitors)}</strong> <span className="font-semibold">{annual?.visitors === 1 ? "visiteur estimé" : "visiteurs estimés"}</span></p>
        <p><strong className="text-xl tabular-nums">{number(total)}</strong> {total === 1 ? "ouverture" : "ouvertures"} du site</p>
      </div>
      <p className="mt-2 text-sm text-black/60">Détails : {number(annual?.visitors)} {annual?.visitors === 1 ? "adresse IP" : "adresses IP"} · {number(annual?.browsers)} {annual?.browsers === 1 ? "navigateur" : "navigateurs"}</p>
      <details className="mt-3 text-sm text-black/60"><summary className="cursor-pointer font-semibold">À propos des chiffres</summary><p className="mt-2">Les visiteurs sont estimés à partir des IP, pas comptés comme des personnes. Les actualisations et robots peuvent influencer les chiffres. Données disponibles sur 36 mois au maximum, heure de Madagascar. « — » : donnée indisponible.</p></details>
      <h2 className="mt-7 text-lg font-bold">Par mois</h2>
      <div className="mt-2 overflow-x-auto"><table className="w-full min-w-64 text-left text-sm"><caption className="sr-only">Fréquentation mensuelle pour {year}</caption><thead><tr className="border-b border-black/10"><th scope="col" className="py-2 pr-4">Mois</th><th scope="col" className="py-2 pr-4">Visiteurs estimés</th><th scope="col" className="py-2">Ouvertures</th></tr></thead><tbody>{names.map((name, index) => {
        const value = byMonth.get(`${year}-${String(index + 1).padStart(2, "0")}`);
        return <tr key={name} className="border-b border-black/5"><th scope="row" className="py-2 pr-4 font-normal">{name}</th><td className="py-2 pr-4 tabular-nums">{number(value?.visitors)}</td><td className="py-2 tabular-nums">{number(value?.count)}</td></tr>;
      })}</tbody></table></div>
      <h2 className="mt-7 text-lg font-bold">Par jour</h2>
      <div className="mt-2"><label className="text-sm font-semibold">Mois<select aria-label="Mois des statistiques quotidiennes" value={month} onChange={(e) => setMonth(e.target.value)} className={selectStyle}>{names.map((name, index) => <option key={name} value={String(index + 1).padStart(2, "0")}>{name}</option>)}</select></label></div>
      <p className="mt-2 text-xs text-black/55">Détail disponible depuis cette mise à jour ; le premier jour peut être incomplet. « — » : aucune donnée disponible.</p>
      {daily.size === 0 ? <p className="mt-3 text-sm text-black/60">Aucune donnée quotidienne pour ce mois.</p> : <div className="mt-2 overflow-x-auto"><table className="w-full min-w-48 text-left text-sm"><caption className="sr-only">Visiteurs estimés par jour pour {names[Number(month) - 1]} {year}</caption><thead><tr className="border-b border-black/10"><th scope="col" className="py-2 pr-4">Jour</th><th scope="col" className="py-2">Visiteurs estimés</th></tr></thead><tbody>{Array.from({ length: dayCount }, (_, index) => {
        const day = String(index + 1).padStart(2, "0");
        return <tr key={day} className="border-b border-black/5"><th scope="row" className="py-2 pr-4 font-normal">{day}/{month}/{year}</th><td className="py-2 tabular-nums">{number(daily.get(`${year}-${month}-${day}`))}</td></tr>;
      })}</tbody></table></div>}
    </div>}
  </section>;
}
