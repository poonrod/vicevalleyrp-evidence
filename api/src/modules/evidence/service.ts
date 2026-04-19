import type { User } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { env } from "../../config/env";
import { createStorageProvider } from "../storage/factory";
import { evidenceObjectKey, extensionFromFileName, newEvidenceId } from "../storage/paths";
import { loadRetentionSettings } from "../retention/loadSettings";
import { getSystemFlags } from "../../lib/systemFlags";
import { computeRetentionClass, computeEvidenceScheduledDeletion } from "../retention/compute";
import { assertAllowedMime } from "./mime";
import type { z } from "zod";
import { completeUploadRequestSchema } from "@vicevalley/shared";

type CompleteBody = z.infer<typeof completeUploadRequestSchema>;

async function resolveIncidentBusinessId(incidentId?: string): Promise<string | undefined> {
  if (!incidentId) return undefined;
  const inc = await prisma.incident.findUnique({ where: { incidentId } });
  return inc?.incidentId;
}

export type UploadUrlInput = {
  fileName: string;
  mimeType: string;
  fileSize: number;
  captureType?: string;
  videoTier?: "short" | "medium" | "long";
  caseNumber?: string | null;
  incidentId?: string;
  evidenceId?: string;
};

export async function issueUploadUrlForUser(user: User, body: UploadUrlInput) {
  assertAllowedMime(body.mimeType);
  const settings = await loadRetentionSettings();
  const maxBytes = settings.maxUploadSizeMB * 1024 * 1024;
  if (body.fileSize > maxBytes) {
    throw new Error(`File exceeds max upload size (${settings.maxUploadSizeMB} MB)`);
  }

  if (body.videoTier === "long" && settings.enableLongVideoMode && settings.requireCaseNumberForLongVideos) {
    const hasCase = !!(body.caseNumber && body.caseNumber.trim());
    if (!hasCase && settings.longVideoWithoutCaseAction === "reject") {
      throw new Error("Long video uploads require a case number");
    }
  }

  const storage = createStorageProvider();
  const evidenceId = body.evidenceId ?? newEvidenceId();
  const ext = extensionFromFileName(body.fileName) || (body.mimeType.includes("video") ? ".mp4" : ".jpg");
  const officer = await prisma.officerProfile.findUnique({ where: { userId: user.id } });
  const namespace = officer?.storageNamespace ?? "default";
  const key = evidenceObjectKey({
    discordId: user.discordId,
    evidenceId,
    extension: ext,
    incidentId: body.incidentId,
    caseNumber: body.caseNumber,
  });

  const presigned = await storage.createPresignedUploadUrl({
    key,
    contentType: body.mimeType,
    // Omit Content-Length from the signature: browsers may omit or adjust length (encoding,
    // chunked retry); mismatch causes R2/S3 SignatureDoesNotMatch on PUT.
    expiresSeconds: env.PRESIGNED_URL_EXPIRES_SECONDS,
  });

  return {
    url: presigned.url,
    // Historical key — must be the URL string, not the whole presign object (videos/files broke).
    upload: presigned.url,
    evidenceId,
    storageKey: presigned.storageKey,
    storageBucket: presigned.bucket,
    storageNamespace: namespace,
    storageProvider: storage.kind,
    expiresInSeconds: presigned.expiresInSeconds,
  };
}

