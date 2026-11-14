import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { Footer, Header, type Route } from "./components/Layout";
import CatChat from "./components/CatChat";
import { chatbotEnabled } from "./content/homepage";
import CookieConsent, { readConsent } from "./components/CookieConsent";
import { RouteProgress } from "./components/Loaders";
import { PromotionsProvider } from "./components/PromotionsContext";
import { motorcycles, findProductById } from "./catalog";
import { persistTheme, readDarkPreference } from "./lib/theme";
import { parseRoute, routePath } from "./lib/routes";
import { updateSeo } from "./lib/seo";
import { recordSiteOpening, clearOldAudienceId } from "./lib/openings";
import { loadPublicPage, loadedPublicPage, publicPageKey } from "./lib/publicPages";

function sameRoute(a: Route, b: Route) {
  return a.page === b.page && (a.id ?? "") === (b.id ?? "") && (a.categoryId ?? "") === (b.categoryId ?? "");
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
      const part = findProductById(route.id);
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

export default function App() {
  const [dark, setDark] = useState(readDarkPreference);
  const [history, setHistory] = useState<Route[]>(() => [parseRoute(window.location.pathname, window.location.search)]);
  const [cookieOpen, setCookieOpen] = useState(false);
  const [progressKey, setProgressKey] = useState(0);
  const [pageLoadError, setPageLoadError] = useState("");
  const [, pageLoaded] = useState(0);

  const route = history[history.length - 1];
  useEffect(() => {
    clearOldAudienceId();
    if (history[0].page !== "not-found") recordSiteOpening();
  }, []);
  const pageKey = publicPageKey(route.page);
  const Page = pageKey ? loadedPublicPage(pageKey) : undefined;
  useEffect(() => {
    if (!pageKey || loadedPublicPage(pageKey)) return;
    let active = true; setPageLoadError("");
    loadPublicPage(pageKey).then(() => { if (active) pageLoaded((n) => n + 1); }, () => { if (active) setPageLoadError(pageKey); });
    return () => { active = false; };
  }, [pageKey]);
  const canGoBack = history.length > 1;
  useEffect(() => { updateSeo(route); }, [route]);
  const previousRoute = canGoBack ? history[history.length - 2] : null;
  const backLabel = useMemo(
    () => (previousRoute ? routeLabel(previousRoute) : "Accueil"),
    [previousRoute?.page, previousRoute?.id],
  );

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    persistTheme(dark);
    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute("content", dark ? "#141513" : "#ffffff");
  }, [dark]);

  // Afficher les choix de cookies après le démarrage, seulement sans choix enregistré.
  useEffect(() => {
    if (readConsent()) return;
    const timer = window.setTimeout(() => setCookieOpen(true), 1150);
    return () => window.clearTimeout(timer);
  }, []);

  const go = useCallback((page: string, id?: string, categoryId?: string) => {
    const next = { page, id, categoryId };
    if (sameRoute(next, route)) return;
    window.history.pushState(null, "", routePath(next));
    setHistory((prev) => [...prev, next].slice(-50));
    setProgressKey((key) => key + 1);
  }, [route]);

  useEffect(() => {
    const onPop = () => {
      const next = parseRoute(window.location.pathname, window.location.search);
      setHistory((prev) => {
        if (prev.length > 1 && sameRoute(prev[prev.length - 2], next)) return prev.slice(0, -1);
        return [next];
      });
      setProgressKey((key) => key + 1);
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
  const back = useCallback((fallback: Route = { page: "home" }) => {
    if (canGoBack) window.history.back();
    else go(fallback.page, fallback.id);
  }, [canGoBack, go]);

  return (
    <PromotionsProvider><MotionConfig reducedMotion="user">
      {progressKey > 0 && <RouteProgress key={progressKey} />}

      <div className="min-h-screen bg-white text-[#171816] transition-colors duration-300 dark:bg-[#141513] dark:text-[#f2f0ea]">
        <Header route={route} go={go} dark={dark} toggle={() => setDark((d) => !d)} />
        <main>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={`${route.page}-${route.id ?? ""}-${route.categoryId ?? ""}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              {route.page === "not-found" && <div className="p-8">Page introuvable. <button className="underline" onClick={() => go("home")}>Accueil</button></div>}
              {Page && <Page route={route} go={go} back={back} canGoBack={canGoBack} backLabel={backLabel} />}
              {pageKey && !Page && (pageLoadError === pageKey ? <div role="alert" className="p-8">Impossible de charger cette page. Vérifiez votre connexion puis <button className="underline" onClick={() => window.location.reload()}>actualisez la page</button>.</div> : <p role="status" className="p-8">Chargement de la page…</p>)}
            </motion.div>
          </AnimatePresence>
        </main>
        <Footer go={go} onCookies={() => setCookieOpen(true)} />
        {chatbotEnabled && <CatChat go={go} hiddenOnMobile={cookieOpen} />}
        <CookieConsent open={cookieOpen} onClose={() => setCookieOpen(false)} />
      </div>
    </MotionConfig></PromotionsProvider>
  );
}
