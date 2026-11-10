import { useEffect, useState, type FormEvent } from "react";
import { HomepageManager, type AdminCatalog, type HomepageField } from "./AdminCatalog";
import { AdminFeatureBanner } from "./AdminFeatureBanner";
import { json, request } from "../lib/adminApi";
import { useConfirmation } from "../components/ConfirmationModal";
import { validHomepage, type HomepageContent, type HomepageData, type HomepageLink } from "../content/homepage";
import type { Product } from "../types/product";

const control = "mt-1 w-full rounded-md border border-black/15 bg-white px-3 py-2.5 text-sm text-[#171816] focus:border-[#98741b] focus:outline-none";
const secondary = "rounded-md border border-black/20 px-3 py-2 text-sm font-semibold hover:bg-black/5 disabled:opacity-40";
const primary = "rounded-md bg-[#ffd100] px-4 py-2.5 text-sm font-bold text-[#171816] hover:bg-[#ffe36b] disabled:opacity-50";
const sections: { key: keyof HomepageContent; name: string; fields: { key: string; label: string; multiline?: boolean; hint?: string }[] }[] = [
  { key: "hero", name: "Bandeau principal", fields: [
    { key: "localisation", label: "Texte au-dessus du titre" }, { key: "titreLigne1", label: "Titre — ligne 1" }, { key: "titreLigne2", label: "Titre — ligne 2" },
    { key: "description", label: "Description avec les marques", multiline: true, hint: "Utilisée lorsque Sherco, Fantic et TVS sont publiées." },
    { key: "descriptionSansMarques", label: "Description alternative", multiline: true, hint: "Utilisée si l’une de ces marques n’est pas publiée." },
    { key: "sloganPrefix", label: "Début du slogan animé" }, { key: "usages", label: "Usages du slogan animé", multiline: true, hint: "Un usage par ligne, de 1 à 10." },
    { key: "boutonCatalogue", label: "Bouton catalogue" }, { key: "aLaUne", label: "Libellé À la une" }, { key: "choisirModele", label: "Libellé accessible du sélecteur" }, { key: "afficherModele", label: "Libellé accessible d’un modèle" },
  ] },
  { key: "univers", name: "Choisir son univers", fields: [{ key: "surTitre", label: "Surtitre" }, { key: "titre", label: "Titre" }] },
  { key: "distributeur", name: "Marques officielles", fields: [{ key: "surTitre", label: "Surtitre" }, { key: "titre", label: "Titre" }, { key: "boutonToutVoir", label: "Bouton sur ordinateur" }, { key: "boutonToutesMotos", label: "Bouton sur mobile" }, { key: "logoPrefix", label: "Préfixe accessible des logos" }] },
  { key: "nouveautes", name: "Nouveautés", fields: [{ key: "surTitre", label: "Surtitre" }, { key: "titre", label: "Titre" }, { key: "description", label: "Description", multiline: true }, { key: "tarif", label: "Libellé du tarif" }, { key: "boutonCatalogue", label: "Bouton catalogue" }, { key: "decouvrirPrefix", label: "Préfixe accessible Découvrir" }] },
  { key: "motos", name: "Sélection de motos", fields: [{ key: "numero", label: "Numéro et surtitre" }, { key: "titre", label: "Titre" }, { key: "description", label: "Description", multiline: true }, { key: "bouton", label: "Bouton" }] },
  { key: "atelier", name: "Équipements", fields: [{ key: "surTitre", label: "Surtitre" }, { key: "titre", label: "Titre" }, { key: "description", label: "Description", multiline: true }, { key: "bouton", label: "Bouton" }] },
  { key: "partenaires", name: "Partenaires", fields: [{ key: "titre", label: "Titre" }, { key: "description", label: "Description" }, { key: "logoPrefix", label: "Préfixe accessible des logos" }] },
];
const destinations: { value: HomepageLink["to"]; label: string }[] = [
  { value: "catalogue", label: "Catalogue" }, { value: "motos", label: "Motos" }, { value: "equipements", label: "Équipements" },
  { value: "spares", label: "Pièces détachées" }, { value: "revendeurs", label: "Revendeurs" }, { value: "contact", label: "Contact" },
];
const icons: { value: HomepageLink["icon"]; label: string }[] = [{ value: "moto", label: "Moto" }, { value: "helmet", label: "Casque" }, { value: "parts", label: "Pièces" }, { value: "gear", label: "Équipement" }];

