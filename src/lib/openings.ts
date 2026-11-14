/// <reference types="vite/client" />

export const openingsClientEnabled = import.meta.env.VITE_COUNT_SITE_OPENINGS !== "0";
const BROWSER_ID = "fb_stats_browser_v1";
const OLD_AUDIENCE_ID = "fb_audience_id_v2";
let attempted = false;

// L'ancien identifiant de la version précédente n'est plus utilisé.
export function clearOldAudienceId() {
  try { window.localStorage.removeItem(OLD_AUDIENCE_ID); } catch { /* stockage indisponible */ }
}

// Un identifiant aléatoire local est renouvelé à la première visite d'une nouvelle année.
export function getBrowserId(): string | null {
  try {
    const year = new Intl.DateTimeFormat("en", { timeZone: "Indian/Antananarivo", year: "numeric" }).format(new Date());
    const stored = JSON.parse(window.localStorage.getItem(BROWSER_ID) || "null");
    if (stored?.year === year && typeof stored.id === "string" && /^[a-f0-9]{64}$/.test(stored.id)) return stored.id;
    const bytes = new Uint8Array(32);
    window.crypto.getRandomValues(bytes);
    const id = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    window.localStorage.setItem(BROWSER_ID, JSON.stringify({ year, id }));
    return id;
  } catch { return null; }
}

export function recordSiteOpening(enabled = openingsClientEnabled, send: typeof fetch = fetch) {
  if (!enabled || attempted) return;
  attempted = true; // Une seule tentative par chargement, y compris avec React StrictMode.
  const browserId = getBrowserId();
  void send("/server/api/openings.php", {
    method: "POST", credentials: "omit", referrerPolicy: "no-referrer", cache: "no-store", keepalive: true,
    headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "opening", ...(browserId ? { browserId } : {}) }),
  }).catch(() => {});
}
