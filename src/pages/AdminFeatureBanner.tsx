import { useEffect, useState, type FormEvent } from "react";
import type { AdminCatalog } from "./AdminCatalog";
import { AdminShercoBanner } from "./AdminShercoBanner";
import { validHomepage, type BannerLink, type HomepageContent, type HomepageData } from "../content/homepage";
import { json, request } from "../lib/adminApi";

const control = "mt-1 w-full rounded-md border border-black/15 bg-white px-3 py-2.5 text-sm text-[#171816] focus:border-[#98741b] focus:outline-none";
const primary = "rounded-md bg-[#ffd100] px-4 py-2.5 text-sm font-bold text-[#171816] hover:bg-[#ffe36b] disabled:opacity-50";
const secondary = "rounded-md border border-black/20 px-3 py-2 text-sm font-semibold hover:bg-black/5";
const fields: { key: keyof HomepageContent['sherco']; label: string; multiline?: boolean }[] = [
  { key: 'surTitre', label: 'Surtitre' }, { key: 'titreLigne1', label: 'Titre — ligne 1' },
  { key: 'titreLigne2', label: 'Titre — ligne 2' }, { key: 'description', label: 'Description', multiline: true },
  { key: 'bouton', label: 'Texte du bouton' }, { key: 'imageAlt', label: 'Description accessible de la photo' },
];
const destinations: { value: BannerLink['to']; label: string }[] = [
  { value: 'motos', label: 'Motos' }, { value: 'equipements', label: 'Équipements' }, { value: 'spares', label: 'Pièces détachées' },
  { value: 'catalogue', label: 'Catalogue complet' }, { value: 'promotions', label: 'Promotions' }, { value: 'revendeurs', label: 'Revendeurs' }, { value: 'contact', label: 'Contact' },
];
const canFilter = (to: string) => ['motos', 'equipements', 'spares'].includes(to);

