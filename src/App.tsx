import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { Footer, Header, type Route } from "./components/Layout";
import CatChat from "./components/CatChat";
import { chatbotEnabled, defaultDisplayMode } from "./content/homepage";
import CookieConsent, { readConsent } from "./components/CookieConsent";
import { PageLoading, RouteProgress } from "./components/Loaders";
import { WhatsappProvider } from "./components/Whatsapp";
import { PromotionsProvider } from "./components/PromotionsContext";
import { motorcycles, products } from "./catalog";
import { getBackgroundStatus, subscribeBackgroundStatus, startBackgroundCatalog } from "./catalog/loadServerData";
import { persistTheme, readDarkPreference } from "./lib/theme";
import { navigationPage, parseRoute, routePath } from "./lib/routes";
import { updateSeo } from "./lib/seo";
import { recordSiteOpening, clearOldAudienceId } from "./lib/openings";
import { loadPublicPage, loadedPublicPage, publicPageKey } from "./lib/publicPages";

function sameRoute(a: Route, b: Route) {
  return a.page === b.page && (a.id ?? "") === (b.id ?? "") && (a.categoryId ?? "") === (b.categoryId ?? "");
}

function defaultBackRoute(route: Route): Route {
  if (route.page === "product" || route.page === "accessory") {
    const page = navigationPage(route);
    if (page === "motos" || page === "equipements" || page === "spares") return { page };
  }
  return { page: "home" };
}

function routeLabel(route: Route): string {
  switch (route.page) {
    case "home":
      return "Accueil";
    case "catalogue":
      return "Catalogue";
    case "motos":
      return "Motos";
    case "equipements":
      return "Équipements";
    case "spares":
      return "Pièces détachées";
    case "product": {
      const bike = motorcycles.find((product) => product.id === route.id);
      return bike ? bike.name : "Fiche moto";
    }
    case "accessory": {
      const part = products.find((item) => item.id === route.id && item.categoryId !== "motos" && (!route.categoryId || item.categoryId === route.categoryId));
      return part ? part.name : "Fiche produit";
    }
    case "promotions":
      return "Promotions";
    case "revendeurs":
      return "Revendeurs";
    case "contact":
      return "Contact";
    default:
      return "Page précédente";
  }
}

type HistoryEntry = { key: string; route: Route };
type RouteHistory = { entries: HistoryEntry[]; index: number };
const historyKey = "__funbikeRouteKey";

