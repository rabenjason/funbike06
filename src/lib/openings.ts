/// <reference types="vite/client" />

// Aucune requête de comptage sans activation explicite au build.
export const openingsClientEnabled = import.meta.env.VITE_COUNT_SITE_OPENINGS === "1";
let attempted = false;
export function recordSiteOpening(enabled = openingsClientEnabled, send: typeof fetch = fetch) {
  if (!enabled || attempted) return;
  attempted = true; // Une seule tentative par chargement, y compris avec React StrictMode.
  void send("/server/api/openings.php", { method: "POST", credentials: "omit", referrerPolicy: "no-referrer", cache: "no-store", keepalive: true }).catch(() => {});
}
