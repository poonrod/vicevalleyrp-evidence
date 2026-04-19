import { randomBytes } from "crypto";
import { Router } from "express";
import { z } from "zod";
import {
  uploadUrlRequestSchema,
  completeUploadRequestSchema,
  noteSchema,
  tagSchema,
  caseNumberSchema,
} from "@vicevalley/shared";
import { prisma } from "../lib/prisma";
import { loadSessionUser, requireAuth, requireMinRole } from "../middleware/sessionUser";
import {
  issueUploadUrlForUser,
  completeEvidenceForUser,
} from "../modules/evidence/service";
import { createStorageProvider } from "../modules/storage/factory";
import { env } from "../config/env";
import { loadRetentionSettings } from "../modules/retention/loadSettings";
import { computeRetentionClass, computeEvidenceScheduledDeletion } from "../modules/retention/compute";
import { isStrictEvidencePermissions } from "../lib/systemFlags";
import type { EvidenceItem, User } from "@prisma/client";

export const evidenceRouter = Router();

function canManagePublicShare(user: User, ev: EvidenceItem): boolean {
  if (ev.officerDiscordId === user.discordId) return true;
  const order = ["viewer", "officer", "evidence_tech", "command_staff", "super_admin"] as const;
  const idx = order.indexOf(user.globalRole as (typeof order)[number]);
  return idx >= order.indexOf("evidence_tech");
}
evidenceRouter.use(loadSessionUser);

evidenceRouter.post("/upload-url", requireAuth, async (req, res) => {
  try {
    const body = uploadUrlRequestSchema.parse(req.body);
    const result = await issueUploadUrlForUser(req.currentUser!, body);
    res.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Bad request";
    try {
      await prisma.failedUploadLog.create({
        data: {
          source: "portal_upload_url",
          officerDiscordId: req.currentUser?.discordId ?? null,
          errorMessage: msg,
          payload: req.body as object,
        },
      });
    } catch {
      /* ignore if table missing during migration */
    }
    res.status(400).json({ error: msg });
  }
});

evidenceRouter.post("/complete", requireAuth, async (req, res) => {
  try {
    const body = completeUploadRequestSchema.parse(req.body);
    const ev = await completeEvidenceForUser(req.currentUser!, body);
    res.json({ evidence: ev });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Bad request";
    try {
      await prisma.failedUploadLog.create({
        data: {
          source: "portal_complete",
          officerDiscordId: req.currentUser?.discordId ?? null,
          errorMessage: msg,
          payload: req.body as object,
        },
      });
    } catch {
      /* ignore if table missing during migration */
    }
    res.status(400).json({ error: msg });
  }
});

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().optional(),
  caseNumber: z.string().optional(),
  officerDiscordId: z.string().optional(),
  captureType: z.string().optional(),
  retentionClass: z.string().optional(),
  videoTier: z.string().optional(),
});

evidenceRouter.get("/", requireAuth, async (req, res) => {
  const q = listQuery.parse(req.query);
  const where: Record<string, unknown> = { isDeleted: false };
  const strict = await isStrictEvidencePermissions();
  const role = req.currentUser!.globalRole;
  if (strict && (role === "officer" || role === "viewer")) {
    where.officerDiscordId = req.currentUser!.discordId;
  } else if (q.officerDiscordId) {
    where.officerDiscordId = q.officerDiscordId;
  }
  if (q.caseNumber) where.caseNumber = q.caseNumber;
  if (q.captureType) where.captureType = q.captureType;
  if (q.retentionClass) where.retentionClass = q.retentionClass;
  if (q.videoTier) where.videoTier = q.videoTier;
  if (q.q) {
    where.OR = [
      { fileName: { contains: q.q } },
      { incidentBusinessId: { contains: q.q } },
      { officerName: { contains: q.q } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.evidenceItem.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: { tags: true, notes: true },
    }),
    prisma.evidenceItem.count({ where }),
  ]);
  res.json({ items, total, page: q.page, pageSize: q.pageSize });
});

