/// <reference types="vite/client" />
import { readConsent } from "../components/CookieConsent";

export const openingsClientEnabled = import.meta.env.VITE_COUNT_SITE_OPENINGS === "1";
const ID_KEY = "fb_audience_id_v2";
let attempted = false;
let visitorSent = false;

function removeId() {
  try { window.localStorage.removeItem(ID_KEY); } catch { /* stockage indisponible */ }
}
function visitorId(): string | null {
  try {
    const year = new Intl.DateTimeFormat("en", { timeZone: "Indian/Antananarivo", year: "numeric" }).format(new Date());
    const old = JSON.parse(window.localStorage.getItem(ID_KEY) || "null");
    if (old?.year === year && typeof old.id === "string" && /^[a-f0-9]{64}$/.test(old.id)) return old.id;
    const bytes = new Uint8Array(32);
    window.crypto.getRandomValues(bytes);
    const id = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
    window.localStorage.setItem(ID_KEY, JSON.stringify({ year, id }));
    return id;
  } catch { return null; }
}
function sendEvent(kind: "opening" | "visitor", id: string | null, send: typeof fetch) {
  void send("/server/api/openings.php", {
    method: "POST", credentials: "omit", referrerPolicy: "no-referrer", cache: "no-store", keepalive: true,
    headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, ...(id ? { id } : {}) }),
  }).catch(() => {});
}
export function recordSiteOpening(enabled = openingsClientEnabled, send: typeof fetch = fetch) {
  if (!enabled || attempted) return;
  attempted = true; // Une tentative par chargement, y compris avec StrictMode.
  const consented = readConsent()?.stats === true;
  if (!consented) removeId();
  const id = consented ? visitorId() : null;
  visitorSent = !!id;
  sendEvent("opening", id, send);
}
// Les changements dans cet onglet et dans les autres onglets prennent effet immédiatement.
export function updateAudienceConsent(enabled = openingsClientEnabled, send: typeof fetch = fetch) {
  if (readConsent()?.stats !== true) { removeId(); visitorSent = false; return; }
  if (!enabled || !attempted || visitorSent) return;
  const id = visitorId();
  if (id) { visitorSent = true; sendEvent("visitor", id, send); }
}
