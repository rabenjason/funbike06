import { motion } from "framer-motion";

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
