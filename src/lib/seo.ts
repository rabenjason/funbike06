import { products } from "../catalog/products";
import { brands } from "../catalog/brands";
import { routePath, type SiteRoute } from "./routes";

const pages: Record<string, [string, string]> = {
  home: ["Funbike Madagascar — Motos, pièces et équipements", "Découvrez les motos, équipements et pièces détachées de Funbike à Madagascar."],
  catalogue: ["Catalogue motos, pièces et équipements | Funbike Madagascar", "Découvrez le catalogue de motos, pièces et équipements Funbike."],
  motos: ["Motos à Madagascar | Funbike", "Découvrez les motos du catalogue Funbike à Madagascar."],
  equipements: ["Casques et équipements moto | Funbike Madagascar", "Découvrez les casques et équipements moto du catalogue Funbike."],
  spares: ["Pièces détachées moto | Funbike Madagascar", "Découvrez les pièces détachées moto du catalogue Funbike."],
  revendeurs: ["Nos revendeurs | Funbike Madagascar", "Retrouvez les revendeurs et points de vente Funbike."],
  contact: ["Contact | Funbike Madagascar", "Contactez l’équipe Funbike pour vos questions sur les motos, pièces et équipements."],
};
function setMeta(attribute: "name" | "property", name: string, value: string) {
  let tag = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${name}"]`);
  if (!value) { tag?.remove(); return; }
  if (!tag) { tag = document.createElement("meta"); tag.setAttribute(attribute, name); document.head.appendChild(tag); }
  tag.content = value;
}
/** Maintient les balises lors de la navigation React ; les robots reçoivent aussi du HTML depuis PHP. */
export function updateSeo(route: SiteRoute) {
  const product = (route.page === "product" || route.page === "accessory") ? products.find((item) => item.id === route.id && (!route.categoryId || item.categoryId === route.categoryId)) : undefined;
  const [title, description] = product ? [`${product.name} | Funbike Madagascar`, product.description?.trim() || `Découvrez ${product.name} chez Funbike Madagascar.`] : pages[route.page] ?? ["Page introuvable | Funbike", "Page introuvable."];
  document.title = title;
  let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  const origin = canonical ? new URL(canonical.href, window.location.origin).origin : window.location.origin;
  if (!canonical) { canonical = document.createElement("link"); canonical.rel = "canonical"; document.head.appendChild(canonical); }
  const url = origin + routePath({ page: route.page, id: product?.id, categoryId: product?.categoryId });
  canonical.href = url;
  const image = product?.images?.find((item) => item.isMain) ?? product?.images?.[0];
  const imageUrl = image?.url?.startsWith("/server/uploads/") ? origin + image.url : "";
  setMeta("name", "description", description);
  setMeta("property", "og:title", title); setMeta("property", "og:description", description);
  setMeta("property", "og:type", product ? "product" : "website"); setMeta("property", "og:url", url);
  setMeta("property", "og:image", imageUrl); setMeta("name", "twitter:card", imageUrl ? "summary_large_image" : "summary");
  // Mettre à jour les données structurées après une navigation sans rechargement.
  document.head.querySelector('script[data-funbike-product]')?.remove();
  if (product) {
    const schema: Record<string, unknown> = { "@context": "https://schema.org", "@type": "Product", name: product.name, description, url };
    if (imageUrl) schema.image = imageUrl;
    const brand = brands.find((item) => item.id === product.brandId);
    if (brand) schema.brand = { "@type": "Brand", name: brand.name };
    const script = document.createElement("script");
    script.type = "application/ld+json"; script.dataset.funbikeProduct = ""; script.textContent = JSON.stringify(schema);
    document.head.appendChild(script);
  }
}