export default function App() {
  const [dark, setDark] = useState(() => readDarkPreference(defaultDisplayMode));
  const session = useRef(`${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const sequence = useRef(0);
  const [history, setHistory] = useState<RouteHistory>(() => ({ entries: [{ key: `${session.current}:0`, route: parseRoute(window.location.pathname, window.location.search) }], index: 0 }));
  const [cookieOpen, setCookieOpen] = useState(false);
  const [progressKey, setProgressKey] = useState(0);
  const [pageLoadError, setPageLoadError] = useState("");
  const [, pageLoaded] = useState(0);

  const route = history.entries[history.index].route;
  const initialPage = useRef(route.page);
  const catalogStatus = useSyncExternalStore(subscribeBackgroundStatus, getBackgroundStatus, getBackgroundStatus);
  const sameInitialSection = route.page === initialPage.current || (initialPage.current === "motos" && route.page === "product") || (initialPage.current === "product" && route.page === "motos");
  const waitingForCatalog = route.page !== "revendeurs" && !sameInitialSection && catalogStatus !== "ready";
  useLayoutEffect(() => {
    // Identifier l'entrée initiale sans effacer un éventuel état navigateur existant.
    const current = window.history.state;
    window.history.replaceState({ ...(current && typeof current === "object" ? current : {}), [historyKey]: `${session.current}:0` }, "");
  }, []);
  useEffect(() => {
    clearOldAudienceId();
    if (history.entries[0].route.page !== "not-found") recordSiteOpening();
  }, []);
  const pageKey = publicPageKey(route.page);
  const Page = pageKey ? loadedPublicPage(pageKey) : undefined;
  useEffect(() => {
    if (!pageKey || loadedPublicPage(pageKey)) return;
    let active = true; setPageLoadError("");
    loadPublicPage(pageKey).then(() => { if (active) pageLoaded((n) => n + 1); }, () => { if (active) setPageLoadError(pageKey); });
    return () => { active = false; };
  }, [pageKey]);
  const canGoBack = history.index > 0;
  useEffect(() => {
    if (route.page !== "not-found") return;
    // En cas d'adresse invalide atteinte dans l'historique de l'application,
    // remplacer l'entrée évite une boucle avec le bouton Retour.
    window.history.replaceState(window.history.state, "", "/");
    setHistory((prev) => ({ entries: [{ key: prev.entries[prev.index].key, route: { page: "home" } }], index: 0 }));
  }, [route.page]);
  useEffect(() => { updateSeo(route); }, [route]);
  const previousRoute = canGoBack ? history.entries[history.index - 1].route : null;
  const backLabel = useMemo(
    () => routeLabel(previousRoute ?? defaultBackRoute(route)),
    [previousRoute?.page, previousRoute?.id, previousRoute?.categoryId, route.page, route.id, route.categoryId],
  );

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute("content", dark ? "#141513" : "#ffffff");
  }, [dark]);

  // Afficher les choix de cookies après le démarrage, seulement sans choix enregistré.
  useEffect(() => {
    if (readConsent()) return;
    const timer = window.setTimeout(() => setCookieOpen(true), 1150);
    return () => window.clearTimeout(timer);
  }, []);

  const go = useCallback((page: string, id?: string, categoryId?: string) => {
    const path = routePath({ page, id, categoryId });
    const url = new URL(path, window.location.origin);
    // L'état et l'URL doivent désigner exactement la même fiche, y compris
    // quand l'appelant ne précise pas la catégorie d'une moto.
    const next = parseRoute(url.pathname, url.search);
    if (sameRoute(next, route)) return;
    const key = `${session.current}:${++sequence.current}`;
    window.history.pushState({ [historyKey]: key }, "", path);
    setHistory((prev) => {
      const entries = [...prev.entries.slice(0, prev.index + 1), { key, route: next }].slice(-50);
      return { entries, index: entries.length - 1 };
    });
    setProgressKey((key) => key + 1);
  }, [route]);

  useEffect(() => {
    const onPop = (event: PopStateEvent) => {
      const next = parseRoute(window.location.pathname, window.location.search);
      let key = event.state?.[historyKey];
      if (typeof key !== "string" || !key.startsWith(`${session.current}:`)) {
        key = `${session.current}:${++sequence.current}`;
        const current = window.history.state;
        window.history.replaceState({ ...(current && typeof current === "object" ? current : {}), [historyKey]: key }, "");
      }
      setHistory((prev) => {
        const index = prev.entries.findIndex((entry) => entry.key === key && sameRoute(entry.route, next));
        return index >= 0 ? { entries: prev.entries, index } : { entries: [{ key, route: next }], index: 0 };
      });
      setProgressKey((value) => value + 1);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Sécurité : après chaque changement de page, forcer le haut
  // (les images qui chargent décalent la mise en page vers le bas).
  useEffect(() => {
    window.scrollTo(0, 0);
    const t = window.setTimeout(() => window.scrollTo(0, 0), 60);
    return () => window.clearTimeout(t);
  }, [route.page, route.id]);

  /** Retour navigateur ; une entrée directe revient à une page pertinente. */
  const back = useCallback((fallback?: Route) => {
    if (canGoBack) window.history.back();
    else {
      const destination = fallback ?? defaultBackRoute(route);
      go(destination.page, destination.id, destination.categoryId);
    }
  }, [canGoBack, go, route]);

  return (
    <WhatsappProvider><PromotionsProvider><MotionConfig reducedMotion="user">
      {progressKey > 0 && <RouteProgress key={progressKey} />}

      <div className="min-h-screen bg-white text-[#171816] transition-colors duration-300 dark:bg-[#141513] dark:text-[#f2f0ea]">
        <Header route={route} go={go} dark={dark} toggle={() => { const next = !dark; persistTheme(next); setDark(next); }} />
        <main>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={`${route.page}-${route.id ?? ""}-${route.categoryId ?? ""}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              {route.page === "not-found" && <PageLoading />}
              {waitingForCatalog ? (catalogStatus === "error" ? <div role="alert" className="p-8">Impossible de charger les données de cette page. <button className="underline" onClick={() => void startBackgroundCatalog().catch(() => {})}>Réessayer</button></div> : <PageLoading />) : Page && <Page route={route} go={go} back={back} canGoBack={canGoBack} backLabel={backLabel} />}
              {!waitingForCatalog && pageKey && !Page && (pageLoadError === pageKey ? <div role="alert" className="p-8">Impossible de charger cette page. Vérifiez votre connexion puis <button className="underline" onClick={() => window.location.reload()}>actualisez la page</button>.</div> : <PageLoading />)}
            </motion.div>
          </AnimatePresence>
        </main>
        <Footer go={go} onCookies={() => setCookieOpen(true)} />
        {chatbotEnabled && <CatChat go={go} hiddenOnMobile={cookieOpen} />}
        <CookieConsent open={cookieOpen} onClose={() => setCookieOpen(false)} />
      </div>
    </MotionConfig></PromotionsProvider></WhatsappProvider>
  );
}
