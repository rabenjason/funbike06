import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { brands, mainProductImage } from "../catalog";
import type { Product } from "../types/product";
import type { Promotion, PromotionProduct } from "../lib/promotions";
import { resolvePromotionPrice, formatAriary } from "../lib/promotions";
import { productPath } from "../lib/routes";
import { WhatsAppIcon } from "./Whatsapp";
import "../styles/promotion-reservation.css";

type Saved = { id: string; phone: string | null; product: { name: string; brand: string; path: string }; promotion: { name: string; originalPrice: number; promotionalPrice: number; discountPercent: number; pricingMode?: "percent" | "price" | "price_percent" } };
type FormDetails = { name: string; phone: string; city: string; quantity: number; message: string };
function buildWhatsappUrl(saved: Saved, template?: string, details?: FormDetails): string {
  const p = saved.promotion; const item = saved.product;
  const link = new URL(item.path, window.location.origin).href;
  const introduction = (template || 'Bonjour FUNBIKE, je souhaite me renseigner sur {produit}.\n{lien}').replace(/\{produit\}/g, () => item.name).replace(/\{lien\}/g, () => link);
  const customer = details ? `\n\nClient : ${details.name.trim()}\nTéléphone : ${details.phone.trim()}\nVille : ${details.city.trim()}\nQuantité : ${details.quantity}${details.message.trim() ? `\nMessage : ${details.message.trim()}` : ''}` : '';
  const text = `${introduction}\n\nPromotion : ${p.name}\nProduit : ${item.name}\nMarque : ${item.brand}\nPrix promotionnel : ${formatAriary(p.promotionalPrice)}\nAncien prix : ${formatAriary(p.originalPrice)}${p.pricingMode === "price" ? "" : `\nRéduction : -${p.discountPercent} %`}\nLien du produit : ${link}\nDemande : ${saved.id}${customer}\n\nJe souhaite connaître la disponibilité et les modalités de réservation.\nMerci.`;
  return `https://wa.me/${saved.phone!.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
}
// La navigation dans l'onglet courant évite les bloqueurs de pop-up après l'écriture asynchrone.
const navigateToWhatsapp = (url: string) => window.location.assign(url);
export function PromotionReservationDialog({ product, campaign, offer, canWhatsapp, messageTemplate, onClose, navigateWhatsapp = navigateToWhatsapp }: { product: Product; campaign: Promotion; offer: PromotionProduct; canWhatsapp: boolean; messageTemplate?: string; onClose: () => void; navigateWhatsapp?: (url: string) => void }) {
  const [stage, setStage] = useState<"choice" | "form" | "done" | "whatsapp">("choice");
  const [saved, setSaved] = useState<Saved | null>(null);
  const [whatsappUrl, setWhatsappUrl] = useState("");
  const completed = useRef(false);
  const [busy, setBusy] = useState(false); const pending = useRef(false);
  const [uncertain, setUncertain] = useState(false); const [error, setError] = useState("");
  const [name, setName] = useState(""); const [phone, setPhone] = useState(""); const [city, setCity] = useState(""); const [quantity, setQuantity] = useState(1); const [message, setMessage] = useState("");
  const dialog = useRef<HTMLDivElement>(null); const closeRef = useRef(onClose); closeRef.current = onClose;
  const busyRef = useRef(false); const titleId = useId();
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    dialog.current?.querySelector<HTMLElement>('button')?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyRef.current) { event.preventDefault(); closeRef.current(); return; }
      if (event.key !== 'Tab' || !dialog.current) return;
      const focusable = [...dialog.current.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled)')];
      const index = focusable.indexOf(document.activeElement as HTMLElement);
      if (focusable.length && (index < 0 || (event.shiftKey && index === 0) || (!event.shiftKey && index === focusable.length - 1))) { event.preventDefault(); (event.shiftKey ? focusable[focusable.length - 1] : focusable[0]).focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.removeEventListener('keydown', keydown); document.body.style.overflow = overflow; if (previous?.isConnected) previous.focus(); };
  }, []);
  const image = mainProductImage(product); const brand = brands.find((b) => b.id === product.brandId)?.name ?? "";
  const { finalPrice, showPercent } = resolvePromotionPrice(offer);
  async function send(source: "form" | "whatsapp") {
    if (pending.current || completed.current || uncertain) return;
    pending.current = true; busyRef.current = true; setBusy(true); setError("");
    try {
      const response = await fetch('/server/api/promotion-reservations.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source, campaignId: campaign.id, productId: product.id, categoryId: product.categoryId, originalPrice: offer.originalPrice, discountPercent: offer.discountPercent, ...(offer.pricingMode && offer.pricingMode !== "percent" ? { pricingMode: offer.pricingMode, promotionalPrice: finalPrice } : {}), ...(source === 'form' ? { name, phone, city, quantity, message } : { quantity: 1 }), website: '' }) });
      let result: any;
      try { result = await response.json(); } catch { setUncertain(true); throw new Error('Réception non confirmée. Contactez FUNBIKE avant de refaire une demande pour éviter un doublon.'); }
      if (!response.ok) {
        if (response.status >= 500) { setUncertain(true); throw new Error('Réception non confirmée. Contactez FUNBIKE avant de refaire une demande pour éviter un doublon.'); }
        throw new Error(result.error || 'Impossible d’enregistrer la demande.');
      }
      const savedProduct = result?.product; const savedPromotion = result?.promotion;
      const validResponse = typeof result?.id === 'string' && /^[a-f0-9]{32}$/.test(result.id)
        && typeof savedProduct?.name === 'string' && typeof savedProduct?.brand === 'string'
        && typeof savedProduct?.path === 'string' && /^\/(motos|casques|equipements|pieces-detachees)\/[^/?#]+$/.test(savedProduct.path)
        && typeof savedPromotion?.name === 'string' && Number.isSafeInteger(savedPromotion?.originalPrice)
        && Number.isSafeInteger(savedPromotion?.promotionalPrice) && typeof savedPromotion?.discountPercent === 'number'
        && savedPromotion.originalPrice === offer.originalPrice && savedPromotion.discountPercent === offer.discountPercent
        && savedPromotion.promotionalPrice === finalPrice && (!offer.pricingMode || offer.pricingMode === "percent" || savedPromotion.pricingMode === offer.pricingMode)
        && ((source === 'form' && result.phone === null) || (typeof result.phone === 'string' && /^\+[0-9\s().-]+$/.test(result.phone) && /^[1-9]\d{7,14}$/.test(result.phone.replace(/\D/g, ''))));
      if (!validResponse) { setUncertain(true); throw new Error('Réception non confirmée. Contactez FUNBIKE avant de refaire une demande pour éviter un doublon.'); }
      completed.current = true;
      const destination = result.phone ? buildWhatsappUrl(result, messageTemplate, source === 'form' ? { name, phone, city, quantity, message } : undefined) : '';
      setSaved(result); setWhatsappUrl(destination); setStage(source === 'form' ? 'done' : 'whatsapp');
      if (destination) {
        // L'enregistrement est confirmé avant toute redirection, et n'est jamais réessayé automatiquement.
        try { navigateWhatsapp(destination); } catch { /* Le lien de secours reste utilisable sans réenregistrement. */ }
      }
    } catch (err) {
      if (err instanceof TypeError) { setUncertain(true); setError('Réception non confirmée. Contactez FUNBIKE avant de refaire une demande pour éviter un doublon.'); }
      else setError(err instanceof Error ? err.message : 'Erreur de connexion.');
    } finally { pending.current = false; busyRef.current = false; setBusy(false); }
  }
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void send('form'); }
  return createPortal(<div className="fb-whatsapp-overlay" onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
    <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} className="fb-whatsapp-dialog fb-reservation-dialog">
      <div className="flex items-start justify-between gap-3"><div><h2 id={titleId} className="fb-whatsapp-title">Réserver cette promotion</h2><p className="fb-whatsapp-product">Demande sans paiement, sous réserve de disponibilité.</p></div><button type="button" aria-label="Fermer le modal" disabled={busy} className="fb-reservation-close" onClick={onClose}>×</button></div>
      <div className="fb-reservation-product">{image?.url && <img src={image.url} alt="" />}<div><p className="font-bold">{product.name}</p><p className="fb-whatsapp-product">{brand} · {campaign.name}</p><p className="mt-1 text-sm"><del>{formatAriary(offer.originalPrice)}</del> <strong>{formatAriary(finalPrice)}</strong>{showPercent && <> · −{offer.discountPercent} %</>}</p><a className="fb-reservation-link" href={productPath(product)} target="_blank" rel="noopener noreferrer">Voir la fiche produit</a></div></div>
      {error && <p role="alert" className="fb-reservation-error">{error}</p>}
      {stage === 'choice' && <div className="fb-whatsapp-options"><button className="fb-whatsapp-choice" type="button" disabled={busy || uncertain} onClick={() => { setError(''); setStage('form'); }}>Réserver via le formulaire</button>{canWhatsapp && <button className="fb-whatsapp-primary" type="button" disabled={busy || uncertain} onClick={() => void send('whatsapp')}><WhatsAppIcon /><span>{busy ? 'Enregistrement…' : 'Contacter un commercial'}</span></button>}</div>}
      {stage === 'form' && <form onSubmit={submit} className="fb-reservation-form">
        <h3 className="font-bold">Vos coordonnées</h3>
        <label>Nom complet *<input disabled={busy} required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>
        <label>Numéro de téléphone *<input disabled={busy} required type="tel" maxLength={60} value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" /></label>
        <label>Ville *<input disabled={busy} required maxLength={100} value={city} onChange={(e) => setCity(e.target.value)} autoComplete="address-level2" /></label>
        <label>Quantité<input disabled={busy} required type="number" min={1} max={999} step={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} /></label>
        <label>Message (facultatif)<textarea disabled={busy} maxLength={2000} rows={3} value={message} onChange={(e) => setMessage(e.target.value)} /></label>
        <p className="fb-whatsapp-hint">Vos coordonnées seront enregistrées pour traiter cette demande. Si WhatsApp est disponible, elles seront incluses dans le message prérempli, que vous choisirez d’envoyer.</p>
        <button type="submit" className="fb-whatsapp-primary" disabled={busy || uncertain}>{busy ? 'Enregistrement…' : 'Envoyer ma réservation'}</button>
        <button type="button" className="fb-whatsapp-cancel" disabled={busy || uncertain} onClick={() => { setError(''); setStage('choice'); }}>Retour</button>
      </form>}
      {stage === 'done' && <div role="status" className="fb-reservation-result"><strong>Votre demande a bien été reçue.</strong><p>Référence : {saved?.id}</p><p>Notre équipe vous contactera pour confirmer la disponibilité et les modalités. Aucun paiement n’est demandé.</p>{whatsappUrl ? <><p>Si WhatsApp ne s’ouvre pas, utilisez ce lien puis envoyez vous-même le message.</p><a className="fb-whatsapp-primary" href={whatsappUrl}><WhatsAppIcon /><span>Ouvrir WhatsApp</span></a></> : <p>WhatsApp est indisponible ; votre demande reste enregistrée pour notre équipe.</p>}</div>}
      {stage === 'whatsapp' && <div className="fb-reservation-result"><p role="status">Demande enregistrée : {saved?.id}</p><p>Si WhatsApp ne s’ouvre pas, utilisez le lien ci-dessous puis envoyez vous-même le message. Le site ne peut pas confirmer l’envoi.</p><a className="fb-whatsapp-primary" href={whatsappUrl}><WhatsAppIcon /><span>Ouvrir WhatsApp</span></a></div>}
      {(stage === 'done' || stage === 'whatsapp') && <button className="fb-whatsapp-cancel" type="button" onClick={onClose}>Fermer</button>}
    </div>
  </div>, document.body);
}
