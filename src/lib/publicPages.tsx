import type { ComponentType } from "react";
import type { SiteRoute } from "./routes";

type PageProps = {
  route: SiteRoute;
  go: (page: string, id?: string, categoryId?: string) => void;
  back: (fallback?: SiteRoute) => void;
  canGoBack: boolean;
  backLabel: string;
};
type PageComponent = ComponentType<PageProps>;
type PageKey = "home" | "catalog" | "product" | "accessory" | "promotions" | "contact" | "dealers";

// Un seul import en cours par page, partagé entre le démarrage et la navigation.
const loaders: Record<PageKey, () => Promise<PageComponent>> = {
  home: () => import("../pages/Home").then(({ default: Page }) => ({ go }: PageProps) => <Page go={go} />),
  catalog: () => import("../pages/Catalog").then(({ Catalogue, Equipements, Spares }) => ({ route, go }: PageProps) => {
    if (route.page === "equipements") return <Equipements go={go} initialBrand={route.id} />;
    if (route.page === "spares") return <Spares go={go} initialBrand={route.id} />;
    return <Catalogue go={go} motosOnly={route.page === "motos"} initialQuery={route.page === "motos" ? route.id : undefined} />;
  }),
  product: () => import("../pages/Product").then(({ default: Page }) => ({ route, go, back, canGoBack, backLabel }: PageProps) => <Page id={route.id} go={go} back={back} canGoBack={canGoBack} backLabel={backLabel} />),
  accessory: () => import("../pages/AccessoryDetail").then(({ default: Page }) => ({ route, go, back, canGoBack, backLabel }: PageProps) => <Page id={route.id} categoryId={route.categoryId} go={go} back={back} canGoBack={canGoBack} backLabel={backLabel} />),
  promotions: () => import("../pages/Promotions").then(({ default: Page }) => ({ go }: PageProps) => <Page go={go} />),
  contact: () => import("../pages/Contact").then(({ default: Page }) => ({ route }: PageProps) => <Page inquiryId={route.id} />),
  dealers: () => import("../pages/Dealers").then(({ default: Page }) => ({ route, go }: PageProps) => <Page go={go} initialCity={route.id} />),
};
const pages: Partial<Record<PageKey, PageComponent>> = {};
const requests: Partial<Record<PageKey, Promise<PageComponent>>> = {};

export function publicPageKey(page: string): PageKey | undefined {
  switch (page) {
    case "home": return "home";
    case "catalogue": case "motos": case "equipements": case "spares": return "catalog";
    case "product": return "product";
    case "accessory": return "accessory";
    case "promotions": return "promotions";
    case "contact": return "contact";
    case "revendeurs": return "dealers";
    default: return undefined;
  }
}
export function loadedPublicPage(key: PageKey): PageComponent | undefined { return pages[key]; }
export function loadPublicPage(key: PageKey): Promise<PageComponent> {
  if (pages[key]) return Promise.resolve(pages[key]);
  if (!requests[key]) requests[key] = loaders[key]().then((component) => { pages[key] = component; delete requests[key]; return component; }, (error) => { delete requests[key]; throw error; });
  return requests[key]!;
}

/** Déduire le fichier à charger sans attendre le catalogue ni exposer les brouillons. */
export function publicPageKeyForPath(pathname: string): PageKey | undefined {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/") return "home";
  if (path === "/catalogue" || path === "/motos" || path === "/equipements" || path === "/pieces-detachees") return "catalog";
  if (/^\/motos\/[^/]+$/.test(path)) return "product";
  if (/^\/(?:casques|equipements|pieces-detachees)\/[^/]+$/.test(path)) return "accessory";
  if (path === "/promotions") return "promotions";
  if (path === "/revendeurs") return "dealers";
  if (path === "/contact") return "contact";
  return undefined;
}
export function preloadPublicPage(pathname: string): Promise<unknown> {
  const key = publicPageKeyForPath(pathname);
  return key ? loadPublicPage(key) : Promise.resolve();
}
