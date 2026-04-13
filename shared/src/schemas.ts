import { z } from "zod";

const globalRoleZ = z.enum([
  "super_admin",
  "command_staff",
  "evidence_tech",
  "officer",
  "viewer",
]);

export const uploadUrlRequestSchema = z.object({
  fileName: z.string().min(1).max(512),
  mimeType: z.string().min(1).max(128),
  fileSize: z.number().int().positive(),
  captureType: z.string().max(64).optional(),
  videoTier: z.enum(["short", "medium", "long"]).optional(),
  durationSeconds: z.number().optional(),
  caseNumber: z.string().max(64).optional().nullable(),
  incidentId: z.string().max(128).optional(),
  segmentIndex: z.number().int().min(0).optional(),
  parentEvidenceGroupId: z.string().uuid().optional(),
});

export const completeUploadRequestSchema = z.object({
  storageKey: z.string().min(1),
  evidenceId: z.string().uuid().optional(),
  incidentId: z.string().max(128).optional(),
  parentEvidenceGroupId: z.string().uuid().optional(),
  segmentIndex: z.number().int().min(0).optional(),
  caseNumber: z.string().max(64).optional().nullable(),
  type: z.enum(["image", "video", "other"]),
  captureType: z.string().max(64),
  videoTier: z.enum(["short", "medium", "long"]).optional(),
  officerName: z.string().max(256).optional(),
  officerBadgeNumber: z.string().max(64).optional(),
  officerDepartment: z.string().max(128).optional(),
  officerCallsign: z.string().max(64).optional(),
  playerServerId: z.number().int().optional(),
  gameLicenseIdentifier: z.string().max(128).optional(),
  timestampUtc: z.string().min(1).refine((s) => !Number.isNaN(Date.parse(s)), "Invalid timestamp"),
  uploadedAt: z.string().optional(),
  fileName: z.string().max(512),
  mimeType: z.string().max(128),
  fileSize: z.number().int().nonnegative(),
  durationSeconds: z.number().optional(),
  resolution: z.string().max(32).optional(),
  bitrateKbps: z.number().int().optional(),
  codec: z.string().max(32).optional(),
  sha256: z.string().length(64).optional(),
  locationX: z.number().optional(),
  locationY: z.number().optional(),
  locationZ: z.number().optional(),
  heading: z.number().optional(),
  streetName: z.string().max(256).optional(),
  weaponName: z.string().max(128).optional(),
  activationSource: z
    .enum(["manual_keybind", "manual_command", "auto_taser", "auto_firearm"])
    .optional(),
  wasAutoActivated: z.boolean().optional(),
  autoActivationReason: z.string().max(256).optional(),
  triggerDetectedAtUtc: z
    .string()
    .optional()
    .refine((s) => s == null || !Number.isNaN(Date.parse(s)), "Invalid trigger time"),
  preEventEvidenceAttached: z.boolean().optional(),
  sleepingModeAtCapture: z.boolean().optional(),
  equippedStateAtCapture: z.boolean().optional(),
  soundPlayedOnActivation: z.boolean().optional(),
});

export const fivemUploadUrlSchema = uploadUrlRequestSchema.extend({
  officerDiscordId: z.string().min(1).max(32),
  officerName: z.string().max(256).optional(),
  officerBadgeNumber: z.string().max(64).optional(),
  officerDepartment: z.string().max(128).optional(),
  officerCallsign: z.string().max(64).optional(),
  departmentStorageKey: z.string().max(64).optional(),
});

export const fivemCompleteSchema = completeUploadRequestSchema.extend({
  officerDiscordId: z.string().min(1).max(32),
});

export const patchRoleSchema = z.object({
  globalRole: globalRoleZ,
});

export const retentionSettingsPatchSchema = z.record(z.string(), z.unknown());

export const videoPolicyPatchSchema = z.record(z.string(), z.unknown());

export const noteSchema = z.object({
  note: z.string().min(1).max(8000),
});

export const tagSchema = z.object({
  tag: z.string().min(1).max(128),
});

export const caseNumberSchema = z.object({
  caseNumber: z.string().max(64).nullable(),
});
