import { Router } from "express";
import { z } from "zod";
import { patchRoleSchema } from "@vicevalley/shared";
import { prisma } from "../lib/prisma";
import { loadSessionUser, requireAuth, requireMinRole } from "../middleware/sessionUser";
import { loadRetentionSettings, mergeRetentionSettings } from "../modules/retention/loadSettings";
import type { RetentionSettings } from "../modules/retention/settings";

export const adminRouter = Router();
adminRouter.use(loadSessionUser);
adminRouter.use(requireAuth);
adminRouter.use(requireMinRole("command_staff"));

adminRouter.get("/users", async (_req, res) => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    include: { officerProfile: true },
  });
  res.json({ users });
});

adminRouter.patch("/users/:id/role", async (req, res) => {
  const body = patchRoleSchema.parse(req.body);
  const user = await prisma.user.update({
    where: { id: String(req.params.id) },
    data: { globalRole: body.globalRole as "super_admin" | "command_staff" | "evidence_tech" | "officer" | "viewer" },
  });
  await prisma.adminAuditLog.create({
    data: {
      actorUserId: req.currentUser!.id,
      category: "rbac",
      action: "role_changed",
      details: { target: user.id, role: body.globalRole } as object,
    },
  });
  res.json({ user });
});

adminRouter.get("/settings/retention", async (_req, res) => {
  const settings = await loadRetentionSettings();
  res.json(settings);
});

adminRouter.patch("/settings/retention", async (req, res) => {
  const partial = req.body as Partial<RetentionSettings>;
  const next = await mergeRetentionSettings(partial);
  await prisma.adminAuditLog.create({
    data: {
      actorUserId: req.currentUser!.id,
      category: "retention",
      action: "settings_updated",
      details: partial as object,
    },
  });
  res.json(next);
});

adminRouter.get("/settings/video-policy", async (_req, res) => {
  const s = await loadRetentionSettings();
  res.json({
    shortClipMaxSeconds: s.shortClipMaxSeconds,
    mediumClipMaxSeconds: s.mediumClipMaxSeconds,
    longVideoMaxSeconds: s.longVideoMaxSeconds,
    maxUploadSizeMB: s.maxUploadSizeMB,
    shortClipResolution: s.shortClipResolution,
    shortClipBitrateKbps: s.shortClipBitrateKbps,
    shortClipFps: s.shortClipFps,
    mediumClipResolution: s.mediumClipResolution,
    mediumClipBitrateKbps: s.mediumClipBitrateKbps,
    mediumClipFps: s.mediumClipFps,
    longVideoResolution: s.longVideoResolution,
    longVideoBitrateKbps: s.longVideoBitrateKbps,
    longVideoFps: s.longVideoFps,
    videoCodec: s.videoCodec,
    enableLongVideoMode: s.enableLongVideoMode,
    requireCaseNumberForLongVideos: s.requireCaseNumberForLongVideos,
    longVideoWithoutCaseAction: s.longVideoWithoutCaseAction,
    enableLongVideoChunking: s.enableLongVideoChunking,
    longVideoChunkSeconds: s.longVideoChunkSeconds,
  });
});

adminRouter.patch("/settings/video-policy", async (req, res) => {
  const partial = req.body as Partial<RetentionSettings>;
  const allowedKeys: (keyof RetentionSettings)[] = [
    "shortClipMaxSeconds",
    "mediumClipMaxSeconds",
    "longVideoMaxSeconds",
    "maxUploadSizeMB",
    "shortClipResolution",
    "shortClipBitrateKbps",
    "shortClipFps",
    "mediumClipResolution",
    "mediumClipBitrateKbps",
    "mediumClipFps",
    "longVideoResolution",
    "longVideoBitrateKbps",
    "longVideoFps",
    "videoCodec",
    "enableLongVideoMode",
    "requireCaseNumberForLongVideos",
    "longVideoWithoutCaseAction",
    "enableLongVideoChunking",
    "longVideoChunkSeconds",
  ];
  const patch: Partial<RetentionSettings> = {};
  for (const k of allowedKeys) {
    if (k in partial) (patch as Record<string, unknown>)[k] = partial[k];
  }
  const next = await mergeRetentionSettings(patch);
  await prisma.adminAuditLog.create({
    data: {
      actorUserId: req.currentUser!.id,
      category: "video_policy",
      action: "settings_updated",
      details: patch as object,
    },
  });
  res.json(next);
});

adminRouter.get("/deletion-queue", async (_req, res) => {
  const now = new Date();
  const items = await prisma.evidenceItem.findMany({
    where: {
      isDeleted: false,
      legalHold: false,
      scheduledDeletionAt: { lte: new Date(now.getTime() + 7 * 86400000) },
    },
    orderBy: { scheduledDeletionAt: "asc" },
    take: 200,
  });
  res.json({ items });
});

adminRouter.post("/evidence/:id/retain", requireMinRole("super_admin"), async (req, res) => {
  const body = z.object({ until: z.string().datetime() }).parse(req.body);
  const until = new Date(body.until);
  const ev = await prisma.evidenceItem.update({
    where: { id: String(req.params.id) },
    data: { manualRetainUntil: until, scheduledDeletionAt: until, legalHold: false },
  });
  await prisma.chainOfCustodyEntry.create({
    data: {
      evidenceId: ev.id,
      actorUserId: req.currentUser!.id,
      action: "manual_retain",
      details: until.toISOString(),
    },
  });
  res.json({ evidence: ev });
});

adminRouter.post("/evidence/:id/release-hold", async (req, res) => {
  const ev = await prisma.evidenceItem.findUnique({ where: { id: String(req.params.id) } });
  if (!ev) return res.status(404).json({ error: "Not found" });
  const settings = await loadRetentionSettings();
  const { computeRetentionClass, computeEvidenceScheduledDeletion } = await import("../modules/retention/compute");
  const full = await prisma.evidenceItem.findUnique({
    where: { id: ev.id },
    include: { tags: true, notes: true },
  });
  if (!full) return res.status(404).json({ error: "Not found" });
  const rc = computeRetentionClass(
    {
      caseNumber: full.caseNumber,
      legalHold: false,
      isArchived: full.isArchived,
      archiveStatus: full.archiveStatus,
      videoTier: full.videoTier,
      retentionClass: full.retentionClass,
      tagCount: full.tags.length,
      noteCount: full.notes.length,
    },
    settings
  );
  const sched = computeEvidenceScheduledDeletion(full.createdAt, rc, settings, {
    evidenceType: full.type,
    caseNumber: full.caseNumber,
  });
  const updated = await prisma.evidenceItem.update({
    where: { id: ev.id },
    data: { legalHold: false, retentionClass: rc, scheduledDeletionAt: sched },
  });
  await prisma.chainOfCustodyEntry.create({
    data: {
      evidenceId: ev.id,
      actorUserId: req.currentUser!.id,
      action: "legal_hold_released",
    },
  });
  res.json({ evidence: updated });
});

adminRouter.post("/evidence/:id/reschedule-deletion", async (req, res) => {
  const body = z.object({ at: z.string().datetime() }).parse(req.body);
  const ev = await prisma.evidenceItem.update({
    where: { id: String(req.params.id) },
    data: { scheduledDeletionAt: new Date(body.at) },
  });
  await prisma.chainOfCustodyEntry.create({
    data: {
      evidenceId: ev.id,
      actorUserId: req.currentUser!.id,
      action: "deletion_rescheduled",
      details: body.at,
    },
  });
  res.json({ evidence: ev });
});