export function AdminHomepage({ catalog, onToggle, dirty, saving, onDirtyChange, onSavingChange }: { catalog: AdminCatalog; onToggle: (p: Product, field: HomepageField, value: boolean) => Promise<void>; dirty: boolean; saving: boolean; onDirtyChange: (value: boolean) => void; onSavingChange: (value: boolean) => void }) {
  const [mode, setMode] = useState<"products" | "content" | "sherco">("products");
  const confirm = useConfirmation();
  async function changeMode(next: "products" | "content" | "sherco") {
    if (mode === next || saving) return;
    if (dirty && !await confirm({ title: "Abandonner les modifications ?", description: "Les modifications non enregistrées seront perdues.", confirmLabel: "Abandonner", cancelLabel: "Continuer à modifier", destructive: true })) return;
    onDirtyChange(false); setMode(next);
  }
  return <div>
    <div className="mb-5 flex flex-wrap gap-2" aria-label="Gestion de l’accueil">
      <button type="button" className={mode === "products" ? "rounded-md bg-[#171816] px-3 py-2 text-sm font-semibold text-white" : secondary} aria-pressed={mode === "products"} disabled={saving} onClick={() => void changeMode("products")}>Sélections de produits</button>
      <button type="button" className={mode === "content" ? "rounded-md bg-[#171816] px-3 py-2 text-sm font-semibold text-white" : secondary} aria-pressed={mode === "content"} disabled={saving} onClick={() => void changeMode("content")}>Textes et liens</button>
      <button type="button" className={mode === "sherco" ? "rounded-md bg-[#171816] px-3 py-2 text-sm font-semibold text-white" : secondary} aria-pressed={mode === "sherco"} disabled={saving} onClick={() => void changeMode("sherco")}>Bannière de mise en avant</button>
    </div>
    {mode === "products" ? <HomepageManager catalog={catalog} onToggle={onToggle} saving={saving} onSavingChange={onSavingChange} /> : mode === "content" ? <HomepageContentEditor catalog={catalog} onDirtyChange={onDirtyChange} onSavingChange={onSavingChange} /> : <AdminFeatureBanner catalog={catalog} onDirtyChange={onDirtyChange} onSavingChange={onSavingChange} />}
  </div>;
}

