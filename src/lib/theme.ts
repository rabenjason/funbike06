/** Le mode par défaut ne remplace jamais un choix enregistré par le visiteur. */
const THEME_KEY = "fb-theme-v2";
export type DisplayMode = "light" | "dark";

export function readDarkPreference(defaultMode: DisplayMode = "dark"): boolean {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") return saved === "dark";
  } catch { /* Le mode par défaut reste disponible sans stockage. */ }
  return defaultMode === "dark";
}

/** Uniquement lors d’un choix explicite, pas à chaque chargement. */
export function persistTheme(isDark: boolean): void {
  try { localStorage.setItem(THEME_KEY, isDark ? "dark" : "light"); }
  catch { /* Le choix reste actif pour cette session. */ }
}
