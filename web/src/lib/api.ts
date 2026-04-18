const raw = process.env.NEXT_PUBLIC_API_URL?.trim();
/** Note: `"" ?? default` is still `""`; empty env must not produce relative fetch URLs. */
export const API_BASE =
  raw && raw.length > 0 ? raw.replace(/\/+$/, "") : "http://localhost:4000";

export class ApiHttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiHttpError";
  }
}

/**
 * Only true authz/authn outcomes navigate away. Other errors leave the caller to show UI
 * (otherwise a 404/500 or a misconfigured API URL looks like "logged out" → Discord).
 */
export function handleApiAuthNavigation(router: { push: (href: string) => void }, err: unknown): boolean {
  if (err instanceof ApiHttpError) {
    if (err.status === 401) {
      router.push("/login");
      return true;
    }
    if (err.status === 403) {
      router.push("/dashboard");
      return true;
    }
  }
  return false;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  const headers = new Headers(init?.headers as HeadersInit | undefined);
  const body = init?.body;
  if (body != null && body !== "" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    headers,
  });

  const text = await res.text();
  if (!res.ok) {
    let message = res.statusText;
    try {
      const j = JSON.parse(text) as { error?: string };
      if (j.error) message = j.error;
    } catch {
      if (text.trim()) message = text.trim().slice(0, 200);
    }
    throw new ApiHttpError(res.status, message);
  }

  if (!text.length) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    const ct = res.headers.get("content-type") || "";
    const looksHtml = /<!DOCTYPE|<html[\s>]/i.test(text);
    const hint =
      looksHtml || ct.toLowerCase().includes("text/html")
        ? "This often happens when NEXT_PUBLIC_API_URL points at the evidence portal (Next static site) instead of the Node API. "
        : "";
    throw new ApiHttpError(
      502,
      `${hint}Expected JSON from ${API_BASE}${path} but the response was not valid JSON. ` +
        `Set NEXT_PUBLIC_API_URL in web/.env.local to your **API** host (e.g. https://api.yourdomain.com), not the evidence portal URL. ` +
        `Discord OAuth redirect URI is a separate API setting (DISCORD_CALLBACK_URL); correcting the redirect does not fix this env var. ` +
        `After changing .env.local, run npm run build again so the static export picks up NEXT_PUBLIC_API_URL.`
    );
  }
}

export function loginUrl() {
  return `${API_BASE}/auth/discord/login`;
}
