import { products } from "../catalog/products";
import type { Product } from "../types/product";

export type SiteRoute = { page: string; id?: string; categoryId?: string };
const pages: Record<string, string> = { home: "/", catalogue: "/catalogue", motos: "/motos", equipements: "/equipements", spares: "/pieces-detachees", promotions: "/promotions", revendeurs: "/revendeurs", contact: "/contact" };

/** L'identifiant immuable, et non le nom modifiable, constitue le lien public. */
export function productPath(product: Product): string {
  const prefix = product.categoryId === "motos" ? "motos" : product.categoryId === "pieces-detachees" ? "pieces-detachees" : product.categoryId === "casques" ? "casques" : "equipements";
  return `/${prefix}/${encodeURIComponent(product.id)}`;
}
export function routePath(route: SiteRoute): string {
  if ((route.page === "product" || route.page === "accessory") && route.id) {
    const product = products.find((item) => item.id === route.id && (!route.categoryId || item.categoryId === route.categoryId) && (route.page === "product" ? item.categoryId === "motos" : item.categoryId !== "motos"));
    if (product) return productPath(product);
  }
  const path = pages[route.page] ?? "/";
  if (!route.id) return path;
  const param = route.page === "contact" ? "produit" : route.page === "revendeurs" ? "ville" : ["motos", "equipements", "spares"].includes(route.page) ? "marque" : "";
  return param ? `${path}?${param}=${encodeURIComponent(route.id)}` : path;
}
export function parseRoute(pathname: string, search = ""): SiteRoute {
  const path = pathname.replace(/\/+$/, "") || "/";
  const entry = Object.entries(pages).find(([, value]) => value === path);
  const params = new URLSearchParams(search);
  if (entry) {
    const page = entry[0];
    const param = page === "contact" ? "produit" : page === "revendeurs" ? "ville" : ["motos", "equipements", "spares"].includes(page) ? "marque" : "";
    return { page, id: param ? params.get(param) || undefined : undefined };
  }
  const match = path.match(/^\/(motos|casques|equipements|pieces-detachees)\/([^/]+)$/);
  if (match) {
    try {
      const id = decodeURIComponent(match[2]);
      const found = products.find((product) => product.id === id && productPath(product) === `/${match[1]}/${encodeURIComponent(id)}`);
      if (found) return { page: found.categoryId === "motos" ? "product" : "accessory", id, categoryId: found.categoryId };
    } catch { /* adresse mal formée */ }
  }
  return { page: "not-found" };
}

/** Les liens restent utilisables sans JavaScript et avec Ctrl/Cmd-clic. */
export function navigateLink(event: React.MouseEvent<HTMLAnchorElement>, go: (page: string, id?: string, categoryId?: string) => void, page: string, id?: string, categoryId?: string) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  go(page, id, categoryId);
}
