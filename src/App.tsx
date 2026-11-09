import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { Footer, Header, type Route } from "./components/Layout";
import CatChat from "./components/CatChat";
import CookieConsent, { readConsent } from "./components/CookieConsent";
import { RouteProgress } from "./components/Loaders";
import Home from "./pages/Home";
import Promotions from "./pages/Promotions";
import { PromotionsProvider } from "./components/PromotionsContext";
import { Catalogue, Equipements, Spares } from "./pages/Catalog";
import Product from "./pages/Product";
import AccessoryDetail from "./pages/AccessoryDetail";
import Contact from "./pages/Contact";
import Dealers from "./pages/Dealers";
import { motorcycles, findProductById } from "./catalog";
import { persistTheme, readDarkPreference } from "./lib/theme";
import { parseRoute, routePath } from "./lib/routes";
import { updateSeo } from "./lib/seo";

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

  const route = history[history.length - 1];
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
              {route.page === "home" && <Home go={go} />}
              {route.page === "catalogue" && <Catalogue go={go} />}
              {route.page === "motos" && <Catalogue go={go} motosOnly initialQuery={route.id} />}
              {route.page === "equipements" && <Equipements go={go} initialBrand={route.id} />}
              {route.page === "promotions" && <Promotions go={go} />}
              {route.page === "spares" && <Spares go={go} initialBrand={route.id} />}
              {route.page === "product" && (
                <Product id={route.id} go={go} back={back} canGoBack={canGoBack} backLabel={backLabel} />
              )}
              {route.page === "accessory" && (
                <AccessoryDetail id={route.id} categoryId={route.categoryId} go={go} back={back} canGoBack={canGoBack} backLabel={backLabel} />
              )}
              {route.page === "revendeurs" && <Dealers go={go} initialCity={route.id} />}
              {route.page === "contact" && <Contact inquiryId={route.id} />}
            </motion.div>
          </AnimatePresence>
        </main>
        <Footer go={go} onCookies={() => setCookieOpen(true)} />
        <CatChat go={go} hiddenOnMobile={cookieOpen} />
        <CookieConsent open={cookieOpen} onClose={() => setCookieOpen(false)} />
      </div>
    </MotionConfig></PromotionsProvider>
  );
}
