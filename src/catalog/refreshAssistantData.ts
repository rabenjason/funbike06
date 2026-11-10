import { getPublicDataGeneration, loadServerData } from "./loadServerData";

let verified: { version: string; generation: number } | undefined;
class VersionChanged extends Error {}

async function readVersion(signal: AbortSignal): Promise<string> {
  const response = await fetch("/server/api/public-data-version.php", { credentials: "same-origin", cache: "no-store", signal });
  if (!response.ok) throw new Error("Vérification des données indisponible.");
  const value: unknown = await response.json();
  if (!value || typeof value !== "object" || typeof (value as { version?: unknown }).version !== "string" || !/^[a-f0-9]{64}$/.test((value as { version: string }).version)) throw new Error("Version des données invalide.");
  if (signal.aborted) throw new Error("Chargement annulé.");
  return (value as { version: string }).version;
}

/** Vérifie à chaque question ; les données ne sont publiées que si elles sont stables pendant la lecture. */
export async function refreshAssistantData(signal: AbortSignal): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const version = await readVersion(signal);
    if (verified?.version === version && verified.generation === getPublicDataGeneration()) return;
    try {
      const generation = await loadServerData(signal, async () => {
        if (await readVersion(signal) !== version) throw new VersionChanged();
      });
      if (generation !== getPublicDataGeneration()) throw new VersionChanged();
      verified = { version, generation };
      return;
    } catch (error) {
      if (!(error instanceof VersionChanged)) throw error;
    }
  }
  throw new Error("Les données changent pendant la lecture. Réessayez.");
}
