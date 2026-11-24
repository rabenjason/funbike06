import type { ApiResult } from "./adminApi";

/** Lectures d'administration uniquement : aucune écriture ne passe ici. */
export class AdminReadError extends Error {
  constructor(message: string, public readonly status?: number) { super(message); }
}

const retryDelays = [250, 750];
const transient = new Set([502, 503, 504]);

export async function readAdmin(path: string): Promise<ApiResult> {
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 8000);
    try {
      const response = await fetch(`/server/api/${path}`, { credentials: "same-origin", cache: "no-store", signal: controller.signal });
      if (transient.has(response.status)) {
        try { await response.body?.cancel(); } catch { /* réponse déjà terminée */ }
        if (attempt < retryDelays.length) {
          clearTimeout(timer);
          await new Promise((resolve) => setTimeout(resolve, retryDelays[attempt]));
          continue;
        }
        throw new AdminReadError(`Lecture impossible (${response.status}) : ${path.split("?")[0]}.`, response.status);
      }
      let result: ApiResult;
      try { result = await response.json(); }
      catch { throw new AdminReadError(`Réponse du serveur invalide (${response.status || "statut inconnu"}) : ${path.split("?")[0]}.`, response.status); }
      if (!response.ok) throw new AdminReadError(result?.message || result?.error || `Lecture impossible (${response.status || "statut inconnu"}).`, response.status);
      return result;
    } catch (error) {
      if (!timedOut) throw error;
      if (attempt >= retryDelays.length) throw new AdminReadError(`Délai de lecture dépassé : ${path.split("?")[0]}.`);
    } finally {
      clearTimeout(timer);
    }
    await new Promise((resolve) => setTimeout(resolve, retryDelays[attempt]));
  }
}

/** Charge au plus trois ressources à la fois et s'arrête après un échec définitif. */
export async function readAdminCatalog(paths: string[]): Promise<ApiResult[]> {
  const results: ApiResult[] = new Array(paths.length);
  let next = 0;
  let failed = false;
  let failure: unknown;
  async function worker() {
    while (!failed && next < paths.length) {
      const index = next++;
      try { results[index] = await readAdmin(paths[index]); }
      catch (error) { if (!failed) { failed = true; failure = error; } }
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, paths.length) }, () => worker()));
  if (failed) throw failure;
  return results;
}
