import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

type Props = { src: string; alt: string; priority: boolean };

/** La photo garde son animation ; le squelette reste visible tant qu'elle charge. */
function HeroImageContent({ src, alt, priority }: Props) {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [showSkeleton, setShowSkeleton] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!loaded) return;
    const fade = setTimeout(() => setShowSkeleton(false), 700);
    return () => clearTimeout(fade);
  }, [loaded]);

  function onLoad() {
    clearTimeout(timer.current);
    setLoaded(true);
  }

  function onError() {
    if (attempt < 2) {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setAttempt((value) => value + 1), attempt === 0 ? 1000 : 3000);
    } else {
      setFailed(true);
    }
  }

  return (
    <motion.div className="pointer-events-none absolute inset-0" exit={{ opacity: 0 }} transition={{ duration: 0.7 }}>
      {showSkeleton && !failed && <motion.div className="skeleton hero-image-skeleton" aria-hidden="true" initial={false} animate={{ opacity: loaded ? 0 : 1 }} transition={{ duration: 0.7 }} />}
      {!failed ? <motion.img
        key={attempt}
        ref={(image: HTMLImageElement | null) => { if (image && !loaded && image.complete && image.naturalWidth > 0) onLoad(); }}
        src={src}
        alt={alt}
        fetchPriority={priority ? "high" : "auto"}
        onLoad={onLoad}
        onError={onError}
        initial={{ opacity: 0, scale: 1.035 }}
        animate={{ opacity: loaded ? 1 : 0, scale: 1 }}
        transition={{ opacity: { duration: 0.7 }, scale: { duration: 7, ease: "linear" } }}
        className="absolute inset-0 h-full w-full object-cover object-[center_52%]"
      /> : <span className="sr-only" role="status">Image indisponible.</span>}
    </motion.div>
  );
}

/** Réinitialise le chargement si l’URL de la photo change. */
export default function HeroImage(props: Props) {
  return <HeroImageContent key={props.src} {...props} />;
}
