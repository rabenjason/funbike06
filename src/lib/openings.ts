/// <reference types="vite/client" />

export const openingsClientEnabled = import.meta.env.VITE_COUNT_SITE_OPENINGS === "1";
const OLD_AUDIENCE_ID = "fb_audience_id_v2";
let attempted = false;

// L'ancien identifiant de la version précédente n'est plus utilisé.
export function clearOldAudienceId() {
  try { window.localStorage.removeItem(OLD_AUDIENCE_ID); } catch { /* stockage indisponible */ }
}

export function recordSiteOpening(enabled = openingsClientEnabled, send: typeof fetch = fetch) {
  if (!enabled || attempted) return;
  attempted = true; // Une seule tentative par chargement, y compris avec React StrictMode.
  void send("/server/api/openings.php", {
    method: "POST", credentials: "omit", referrerPolicy: "no-referrer", cache: "no-store", keepalive: true,
    headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "opening" }),
  }).catch(() => {});
}
