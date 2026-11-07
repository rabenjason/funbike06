export type ApiResult = Record<string, any>;

export async function request(path: string, options: RequestInit = {}): Promise<ApiResult> {
  const response = await fetch(`/server/api/${path}`, { credentials: "same-origin", cache: "no-store", ...options });
  let result: ApiResult;
  try { result = await response.json(); } catch { throw new Error("Réponse du serveur invalide."); }
  if (!response.ok) throw new Error(result.message || result.error || "La demande a échoué.");
  return result;
}
export const json = (method: string, body?: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
