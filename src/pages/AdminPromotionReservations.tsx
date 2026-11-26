import { useEffect, useMemo, useState } from "react";
import { useConfirmation } from "../components/ConfirmationModal";
import { json, request } from "../lib/adminApi";
import { formatAriary } from "../lib/promotions";
import { whatsappNumber } from "./AdminMessages";

type Status = "new" | "whatsapp_initiated" | "contacted" | "confirmed" | "cancelled";
type Reservation = { id: string; revision: string; createdAt: string; source: "form" | "whatsapp"; status: Status; product: { id: string; categoryId: string; name: string; brand: string; path: string; image: string }; promotion: { id: string; name: string; startDate: string; endDate: string; originalPrice: number; promotionalPrice: number; discountPercent: number }; customer: { name: string; phone: string; city: string }; quantity: number; message: string; internalNotes: string };
const statuses: Record<Status, string> = { new: "Nouvelle", whatsapp_initiated: "Contact WhatsApp initié", contacted: "Contacté", confirmed: "Confirmée", cancelled: "Annulée" };
const colors: Record<Status, string> = { new: "bg-sky-50 text-sky-800", whatsapp_initiated: "bg-amber-50 text-amber-800", contacted: "bg-black/5 text-black/60", confirmed: "bg-emerald-50 text-emerald-800", cancelled: "bg-red-50 text-red-700" };
const input = "mt-1 w-full rounded-md border border-black/20 bg-white px-3 py-2 text-sm text-[#171816]";
const button = "rounded-md border border-black/20 px-3 py-2 text-sm font-semibold hover:bg-black/5 disabled:opacity-50";
const primary = "rounded-md bg-[#ffd100] px-4 py-2 text-sm font-bold text-[#171816] disabled:opacity-50";
const dateFormat = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Indian/Antananarivo', dateStyle: 'short', timeStyle: 'short' });
const day = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Indian/Antananarivo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
function minusDays(value: string, days: number) { const date = new Date(`${value}T00:00:00Z`); date.setUTCDate(date.getUTCDate() - days); return date.toISOString().slice(0, 10); }
const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
function safeProductPath(path: string) { return /^\/(motos|casques|equipements|pieces-detachees)\/[^/?#]+$/.test(path) ? path : undefined; }
function safeImage(path: string) { return /^\/server\/(uploads|public)\/[^?#]*$/.test(path) && !path.includes('..') ? path : undefined; }

export function AdminPromotionReservations({ onChanged, onDirtyChange, onSavingChange }: { onChanged: () => void; onDirtyChange: (dirty: boolean) => void; onSavingChange: (busy: boolean) => void }) {
  const confirm = useConfirmation();
  const [items, setItems] = useState<Reservation[]>([]); const [listRevision, setListRevision] = useState(""); const [loaded, setLoaded] = useState(false); const [loading, setLoading] = useState(false); const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState(""); const [notice, setNotice] = useState(""); const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState(""); const [status, setStatus] = useState(""); const [source, setSource] = useState(""); const [period, setPeriod] = useState(""); const [from, setFrom] = useState(""); const [to, setTo] = useState(""); const [order, setOrder] = useState("desc"); const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]); const [selected, setSelected] = useState<Reservation | null>(null); const [draft, setDraft] = useState<Reservation | null>(null);
  const dirty = !!draft && !!selected && JSON.stringify([draft.customer, draft.status, draft.internalNotes]) !== JSON.stringify([selected.customer, selected.status, selected.internalNotes]);
  useEffect(() => { onDirtyChange(dirty); return () => onDirtyChange(false); }, [dirty, onDirtyChange]);
  useEffect(() => { onSavingChange(busy); return () => onSavingChange(false); }, [busy, onSavingChange]);
  useEffect(() => {
    let active = true; setLoading(true); setLoaded(false); setError("");
    request('promotion-reservations.php').then((result) => {
      if (!Array.isArray(result.reservations)) throw new Error('Réponse invalide.');
      if (active) { setItems(result.reservations); setListRevision(typeof result.revision === "string" ? result.revision : ""); setLoaded(true); }
    }).catch((err) => { if (active) setError((err as Error).message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt]);
  async function abandon() { return !dirty || await confirm({ title: 'Abandonner les modifications ?', description: 'Les modifications non enregistrées seront perdues.', confirmLabel: 'Abandonner', cancelLabel: 'Continuer à modifier', destructive: true }); }
  async function open(item: Reservation) { if (busy || !await abandon()) return; setSelected(item); setDraft(structuredClone(item)); setError(''); setNotice(''); }
  async function save(value: Reservation) {
    if (busy) return; setBusy(true); setError(''); setNotice('');
    try {
      const result = await request('promotion-reservations.php', json('PUT', { id: value.id, revision: value.revision, status: value.status, customer: value.customer, internalNotes: value.internalNotes }));
      if (result.reservation?.id !== value.id || typeof result.reservation.revision !== 'string') throw new Error('Réponse invalide. Rechargez pour vérifier l’enregistrement.');
      const saved = result.reservation as Reservation;
      setItems((current) => current.map((item) => item.id === saved.id ? saved : item));
      setSelected((current) => current?.id === saved.id ? saved : current); setDraft((current) => current?.id === saved.id ? structuredClone(saved) : current);
      setListRevision(''); setNotice('Réservation enregistrée.'); onChanged();
    } catch (err) { setError((err as Error).message || 'Réception non confirmée. Rechargez avant de réessayer.'); }
    finally { setBusy(false); }
  }
  async function remove(ids: string[]) {
    if (busy || !ids.length || !await abandon()) return;
    if (!await confirm({ title: ids.length === 1 ? 'Supprimer cette réservation ?' : `Supprimer ces ${ids.length} réservations ?`, description: 'Êtes-vous sûr de vouloir supprimer cette réservation ? Cette action est irréversible.', confirmLabel: 'Supprimer', destructive: true })) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await request('promotion-reservations.php', json('DELETE', { ids }));
      if (result.deleted !== ids.length) throw new Error('Réponse invalide. Rechargez pour vérifier la suppression.');
      setItems((current) => current.filter((item) => !ids.includes(item.id))); setSelectedIds((current) => current.filter((id) => !ids.includes(id)));
      if (selected && ids.includes(selected.id)) { setSelected(null); setDraft(null); }
      setListRevision(''); setNotice('Suppression effectuée.'); onChanged();
    } catch (err) { setError((err as Error).message || 'Résultat inconnu. Rechargez pour vérifier.'); }
    finally { setBusy(false); }
  }
  async function removeAll() {
    if (busy || !items.length || !listRevision || !await abandon()) return;
    if (!await confirm({ title: `Supprimer toutes les ${items.length} réservations ?`, description: 'Toutes les réservations, y compris celles masquées par les filtres, seront supprimées définitivement. Cette action est irréversible.', confirmLabel: 'Tout supprimer', destructive: true })) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await request('promotion-reservations.php', json('DELETE', { deleteAll: true, revision: listRevision }));
      if (result.deleted !== items.length || typeof result.revision !== 'string') throw new Error('Réponse invalide. Rechargez pour vérifier la suppression.');
      setItems([]); setListRevision(result.revision); setSelectedIds([]); setSelected(null); setDraft(null); setPage(1);
      setNotice('Toutes les réservations ont été supprimées.'); onChanged();
    } catch (err) { setError((err as Error).message || 'Résultat inconnu. Rechargez pour vérifier.'); }
    finally { setBusy(false); }
  }
  const filtered = useMemo(() => {
    const today = day(new Date()); const first = period === 'today' ? today : period === 'week' ? minusDays(today, 6) : period === 'month' ? `${today.slice(0, 7)}-01` : period === 'custom' ? from : '';
    const last = period === 'custom' ? to : period ? today : '';
    const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
    return items.filter((item) => {
      const date = day(new Date(item.createdAt));
      const text = normalize([item.id, item.customer.name, item.customer.phone, item.product.name, item.product.brand].join(' '));
      return (!status || item.status === status) && (!source || item.source === source) && (!first || date >= first) && (!last || date <= last) && terms.every((term) => text.includes(term));
    }).sort((a, b) => order === 'asc' ? a.createdAt.localeCompare(b.createdAt) : b.createdAt.localeCompare(a.createdAt));
  }, [items, query, status, source, period, from, to, order]);
  const pages = Math.max(1, Math.ceil(filtered.length / 20)); const current = Math.min(page, pages); const visible = filtered.slice((current - 1) * 20, current * 20);
  const selectedPhone = draft?.customer.phone ? whatsappNumber(draft.customer.phone) : null;
  const path = draft ? safeProductPath(draft.product.path) : undefined; const image = draft ? safeImage(draft.product.image) : undefined;
  const toggle = (id: string) => setSelectedIds((currentIds) => currentIds.includes(id) ? currentIds.filter((x) => x !== id) : [...currentIds, id].slice(0, 100));
  return <section aria-label="Réservations de promotions" className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">Réservations</h1><p className="mt-1 text-sm text-black/60">Demandes de promotions ; aucune réservation ni disponibilité n’est garantie automatiquement.</p></div><button type="button" className={button} disabled={busy || loading || dirty} onClick={() => { setSelected(null); setDraft(null); setSelectedIds([]); setAttempt((n) => n + 1); onChanged(); }}>Actualiser</button></div>
    {error && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}{notice && <p role="status" className="rounded bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    {loading && <p role="status">Chargement des réservations…</p>}{!loading && !loaded && <button type="button" className={button} onClick={() => setAttempt((n) => n + 1)}>Réessayer la lecture</button>}
    {loaded && <>
      <div className="grid gap-3 rounded-lg bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs font-semibold">Rechercher<input className={input} type="search" placeholder="Identifiant, client, téléphone, produit, marque" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} /></label>
        <label className="text-xs font-semibold">Statut<select className={input} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">Toutes</option>{Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="text-xs font-semibold">Origine<select className={input} value={source} onChange={(e) => { setSource(e.target.value); setPage(1); }}><option value="">Toutes</option><option value="form">Formulaire</option><option value="whatsapp">WhatsApp</option></select></label>
        <label className="text-xs font-semibold">Période<select className={input} value={period} onChange={(e) => { setPeriod(e.target.value); setPage(1); }}><option value="">Toutes</option><option value="today">Aujourd’hui</option><option value="week">7 derniers jours</option><option value="month">Ce mois-ci</option><option value="custom">Période personnalisée</option></select></label>
        {period === 'custom' && <><label className="text-xs font-semibold">Du<input type="date" className={input} value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} /></label><label className="text-xs font-semibold">Au<input type="date" className={input} value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} /></label></>}
        <label className="text-xs font-semibold">Trier par date<select className={input} value={order} onChange={(e) => { setOrder(e.target.value); setPage(1); }}><option value="desc">Plus récentes en premier</option><option value="asc">Plus anciennes en premier</option></select></label>
      </div>
      {!listRevision && items.length > 0 && <p className="text-sm text-black/60">Actualisez la liste avant de supprimer toutes les réservations.</p>}
      <div className="rounded-lg bg-white p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold">{filtered.length} demande(s) · sélection conservée même après filtrage (100 maximum)</p><div className="flex flex-wrap gap-2"><button className={button} type="button" disabled={busy || !selectedIds.length} onClick={() => void remove(selectedIds)}>Supprimer la sélection ({selectedIds.length})</button><button className={button} type="button" disabled={busy || !items.length || !listRevision} onClick={() => void removeAll()}>Tout supprimer ({items.length})</button></div></div>
        <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-sm"><thead><tr className="border-b border-black/10 text-xs text-black/60"><th>Sélection</th>{['Identifiant', 'Date', 'Produit', 'Client', 'Téléphone', 'Ville', 'Quantité', 'Prix promo', 'Origine', 'Statut', 'Actions'].map((v) => <th key={v} className="px-2 py-2">{v}</th>)}</tr></thead><tbody>{visible.map((item) => <tr key={item.id} className="border-b border-black/10"><td><input type="checkbox" aria-label={`Sélectionner ${item.id}`} checked={selectedIds.includes(item.id)} disabled={busy || (selectedIds.length >= 100 && !selectedIds.includes(item.id))} onChange={() => toggle(item.id)} /></td><td className="px-2 py-3"><span className="break-all">{item.id}</span></td><td className="px-2">{dateFormat.format(new Date(item.createdAt))}</td><td className="px-2">{item.product.name}<br /><span className="text-xs text-black/55">{item.product.brand}</span></td><td className="px-2">{item.customer.name || '—'}</td><td className="px-2">{item.customer.phone || '—'}</td><td className="px-2">{item.customer.city || '—'}</td><td className="px-2">{item.quantity}</td><td className="px-2">{formatAriary(item.promotion.promotionalPrice)}</td><td className="px-2">{item.source === 'form' ? 'Formulaire' : 'WhatsApp'}</td><td className="px-2"><span className={`rounded-full px-2 py-1 text-xs ${colors[item.status]}`}>{statuses[item.status]}</span></td><td className="px-2"><button className={button} disabled={busy} onClick={() => void open(item)}>Ouvrir</button></td></tr>)}</tbody></table></div>
        {!filtered.length && <p className="mt-4 text-sm">Aucune réservation correspondante.</p>}
        <div className="mt-4 flex flex-wrap items-center gap-3"><button className={button} disabled={current <= 1} onClick={() => setPage(current - 1)}>Précédent</button><span className="text-sm">Page {current} / {pages}</span><button className={button} disabled={current >= pages} onClick={() => setPage(current + 1)}>Suivant</button></div>
      </div>
    </>}
    {draft && <section className="rounded-lg bg-white p-5" aria-label="Détail de réservation"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-bold">Détail de la demande</h2><p className="break-all text-xs text-black/60">{draft.id} · {dateFormat.format(new Date(draft.createdAt))} (Madagascar)</p><p className="text-sm">Origine : {draft.source === 'form' ? 'Formulaire' : 'WhatsApp — contact initié, envoi non confirmé'}</p></div><button type="button" className={button} disabled={busy} onClick={() => { void (async () => { if (await abandon()) { setSelected(null); setDraft(null); } })(); }}>Fermer</button></div>
      <div className="mt-4 flex flex-wrap gap-4 border-y border-black/10 py-4">{image && <img src={image} alt="" className="h-24 w-28 rounded bg-white object-contain" />}<div className="min-w-0 break-words text-sm"><p className="font-bold">{draft.product.name} · {draft.product.brand}</p><p>ID produit : {draft.product.id}</p><p>Campagne : {draft.promotion.name} · {draft.promotion.startDate} au {draft.promotion.endDate}</p><p><del>{formatAriary(draft.promotion.originalPrice)}</del> → <strong>{formatAriary(draft.promotion.promotionalPrice)}</strong> · −{draft.promotion.discountPercent} %</p>{path && <a href={path} target="_blank" rel="noopener noreferrer" className="underline">Voir la fiche produit</a>}</div></div>
      <p className="mt-4 text-sm">Quantité : {draft.quantity}</p><p className="mt-2 whitespace-pre-wrap break-words text-sm">Message client : {draft.message || '—'}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold">Nom du client<input disabled={busy} className={input} maxLength={80} value={draft.customer.name} onChange={(e) => setDraft({ ...draft, customer: { ...draft.customer, name: e.target.value } })} /></label><label className="text-sm font-semibold">Téléphone<input disabled={busy} type="tel" className={input} maxLength={60} value={draft.customer.phone} onChange={(e) => setDraft({ ...draft, customer: { ...draft.customer, phone: e.target.value } })} /></label><label className="text-sm font-semibold">Ville<input disabled={busy} className={input} maxLength={100} value={draft.customer.city} onChange={(e) => setDraft({ ...draft, customer: { ...draft.customer, city: e.target.value } })} /></label><label className="text-sm font-semibold">Statut<select disabled={busy} className={input} value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as Status })}>{Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
      <label className="mt-4 block text-sm font-semibold">Notes internes (admin uniquement)<textarea disabled={busy} className={input} maxLength={4000} rows={4} value={draft.internalNotes} onChange={(e) => setDraft({ ...draft, internalNotes: e.target.value })} /></label>
      <div className="mt-4 flex flex-wrap gap-2"><button type="button" className={primary} disabled={busy || !dirty} onClick={() => void save(draft)}>Enregistrer</button>{selectedPhone && <a className={button} href={`https://wa.me/${selectedPhone}`} target="_blank" rel="noopener noreferrer">WhatsApp client</a>}{draft.customer.phone && /^[+0-9 ().-]+$/.test(draft.customer.phone) && <a className={button} href={`tel:${draft.customer.phone.replace(/[^+0-9]/g, '')}`}>Appeler</a>}<button type="button" className={button} disabled={busy} onClick={() => void remove([draft.id])}>Supprimer</button></div>
    </section>}
  </section>;
}
