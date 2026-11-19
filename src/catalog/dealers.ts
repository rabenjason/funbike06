import type { Dealer } from "../types";
export const DEALERS: Dealer[] = [];

// Une erreur de chargement ne doit jamais être présentée comme une liste vide.
type DealerStatus = "ready" | "loading" | "error";
let status: DealerStatus = "ready";
const listeners = new Set<() => void>();
export function dealerStatus() { return status; }
export function subscribeDealerStatus(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); }
export function setDealerStatus(next: DealerStatus) { status = next; listeners.forEach((listener) => listener()); }
