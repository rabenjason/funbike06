// Limite commune aux lectures publiques, y compris le contenu d'accueil.
// Les écritures de l'administration n'utilisent jamais cette file ni ses essais.
const MAX_CONCURRENT = 3;
const RETRY_DELAYS = [250, 750];
const TRANSIENT_STATUSES = new Set([502, 503, 504]);
let active = 0;
type Job = { start: () => void; cancel: () => void; signal?: AbortSignal };
const queue: Job[] = [];

function cancelled() { return new Error("Chargement annulé."); }
function drain() {
  while (active < MAX_CONCURRENT && queue.length) {
    const job = queue.shift()!;
    job.signal?.removeEventListener("abort", job.cancel);
    if (job.signal?.aborted) { job.cancel(); continue; }
    active++;
    job.start();
  }
}
export function schedulePublicOperation<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(cancelled()); return; }
    const job: Job = {
      signal,
      cancel: () => {
        const index = queue.indexOf(job);
        if (index >= 0) queue.splice(index, 1);
        reject(cancelled());
      },
      start: () => {
        void Promise.resolve().then(task).then(resolve, reject).finally(() => { active--; drain(); });
      },
    };
    signal?.addEventListener("abort", job.cancel, { once: true });
    queue.push(job);
    drain();
  });
}
function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(cancelled()); return; }
    const timer = setTimeout(() => { signal?.removeEventListener("abort", abort); resolve(); }, ms);
    function abort() { clearTimeout(timer); reject(cancelled()); }
    signal?.addEventListener("abort", abort, { once: true });
  });
}

/** GET uniquement : deux nouvelles tentatives au maximum pour les erreurs HTTP temporaires. */
export async function readPublicJson(path: string, signal?: AbortSignal): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    if (signal?.aborted) throw cancelled();
    const result = await schedulePublicOperation(async () => {
      if (signal?.aborted) throw cancelled();
      const response = await fetch(`/server/api/${path}`, { credentials: "same-origin", cache: "no-store", signal });
      if (!response.ok) {
        try { await response.body?.cancel(); } catch { /* la réponse est déjà terminée */ }
        return { status: response.status, value: undefined };
      }
      return { status: 200, value: await response.json() as unknown };
    }, signal);
    if (signal?.aborted) throw cancelled();
    if (result.status === 200) return result.value;
    if (!TRANSIENT_STATUSES.has(result.status) || attempt >= RETRY_DELAYS.length) throw new Error(`Le serveur est indisponible (${result.status}).`);
    // Un léger décalage évite que tous les visiteurs réessaient exactement ensemble.
    await delay(RETRY_DELAYS[attempt] + Math.floor(Math.random() * 100), signal);
  }
}