export async function completeEvidenceForUser(user: User, body: CompleteBody & { officerDiscordId?: string }) {
  if (body.officerDiscordId && body.officerDiscordId !== user.discordId) {
    throw new Error("Discord mismatch");
  }
  assertAllowedMime(body.mimeType);
  const settings = await loadRetentionSettings();
  const maxBytes = settings.maxUploadSizeMB * 1024 * 1024;
  if (body.fileSize > maxBytes) {
    throw new Error("File exceeds max upload size");
  }

  const storage = createStorageProvider();
  const exists = await storage.objectExists(body.storageKey);
  if (!exists) {
    throw new Error("Object not found in storage; upload may have failed");
  }

  const flags = await getSystemFlags();
  if (flags.ENABLE_HASH_CHECK) {
    const mime = (body.mimeType || "").toLowerCase();
    const needsHash = mime.startsWith("video/");
    if (needsHash && (!body.sha256 || !String(body.sha256).trim())) {
      throw new Error("SHA-256 is required for video evidence when ENABLE_HASH_CHECK is enabled");
    }
  }

  const officer = await prisma.officerProfile.findUnique({ where: { userId: user.id } });
  const namespace = officer?.storageNamespace ?? "default";

  const tagCount = 0;
  const noteCount = 0;
  const retentionClass = computeRetentionClass(
    {
      caseNumber: body.caseNumber ?? null,
      legalHold: false,
      isArchived: false,
      archiveStatus: "none",
      videoTier: body.videoTier ?? null,
      retentionClass: "default",
      tagCount,
      noteCount,
    },
    settings
  );

  const scheduled = computeEvidenceScheduledDeletion(new Date(body.timestampUtc), retentionClass, settings, {
    evidenceType: body.type,
    caseNumber: body.caseNumber ?? null,
  });

  const incidentBusinessIdUser = await resolveIncidentBusinessId(body.incidentId);

  const evidence = await prisma.evidenceItem.create({
    data: {
      incidentBusinessId: incidentBusinessIdUser,
      evidenceGroupId: body.parentEvidenceGroupId,
      segmentIndex: body.segmentIndex,
      caseNumber: body.caseNumber,
      type: body.type,
      captureType: body.captureType,
      videoTier: body.videoTier,
      officerName: body.officerName ?? officer?.officerName,
      officerBadgeNumber: body.officerBadgeNumber ?? officer?.badgeNumber,
      officerDepartment: body.officerDepartment ?? officer?.department,
      officerCallsign: body.officerCallsign ?? officer?.callsign,
      officerDiscordId: user.discordId,
      playerServerId: body.playerServerId,
      gameLicenseIdentifier: body.gameLicenseIdentifier,
      timestampUtc: new Date(body.timestampUtc),
      uploadedAt: body.uploadedAt ? new Date(body.uploadedAt) : new Date(),
      storageProvider: storage.kind,
      storageBucket: storage.getBucket(),
      storageNamespace: namespace,
      storageKey: body.storageKey,
      fileName: body.fileName,
      mimeType: body.mimeType,
      fileSize: body.fileSize,
      durationSeconds: body.durationSeconds,
      resolution: body.resolution,
      bitrateKbps: body.bitrateKbps,
      codec: body.codec,
      sha256: body.sha256,
      locationX: body.locationX,
      locationY: body.locationY,
      locationZ: body.locationZ,
      heading: body.heading,
      streetName: body.streetName,
      weaponName: body.weaponName,
      activationSource: body.activationSource,
      wasAutoActivated: body.wasAutoActivated ?? false,
      autoActivationReason: body.autoActivationReason,
      triggerDetectedAtUtc: body.triggerDetectedAtUtc ? new Date(body.triggerDetectedAtUtc) : null,
      preEventEvidenceAttached: body.preEventEvidenceAttached ?? false,
      sleepingModeAtCapture: body.sleepingModeAtCapture ?? false,
      equippedStateAtCapture: body.equippedStateAtCapture ?? true,
      soundPlayedOnActivation: body.soundPlayedOnActivation ?? false,
      retentionClass,
      scheduledDeletionAt: scheduled,
      retentionUntil: scheduled,
    },
  });

  await prisma.chainOfCustodyEntry.create({
    data: {
      evidenceId: evidence.id,
      actorUserId: user.id,
      action: "evidence_created",
      details: JSON.stringify({ source: "portal" }),
    },
  });

  return evidence;
}

export async function issueUploadUrlForFivem(params: {
  officerDiscordId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  incidentId?: string;
  caseNumber?: string | null;
  departmentStorageKey?: string;
  captureType?: string;
  videoTier?: "short" | "medium" | "long";
}) {
  assertAllowedMime(params.mimeType);
  const settings = await loadRetentionSettings();
  const maxBytes = settings.maxUploadSizeMB * 1024 * 1024;
  if (params.fileSize > maxBytes) throw new Error("File too large");

  if (params.videoTier === "long" && settings.enableLongVideoMode && settings.requireCaseNumberForLongVideos) {
    const hasCase = !!(params.caseNumber && params.caseNumber.trim());
    if (!hasCase && settings.longVideoWithoutCaseAction === "reject") {
      throw new Error("Long video requires case number");
    }
  }

  const user = await prisma.user.findUnique({ where: { discordId: params.officerDiscordId } });
  const officer = user
    ? await prisma.officerProfile.findUnique({ where: { userId: user.id } })
    : null;
  const namespace =
    params.departmentStorageKey ||
    officer?.storageNamespace ||
    (user ? `dept-${user.id.slice(0, 8)}` : "default");

  const storage = createStorageProvider();
  const evidenceId = newEvidenceId();
  const ext =
    extensionFromFileName(params.fileName) ||
    (params.mimeType.toLowerCase().includes("webm") ? ".webm" : "") ||
    (params.mimeType.toLowerCase().includes("video") ? ".mp4" : "") ||
    ".jpg";
  const key = evidenceObjectKey({
    discordId: params.officerDiscordId,
    evidenceId,
    extension: ext,
    incidentId: params.incidentId,
    caseNumber: params.caseNumber,
  });

  const presigned = await storage.createPresignedUploadUrl({
    key,
    contentType: params.mimeType,
    // Do not sign Content-Length: JPEG size from screenshot-basic is unknown until
    // capture; a mismatch makes S3/R2 reject the PUT and the client shows "upload failed".
    expiresSeconds: env.PRESIGNED_URL_EXPIRES_SECONDS,
  });

  return {
    ...presigned,
    evidenceId,
    storageNamespace: namespace,
    storageProvider: storage.kind,
  };
}

