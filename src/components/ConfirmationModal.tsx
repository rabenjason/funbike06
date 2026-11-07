import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export type ConfirmationOptions = {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** Rouge pour une suppression ; sombre pour les autres actions. */
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
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4" onClick={(event) => { if (event.target === event.currentTarget) onClose(false); }}>
      <div ref={dialogRef} role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-xl bg-white text-[#171816] shadow-xl">
        <div className="border-b border-black/10 px-5 py-4 sm:px-6"><h2 id={titleId} className="break-words text-lg font-bold leading-snug">{options.title}</h2></div>
        <div className="px-5 py-5 sm:px-6">
          <p id={descriptionId} className="break-words text-sm leading-6 text-black/65">{options.description}</p>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button ref={cancelRef} type="button" onClick={() => onClose(false)} className="rounded-md bg-black/5 px-4 py-2.5 text-sm font-semibold text-[#171816] hover:bg-black/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171816]">{options.cancelLabel ?? "Annuler"}</button>
            <button type="button" onClick={() => onClose(true)} className={"rounded-md px-4 py-2.5 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 " + (options.destructive ? "bg-red-700 hover:bg-red-800 focus-visible:outline-red-700" : "bg-[#171816] hover:bg-black/80 focus-visible:outline-[#171816]")}>{options.confirmLabel}</button>
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
