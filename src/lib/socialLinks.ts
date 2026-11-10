/** N'afficher l'icône Facebook que pour une adresse Facebook réelle. */
export function isFacebookUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    const host = url.hostname.toLowerCase();
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password &&
      ["facebook.com", "fb.com", "fb.me"].some((domain) => host === domain || host.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

export function facebookUrl(links: { label: string; url: string }[]): string | undefined {
  return links.find((link) => typeof link?.url === "string" && isFacebookUrl(link.url))?.url.trim();
}