export function HomepageContentEditor({ catalog, onDirtyChange, onSavingChange }: { catalog: AdminCatalog; onDirtyChange: (value: boolean) => void; onSavingChange: (value: boolean) => void }) {
  const [draft, setDraft] = useState<HomepageData | null>(null);
  const [saved, setSaved] = useState("");
  const [revision, setRevision] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError("");
    request("homepage-content.php").then((result) => {
      if (!validHomepage(result.data) || typeof result.revision !== "string") throw new Error("Réponse du serveur invalide.");
      if (active) { setDraft(result.data); setSaved(JSON.stringify(result.data)); setRevision(result.revision); onDirtyChange(false); }
    }).catch((err) => { if (active) setError((err as Error).message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt, onDirtyChange]);
  const update = (next: HomepageData) => { setDraft(next); onDirtyChange(JSON.stringify(next) !== saved); setNotice(""); };
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!draft || busy) return;
    const usages = draft.content.hero.usages.map((u) => u.trim()).filter(Boolean);
    const data = { ...draft, content: { ...draft.content, hero: { ...draft.content.hero, usages } } };
    if (!validHomepage(data)) { setError("Vérifiez les champs obligatoires et ajoutez au moins un usage."); return; }
    setBusy(true); onSavingChange(true); setError(""); setNotice("");
    try {
      const result = await request("homepage-content.php", json("PUT", { revision, data }));
      if (!validHomepage(result.data) || typeof result.revision !== "string") throw new Error("Réponse du serveur invalide. Rechargez pour vérifier l’enregistrement.");
      setDraft(result.data); setSaved(JSON.stringify(result.data)); setRevision(result.revision); onDirtyChange(false); setNotice("Textes et liens enregistrés. Rechargez le site pour les voir.");
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); onSavingChange(false); }
  }
  const reload = () => { setAttempt((n) => n + 1); };
  if (loading) return <p className="rounded-xl bg-white p-5">Chargement des textes de l’accueil…</p>;
  if (!draft) return <div className="rounded-xl bg-white p-5"><p role="alert" className="text-red-700">{error || "Impossible de charger les textes."}</p><button type="button" className={`${secondary} mt-3`} onClick={reload}>Réessayer</button></div>;
  const updateLink = (index: number, patch: Partial<HomepageLink>) => update({ ...draft, links: draft.links.map((link, i) => i === index ? { ...link, ...patch } : link) });
  const moveLink = (index: number, direction: number) => { const links = [...draft.links]; const other = index + direction; if (other < 0 || other >= links.length) return; [links[index], links[other]] = [links[other], links[index]]; update({ ...draft, links }); };
  return <form onSubmit={save} className="space-y-4">
    <div><p className="text-xs font-bold uppercase tracking-widest text-[#98741b]">Mise en avant</p><h1 className="mt-1 text-2xl font-bold">Textes et liens de l’accueil</h1><p className="mt-1 text-sm text-black/60">Modifiez les textes visibles et les libellés accessibles. Les photos des produits se règlent dans leurs fiches ; la bannière de mise en avant se gère dans son onglet dédié.</p></div>
    {error && <div role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error} {error.includes("changé depuis") && <span>Copiez vos modifications si nécessaire, puis quittez et rouvrez cet écran pour recharger.</span>}</div>}
    {notice && <p role="status" className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    <fieldset disabled={busy} className="space-y-3">
      {sections.map((section) => <details key={section.key} className="rounded-xl border border-black/10 bg-white p-4"><summary className="cursor-pointer font-bold">{section.name}</summary><div className="mt-4 grid gap-4 sm:grid-cols-2">
        {section.fields.map((field) => {
          const value = (draft.content[section.key] as unknown as Record<string, string | string[]>)[field.key];
          const label = `${section.name} — ${field.label}`;
          const change = (v: string) => update({ ...draft, content: { ...draft.content, [section.key]: { ...draft.content[section.key], [field.key]: field.key === "usages" ? v.split(/\r?\n/) : v } } });
          return <label key={field.key} className={`block text-xs font-semibold text-black/65 ${field.multiline ? "sm:col-span-2" : ""}`}>{label}{field.multiline ? <textarea required maxLength={field.key === "usages" ? 1000 : 1800} rows={field.key === "usages" ? 4 : 3} className={control} value={Array.isArray(value) ? value.join("\n") : value} onChange={(e) => change(e.target.value)} /> : <input required maxLength={200} className={control} value={value as string} onChange={(e) => change(e.target.value)} />}{field.hint && <span className="mt-1 block font-normal text-black/50">{field.hint}</span>}</label>;
        })}
      </div></details>)}
      <section className="rounded-xl border border-black/10 bg-white p-4"><h2 className="font-bold">Liens « Choisir son univers »</h2><p className="mt-1 text-sm text-black/55">De 1 à 8 liens, dans l’ordre affiché. Les images et anciennes descriptions ne sont pas affichées. Une marque masquée ou sans produits adaptés ouvre la page sans appliquer ce filtre ; la page des équipements peut sélectionner une marque par défaut.</p>
        {draft.links.map((link, index) => <fieldset key={index} className="mt-4 rounded-lg border border-black/10 p-3"><legend className="px-1 text-sm font-semibold">Lien {index + 1}</legend><div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold">Titre du lien {index + 1}<input required maxLength={150} className={control} value={link.title} onChange={(e) => updateLink(index, { title: e.target.value })} /></label>
          <label className="text-xs font-semibold">Destination du lien {index + 1}<select className={control} value={link.to} onChange={(e) => { const to = e.target.value as HomepageLink["to"]; updateLink(index, { to, ...(!["motos", "equipements", "spares"].includes(to) ? { brandId: "" } : {}) }); }}>{destinations.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}</select></label>
          <label className="text-xs font-semibold">Icône du lien {index + 1}<select className={control} value={link.icon} onChange={(e) => updateLink(index, { icon: e.target.value as HomepageLink["icon"] })}>{icons.map((i) => <option key={i.value} value={i.value}>{i.label}</option>)}</select></label>
          <label className="text-xs font-semibold">Marque du lien {index + 1} (facultatif)<select className={control} disabled={!["motos", "equipements", "spares"].includes(link.to)} value={link.brandId} onChange={(e) => updateLink(index, { brandId: e.target.value })}><option value="">Aucune marque imposée</option>{link.brandId && !catalog.brands.some((b) => b.id === link.brandId) && <option value={link.brandId}>Marque introuvable ({link.brandId})</option>}{catalog.brands.filter((brand) => brand.id !== "unknown-brand").map((brand) => <option key={brand.id} value={brand.id}>{brand.name}{brand.isPublished === false ? " — non publiée" : ""}{link.to === "equipements" && !brand.isEquipmentBrand ? " — pas une marque d’équipements" : ""}</option>)}</select></label>
        </div><div className="mt-3 flex flex-wrap gap-2"><button type="button" className={secondary} disabled={index === 0} onClick={() => moveLink(index, -1)}>Monter le lien {index + 1}</button><button type="button" className={secondary} disabled={index === draft.links.length - 1} onClick={() => moveLink(index, 1)}>Descendre le lien {index + 1}</button><button type="button" className={secondary} disabled={draft.links.length <= 1} onClick={() => update({ ...draft, links: draft.links.filter((_, i) => i !== index) })}>Retirer le lien {index + 1}</button></div></fieldset>)}
        <button type="button" className={`${secondary} mt-4`} disabled={draft.links.length >= 8} onClick={() => update({ ...draft, links: [...draft.links, { title: "Nouveau lien", to: "catalogue", icon: "moto", brandId: "" }] })}>Ajouter un lien</button>
      </section>
      <section className="rounded-xl border border-black/10 bg-white p-4"><h2 className="font-bold">Marques officielles mises en avant</h2><p className="mt-1 text-sm text-black/55">Sélection indépendante des partenaires. Seules les marques publiées avec un logo apparaissent. Maximum 6.</p>
        {draft.exclusiveBrands.map((item, index) => <div key={index} className="mt-3 grid gap-3 rounded-lg border border-black/10 p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="text-xs font-semibold">Marque officielle {index + 1}<select required className={control} value={item.brandId} onChange={(e) => update({ ...draft, exclusiveBrands: draft.exclusiveBrands.map((v, i) => i === index ? { ...v, brandId: e.target.value } : v) })}><option value="">Choisir</option>{item.brandId && !catalog.brands.some((b) => b.id === item.brandId) && <option value={item.brandId}>Marque introuvable ({item.brandId})</option>}{catalog.brands.filter((brand) => brand.id !== "unknown-brand").map((brand) => <option key={brand.id} value={brand.id}>{brand.name}{brand.isPublished === false ? " — non publiée" : ""}</option>)}</select></label>
          <label className="text-xs font-semibold">Slogan de la marque {index + 1}<input required maxLength={150} className={control} value={item.tagline} onChange={(e) => update({ ...draft, exclusiveBrands: draft.exclusiveBrands.map((v, i) => i === index ? { ...v, tagline: e.target.value } : v) })} /></label>
          <button type="button" className={secondary} onClick={() => update({ ...draft, exclusiveBrands: draft.exclusiveBrands.filter((_, i) => i !== index) })}>Retirer la marque {index + 1}</button>
        </div>)}
        <button type="button" className={`${secondary} mt-4`} disabled={draft.exclusiveBrands.length >= 6} onClick={() => update({ ...draft, exclusiveBrands: [...draft.exclusiveBrands, { brandId: "", tagline: "" }] })}>Ajouter une marque officielle</button>
      </section>
    </fieldset>
    <div className="flex flex-wrap items-center gap-3"><button disabled={busy || JSON.stringify(draft) === saved} className={primary}>{busy ? "Enregistrement…" : "Enregistrer les textes et liens"}</button>{JSON.stringify(draft) !== saved && <span className="text-sm font-semibold text-amber-800">Modifications non enregistrées</span>}</div>
  </form>;
}
