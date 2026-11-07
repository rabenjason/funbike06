import { useEffect, useRef, useState, type CSSProperties } from "react";
import { motion } from "framer-motion";
import { homepageContent } from "../content/homepage";
import type { Brand } from "../types/product";

// Vitesse visuelle indépendante du nombre de logos et de la largeur d'écran.
const SPEED_PX_PER_SECOND = 72;

export default function PartnerMarquee({ partners }: { partners: Brand[] }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const setRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState({ copies: 1, duration: 22, measured: false });

  useEffect(() => {
    const viewport = viewportRef.current;
    const set = setRef.current;
    if (!viewport || !set) return;

    const measure = () => {
      const viewportWidth = viewport.getBoundingClientRect().width;
      const setWidth = set.getBoundingClientRect().width;
      if (viewportWidth <= 0 || setWidth <= 0) return;
      // Une moitié de la piste remplit au moins toute la fenêtre : la boucle
      // à -50 % ne laisse donc jamais de trou, même avec un seul partenaire.
      const copies = Math.max(1, Math.ceil(viewportWidth / setWidth));
      const duration = (copies * setWidth) / SPEED_PX_PER_SECOND;
      setLayout((old) => old.copies === copies && old.duration === duration && old.measured ? old : { copies, duration, measured: true });
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(viewport);
    observer?.observe(set);
    window.addEventListener("resize", measure);
    return () => { observer?.disconnect(); window.removeEventListener("resize", measure); };
  }, [partners.length]);

  return (
    <div ref={viewportRef} className="group/marquee relative overflow-hidden">
      <div aria-hidden="true" className="fb-partner-fade pointer-events-none absolute inset-y-0 left-0 z-10 w-12 bg-gradient-to-r from-white to-transparent sm:w-24 dark:from-[#141513]" />
      <div aria-hidden="true" className="fb-partner-fade pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-white to-transparent sm:w-24 dark:from-[#141513]" />
      <div className="fb-partner-track flex w-max" style={{ "--partner-duration": `${layout.duration}s`, animationPlayState: layout.measured ? undefined : "paused" } as CSSProperties}>
        {[0, 1].map((half) => (
          <div key={half} className="fb-partner-half flex shrink-0" aria-hidden={half === 1 ? true : undefined}>
            {Array.from({ length: layout.copies }, (_, copy) => (
              <div key={copy} ref={half === 0 && copy === 0 ? setRef : undefined} className="fb-partner-set flex shrink-0 items-center gap-6 pr-6 sm:gap-10 sm:pr-10" aria-hidden={half === 0 && copy === 0 ? undefined : true}>
                {partners.map((brand) => (
                  <motion.div key={brand.id} whileHover={{ scale: 1.08 }} transition={{ type: "spring", stiffness: 320, damping: 20 }} className="brand-logo-tile shrink-0">
                    <img src={brand.logo ?? ""} alt={`${homepageContent.partenaires.logoPrefix} ${brand.name}`} loading="lazy" className="partner-logo h-full w-full object-contain transition-opacity hover:opacity-100" />
                  </motion.div>
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