evidenceRouter.get("/:id/download-url", requireAuth, async (req, res) => {
  const ev = await prisma.evidenceItem.findFirst({
    where: { id: String(req.params.id), isDeleted: false },
  });
  if (!ev) return res.status(404).json({ error: "Not found" });

  const storage = createStorageProvider();
  const url = await storage.createPresignedDownloadUrl({
    key: ev.storageKey,
    expiresSeconds: env.PRESIGNED_URL_EXPIRES_SECONDS,
  });
  await prisma.accessLog.create({
    data: {
      evidenceId: ev.id,
      userId: req.currentUser?.id,
      action: "download_url",
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    },
  });
  res.json(url);
});

evidenceRouter.get("/:id/shares", requireAuth, async (req, res) => {
  const ev = await prisma.evidenceItem.findFirst({
    where: { id: String(req.params.id), isDeleted: false },
  });
  if (!ev) return res.status(404).json({ error: "Not found" });
  if (!canManagePublicShare(req.currentUser!, ev)) return res.status(403).json({ error: "Forbidden" });
  const shares = await prisma.evidenceShare.findMany({
    where: { evidenceId: ev.id, revokedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, token: true, expiresAt: true, createdAt: true },
  });
  res.json({ shares });
});

evidenceRouter.post("/:id/share", requireAuth, async (req, res) => {
  const body = z
    .object({
      neverExpires: z.boolean(),
      expiresAt: z.string().optional(),
    })
    .parse(req.body);

  const ev = await prisma.evidenceItem.findFirst({
    where: { id: String(req.params.id), isDeleted: false },
  });
  if (!ev) return res.status(404).json({ error: "Not found" });
  if (!canManagePublicShare(req.currentUser!, ev)) return res.status(403).json({ error: "Forbidden" });
  if (!ev.mimeType.startsWith("video/")) {
    return res.status(400).json({ error: "Only video evidence can have a public watch link" });
  }

  let expiresAt: Date | null = null;
  if (!body.neverExpires) {
    if (!body.expiresAt) return res.status(400).json({ error: "expiresAt is required unless neverExpires is true" });
    const d = new Date(body.expiresAt);
    if (Number.isNaN(d.getTime())) return res.status(400).json({ error: "Invalid expiresAt" });
    if (d.getTime() <= Date.now()) return res.status(400).json({ error: "expiresAt must be in the future" });
    expiresAt = d;
  }

  const token = randomBytes(24).toString("hex");
  const share = await prisma.evidenceShare.create({
    data: {
      evidenceId: ev.id,
      token,
      expiresAt,
      createdByUserId: req.currentUser!.id,
    },
  });
  await prisma.chainOfCustodyEntry.create({
    data: {
      evidenceId: ev.id,
      actorUserId: req.currentUser!.id,
      action: "share_link_created",
      details: JSON.stringify({ shareId: share.id, expiresAt: expiresAt?.toISOString() ?? null }),
    },
  });
  res.json({ share });
});

evidenceRouter.delete("/:id/share/:shareId", requireAuth, async (req, res) => {
  const ev = await prisma.evidenceItem.findFirst({
    where: { id: String(req.params.id), isDeleted: false },
  });
  if (!ev) return res.status(404).json({ error: "Not found" });
  if (!canManagePublicShare(req.currentUser!, ev)) return res.status(403).json({ error: "Forbidden" });

  const share = await prisma.evidenceShare.findFirst({
    where: { id: String(req.params.shareId), evidenceId: ev.id, revokedAt: null },
  });
  if (!share) return res.status(404).json({ error: "Not found" });

  await prisma.evidenceShare.update({
    where: { id: share.id },
    data: { revokedAt: new Date() },
  });
  await prisma.chainOfCustodyEntry.create({
    data: {
      evidenceId: ev.id,
      actorUserId: req.currentUser!.id,
      action: "share_link_revoked",
      details: JSON.stringify({ shareId: share.id }),
    },
  });
  res.json({ ok: true });
});

evidenceRouter.get("/:id/audit", requireAuth, async (req, res) => {
  const entries = await prisma.chainOfCustodyEntry.findMany({
    where: { evidenceId: String(req.params.id) },
    orderBy: { createdAt: "desc" },
  });
  res.json({ entries });
});

