import { prisma } from "../../lib/prisma";
import { DEFAULT_RETENTION_SETTINGS, type RetentionSettings, RETENTION_KEYS } from "./settings";

export async function loadRetentionSettings(): Promise<RetentionSettings> {
  const rows = await prisma.retentionPolicySetting.findMany({
    where: { key: { in: [...RETENTION_KEYS] } },
  });
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const out = { ...DEFAULT_RETENTION_SETTINGS };
  for (const k of RETENTION_KEYS) {
    const v = map.get(k);
    if (v === undefined) continue;
    (out as Record<string, unknown>)[k] = v as unknown;
  }
  return out as RetentionSettings;
}

export async function mergeRetentionSettings(patch: Partial<RetentionSettings>): Promise<RetentionSettings> {
  const current = await loadRetentionSettings();
  const next = { ...current, ...patch };
  for (const [k, val] of Object.entries(patch)) {
    await prisma.retentionPolicySetting.upsert({
      where: { key: k },
      create: { key: k, value: val as never },
      update: { value: val as never },
    });
  }
  return next;
}
