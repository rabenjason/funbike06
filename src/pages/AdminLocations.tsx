import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { Dealer } from "../types";
import { json, request } from "../lib/adminApi";
import { useConfirmation } from "../components/ConfirmationModal";

const control = "mt-1.5 w-full rounded-md border border-black/15 bg-white px-3 py-2.5 text-sm font-normal text-[#171816] focus:border-[#98741b] focus:outline-none";
const primary = "rounded-md bg-[#ffd100] px-4 py-2.5 text-sm font-bold text-[#171816] hover:bg-[#ffe36b] disabled:opacity-50";
const secondary = "rounded-md border border-black/20 px-3 py-2 text-sm font-semibold hover:bg-black/5 disabled:opacity-50";
const panel = "rounded-xl border border-black/10 bg-white p-5 sm:p-6";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-xs font-semibold text-black/65">{label}{children}</label>;
}
function Feedback({ error, message }: { error: string; message: string }) {
  return <>{error && <p role="alert" className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}{message && <p role="status" className="mb-4 rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}</>;
}
function PageHeading({ title, detail }: { title: string; detail: string }) {
  return <div className="mb-5"><p className="text-xs font-bold uppercase tracking-widest text-[#98741b]">Administration</p><h1 className="mt-1 text-2xl font-bold">{title}</h1><p className="mt-1 text-sm text-black/55">{detail}</p></div>;
}
function HoursField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <div>
    <Field label="Horaires d’ouverture"><textarea required rows={4} className={control} value={value} onChange={(e) => onChange(e.target.value)} placeholder={"Lundi à vendredi : 8h30 – 17h30\nSamedi : 8h30 – 12h00\nDimanche : fermé"} aria-describedby="hours-help" /></Field>
    <p id="hours-help" className="mt-2 text-xs leading-5 text-black/55">Écrivez vos horaires librement, une ligne par groupe de jours. Exemple :<br />Lundi à vendredi : 8h30 – 17h30<br />Samedi : 8h30 – 12h00<br />Dimanche : fermé</p>
    <div className="mt-3 rounded-md border border-black/10 bg-black/[0.02] p-3"><p className="text-xs font-semibold text-black/55">Aperçu sur le site</p><p className="mt-1 whitespace-pre-line break-words text-sm leading-6">{value.trim() || "Vos horaires apparaîtront ici."}</p></div>
  </div>;
}

type DealerForm = { name: string; city: string; kind: string; address: string; hours: string; phone: string; email: string; desc: string; lat: string; lon: string; services: string };
const emptyDealer = (): DealerForm => ({ name: "", city: "", kind: "", address: "", hours: "", phone: "", email: "", desc: "", lat: "", lon: "", services: "" });
function dealerForm(dealer: Dealer): DealerForm {
  return { name: dealer.name, city: dealer.city, kind: dealer.kind, address: dealer.address, hours: dealer.hours, phone: dealer.phone, email: dealer.email, desc: dealer.desc, lat: String(dealer.lat), lon: String(dealer.lon), services: dealer.services.join("\n") };
}

