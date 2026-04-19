import { z } from "zod";

const startRaw = z.object({
  officer_discord_id: z.string().min(1).max(32).optional(),
  officer_name: z.string().max(256).optional(),
  badge_number: z.string().max(64).optional(),
  case_number: z.string().max(64).nullable().optional(),
  timestamp: z.union([z.number(), z.string()]).optional(),
  incident_id: z.string().max(128).optional().nullable(),
  officerDiscordId: z.string().min(1).max(32).optional(),
  officerName: z.string().max(256).optional(),
  badgeNumber: z.string().max(64).optional(),
  caseNumber: z.string().max(64).nullable().optional(),
  incidentId: z.string().max(128).optional().nullable(),
});

/** POST /start-recording — snake_case from FiveM NUI; camelCase accepted too. */
export const startRecordingBodySchema = startRaw
  .refine((raw) => !!(raw.officer_discord_id ?? raw.officerDiscordId), {
    message: "officer_discord_id required",
  })
  .transform((raw) => ({
    officerDiscordId: (raw.officer_discord_id ?? raw.officerDiscordId) as string,
    officerName: raw.officer_name ?? raw.officerName,
    officerBadgeNumber: raw.badge_number ?? raw.badgeNumber,
    caseNumber: raw.case_number ?? raw.caseNumber ?? null,
    timestamp: raw.timestamp,
    incidentId: raw.incident_id ?? raw.incidentId ?? null,
  }));

export const stopRecordingBodySchema = startRaw;

export type StartRecordingPayload = z.infer<typeof startRecordingBodySchema>;
