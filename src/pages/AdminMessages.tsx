import { useEffect, useState } from "react";
import { useConfirmation } from "../components/ConfirmationModal";
import { json, request } from "../lib/adminApi";

type Status = "NEW" | "READ" | "PROCESSED";
type Message = { id: string; createdAt: string; status: Status; name: string; phone: string; email: string; whatsapp: string; subject: string; subjectLabel: string; message: string };
type Inbox = { messages: Message[]; total: number; page: number; pages: number };
const empty: Inbox = { messages: [], total: 0, page: 1, pages: 1 };
const labels: Record<Status, string> = { NEW: "Nouveau", READ: "Lu", PROCESSED: "Traité" };
const secondary = "rounded-md border border-black/20 px-3 py-2 text-sm font-semibold hover:bg-black/5 disabled:opacity-50";
const panel = "rounded-xl border border-black/10 bg-white p-5 sm:p-6";

/** Le format national malgache 034… peut aussi être utilisé. */
export function whatsappNumber(value: string): string | null {
  const trimmed = value.trim();
  if (!/^[+0-9 ().-]+$/.test(trimmed)) return null;
  const digits = trimmed.replace(/\D/g, "");
  const number = /^0[23]\d{8}$/.test(digits) ? `261${digits.slice(1)}` : trimmed.startsWith("+") ? digits : digits.startsWith("00") ? digits.slice(2) : digits.startsWith("261") ? digits : "";
  return /^[1-9]\d{7,14}$/.test(number) ? number : null;
}
function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function AdminMessages({ onChanged }: { onChanged: () => void }) {
  const confirm = useConfirmation();
  const [inbox, setInbox] = useState<Inbox>(empty);
  const [page, setPage] = useState(1); const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [attempt, setAttempt] = useState(0); const [loading, setLoading] = useState(true); const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<Message | null>(null); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(""); const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true; setLoading(true); setLoaded(false); setError("");
    request(`messages.php?page=${page}&order=${order}`).then((result) => {
      if (!Array.isArray(result.messages) || !Number.isInteger(result.page) || !Number.isInteger(result.pages) || !Number.isInteger(result.total)) throw new Error("Réponse des messages invalide.");
      if (active) { setInbox(result as Inbox); setLoaded(true); }
    }).catch((err) => { if (active) setError((err as Error).message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [page, order, attempt]);

  async function changeStatus(item: Message, status: Status) {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await request(`messages.php?id=${encodeURIComponent(item.id)}`, json("PUT", { status }));
      if (result.message?.id !== item.id || result.message?.status !== status) throw new Error("Réponse invalide. Rechargez les messages pour vérifier le statut.");
      const saved: Message = result.message;
      setSelected((current) => current?.id === saved.id ? saved : current);
      setInbox((current) => ({ ...current, messages: current.messages.map((message) => message.id === saved.id ? saved : message) }));
      onChanged();
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }
  function open(item: Message) {
    setSelected(item); setNotice(""); setError("");
    if (item.status === "NEW") void changeStatus(item, "READ");
  }
  async function remove(item: Message) {
    if (busy || !await confirm({ title: "Supprimer ce message ?", description: `Le message de ${item.name} sera supprimé définitivement.`, confirmLabel: "Supprimer", destructive: true })) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await request(`messages.php?id=${encodeURIComponent(item.id)}`, json("DELETE"));
      onChanged(); setSelected(null); setNotice("Le message a été supprimé."); setAttempt((value) => value + 1);
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }
  function goPage(next: number) { setSelected(null); setNotice(""); setPage(next); }
  const whatsapp = selected ? whatsappNumber(selected.whatsapp) : null;

  return <div>
    <div className="mb-5"><p className="text-xs font-bold uppercase tracking-widest text-[#98741b]">Administration</p><h1 className="mt-1 text-2xl font-bold">Messages</h1><p className="mt-1 text-sm text-black/55">Demandes reçues depuis le formulaire de contact. Les réponses sont envoyées depuis votre messagerie ou WhatsApp.</p></div>
    {error && <p role="alert" className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {notice && <p role="status" className="mb-4 rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    <div className="grid items-start gap-5 lg:grid-cols-[1fr_1.15fr]">
      <section className={panel} aria-label="Liste des messages">
        <div className="flex flex-wrap items-end justify-between gap-3"><button type="button" className={secondary} disabled={busy || loading} onClick={() => { setSelected(null); setAttempt((value) => value + 1); }}>Actualiser</button><h2 className="text-lg font-bold">Messages {loaded && `(${inbox.total})`}</h2><label className="text-xs font-semibold text-black/65">Trier par date<select value={order} disabled={busy || loading} onChange={(e) => { setOrder(e.target.value as "asc" | "desc"); setPage(1); setSelected(null); setNotice(""); }} className="ml-2 rounded-md border border-black/20 bg-white px-2 py-2 text-sm text-[#171816]"><option value="desc">Plus récents d’abord</option><option value="asc">Plus anciens d’abord</option></select></label></div>
        {loading ? <p className="mt-4 text-sm text-black/55">Chargement des messages…</p> : !loaded ? <button type="button" className={`${secondary} mt-4`} onClick={() => setAttempt((value) => value + 1)}>Réessayer le chargement</button> : inbox.total === 0 ? <p className="mt-4 text-sm text-black/55">Aucun message pour le moment.</p> : <>
          <div className="mt-4 divide-y divide-black/10">{inbox.messages.map((item) => <button type="button" key={item.id} disabled={busy} onClick={() => open(item)} className={`block w-full py-3 text-left disabled:opacity-50 ${selected?.id === item.id ? "bg-black/[0.03]" : "hover:bg-black/[0.02]"}`}><span className="flex flex-wrap items-center justify-between gap-2"><span className="break-words font-semibold">{item.name}</span><span className="text-xs text-black/55">{dateLabel(item.createdAt)}</span></span><span className="mt-1 block break-words text-sm text-black/60">{item.subjectLabel}</span><span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${item.status === "NEW" ? "bg-sky-50 text-sky-800" : item.status === "PROCESSED" ? "bg-emerald-50 text-emerald-800" : "bg-black/5 text-black/60"}`}>{labels[item.status] ?? item.status}</span></button>)}</div>
          <nav aria-label="Pagination des messages" className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-black/10 pt-4"><p className="text-xs text-black/60">Page {inbox.page} / {inbox.pages} · {inbox.total} message{inbox.total > 1 ? "s" : ""}</p><div className="flex gap-2"><button type="button" disabled={busy || inbox.page <= 1} className={secondary} onClick={() => goPage(inbox.page - 1)}>Précédent</button><button type="button" disabled={busy || inbox.page >= inbox.pages} className={secondary} onClick={() => goPage(inbox.page + 1)}>Suivant</button></div></nav>
        </>}
      </section>
      {selected && <section className={panel} aria-label="Détail du message"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="break-words text-lg font-bold">{selected.subjectLabel}</h2><p className="mt-1 text-xs text-black/55">Reçu le {dateLabel(selected.createdAt)} · {labels[selected.status]}</p></div><button type="button" disabled={busy} className={secondary} onClick={() => setSelected(null)}>Fermer</button></div>
        <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">{([["Nom", selected.name], ["Téléphone", selected.phone], ["E-mail", selected.email], ["WhatsApp", selected.whatsapp || "Non renseigné"]] as const).map(([label, value]) => <div key={label}><dt className="text-xs font-semibold text-black/55">{label}</dt><dd className="mt-1 break-words">{value}</dd></div>)}</dl>
        <div className="mt-5 border-t border-black/10 pt-4"><h3 className="text-xs font-semibold text-black/55">Message</h3><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{selected.message}</p></div>
        <div className="mt-5 flex flex-wrap gap-2"><a className={secondary} href={`mailto:${encodeURIComponent(selected.email)}?subject=${encodeURIComponent(`Re: ${selected.subjectLabel}`)}`}>Répondre par e-mail</a>{whatsapp && <a className={secondary} href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer">Répondre par WhatsApp</a>}{!whatsapp && <p className="w-full text-xs text-black/55">{selected.whatsapp ? "Numéro WhatsApp non reconnu : vérifiez l’indicatif international." : "Le client n’a pas renseigné de numéro WhatsApp."}</p>}</div>
        <p className="mt-3 text-xs text-black/55">La réponse est envoyée dans votre application. Marquez le message comme traité lorsque vous avez répondu.</p>
        <div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={busy} className="rounded-md bg-[#171816] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50" onClick={() => void changeStatus(selected, selected.status === "PROCESSED" ? "READ" : "PROCESSED")}>{selected.status === "PROCESSED" ? "Marquer comme lu" : "Marquer comme traité"}</button><button type="button" disabled={busy || selected.status === "NEW"} className={secondary} onClick={() => void changeStatus(selected, "NEW")}>Marquer comme nouveau</button><button type="button" disabled={busy} className={secondary} onClick={() => void remove(selected)}>Supprimer</button></div>
      </section>}
    </div>
  </div>;
}
