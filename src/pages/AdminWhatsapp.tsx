import { useEffect, useRef, useState, type FormEvent } from "react";
import { json, request } from "../lib/adminApi";
import { validSettings, type WhatsappSettings, type WhatsappTeam, type WhatsappTexts } from "../lib/whatsappSettings";
import { useConfirmation } from "../components/ConfirmationModal";

const input = "mt-1 block w-full rounded-md border border-black/20 bg-white px-3 py-2 text-sm text-[#171816]";
const secondary = "rounded-md border border-black/20 px-3 py-2 text-sm font-semibold hover:bg-black/5 disabled:opacity-50";
const primary = "rounded-md bg-[#ffd100] px-4 py-2.5 text-sm font-bold text-[#171816] hover:bg-[#ffe36b] disabled:opacity-50";
const labels: { key: keyof WhatsappTexts; label: string; template?: boolean }[] = [
  {key:"intentTitle",label:"Titre de la fenêtre de demande"}, {key:"priceLabel",label:"Choix prix et disponibilité"}, {key:"infoLabel",label:"Choix informations"},
  {key:"choiceTitle",label:"Titre du choix de contact"}, {key:"siteLabel",label:"Choix formulaire du site"}, {key:"whatsappLabel",label:"Choix WhatsApp"},
  {key:"continueLabel",label:"Bouton pour continuer sur WhatsApp"}, {key:"priceTemplate",label:"Message pour le prix",template:true},
  {key:"infoTemplate",label:"Message pour les informations",template:true}, {key:"directTemplate",label:"Message direct sans fenêtre de demande",template:true},
];
export function AdminWhatsapp({ onDirtyChange, onSavingChange }: { onDirtyChange: (dirty: boolean) => void; onSavingChange: (saving: boolean) => void }) {
  const [draft, setDraft] = useState<WhatsappSettings | null>(null);
  const [saved, setSaved] = useState(""); const [revision, setRevision] = useState("");
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(""); const [notice, setNotice] = useState(""); const [attempt, setAttempt] = useState(0);
  const onDirtyRef = useRef(onDirtyChange); onDirtyRef.current = onDirtyChange;
  const confirm = useConfirmation();
  useEffect(() => {
    let active = true; setLoading(true); setError("");
    request("whatsapp-settings.php?admin=1").then((result) => {
      if (!validSettings(result.data) || typeof result.revision !== "string") throw new Error("Réponse du serveur invalide.");
      if (active) { setDraft(result.data); setSaved(JSON.stringify(result.data)); setRevision(result.revision); onDirtyRef.current(false); }
    }).catch((err) => { if (active) setError((err as Error).message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt]);
  function update(next: WhatsappSettings) { setDraft(next); onDirtyChange(JSON.stringify(next) !== saved); setNotice(""); }
  function updateTeam(key: "sales" | "parts", team: WhatsappTeam) { if (draft) update({ ...draft, [key]: team }); }
  async function remove(key: "sales" | "parts", id: string, name: string) {
    if (!draft || !await confirm({title:`Supprimer « ${name || "ce responsable"} » ?`,description:"Les conversations WhatsApp existantes ne seront pas supprimées. Si ce responsable est actif, aucun numéro ne sera choisi automatiquement.",confirmLabel:"Supprimer",cancelLabel:"Annuler",destructive:true})) return;
    const team = draft[key]; updateTeam(key, { activeId: team.activeId === id ? null : team.activeId, people: team.people.filter((p) => p.id !== id) });
  }
  async function save(event: FormEvent) {
    event.preventDefault(); if (!draft || busy) return;
    if (!validSettings(draft)) { setError("Vérifiez les noms, les numéros avec indicatif (ex. +261) et les textes. Chaque modèle doit contenir {produit} et {lien}."); return; }
    setBusy(true); onSavingChange(true); setError(""); setNotice("");
    try {
      const result = await request("whatsapp-settings.php", json("PUT", { data: draft, revision }));
      if (!validSettings(result.data) || typeof result.revision !== "string") throw new Error("Réponse invalide. Rechargez pour vérifier l’enregistrement.");
      setDraft(result.data); setSaved(JSON.stringify(result.data)); setRevision(result.revision); onDirtyChange(false); setNotice("Réglages enregistrés. Les visiteurs devront éventuellement actualiser la page.");
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); onSavingChange(false); }
  }
  if (loading) return <p className="rounded-xl bg-white p-5">Chargement des réglages WhatsApp…</p>;
  if (!draft) return <div className="rounded-xl bg-white p-5"><p role="alert">{error || "Chargement impossible."}</p><button className={secondary} onClick={() => setAttempt((n) => n + 1)}>Réessayer</button></div>;
  return <form onSubmit={save} className="space-y-5">
    <div className="rounded-xl border border-black/10 bg-white p-5"><h2 className="text-xl font-bold">WhatsApp</h2><p className="mt-2 text-sm text-black/60">Les demandes partent dans WhatsApp, pas dans les messages du site. Les numéros actifs sont visibles par les visiteurs.</p>
      <label className="mt-4 flex gap-2 text-sm font-semibold"><input type="checkbox" checked={draft.enabled} disabled={busy} onChange={(e) => update({...draft,enabled:e.target.checked})} /> Activer WhatsApp sur les cartes produits</label>
      <p className="ml-5 mt-1 text-xs text-black/60">Désactivé ou sans responsable actif : les actions habituelles restent disponibles.</p>
      <label className="mt-4 flex gap-2 text-sm font-semibold"><input type="checkbox" checked={draft.askIntent} disabled={busy} onChange={(e) => update({...draft,askIntent:e.target.checked})} /> Proposer prix ou informations avant WhatsApp</label>
      <p className="ml-5 mt-1 text-xs text-black/60">Désactivé : ouverture directe avec le message préparé. Pour les pièces et équipements, le choix entre le site et WhatsApp reste proposé.</p>
    </div>
    {([['sales','Commerciaux — motos et équipements'],['parts','Responsables — pièces détachées']] as const).map(([key,title]) => {
      const team = draft[key];
      return <section key={key} className="rounded-xl border border-black/10 bg-white p-5"><h3 className="font-bold">{title}</h3><p className="mt-1 text-xs text-black/60">Un seul responsable actif par équipe. L’activation ne prend effet qu’après enregistrement.</p>
        <div className="mt-4 space-y-3">{team.people.length === 0 && <p className="text-sm text-black/60">Aucun responsable enregistré.</p>}{team.people.map((person,index) => <div key={person.id} className="grid gap-3 rounded-lg border border-black/10 p-3 sm:grid-cols-2">
          <label className="text-sm font-semibold">Nom {index+1}<input className={input} maxLength={80} value={person.name} disabled={busy} onChange={(e) => updateTeam(key,{...team,people:team.people.map((p)=>p.id === person.id ? {...p,name:e.target.value} : p)})} /></label>
          <label className="text-sm font-semibold">Numéro WhatsApp {index+1}<input className={input} type="tel" maxLength={40} placeholder="+261 …" value={person.phone} disabled={busy} onChange={(e) => updateTeam(key,{...team,people:team.people.map((p)=>p.id === person.id ? {...p,phone:e.target.value} : p)})} /></label>
          <div className="flex flex-wrap items-center gap-2 sm:col-span-2"><button type="button" className={secondary} disabled={busy || team.activeId === person.id} onClick={() => updateTeam(key,{...team,activeId:person.id})}>{team.activeId === person.id ? "Actif" : "Activer"}</button><button type="button" className={secondary} disabled={busy} onClick={() => void remove(key,person.id,person.name)}>Supprimer</button></div>
        </div>)}</div>
        <div className="mt-4 flex flex-wrap gap-2"><button type="button" className={secondary} disabled={busy || team.people.length >= 30} onClick={() => updateTeam(key,{...team,people:[...team.people,{id:crypto.randomUUID(),name:"",phone:""}]})}>Ajouter un responsable</button>{team.activeId && <button type="button" className={secondary} disabled={busy} onClick={() => updateTeam(key,{...team,activeId:null})}>Aucun responsable actif</button>}</div>
      </section>;
    })}
    <section className="rounded-xl border border-black/10 bg-white p-5"><h3 className="font-bold">Textes et messages</h3><p className="mt-1 text-xs text-black/60">Dans chaque modèle, conserver les variables {"{produit}"} et {"{lien}"} : elles seront remplacées automatiquement.</p><div className="mt-4 grid gap-4 sm:grid-cols-2">{labels.map(({key,label,template}) => <label key={key} className={`text-sm font-semibold ${template ? 'sm:col-span-2' : ''}`}>{label}{template ? <textarea className={input} rows={3} maxLength={1200} disabled={busy} value={draft.texts[key]} onChange={(e)=>update({...draft,texts:{...draft.texts,[key]:e.target.value}})} /> : <input className={input} maxLength={120} disabled={busy} value={draft.texts[key]} onChange={(e)=>update({...draft,texts:{...draft.texts,[key]:e.target.value}})} />}</label>)}</div></section>
    {error && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}{notice && <p role="status" className="rounded bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    <button className={primary} disabled={busy || JSON.stringify(draft) === saved}>{busy ? "Enregistrement…" : "Enregistrer les réglages WhatsApp"}</button>
  </form>;
}
