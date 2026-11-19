import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { schedulePublicOperation } from "../lib/publicDataRequest";
import { faWhatsapp } from "@fortawesome/free-brands-svg-icons";
import { faCircleInfo, faGlobe, faTag } from "@fortawesome/free-solid-svg-icons";
import "../styles/whatsapp.css";
import type { Product } from "../types/product";
import { validPublicSettings, whatsappMessage, whatsappUrl, type PublicWhatsappSettings } from "../lib/whatsappSettings";

const WhatsappContext = createContext<PublicWhatsappSettings | null>(null);
/** En cas d'API absente ou indisponible, les actions de contact existantes restent inchangées. */
export function WhatsappProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<PublicWhatsappSettings | null>(null);
  useEffect(() => {
    let active = true; let sequence = 0; let controller: AbortController | undefined;
    async function load() {
      controller?.abort();
      controller = new AbortController();
      const current = ++sequence;
      try {
        const signal = controller.signal;
        const body = await schedulePublicOperation(async () => {
          const res = await fetch('/server/api/whatsapp-settings.php', {credentials:'same-origin',cache:'no-store',signal});
          if (!res.ok) { try { await res.body?.cancel(); } catch { /* réponse déjà terminée */ } return null; }
          return await res.json();
        }, signal);
        if (active && current === sequence) setSettings(validPublicSettings(body?.data) ? body.data : null);
      } catch { if (active && current === sequence) setSettings(null); }
    }
    const visible = () => { if (document.visibilityState === 'visible') void load(); };
    void load(); document.addEventListener('visibilitychange', visible);
    return () => { active = false; controller?.abort(); document.removeEventListener('visibilitychange', visible); };
  }, []);
  return <WhatsappContext.Provider value={settings}>{children}</WhatsappContext.Provider>;
}
export function useWhatsapp() { return useContext(WhatsappContext); }
export function WhatsAppIcon() { return <FontAwesomeIcon icon={faWhatsapp} aria-hidden="true" />; }
export function whatsappForProduct(settings: PublicWhatsappSettings | null, product: Product) {
  if (!settings?.enabled) return null;
  return (product.categoryId === 'pieces-detachees' ? settings.parts : settings.sales)?.phone ?? null;
}
export function preparedWhatsappUrl(settings: PublicWhatsappSettings, phone: string, product: Product) {
  return whatsappUrl(phone, whatsappMessage(settings.texts.directTemplate, product, window.location.origin));
}

/** Pièces/équipements : choix site/WhatsApp ; puis, si activé, choix de la demande et message modifiable. */
export function WhatsappDialog({ settings, product, phone, offerSite, onSite, onClose }: { settings: PublicWhatsappSettings; product: Product; phone: string; offerSite: boolean; onSite?: () => void; onClose: () => void }) {
  const [stage, setStage] = useState<'channel' | 'intent'>(offerSite ? 'channel' : 'intent');
  const [intent, setIntent] = useState<'price' | 'info' | null>(null);
  const [message, setMessage] = useState('');
  const dialog = useRef<HTMLDivElement>(null); const titleId = useId();
  const close = useCallback(() => onClose(), [onClose]);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    dialog.current?.querySelector<HTMLElement>('button')?.focus();
    function keydown(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); close(); return; }
      if (event.key !== 'Tab' || !dialog.current) return;
      const focusable = [...dialog.current.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], textarea:not(:disabled), input:not(:disabled)')];
      if (!focusable.length) return;
      const index = focusable.indexOf(document.activeElement as HTMLElement);
      if (index < 0 || (event.shiftKey && index === 0) || (!event.shiftKey && index === focusable.length - 1)) { event.preventDefault(); (event.shiftKey ? focusable[focusable.length-1] : focusable[0]).focus(); }
    }
    document.addEventListener('keydown', keydown);
    return () => { document.removeEventListener('keydown', keydown); document.body.style.overflow = overflow; if (previous?.isConnected) previous.focus(); };
  }, [close]);
  useEffect(() => { if (stage === 'intent') dialog.current?.querySelector<HTMLElement>('button')?.focus(); }, [stage]);
  function choose(next: 'price' | 'info') { setIntent(next); setMessage(whatsappMessage(next === 'price' ? settings.texts.priceTemplate : settings.texts.infoTemplate, product, window.location.origin)); }
  return createPortal(<div className="fb-whatsapp-overlay" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
    <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} className="fb-whatsapp-dialog">
      <div className="fb-whatsapp-header">
        <span className="fb-whatsapp-mark"><WhatsAppIcon /></span>
        <div className="min-w-0"><h2 id={titleId} className="fb-whatsapp-title">{stage === 'channel' ? settings.texts.choiceTitle : settings.texts.intentTitle}</h2>
          <p className="fb-whatsapp-product">{product.name}</p></div>
      </div>
      {stage === 'channel' ? <div className="fb-whatsapp-options">
        <button type="button" className="fb-whatsapp-choice" onClick={() => { close(); onSite?.(); }}><FontAwesomeIcon icon={faGlobe} aria-hidden="true" /><span>{settings.texts.siteLabel}</span></button>
        {settings.askIntent ? <button type="button" className="fb-whatsapp-primary" onClick={() => setStage('intent')}><WhatsAppIcon /><span>{settings.texts.whatsappLabel}</span></button> : <a className="fb-whatsapp-primary" href={preparedWhatsappUrl(settings,phone,product)} target="_blank" rel="noopener noreferrer" onClick={close}><WhatsAppIcon /><span>{settings.texts.whatsappLabel}</span></a>}
      </div> : <>
        <div className="fb-whatsapp-options"><button type="button" className="fb-whatsapp-choice" aria-pressed={intent === 'price'} onClick={() => choose('price')}><FontAwesomeIcon icon={faTag} aria-hidden="true" /><span>{settings.texts.priceLabel}</span></button><button type="button" className="fb-whatsapp-choice" aria-pressed={intent === 'info'} onClick={() => choose('info')}><FontAwesomeIcon icon={faCircleInfo} aria-hidden="true" /><span>{settings.texts.infoLabel}</span></button></div>
        {intent && <><label className="fb-whatsapp-field">Votre message<textarea className="fb-whatsapp-message" rows={4} maxLength={2000} value={message} onChange={(e) => setMessage(e.target.value)} /></label><p className="fb-whatsapp-hint">Vous pourrez encore modifier le message dans WhatsApp avant de l’envoyer.</p>
          {message.trim() && <a className="fb-whatsapp-primary fb-whatsapp-continue" href={whatsappUrl(phone,message)} target="_blank" rel="noopener noreferrer" onClick={close}><WhatsAppIcon /><span>{settings.texts.continueLabel}</span></a>}</>}
      </>}
      <button type="button" className="fb-whatsapp-cancel" onClick={close}>Annuler</button>
    </div>
  </div>, document.body);
}