evidenceRouter.get("/:id", requireAuth, async (req, res) => {
  const ev = await prisma.evidenceItem.findFirst({
    where: { id: String(req.params.id), isDeleted: false },
    include: { tags: true, notes: true, chainEntries: { orderBy: { createdAt: "asc" } } },
  });
  if (!ev) return res.status(404).json({ error: "Not found" });

  await prisma.accessLog.create({
    data: {
      evidenceId: ev.id,
      userId: req.currentUser?.id,
      action: "view",
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    },
  });
  res.json({ evidence: ev });
});

evidenceRouter.post("/:id/notes", requireAuth, async (req, res) => {
  const body = noteSchema.parse(req.body);
  const ev = await prisma.evidenceItem.findFirst({ where: { id: String(req.params.id), isDeleted: false } });
  if (!ev) return res.status(404).json({ error: "Not found" });

  const note = await prisma.evidenceNote.create({
    data: {
      evidenceId: ev.id,
      authorUserId: req.currentUser!.id,
      note: body.note,
    },
  });

  const settings = await loadRetentionSettings();
  const full = await prisma.evidenceItem.findUnique({
    where: { id: ev.id },
    include: { tags: true, notes: true },
  });
  if (full) {
    const rc = computeRetentionClass(
      {
        caseNumber: full.caseNumber,
        legalHold: full.legalHold,
        isArchived: full.isArchived,
        archiveStatus: full.archiveStatus,
        videoTier: full.videoTier,
        retentionClass: full.retentionClass,
        tagCount: full.tags.length,
        noteCount: full.notes.length,
      },
      settings
    );
    const schedAnchor = full.uploadedAt ?? full.createdAt;
    const sched = computeEvidenceScheduledDeletion(schedAnchor, rc, settings, {
      evidenceType: full.type,
      caseNumber: full.caseNumber,
    });
    await prisma.evidenceItem.update({
      where: { id: ev.id },
      data: { retentionClass: rc, scheduledDeletionAt: sched, retentionUntil: sched },
    });
  }

  await prisma.chainOfCustodyEntry.create({
    data: {
      evidenceId: ev.id,
      actorUserId: req.currentUser!.id,
      action: "note_added",
      details: note.note.slice(0, 500),
    },
  });
  res.json({ note });
});

evidenceRouter.post("/:id/tags", requireAuth, async (req, res) => {
  const body = tagSchema.parse(req.body);
  const ev = await prisma.evidenceItem.findFirst({ where: { id: String(req.params.id), isDeleted: false } });
  if (!ev) return res.status(404).json({ error: "Not found" });

  const tag = await prisma.evidenceTag.upsert({
    where: { evidenceId_tag: { evidenceId: ev.id, tag: body.tag } },
    create: { evidenceId: ev.id, tag: body.tag },
    update: {},
  });

  const settings = await loadRetentionSettings();
  const full = await prisma.evidenceItem.findUnique({
    where: { id: ev.id },
    include: { tags: true, notes: true },
  });
  if (full) {
    const rc = computeRetentionClass(
      {
        caseNumber: full.caseNumber,
        legalHold: full.legalHold,
        isArchived: full.isArchived,
        archiveStatus: full.archiveStatus,
        videoTier: full.videoTier,
        retentionClass: full.retentionClass,
        tagCount: full.tags.length,
        noteCount: full.notes.length,
      },
      settings
    );
    const schedAnchor = full.uploadedAt ?? full.createdAt;
    const sched = computeEvidenceScheduledDeletion(schedAnchor, rc, settings, {
      evidenceType: full.type,
      caseNumber: full.caseNumber,
    });
    await prisma.evidenceItem.update({
      where: { id: ev.id },
      data: { retentionClass: rc, scheduledDeletionAt: sched, retentionUntil: sched },
    });
  }

  await prisma.chainOfCustodyEntry.create({
    data: {
      evidenceId: ev.id,
      actorUserId: req.currentUser!.id,
      action: "tag_added",
      details: body.tag,
    },
  });
  res.json({ tag });
});