export async function completeEvidenceForFivem(
  body: CompleteBody & { officerDiscordId: string }
) {
  let u = await prisma.user.findUnique({ where: { discordId: body.officerDiscordId } });
  if (!u) {
    u = await prisma.user.create({
      data: {
        discordId: body.officerDiscordId,
        username: `discord_${body.officerDiscordId}`,
        globalRole: "officer",
      },
    });
    await prisma.officerProfile.create({
      data: { userId: u.id, officerName: body.officerName },
    });
    await prisma.personalBodycamSetting.create({ data: { userId: u.id } });
  }

  assertAllowedMime(body.mimeType);
  const settings = await loadRetentionSettings();
  const storage = createStorageProvider();
  const exists = await storage.objectExists(body.storageKey);
  if (!exists) throw new Error("Upload not finalized in storage");

  const officer = await prisma.officerProfile.findUnique({ where: { userId: u.id } });
  const namespace = officer?.storageNamespace ?? "default";

  const retentionClass = computeRetentionClass(
    {
      caseNumber: body.caseNumber ?? null,
      legalHold: false,
      isArchived: false,
      archiveStatus: "none",
      videoTier: body.videoTier ?? null,
      retentionClass: "default",
      tagCount: 0,
      noteCount: 0,
    },
    settings
  );
  const scheduled = computeEvidenceScheduledDeletion(new Date(body.timestampUtc), retentionClass, settings, {
    evidenceType: body.type,
    caseNumber: body.caseNumber ?? null,
  });

  const incidentBusinessIdFivem = await resolveIncidentBusinessId(body.incidentId);

  const evidence = await prisma.evidenceItem.create({
    data: {
      incidentBusinessId: incidentBusinessIdFivem,
      evidenceGroupId: body.parentEvidenceGroupId,
      segmentIndex: body.segmentIndex,
      caseNumber: body.caseNumber,
      type: body.type,
      captureType: body.captureType,
      videoTier: body.videoTier,
      officerName: body.officerName,
      officerBadgeNumber: body.officerBadgeNumber,
      officerDepartment: body.officerDepartment,
      officerCallsign: body.officerCallsign,
      officerDiscordId: body.officerDiscordId,
      playerServerId: body.playerServerId,
      gameLicenseIdentifier: body.gameLicenseIdentifier,
      timestampUtc: new Date(body.timestampUtc),
      storageProvider: storage.kind,
      storageBucket: storage.getBucket(),
      storageNamespace: namespace,
      storageKey: body.storageKey,
      fileName: body.fileName,
      mimeType: body.mimeType,
      fileSize: body.fileSize,
      durationSeconds: body.durationSeconds,
      resolution: body.resolution,
      bitrateKbps: body.bitrateKbps,
      codec: body.codec,
      sha256: body.sha256,
      locationX: body.locationX,
      locationY: body.locationY,
      locationZ: body.locationZ,
      heading: body.heading,
      streetName: body.streetName,
      weaponName: body.weaponName,
      activationSource: body.activationSource,
      wasAutoActivated: body.wasAutoActivated ?? false,
      autoActivationReason: body.autoActivationReason,
      triggerDetectedAtUtc: body.triggerDetectedAtUtc ? new Date(body.triggerDetectedAtUtc) : null,
      preEventEvidenceAttached: body.preEventEvidenceAttached ?? false,
      sleepingModeAtCapture: body.sleepingModeAtCapture ?? false,
      equippedStateAtCapture: body.equippedStateAtCapture ?? true,
      soundPlayedOnActivation: body.soundPlayedOnActivation ?? false,
      retentionClass,
      scheduledDeletionAt: scheduled,
      retentionUntil: scheduled,
    },
  });

  await prisma.chainOfCustodyEntry.create({
    data: {
      evidenceId: evidence.id,
      action: "evidence_created",
      details: JSON.stringify({ source: "fivem" }),
    },
  });

  return evidence;
}
