import { StrictMode, useEffect, useLayoutEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./styles/light-theme.css";
import { readDarkPreference } from "./lib/theme";

if (readDarkPreference()) document.documentElement.classList.add("dark");

// StrictMode peut démarrer deux effets : partager le chargement évite qu'un
// résultat tardif remplace les tableaux après l'import des index de l'application.
let publicData: Promise<void> | undefined;
function initializePublicData() {
  if (!publicData) publicData = Promise.all([import("./catalog/loadServerData").then(({ loadServerData }) => loadServerData()), import("./content/homepage").then(({ loadHomepageData }) => loadHomepageData())]).then(() => {}).catch((error) => { publicData = undefined; throw error; });
  return publicData;
}

function Bootstrap() {
  const [content, setContent] = useState<React.ReactNode>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    async function start() {
      try {
        if (location.pathname === "/admin" || location.pathname === "/admin/" || new URLSearchParams(location.search).has("admin")) {
          const { default: Admin } = await import("./pages/Admin");
          if (active) setContent(<Admin />);
        } else {
          await initializePublicData();
          const { default: App } = await import("./App");
          if (active) setContent(<App />);
        }
      } catch {
        if (active) setError("Impossible de charger les données du serveur. Vérifiez la connexion puis réessayez.");
      }
    }
    setError(""); start();
    return () => { active = false; };
  }, [attempt]);
  useLayoutEffect(() => {
    if (!content && !error) return;
    if (content && location.pathname !== "/admin" && location.pathname !== "/admin/" && !new URLSearchParams(location.search).has("admin")) {
      // Garder le contenu SEO en cas d'erreur ; le retirer seulement après le rendu du site.
      document.getElementById("seo-fallback")?.remove();
    }
    document.documentElement.classList.remove("fb-booting");
  }, [content, error]);
  if (error) return <div role="alert" className="bg-[#141513] p-6 text-center text-white"><p>{error}</p><button className="mt-5 bg-[#ffd100] px-5 py-3 font-bold text-black" onClick={() => setAttempt((n) => n + 1)}>Réessayer</button></div>;
  return content ?? <main className="grid min-h-screen place-items-center bg-[#141513] text-white">Chargement…</main>;
}

createRoot(document.getElementById("root")!).render(<StrictMode><Bootstrap /></StrictMode>);
