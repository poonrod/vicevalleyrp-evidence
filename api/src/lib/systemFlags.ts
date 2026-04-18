import { prisma } from "./prisma";

export const SYSTEM_FLAG_KEYS = [
  "ENABLE_RETENTION",
  "ENABLE_HASH_CHECK",
  "ENABLE_COMPRESSION",
  "ENABLE_STRICT_PERMISSIONS",
  "VERBOSE_HTTP_LOGGING",
] as const;

export type SystemFlagKey = (typeof SYSTEM_FLAG_KEYS)[number];

const DEFAULTS: Record<SystemFlagKey, boolean> = {
  ENABLE_RETENTION: true,
  ENABLE_HASH_CHECK: false,
  ENABLE_COMPRESSION: false,
  ENABLE_STRICT_PERMISSIONS: false,
  VERBOSE_HTTP_LOGGING: false,
};

let cache: { flags: Record<SystemFlagKey, boolean>; at: number } | null = null;
const CACHE_MS = 10_000;

function parseBoolJson(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  if (v && typeof v === "object" && "enabled" in v && typeof (v as { enabled: unknown }).enabled === "boolean") {
    return (v as { enabled: boolean }).enabled;
  }
  return null;
}

export async function getSystemFlags(): Promise<Record<SystemFlagKey, boolean>> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_MS) return cache.flags;

  const rows = await prisma.systemSetting.findMany({
    where: { key: { in: [...SYSTEM_FLAG_KEYS] } },
  });
  const flags = { ...DEFAULTS };
  for (const r of rows) {
    const k = r.key as SystemFlagKey;
    if (!SYSTEM_FLAG_KEYS.includes(k)) continue;
    const b = parseBoolJson(r.value);
    if (b !== null) flags[k] = b;
  }
  cache = { flags, at: now };
  return flags;
}

export function invalidateSystemFlagsCache(): void {
  cache = null;
}

export async function setSystemFlag(key: SystemFlagKey, enabled: boolean): Promise<void> {
  await prisma.systemSetting.upsert({
    where: { key },
    create: { key, value: enabled },
    update: { value: enabled },
  });
  invalidateSystemFlagsCache();
}

export async function isRetentionGloballyEnabled(): Promise<boolean> {
  const f = await getSystemFlags();
  return f.ENABLE_RETENTION;
}

export async function isStrictEvidencePermissions(): Promise<boolean> {
  const f = await getSystemFlags();
  return f.ENABLE_STRICT_PERMISSIONS;
}

export async function isVerboseHttpLogging(): Promise<boolean> {
  const f = await getSystemFlags();
  return f.VERBOSE_HTTP_LOGGING;
}
