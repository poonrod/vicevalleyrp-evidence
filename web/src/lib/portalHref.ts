/**
 * When the static export is served from a known portal origin, use absolute `<a href>`
 * for primary navigation so the browser does a full document load. That avoids
 * App Router client transitions that can mis-resolve segment fetches (e.g. `index.txt`
 * ending up as `?id=index.txt` on `/evidence/view`).
 */
export function portalBase(): string {
  return (process.env.NEXT_PUBLIC_WEB_APP_URL ?? "").trim().replace(/\/+$/, "");
}

/** Path must start with `/` or include query after path, e.g. `/evidence/view?id=…` */
export function portalHref(pathOrQuery: string): string {
  const base = portalBase();
  const raw = pathOrQuery.startsWith("/") ? pathOrQuery : `/${pathOrQuery}`;
  if (!base) return raw;
  return `${base}${raw}`;
}

export function preferFullPagePortalNav(): boolean {
  return portalBase().length > 0;
}