export function DealersManager() {
  const confirm = useConfirmation();
  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [loading, setLoading] = useState(true); const [loaded, setLoaded] = useState(false); const [attempt, setAttempt] = useState(0); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(""); const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<Dealer | "new" | null>(null); const [form, setForm] = useState<DealerForm>(emptyDealer);
  useEffect(() => {
    let active = true; setLoading(true); setError("");
    request("dealers.php").then((r) => { if (!Array.isArray(r.dealers)) throw new Error("Liste des revendeurs invalide."); if (active) { setDealers(r.dealers); setLoaded(true); } }).catch((err) => { if (active) { setError((err as Error).message); setLoaded(false); } }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt]);
  function edit(dealer: Dealer | "new") { setEditing(dealer); setForm(dealer === "new" ? emptyDealer() : dealerForm(dealer)); setError(""); setMessage(""); }
  const update = (key: keyof DealerForm, value: string) => setForm((previous) => ({ ...previous, [key]: value }));
  async function save(event: FormEvent) {
    event.preventDefault(); if (!editing || busy) return; setError(""); setMessage("");
    const lat = Number(form.lat); const lon = Number(form.lon);
    if (!form.lat.trim() || !form.lon.trim() || !Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) { setError("Indiquez une latitude et une longitude valides pour la carte."); return; }
    const services = form.services.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    const { services: _services, ...fields } = form;
    const body = { ...fields, hours: fields.hours.trim(), lat, lon, services, ...(editing !== "new" && editing.isDemo !== undefined ? { isDemo: editing.isDemo } : {}) };
    setBusy(true);
    try {
      const result = await request(editing === "new" ? "dealers.php" : `dealers.php?key=${encodeURIComponent(editing.key)}`, json(editing === "new" ? "POST" : "PUT", body));
      if (!result.dealer?.key) throw new Error("Réponse du serveur invalide. Rechargez la page pour vérifier.");
      const saved: Dealer = result.dealer;
      setDealers((previous) => editing === "new" ? [...previous, saved] : previous.map((d) => d.key === editing.key ? saved : d));
      setEditing(null); setMessage(`« ${saved.name} » a été enregistré.`);
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  async function remove(dealer: Dealer) {
    if (busy || !await confirm({ title: `Supprimer « ${dealer.name} » ?`, description: "Ce revendeur sera retiré du site. Cette action est définitive.", confirmLabel: "Supprimer", destructive: true })) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await request(`dealers.php?key=${encodeURIComponent(dealer.key)}`, json("DELETE"));
      setDealers((previous) => previous.filter((d) => d.key !== dealer.key));
      if (editing !== "new" && editing?.key === dealer.key) setEditing(null);
      setMessage(`« ${dealer.name} » a été supprimé.`);
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  return <div><PageHeading title="Revendeurs" detail="Ajoutez et gérez les points de vente affichés sur le site." /><Feedback error={editing ? "" : error} message={message} />
    <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
      <div className={panel}><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold">Tous les revendeurs ({dealers.length})</h2><button type="button" className={primary} disabled={busy || loading || !loaded} onClick={() => edit("new")}>+ Ajouter un revendeur</button></div>
        {loading ? <p className="mt-4 text-sm text-black/55">Chargement…</p> : !loaded ? <button type="button" className={`${secondary} mt-4`} onClick={() => setAttempt((value) => value + 1)}>Réessayer le chargement</button> : dealers.length === 0 ? <p className="mt-4 text-sm text-black/55">Aucun revendeur renseigné.</p> : null}
        <div className="mt-4 divide-y divide-black/10">{dealers.map((dealer) => <div key={dealer.key} className="flex flex-wrap items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="break-words text-sm font-semibold">{dealer.name} {dealer.isDemo && <span className="text-xs font-normal text-black/50">· Démonstration</span>}</p><p className="text-xs text-black/55">{dealer.city} · {dealer.kind}</p></div><div className="flex gap-2"><button type="button" className={secondary} disabled={busy} onClick={() => edit(dealer)} aria-label={`Modifier ${dealer.name}`}>Modifier</button><button type="button" className={secondary} disabled={busy} onClick={() => void remove(dealer)} aria-label={`Supprimer ${dealer.name}`}>Supprimer</button></div></div>)}</div>
      </div>
      {editing && <form onSubmit={save} className={panel}><div className="flex items-center justify-between gap-3"><h2 className="text-lg font-bold">{editing === "new" ? "Ajouter un revendeur" : "Modifier le revendeur"}</h2><button type="button" disabled={busy} className={secondary} onClick={() => setEditing(null)}>Fermer</button></div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2"><Field label="Nom"><input required className={control} value={form.name} onChange={(e) => update("name", e.target.value)} /></Field><Field label="Ville"><input required className={control} value={form.city} onChange={(e) => update("city", e.target.value)} /></Field><Field label="Type de point de vente"><input required placeholder="Ex. : Point de vente, atelier" className={control} value={form.kind} onChange={(e) => update("kind", e.target.value)} /></Field><Field label="Adresse"><input required className={control} value={form.address} onChange={(e) => update("address", e.target.value)} /></Field><Field label="Téléphone"><input required type="tel" className={control} value={form.phone} onChange={(e) => update("phone", e.target.value)} /></Field><Field label="E-mail"><input required type="email" className={control} value={form.email} onChange={(e) => update("email", e.target.value)} /></Field>
          <div className="sm:col-span-2"><HoursField value={form.hours} onChange={(v) => update("hours", v)} /></div><div className="sm:col-span-2"><Field label="Description"><textarea required rows={3} className={control} value={form.desc} onChange={(e) => update("desc", e.target.value)} /></Field></div><div className="sm:col-span-2"><Field label="Services proposés"><textarea rows={3} className={control} value={form.services} onChange={(e) => update("services", e.target.value)} placeholder={"Motos\nAtelier\nPièces"} /></Field><p className="mt-1 text-xs text-black/55">Un service par ligne, par exemple : Motos, Atelier, Pièces.</p></div>
          <Field label="Latitude"><input required type="number" step="any" min="-90" max="90" placeholder="Ex. : -18.8792" className={control} value={form.lat} onChange={(e) => update("lat", e.target.value)} /></Field><Field label="Longitude"><input required type="number" step="any" min="-180" max="180" placeholder="Ex. : 47.5079" className={control} value={form.lon} onChange={(e) => update("lon", e.target.value)} /></Field><p className="sm:col-span-2 text-xs leading-5 text-black/55">Sur une carte, faites un clic droit sur le lieu (ou un appui long sur téléphone) pour copier les coordonnées : le premier nombre est la latitude, le second la longitude. Utilisez un point pour les décimales et vérifiez l’emplacement avant d’enregistrer.</p>
        </div><div className="mt-5"><Feedback error={error} message="" /></div><button disabled={busy} className={primary}>{busy ? "Enregistrement…" : "Enregistrer le revendeur"}</button>
      </form>}
    </div>
  </div>;
}

type Contact = { email: string; phone: string; phoneHref: string; address: string; hours: string; whatsapp: string | null; socialLinks: { label: string; url: string }[] };
export function ContactManager() {
  const [contact, setContact] = useState<Contact | null>(null); const [originalPhone, setOriginalPhone] = useState("");
  const [loading, setLoading] = useState(true); const [attempt, setAttempt] = useState(0); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true; setLoading(true); setError("");
    request("contacts.php").then((r) => {
      const c = r.contact;
      if (!c || typeof c.email !== "string" || typeof c.phone !== "string" || typeof c.phoneHref !== "string" || typeof c.address !== "string" || typeof c.hours !== "string" || !Array.isArray(c.socialLinks)) throw new Error("Coordonnées invalides.");
      if (active) { setContact(c); setOriginalPhone(c.phone); }
    }).catch((err) => { if (active) setError((err as Error).message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt]);
  function update<K extends keyof Contact>(key: K, value: Contact[K]) { setContact((previous) => previous && ({ ...previous, [key]: value })); }
  function updateSocial(index: number, key: "label" | "url", value: string) { if (contact) update("socialLinks", contact.socialLinks.map((link, i) => i === index ? { ...link, [key]: value } : link)); }
  async function save(event: FormEvent) {
    event.preventDefault(); if (!contact || busy) return; setError(""); setMessage("");
    const dial = contact.phone.replace(/[^\d+]/g, "");
    if (!/^\+?[\d\s().-]+$/.test(contact.phone) || !/^\+?\d{3,15}$/.test(dial)) { setError("Indiquez un numéro de téléphone valide, par exemple +261 34 00 000 00."); return; }
    const whatsapp = contact.whatsapp?.trim() || null;
    if (whatsapp && !/^\+?[\d\s().-]+$/.test(whatsapp)) { setError("Indiquez un numéro WhatsApp valide avec l’indicatif du pays."); return; }
    if (whatsapp && !/^\d{8,15}$/.test(whatsapp.replace(/\D/g, ""))) { setError("Indiquez un numéro WhatsApp valide avec l’indicatif du pays, par exemple +261."); return; }
    for (const link of contact.socialLinks) {
      try { if (!link.label.trim() || !["http:", "https:"].includes(new URL(link.url).protocol)) throw new Error(); }
      catch { setError("Chaque réseau social doit avoir un nom et une adresse commençant par https:// ou http://."); return; }
    }
    const body = { ...contact, hours: contact.hours.trim(), phoneHref: contact.phone === originalPhone ? contact.phoneHref : `tel:${dial}`, whatsapp };
    setBusy(true);
    try {
      const result = await request("contacts.php", json("PUT", body));
      if (!result.contact || typeof result.contact.phone !== "string") throw new Error("Réponse du serveur invalide. Rechargez la page pour vérifier.");
      setContact(result.contact); setOriginalPhone(result.contact.phone); setMessage("Les coordonnées ont été enregistrées.");
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  return <div><PageHeading title="Contact" detail="Modifiez les coordonnées affichées sur le site." />{!contact && <Feedback error={error} message={message} />}
    {loading && <p className="text-sm text-black/55">Chargement…</p>}
    {!loading && !contact && <button type="button" className={secondary} onClick={() => setAttempt((value) => value + 1)}>Réessayer le chargement</button>}
    {contact && <form onSubmit={save} className={`${panel} max-w-3xl`}><h2 className="text-lg font-bold">Coordonnées Funbike</h2><div className="mt-4 grid gap-4 sm:grid-cols-2"><Field label="E-mail"><input required type="email" className={control} value={contact.email} onChange={(e) => update("email", e.target.value)} /></Field><Field label="Téléphone"><input required type="tel" className={control} value={contact.phone} onChange={(e) => update("phone", e.target.value)} /></Field><div className="sm:col-span-2"><Field label="Adresse"><input required className={control} value={contact.address} onChange={(e) => update("address", e.target.value)} /></Field></div><div className="sm:col-span-2"><HoursField value={contact.hours} onChange={(v) => update("hours", v)} /></div><div className="sm:col-span-2"><Field label="WhatsApp (facultatif)"><input type="tel" className={control} placeholder="Ex. : +261 34 00 000 00" value={contact.whatsapp ?? ""} onChange={(e) => update("whatsapp", e.target.value)} /></Field><p className="mt-1 text-xs text-black/55">Ajoutez l’indicatif du pays, par exemple +261. Laissez vide pour ne pas afficher de lien.</p></div></div>
      <div className="mt-6 border-t border-black/10 pt-5"><div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-sm font-bold">Réseaux sociaux (facultatif)</h3><p className="mt-1 text-xs text-black/55">Seuls les liens renseignés seront affichés sur la page Contact.</p></div><button type="button" className={secondary} disabled={busy} onClick={() => update("socialLinks", [...contact.socialLinks, { label: "", url: "" }])}>+ Ajouter un lien</button></div>
        {contact.socialLinks.map((link, index) => <div key={index} className="mt-3 grid items-end gap-2 sm:grid-cols-[1fr_2fr_auto]"><Field label={`Nom du réseau ${index + 1}`}><input required className={control} value={link.label} placeholder="Ex. : Facebook" onChange={(e) => updateSocial(index, "label", e.target.value)} /></Field><Field label={`Adresse du lien ${index + 1}`}><input required type="url" className={control} value={link.url} placeholder="https://..." onChange={(e) => updateSocial(index, "url", e.target.value)} /></Field><button type="button" disabled={busy} aria-label={`Retirer le lien ${index + 1}`} className={secondary} onClick={() => update("socialLinks", contact.socialLinks.filter((_, i) => i !== index))}>Retirer</button></div>)}
      </div><div className="mt-6"><Feedback error={error} message={message} /></div><button disabled={busy} className={primary}>{busy ? "Enregistrement…" : "Enregistrer les coordonnées"}</button>
    </form>}
  </div>;
}
