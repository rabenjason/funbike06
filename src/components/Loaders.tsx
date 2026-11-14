import { motion } from "framer-motion";

/** Réserve l'espace de la page pendant le chargement de son code. */
export function PageLoading() {
  return (
    <div role="status" className="grid min-h-[100svh] place-items-center px-6 text-[#171816] dark:text-[#f2f0ea]">
      <span className="sr-only">Chargement de la page…</span>
      <svg aria-hidden="true" viewBox="0 0 48 48" className="size-11 motion-safe:animate-spin" fill="none">
        {Array.from({ length: 12 }, (_, index) => (
          <line key={index} x1="24" y1="4" x2="24" y2="12" stroke="currentColor" strokeWidth="4" strokeLinecap="round" opacity={(index + 1) / 12} transform={`rotate(${index * 30} 24 24)`} />
        ))}
      </svg>
    </div>
  );
}

/** Thin yellow progress line replayed on every page change. */
export function RouteProgress() {
  return (
    <motion.div
      aria-hidden="true"
      className="pointer-events-none fixed left-0 top-0 z-[70] h-[3px] bg-[#ffd100]"
      initial={{ width: "0%", opacity: 1 }}
      animate={{ width: ["0%", "72%", "100%"], opacity: [1, 1, 0] }}
      transition={{ duration: 0.65, times: [0, 0.6, 1], ease: "easeOut" }}
    />
  );
}
