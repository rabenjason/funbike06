import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";

export type ConfirmationOptions = {
  title: string;
  description: string;
  confirmLabel: string;
  /** Rouge pour une suppression ; jaune pour une réinitialisation. */
  destructive?: boolean;
};
type Confirm = (options: ConfirmationOptions) => Promise<boolean>;
const ConfirmationContext = createContext<Confirm | null>(null);

/** Met le focus sur Annuler, le conserve dans la fenêtre et le rend au bouton d'origine. */
function ConfirmationDialog({ options, onClose }: { options: ConfirmationOptions; onClose: (confirmed: boolean) => void }) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    cancelRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); onClose(false); return; }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const buttons = [...dialogRef.current.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
      if (!buttons.length) return;
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (index < 0 || (event.shiftKey && index === 0) || (!event.shiftKey && index === buttons.length - 1)) {
        event.preventDefault();
        (event.shiftKey ? buttons[buttons.length - 1] : buttons[0]).focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-[#10110f]/70 p-4 backdrop-blur-sm" onClick={(event) => { if (event.target === event.currentTarget) onClose(false); }}>
      <div ref={dialogRef} role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-2xl border border-black/10 bg-white text-[#171816] shadow-2xl">
        <div className="h-1.5 bg-[#ffd100]" />
        <div className="p-6 sm:p-7">
          <div className="flex items-start gap-4">
            <div aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber-100 text-[#98741b]"><FontAwesomeIcon icon={faTriangleExclamation} /></div>
            <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#98741b]">Funbike / Confirmation</p><h2 id={titleId} className="mt-1 break-words text-xl font-bold leading-tight">{options.title}</h2></div>
          </div>
          <p id={descriptionId} className="mt-5 break-words text-sm leading-6 text-black/65">{options.description}</p>
          <div className="mt-7 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button ref={cancelRef} type="button" onClick={() => onClose(false)} className="rounded-md border border-black/20 px-4 py-2.5 text-sm font-semibold text-[#171816] hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#98741b]">Annuler</button>
            <button type="button" onClick={() => onClose(true)} className={"rounded-md px-4 py-2.5 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2 " + (options.destructive ? "bg-red-700 text-white hover:bg-red-800 focus-visible:outline-red-700" : "bg-[#ffd100] text-[#171816] hover:bg-[#ffe36b] focus-visible:outline-[#98741b]")}>{options.confirmLabel}</button>
          </div>
        </div>
      </div>
    </div>, document.body,
  );
}

/** Une seule confirmation à la fois, réutilisable pour toutes les actions admin. */
export function ConfirmationProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmationOptions | null>(null);
  const resolver = useRef<((confirmed: boolean) => void) | null>(null);
  const confirm = useCallback<Confirm>((next) => {
    if (resolver.current) return Promise.resolve(false);
    return new Promise((resolve) => { resolver.current = resolve; setOptions(next); });
  }, []);
  const close = useCallback((confirmed: boolean) => {
    const resolve = resolver.current;
    resolver.current = null;
    setOptions(null);
    resolve?.(confirmed);
  }, []);
  useEffect(() => () => { resolver.current?.(false); resolver.current = null; }, []);

  return <ConfirmationContext.Provider value={confirm}>{children}{options && <ConfirmationDialog options={options} onClose={close} />}</ConfirmationContext.Provider>;
}

export function useConfirmation(): Confirm {
  const confirm = useContext(ConfirmationContext);
  if (!confirm) throw new Error("ConfirmationProvider manquant.");
  return confirm;
}
