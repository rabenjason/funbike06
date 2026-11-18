import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faWhatsapp } from "@fortawesome/free-brands-svg-icons";
import type { Product } from "../types/product";
import { validPublicSettings, whatsappMessage, whatsappUrl, type PublicWhatsappSettings } from "../lib/whatsappSettings";

const WhatsappContext = createContext<PublicWhatsappSettings | null>(null);
/** En cas d'API absente ou indisponible, les actions de contact existantes restent inchangées. */
export function WhatsappProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<PublicWhatsappSettings | null>(null);
  useEffect(() => {
    let active = true; let sequence = 0;
    async function load() {
      const current = ++sequence;
      try {
        const res = await fetch('/server/api/whatsapp-settings.php', {credentials:'same-origin',cache:'no-store'});
        const body = res.ok ? await res.json() : null;
        if (active && current === sequence) setSettings(validPublicSettings(body?.data) ? body.data : null);
      } catch { if (active && current === sequence) setSettings(null); }
    }
    const visible = () => { if (document.visibilityState === 'visible') void load(); };
    void load(); document.addEventListener('visibilitychange', visible);
    return () => { active = false; document.removeEventListener('visibilitychange', visible); };
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
  const button = 'min-h-11 rounded-md border border-black/20 px-4 py-2.5 text-sm font-semibold text-[#171816] hover:bg-black/5 aria-pressed:border-[#98741b] aria-pressed:bg-[#ffd100]/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#98741b] dark:border-white/25 dark:text-white dark:hover:bg-white/10';
  const primary = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[#ffd100] px-4 py-2.5 text-center text-sm font-bold text-[#171816] hover:bg-[#ffe36b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#98741b]';
  return createPortal(<div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-4" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
    <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} className="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 text-[#171816] shadow-xl dark:bg-[#20211e] dark:text-[#f2f0ea] sm:p-6">
      <h2 id={titleId} className="text-lg font-bold break-words">{stage === 'channel' ? settings.texts.choiceTitle : settings.texts.intentTitle}</h2>
      <p className="mt-2 break-words text-sm text-black/60 dark:text-white/65">{product.name}</p>
      {stage === 'channel' ? <div className="mt-5 grid gap-2 sm:grid-cols-2">
        <button type="button" className={button} onClick={() => { close(); onSite?.(); }}>{settings.texts.siteLabel}</button>
        {settings.askIntent ? <button type="button" className={primary} onClick={() => setStage('intent')}><WhatsAppIcon />{settings.texts.whatsappLabel}</button> : <a className={primary} href={preparedWhatsappUrl(settings,phone,product)} target="_blank" rel="noopener noreferrer" onClick={close}><WhatsAppIcon />{settings.texts.whatsappLabel}</a>}
      </div> : <>
        <div className="mt-5 grid gap-2 sm:grid-cols-2"><button type="button" className={button} aria-pressed={intent === 'price'} onClick={() => choose('price')}>{settings.texts.priceLabel}</button><button type="button" className={button} aria-pressed={intent === 'info'} onClick={() => choose('info')}>{settings.texts.infoLabel}</button></div>
        {intent && <><label className="mt-4 block text-sm font-semibold">Votre message<textarea className="mt-2 block w-full rounded-md border border-black/20 bg-white p-3 text-sm text-[#171816] dark:border-white/25 dark:bg-[#141513] dark:text-white" rows={5} maxLength={2000} value={message} onChange={(e) => setMessage(e.target.value)} /></label><p className="mt-2 text-xs text-black/55 dark:text-white/55">Vous pourrez encore modifier le message dans WhatsApp avant de l’envoyer.</p>
          {message.trim() && <a className={`${primary} mt-4 w-full`} href={whatsappUrl(phone,message)} target="_blank" rel="noopener noreferrer" onClick={close}><WhatsAppIcon />{settings.texts.continueLabel}</a>}</>}
      </>}
      <button type="button" className={`${button} mt-4 w-full sm:w-auto`} onClick={close}>Annuler</button>
    </div>
  </div>, document.body);
}
