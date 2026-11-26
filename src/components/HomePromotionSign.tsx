import { usePromotions } from "./PromotionsContext";
import { navigateLink } from "../lib/routes";
import "../styles/home-promotion-sign.css";

export function HomePromotionSignVisual({ text }: { text: string }) {
  return <><span className="fb-home-promo-sign" aria-hidden="true"><span className="fb-home-promo-cord" /><span className="fb-home-promo-board">PROMO</span></span>
    <span className="fb-home-promo-copy"><strong>{text}</strong><span>Voir les promotions <span aria-hidden="true">→</span></span></span></>;
}
/** Petit panneau dans le flux de l’accueil, jamais superposé aux commandes du site. */
export function HomePromotionSign({ go }: { go: (page: string) => void }) {
  const { campaigns, status, homeSignEnabled, homeSignText } = usePromotions();
  if (status !== "ready" || !homeSignEnabled || campaigns.length === 0) return null;
  return <a href="/promotions" onClick={(event) => navigateLink(event, go, "promotions")} className="fb-home-promo fb-home-promo--home" aria-label={`${homeSignText} — Voir les promotions`}><HomePromotionSignVisual text={homeSignText} /></a>;
}
