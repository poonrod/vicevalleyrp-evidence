import "dotenv/config";

/** Discord compares redirect_uri as an exact string; trailing slashes often cause invalid_grant. */
function normalizeDiscordCallbackUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, "");
}

/**
 * Prefer `DATABASE_URL` when set. Otherwise build from `DB_USER`, `DB_PASSWORD`, `DB_HOST`,
 * `DB_NAME`, optional `DB_PORT` (default 3306) so Hostinger-style split vars stay readable.
 * Password is URL-encoded (plain `!!` in hPanel is fine — no manual `%21` needed).
 */
function resolveDatabaseUrl(): string {
  const explicit = (process.env.DATABASE_URL ?? "").trim();
  if (explicit) return explicit;

  const user = (process.env.DB_USER ?? "").trim();
  const password = process.env.DB_PASSWORD ?? "";
  const host = (process.env.DB_HOST ?? "").trim();
  const database = (process.env.DB_NAME ?? "").trim();
  const port = (process.env.DB_PORT ?? "3306").trim() || "3306";

  if (user && host && database) {
    const u = encodeURIComponent(user);
    const p = encodeURIComponent(password);
    const d = encodeURIComponent(database);
    return `mysql://${u}:${p}@${host}:${port}/${d}`;
  }

  return "mysql://evidence:evidence@127.0.0.1:3306/evidence";
}

const resolvedDatabaseUrl = resolveDatabaseUrl();
process.env.DATABASE_URL = resolvedDatabaseUrl;

function req(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === "") throw new Error(`Missing env: ${name}`);
  return v;
}

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? "development",
  PORT: parseInt(process.env.PORT ?? "4000", 10),
  DATABASE_URL: resolvedDatabaseUrl,
  SESSION_SECRET: req("SESSION_SECRET", "dev-change-me-in-production-min-32-chars!!"),

  DISCORD_CLIENT_ID: (process.env.DISCORD_CLIENT_ID ?? "").trim(),
  DISCORD_CLIENT_SECRET: (process.env.DISCORD_CLIENT_SECRET ?? "").trim(),
  DISCORD_CALLBACK_URL: normalizeDiscordCallbackUrl(
    process.env.DISCORD_CALLBACK_URL ?? "http://localhost:4000/auth/discord/callback"
  ),
  WEB_APP_URL: (process.env.WEB_APP_URL ?? "http://localhost:3000").trim().replace(/\/+$/, ""),

  FIVEM_API_SECRET: process.env.FIVEM_API_SECRET ?? "",

  STORAGE_PROVIDER: (process.env.STORAGE_PROVIDER ?? "r2").toLowerCase(),
  PRESIGNED_URL_EXPIRES_SECONDS: parseInt(process.env.PRESIGNED_URL_EXPIRES_SECONDS ?? "900", 10),

  R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID ?? "",
  R2_BUCKET: process.env.R2_BUCKET ?? "",
  R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID ?? "",
  R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY ?? "",
  R2_ENDPOINT: process.env.R2_ENDPOINT ?? "",
  R2_PUBLIC_DEV_URL: process.env.R2_PUBLIC_DEV_URL ?? "",

  S3_BUCKET: process.env.S3_BUCKET ?? "",
  S3_REGION: process.env.S3_REGION ?? "us-east-1",
  S3_ENDPOINT: process.env.S3_ENDPOINT ?? "",
  S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID ?? "",
  S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY ?? "",

  DISCORD_SUPER_ADMIN_IDS: (process.env.DISCORD_SUPER_ADMIN_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
};

export function assertStorageConfigured(): void {
  if (env.STORAGE_PROVIDER === "r2") {
    if (!env.R2_BUCKET || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY || !env.R2_ENDPOINT) {
      throw new Error("R2 storage selected but R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT are required");
    }
  } else {
    if (!env.S3_BUCKET || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) {
      throw new Error("S3 storage selected but S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY are required");
    }
  }
}