function BannerTextEditor({ catalog, onDirtyChange, onSavingChange }: { catalog: AdminCatalog; onDirtyChange: (value: boolean) => void; onSavingChange: (value: boolean) => void }) {
  const [draft, setDraft] = useState<HomepageData | null>(null);
  const [saved, setSaved] = useState(''); const [revision, setRevision] = useState('');
  const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false); const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true; setError(''); setDraft(null);
    request('homepage-content.php').then((result) => {
      if (!validHomepage(result.data) || typeof result.revision !== 'string') throw new Error('Réponse du serveur invalide.');
      if (active) { setDraft(result.data); setSaved(JSON.stringify(result.data)); setRevision(result.revision); onDirtyChange(false); }
    }).catch((err) => { if (active) setError((err as Error).message); });
    return () => { active = false; };
  }, [attempt, onDirtyChange]);
  function update(next: HomepageData) { setDraft(next); setNotice(''); onDirtyChange(JSON.stringify(next) !== saved); }
  async function save(event: FormEvent) {
    event.preventDefault(); if (!draft || busy) return;
    const data = draft;
    if (!validHomepage(data)) { setError('Vérifiez les champs et la destination.'); return; }
    setBusy(true); onSavingChange(true); setError(''); setNotice('');
    try {
      const result = await request('homepage-content.php', json('PUT', { revision, data }));
      if (!validHomepage(result.data) || typeof result.revision !== 'string') throw new Error('Réponse invalide : rechargez pour vérifier l’enregistrement.');
      setDraft(result.data); setSaved(JSON.stringify(result.data)); setRevision(result.revision); onDirtyChange(false); setNotice('Textes et destination enregistrés. Rechargez le site pour les voir.');
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); onSavingChange(false); }
  }
  if (!draft) return <div className="rounded-xl bg-white p-5">{error ? <><p role="alert" className="text-red-700">{error}</p><button className={`${secondary} mt-3`} onClick={() => setAttempt((n) => n + 1)}>Réessayer</button></> : <p>Chargement des textes…</p>}</div>;
  return <form onSubmit={save} className="space-y-4 rounded-xl border border-black/10 bg-white p-4 sm:p-5">
    <div><h2 className="text-lg font-bold">Textes et bouton</h2><p className="mt-1 text-sm text-black/60">Enregistrez ces textes séparément du choix de photo. La marque du lien est facultative.</p></div>
    <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">{fields.map((field) => <label key={field.key} className={`text-xs font-semibold text-black/65 ${field.multiline ? 'sm:col-span-2' : ''}`}>{field.label}{field.multiline ? <textarea required maxLength={2000} rows={3} className={control} value={draft.content.sherco[field.key]} onChange={(e) => update({ ...draft, content: { ...draft.content, sherco: { ...draft.content.sherco, [field.key]: e.target.value } } })} /> : <input required maxLength={500} className={control} value={draft.content.sherco[field.key]} onChange={(e) => update({ ...draft, content: { ...draft.content, sherco: { ...draft.content.sherco, [field.key]: e.target.value } } })} />}</label>)}
      <label className="text-xs font-semibold text-black/65">Destination du bouton<select className={control} value={draft.bannerLink.to} onChange={(e) => { const to = e.target.value as BannerLink['to']; update({ ...draft, bannerLink: { ...draft.bannerLink, to, ...(!canFilter(to) ? { brandId: '' } : {}) } }); }}>{destinations.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      <label className="text-xs font-semibold text-black/65">Marque du bouton (facultatif)<select aria-label="Marque du bouton (facultatif)" className={control} disabled={!canFilter(draft.bannerLink.to)} value={draft.bannerLink.brandId} onChange={(e) => update({ ...draft, bannerLink: { ...draft.bannerLink, brandId: e.target.value } })}><option value="">Toutes les marques</option>{draft.bannerLink.brandId && !catalog.brands.some((b) => b.id === draft.bannerLink.brandId) && <option value={draft.bannerLink.brandId}>Marque introuvable ({draft.bannerLink.brandId})</option>}{catalog.brands.filter((b) => b.id !== 'unknown-brand').map((b) => <option key={b.id} value={b.id}>{b.name}{b.isPublished === false ? ' — non publiée' : ''}</option>)}</select><span className="mt-1 block font-normal text-black/50">Si la marque est masquée ou indisponible pour cette page, la page applique son affichage par défaut.</span></label>
    </fieldset>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}{notice && <p role="status" className="text-sm text-emerald-800">{notice}</p>}
    <button disabled={busy || JSON.stringify(draft) === saved} className={primary}>{busy ? 'Enregistrement…' : 'Enregistrer les textes et le bouton'}</button>
  </form>;
}

export function AdminFeatureBanner({ catalog, onDirtyChange, onSavingChange }: { catalog: AdminCatalog; onDirtyChange: (value: boolean) => void; onSavingChange: (value: boolean) => void }) {
  const [textDirty, setTextDirty] = useState(false); const [photoDirty, setPhotoDirty] = useState(false);
  const [textSaving, setTextSaving] = useState(false); const [photoSaving, setPhotoSaving] = useState(false);
  useEffect(() => { onDirtyChange(textDirty || photoDirty); }, [textDirty, photoDirty, onDirtyChange]);
  useEffect(() => { onSavingChange(textSaving || photoSaving); }, [textSaving, photoSaving, onSavingChange]);
  return <div className="space-y-5"><div><h1 className="text-2xl font-bold">Bannière de mise en avant</h1><p className="mt-1 text-sm text-black/60">Choisissez les textes, la destination et une photo pour cette section de l’accueil. Une seule photo est affichée à la fois.</p></div><BannerTextEditor catalog={catalog} onDirtyChange={setTextDirty} onSavingChange={setTextSaving} /><AdminShercoBanner onDirtyChange={setPhotoDirty} onSavingChange={setPhotoSaving} /></div>;
}
