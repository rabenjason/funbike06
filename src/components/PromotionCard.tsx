import { useCallback, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowUpRightFromSquare } from "@fortawesome/free-solid-svg-icons";
import { brands, getProductFamily, mainProductImage, productGallery, productTypes } from "../catalog";
import type { Product } from "../types/product";
import { navigateLink, productPath } from "../lib/routes";
import SmartImage from "./SmartImage";
import { PromotionBadge, PromotionPrice } from "./PromotionsContext";
import { WhatsAppIcon, WhatsappDialog, preparedWhatsappUrl, useWhatsapp, whatsappForProduct } from "./Whatsapp";

/** Carte commune réservée à la page Promotions, sans modifier les cartes du catalogue. */
export function PromotionCard({ product, go, showDescription = false }: { product: Product; showDescription?: boolean; go: (page: string, id?: string, categoryId?: string) => void }) {
  const settings = useWhatsapp();
  const phone = whatsappForProduct(settings, product);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const [activeImage, setActiveImage] = useState(0);
  const isMoto = product.categoryId === "motos";
  const page = isMoto ? "product" : "accessory";
  const routeCategory = isMoto ? undefined : product.categoryId;
  const gallery = isMoto ? productGallery(product) : [];
  const image = mainProductImage(product);
  const imageUrl = isMoto ? gallery[activeImage] ?? image?.url ?? "" : image?.url ?? "";
  const brand = brands.find((entry) => entry.id === product.brandId)?.name ?? "Marque non renseignée";
  const kind = isMoto ? getProductFamily(product)?.name : productTypes.find((entry) => entry.categoryId === product.categoryId && entry.id === product.productTypeId)?.name;
  const goDetail = () => isMoto ? go("product", product.id) : go("accessory", product.id, product.categoryId);
  const category = product.categoryId === "pieces-detachees" ? `Pièce ${brand}` : `${brand}${kind ? ` · ${kind}` : ""}`;
  const actionClass = "flex min-h-10 min-w-0 flex-1 items-center justify-center gap-2 rounded-md border border-black/25 px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wide text-[#171816] transition hover:bg-[#171816] hover:text-white dark:border-white/35 dark:text-white dark:hover:bg-white dark:hover:text-[#171816]";

  return <article className="fb-card group flex h-full min-w-0 flex-col overflow-hidden rounded-xl text-left">
    <div className="fb-stage-white relative aspect-[4/3] overflow-hidden">
      <a href={productPath(product)} aria-label={`Voir les détails de ${product.name}`} onClick={(event) => navigateLink(event, go, page, product.id, routeCategory)} className="absolute inset-0 block">
        <SmartImage src={imageUrl} alt={image?.altText || product.name} className="absolute inset-0" imgClassName="object-contain p-3 transition-transform duration-500 group-hover:scale-[1.04] sm:p-4" />
      </a>
      <PromotionBadge product={product} className="rounded-xl" />
      {gallery.length > 1 && <div className="absolute inset-x-0 bottom-2 z-10 flex items-center justify-center gap-1.5">{gallery.map((_, index) => <button key={`${product.id}-image-${index}`} type="button" onClick={() => setActiveImage(index)} aria-label={`Voir la photo ${index + 1}`} aria-current={activeImage === index} className="grid h-7 min-w-7 place-items-center px-1"><span className={activeImage === index ? "block h-[3px] w-6 bg-[#171816]" : "block h-[3px] w-1.5 bg-black/35 hover:bg-black/60"} /></button>)}</div>}
    </div>
    <div className="flex min-w-0 flex-1 flex-col border-t border-black/10 p-3 dark:border-white/10 sm:p-4">
      <p className="line-clamp-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-black/55 dark:text-white/55"><span aria-hidden="true" className="mr-2 inline-block h-1 w-4 rounded-full bg-[#ffd100] align-middle" />{category}</p>
      <button type="button" className="mt-2 min-w-0 text-left" onClick={goDetail} aria-label={product.name}><h4 className="line-clamp-2 min-h-[2.4em] break-words font-display text-sm font-bold leading-[1.2] text-[#171816] dark:text-white">{product.name}</h4></button>
      {showDescription && <p className="mt-2 line-clamp-2 min-h-[2.5rem] break-words text-xs leading-5 text-black/55 dark:text-white/55">{product.description}</p>}
      <div className="mt-auto min-h-10 min-w-0 pt-2 sm:[&_strong]:text-lg"><PromotionPrice product={product} card /></div>
      <div className="mt-3 flex min-w-0 gap-2">
        {isMoto ? phone && settings ? (settings.askIntent ? <button type="button" className={actionClass} onClick={() => setOpen(true)}><WhatsAppIcon /> WhatsApp</button> : <a className={actionClass} href={preparedWhatsappUrl(settings, phone, product)} target="_blank" rel="noopener noreferrer"><WhatsAppIcon /> WhatsApp</a>) : <button type="button" className={actionClass} onClick={goDetail}>Découvrir</button>
          : <button type="button" className={actionClass} onClick={() => phone && settings ? setOpen(true) : go("contact", product.id)}>Se renseigner</button>}
        <a href={productPath(product)} onClick={(event) => navigateLink(event, go, page, product.id, routeCategory)} aria-label={`Voir la fiche de ${product.name}`} className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-black/25 text-[#171816] hover:bg-[#171816] hover:text-white dark:border-white/35 dark:text-white dark:hover:bg-white dark:hover:text-[#171816]"><FontAwesomeIcon icon={faArrowUpRightFromSquare} aria-hidden="true" /></a>
      </div>
    </div>
    {open && phone && settings && <WhatsappDialog settings={settings} product={product} phone={phone} offerSite={!isMoto} onSite={() => go("contact", product.id)} onClose={close} />}
  </article>;
}
