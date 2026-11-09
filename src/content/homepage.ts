// Copie des valeurs d'installation PHP, gardée synchronisée par un test.
// Ne pas importer depuis /server : Vite transmet ce chemin au serveur PHP.
import defaults from "./homepage-defaults.json";

export type HomepageContent = {
  hero: { localisation: string; titreLigne1: string; titreLigne2: string; description: string; descriptionSansMarques: string; sloganPrefix: string; usages: string[]; boutonCatalogue: string; aLaUne: string; choisirModele: string; afficherModele: string };
  univers: { surTitre: string; titre: string };
  sherco: { surTitre: string; titreLigne1: string; titreLigne2: string; description: string; bouton: string; imageAlt: string };
  distributeur: { surTitre: string; titre: string; boutonToutVoir: string; boutonToutesMotos: string; logoPrefix: string };
  nouveautes: { surTitre: string; titre: string; description: string; tarif: string; boutonCatalogue: string; decouvrirPrefix: string };
  motos: { numero: string; titre: string; description: string; bouton: string };
  atelier: { surTitre: string; titre: string; description: string; bouton: string };
  partenaires: { titre: string; description: string; logoPrefix: string };
};
export type HomepageLink = { title: string; to: "catalogue" | "motos" | "equipements" | "spares" | "revendeurs" | "contact"; brandId: string; icon: "moto" | "helmet" | "parts" | "gear" };
export type BannerLink = { to: HomepageLink["to"] | "promotions"; brandId: string };
export type HomepageData = { content: HomepageContent; links: HomepageLink[]; exclusiveBrands: { brandId: string; tagline: string }[]; bannerLink: BannerLink };

// Valeurs d'installation uniquement : les données publiées viennent de l'API.
const initial = defaults as HomepageData;
export let homepageContent: HomepageContent = initial.content;
export let homepageCategories: HomepageLink[] = initial.links;
export let homepageExclusiveBrands: HomepageData["exclusiveBrands"] = initial.exclusiveBrands;
export let homepageBannerLink: BannerLink = initial.bannerLink;
// Préserve la bannière actuelle jusqu'à la première image locale choisie par l'admin.
export let shercoBannerImage: string | null = "https://www.sherco.com/wp-content/uploads/SHERCO50ccV2-32.jpg";

/** N'appliquer qu'une réponse complète, après validation, avant le rendu public. */
export function validHomepage(value: unknown): value is HomepageData {
  if (!value || typeof value !== "object") return false;
  const data = value as HomepageData;
  if (!data.content || !Array.isArray(data.links) || !Array.isArray(data.exclusiveBrands)) return false;
  for (const [section, fields] of Object.entries(defaults.content)) {
    const actual = (data.content as unknown as Record<string, Record<string, unknown>>)[section];
    if (!actual || typeof actual !== "object") return false;
    for (const [key, expected] of Object.entries(fields)) {
      const field = actual[key];
      if (Array.isArray(expected) ? !Array.isArray(field) || !field.length || !field.every((item) => typeof item === "string" && item.trim()) : typeof field !== "string" || !field.trim()) return false;
    }
  }
  if (!data.bannerLink || !["catalogue", "motos", "equipements", "spares", "revendeurs", "contact", "promotions"].includes(data.bannerLink.to) || typeof data.bannerLink.brandId !== "string" || (data.bannerLink.brandId !== "" && !/^[a-z0-9][a-z0-9_-]{0,99}$/.test(data.bannerLink.brandId)) || (data.bannerLink.brandId !== "" && !["motos", "equipements", "spares"].includes(data.bannerLink.to))) return false;
  return data.links.length > 0 && data.links.length <= 8 && data.links.every((link) => link && typeof link.title === "string" && !!link.title.trim() && ["catalogue", "motos", "equipements", "spares", "revendeurs", "contact"].includes(link.to) && typeof link.brandId === "string" && ["moto", "helmet", "parts", "gear"].includes(link.icon)) && data.exclusiveBrands.length <= 6 && data.exclusiveBrands.every((brand) => brand && typeof brand.brandId === "string" && !!brand.brandId && typeof brand.tagline === "string" && !!brand.tagline.trim());
}
export function setHomepage(data: HomepageData) {
  if (!validHomepage(data)) throw new Error("Données de l’accueil invalides.");
  homepageContent = data.content; homepageCategories = data.links; homepageExclusiveBrands = data.exclusiveBrands; homepageBannerLink = data.bannerLink;
}

/** Chargé au démarrage ; Piston actualise le catalogue séparément. */
export async function loadHomepageData(signal?: AbortSignal) {
  const res = await fetch("/server/api/homepage-content.php", { credentials: "same-origin", cache: "no-store", signal });
  if (!res.ok) throw new Error("Impossible de charger le contenu de l’accueil.");
  const value: unknown = await res.json();
  if (!value || typeof value !== "object" || !validHomepage((value as { data?: unknown }).data)) throw new Error("Données de l’accueil invalides.");
  const response = value as { data: HomepageData; shercoBannerConfigured?: unknown; shercoBannerImage?: unknown };
  let image = "https://www.sherco.com/wp-content/uploads/SHERCO50ccV2-32.jpg" as string | null;
  if (response.shercoBannerConfigured === true) {
    if (response.shercoBannerImage !== null && (typeof response.shercoBannerImage !== "string" || !/^\/server\/uploads\/homepage\/sherco-[a-f0-9]{32}\.(jpg|png|webp)$/.test(response.shercoBannerImage))) throw new Error("Image de bannière invalide.");
    image = response.shercoBannerImage as string | null;
  } else if (response.shercoBannerConfigured !== undefined && response.shercoBannerConfigured !== false) throw new Error("Configuration de bannière invalide.");
  if (signal?.aborted) throw new Error("Chargement annulé.");
  setHomepage(response.data);
  shercoBannerImage = image;
}