evidenceRouter.patch("/:id/case-number", requireMinRole("evidence_tech"), async (req, res) => {
  const body = caseNumberSchema.parse(req.body);
  const ev = await prisma.evidenceItem.findFirst({ where: { id: String(req.params.id), isDeleted: false } });
  if (!ev) return res.status(404).json({ error: "Not found" });
  const prev = ev.caseNumber;
  const updated = await prisma.evidenceItem.update({
    where: { id: ev.id },
    data: { caseNumber: body.caseNumber },
    include: { tags: true, notes: true },
  });
  const settings = await loadRetentionSettings();
  const rc = computeRetentionClass(
    {
      caseNumber: updated.caseNumber,
      legalHold: updated.legalHold,
      isArchived: updated.isArchived,
      archiveStatus: updated.archiveStatus,
      videoTier: updated.videoTier,
      retentionClass: updated.retentionClass,
      tagCount: updated.tags.length,
      noteCount: updated.notes.length,
    },
    settings
  );
  const schedAnchor = updated.uploadedAt ?? updated.createdAt;
  const sched = computeEvidenceScheduledDeletion(schedAnchor, rc, settings, {
    evidenceType: updated.type,
    caseNumber: updated.caseNumber,
  });
  await prisma.evidenceItem.update({
    where: { id: ev.id },
    data: { retentionClass: rc, scheduledDeletionAt: sched, retentionUntil: sched },
  });

  await prisma.chainOfCustodyEntry.create({
    data: {
      evidenceId: ev.id,
      actorUserId: req.currentUser!.id,
      action: "case_number_changed",
      details: JSON.stringify({ from: prev, to: body.caseNumber }),
    },
  });
  res.json({ evidence: updated });
});

evidenceRouter.post("/:id/archive", requireMinRole("evidence_tech"), async (req, res) => {
  const ev = await prisma.evidenceItem.update({
    where: { id: String(req.params.id) },
    data: { isArchived: true, archiveStatus: "archived" },
  });
  await prisma.chainOfCustodyEntry.create({
    data: {
      evidenceId: ev.id,
      actorUserId: req.currentUser!.id,
      action: "archived",
    },
  });
  res.json({ evidence: ev });
});

evidenceRouter.post("/:id/unarchive", requireMinRole("evidence_tech"), async (req, res) => {
  const ev = await prisma.evidenceItem.update({
    where: { id: String(req.params.id) },
    data: { isArchived: false, archiveStatus: "none" },
  });
  await prisma.chainOfCustodyEntry.create({
    data: {
      evidenceId: ev.id,
      actorUserId: req.currentUser!.id,
      action: "unarchived",
    },
  });
  res.json({ evidence: ev });
});

evidenceRouter.post("/:id/legal-hold", requireMinRole("command_staff"), async (req, res) => {
  const on = z.object({ enabled: z.boolean() }).parse(req.body).enabled;
  const ev = await prisma.evidenceItem.update({
    where: { id: String(req.params.id) },
    data: { legalHold: on, scheduledDeletionAt: on ? null : undefined },
  });
  await prisma.chainOfCustodyEntry.create({
    data: {
      evidenceId: ev.id,
      actorUserId: req.currentUser!.id,
      action: on ? "legal_hold_on" : "legal_hold_off",
    },
  });
  res.json({ evidence: ev });
});

evidenceRouter.delete("/:id", requireMinRole("evidence_tech"), async (req, res) => {
  const ev = await prisma.evidenceItem.findFirst({ where: { id: String(req.params.id) } });
  if (!ev) return res.status(404).json({ error: "Not found" });
  const storage = createStorageProvider();
  await storage.deleteObject(ev.storageKey);
  await prisma.evidenceItem.update({
    where: { id: ev.id },
    data: {
      isDeleted: true,
      deletedAt: new Date(),
      deletedByUserId: req.currentUser!.id,
      deletionReason: "manual_admin",
    },
  });
  await prisma.chainOfCustodyEntry.create({
    data: {
      evidenceId: ev.id,
      actorUserId: req.currentUser!.id,
      action: "manual_delete",
    },
  });
  res.json({ ok: true });
});
