import { useEffect, useState } from "react";
import { isPromotionAppearance, promotionCountdown, type Promotion } from "../lib/promotions";

/** En-tête autonome : le compte à rebours ne redessine pas les cartes. */
export function PromotionCampaignHeader({ campaign, clockOffset = 0, preview = false }: { campaign: Promotion; clockOffset?: number; preview?: boolean }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const interval = window.setInterval(tick, 1000);
    const visible = () => { if (document.visibilityState === "visible") tick(); };
    document.addEventListener("visibilitychange", visible);
    return () => { window.clearInterval(interval); document.removeEventListener("visibilitychange", visible); };
  }, []);
  const remaining = promotionCountdown(campaign.endDate, now + clockOffset);
  const [totalHours, minutes, seconds] = (remaining ?? "00:00:00").split(":").map(Number);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const clock = [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
  const spoken = `${days ? `${days} jour${days > 1 ? "s" : ""}, ` : ""}${hours} heures, ${minutes} minutes et ${seconds} secondes restantes`;
  const appearance = isPromotionAppearance(campaign.appearance) ? campaign.appearance : null;
  const id = preview ? "promotion-preview-title" : `promotion-${campaign.id}`;

  // Les campagnes existantes gardent exactement leur présentation précédente.
  if (!appearance) return <section aria-labelledby={id} className="mx-auto w-full max-w-(--container-site) px-4 sm:px-6 md:px-8 lg:px-10">
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <h2 id={id} className="fluid-h2 min-w-0 font-display font-semibold text-[#171816] dark:text-[#f2f0ea]">{campaign.name}</h2>
      {remaining ? <p className="text-sm text-black/60 dark:text-white/60">Se termine dans <strong role="timer" aria-live="off" aria-label={spoken} className="font-display font-bold tabular-nums text-[#98741b] dark:text-[#ffd100]">{days > 0 && `${days} j `}{clock}</strong> <span className="text-xs">(heure de Madagascar)</span></p>
        : <p className="text-sm text-black/60 dark:text-white/60">Offre du {campaign.startDate.split('-').reverse().join('/')} au {campaign.endDate.split('-').reverse().join('/')} inclus.</p>}
    </div>
  </section>;

  const url = campaign.bannerUrl ?? "";
  const image = appearance.showBanner && /^\/server\/uploads\/promotions\/[a-f0-9]{32}\.(jpg|png|webp)$/.test(url) ? url : "";
  const darkBackground = !!image || appearance.style === "black-friday";
  const isSport = appearance.style === "sportif";
  const titleIndex = appearance.highlight ? campaign.name.indexOf(appearance.highlight) : -1;
  const heading = titleIndex < 0 ? campaign.name : <>{campaign.name.slice(0, titleIndex)}<span className={darkBackground ? "text-[#ffd100]" : "text-[#98741b] dark:text-[#ffd100]"} style={appearance.highlightColor ? { color: appearance.highlightColor } : undefined}>{appearance.highlight}</span>{campaign.name.slice(titleIndex + appearance.highlight.length)}</>;
  const titleStyle = appearance.titleColor ? { color: appearance.titleColor } : undefined;
  const appearanceClass = appearance.style === "sportif" ? "border-l-4 border-[#ffd100]" : appearance.style === "festif" ? "border border-[#ffd100]/40" : appearance.style === "black-friday" ? "border border-white/15" : "border border-black/10 dark:border-white/10";
  return <section aria-labelledby={id} data-promotion-style={appearance.style} data-promotion-image={image ? "true" : "false"} className={`relative isolate overflow-hidden ${appearanceClass} ${darkBackground ? "bg-[#171816] text-white" : "bg-[#f5f3eb] text-[#171816] dark:bg-[#1c1d1a] dark:text-white"}`}>
    {image && <><img src={image} alt="" aria-hidden="true" loading="lazy" className="pointer-events-none absolute inset-0 -z-20 h-full w-full object-cover" /><div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-r from-black/90 via-black/75 to-black/55" /></>}
    {isSport && <span aria-hidden="true" className="pointer-events-none absolute -right-6 top-0 h-full w-10 -skew-x-12 bg-[#ffd100]/15" />}
    <div className="relative mx-auto flex min-w-0 w-full max-w-(--container-site) flex-wrap items-center justify-between gap-x-5 gap-y-3 px-4 py-5 sm:px-6 sm:py-6 md:px-8 lg:px-10">
      <div className="min-w-0 max-w-3xl">
        <span aria-hidden="true" className="mb-2 block h-1 w-9 rounded-full bg-[#ffd100]" />
        <h2 id={id} style={titleStyle} className={`min-w-0 break-words font-display text-[clamp(1.35rem,4vw,2.75rem)] font-bold leading-tight ${isSport || appearance.style === "black-friday" ? "uppercase" : ""} ${darkBackground ? "text-white" : "text-[#171816] dark:text-white"}`}>{heading}</h2>
        {appearance.showDescription && campaign.description.trim() && <p className={`mt-2 max-w-2xl break-words text-sm leading-relaxed ${darkBackground ? "text-white/85" : "text-black/70 dark:text-white/75"}`}>{campaign.description}</p>}
      </div>
      {remaining ? <p className={`text-sm ${darkBackground ? "text-white/85" : "text-black/60 dark:text-white/70"}`}>Se termine dans <strong role="timer" aria-live="off" aria-label={spoken} className={`font-display font-bold tabular-nums ${darkBackground ? "text-[#ffd100]" : "text-[#98741b] dark:text-[#ffd100]"}`}>{days > 0 && `${days} j `}{clock}</strong> <span className="text-xs">(heure de Madagascar)</span></p>
        : <p className={`text-sm ${darkBackground ? "text-white/85" : "text-black/60 dark:text-white/70"}`}>Offre du {campaign.startDate.split('-').reverse().join('/')} au {campaign.endDate.split('-').reverse().join('/')} inclus.</p>}
    </div>
  </section>;
}
