const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiHttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiHttpError";
  }
}

/** 401 → login; 403 → dashboard (still signed in, not allowed); other failures → login. */
export function handleApiAuthNavigation(router: { push: (href: string) => void }, err: unknown): void {
  if (err instanceof ApiHttpError) {
    if (err.status === 401) {
      router.push("/login");
      return;
    }
    if (err.status === 403) {
      router.push("/dashboard");
      return;
    }
  }
  router.push("/login");
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiHttpError(res.status, body.error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

export function loginUrl() {
  return `${API}/auth/discord/login`;
}
