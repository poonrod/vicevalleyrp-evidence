import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { loadSessionUser, requireAuth } from "../middleware/sessionUser";
import { requireDeveloper } from "../middleware/developer";
import { logDeveloperAction } from "../lib/developerAudit";
import {
  getSystemFlags,
  setSystemFlag,
  SYSTEM_FLAG_KEYS,
  type SystemFlagKey,
  invalidateSystemFlagsCache,
  isVerboseHttpLogging,
} from "../lib/systemFlags";
import { createStorageProvider } from "../modules/storage/factory";
import { loadRetentionSettings } from "../modules/retention/loadSettings";
import { runRetentionDeletionBatch } from "../worker/retentionBatch";
import { uploadUrlRequestSchema, completeUploadRequestSchema, caseNumberSchema } from "@vicevalley/shared";
import { computeRetentionClass, computeEvidenceScheduledDeletion } from "../modules/retention/compute";

const developerLimiter = rateLimit({
  windowMs: 60_000,
  max: 80,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.sessionID ? `dev:${req.sessionID}` : `devip:${req.ip ?? "unknown"}`),
});

const bulkFiltersSchema = z.object({
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  officerDiscordId: z.string().optional(),
  caseNumber: z.string().optional(),
  unassignedOnly: z.boolean().optional(),
  videoOnly: z.boolean().optional(),
});

export const developerRouter = Router();
developerRouter.use(developerLimiter);
developerRouter.use(loadSessionUser);
developerRouter.use(requireAuth);
developerRouter.use(requireDeveloper);

developerRouter.use(async (req, _res, next) => {
  try {
    if (await isVerboseHttpLogging()) {
      console.log("[developer-http]", req.method, req.originalUrl, req.currentUser?.discordId, req.ip);
    }
  } catch {
    /* ignore */
  }
  next();
});

developerRouter.get("/status", async (req, res) => {
  await logDeveloperAction(req, "developer.status", {});
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (e) {
    return res.status(500).json({ ok: false, database: "error", error: String(e) });
  }
  let storageOk = false;
  let storageDetail: string | undefined;
  try {
    const storage = createStorageProvider();
    if (storage.listObjectKeys) {
      await storage.listObjectKeys({ prefix: "", maxKeys: 1 });
      storageOk = true;
    } else {
      storageDetail = "listObjectKeys not available";
    }
  } catch (e) {
    storageDetail = String(e);
  }
  res.json({
    ok: true,
    database: "connected",
    storage: storageOk ? "reachable" : "check_failed",
    storageDetail,
    timestamp: new Date().toISOString(),
  });
});

developerRouter.get("/flags", async (req, res) => {
  await logDeveloperAction(req, "developer.flags.read", {});
  const flags = await getSystemFlags();
  res.json({ flags });
});

developerRouter.patch("/flags", async (req, res) => {
  const body = z.record(z.boolean()).parse(req.body);
  for (const k of Object.keys(body)) {
    if (!SYSTEM_FLAG_KEYS.includes(k as SystemFlagKey)) {
      return res.status(400).json({ error: `Unknown flag: ${k}` });
    }
  }
  for (const [k, v] of Object.entries(body)) {
    await setSystemFlag(k as SystemFlagKey, v);
  }
  invalidateSystemFlagsCache();
  await logDeveloperAction(req, "developer.flags.patch", body as Record<string, unknown>);
  res.json({ ok: true, flags: await getSystemFlags() });
});

developerRouter.get("/audit-logs", async (req, res) => {
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));
  await logDeveloperAction(req, "developer.audit_logs.read", { limit });
  const rows = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  res.json({ items: rows });
});

developerRouter.get("/failed-uploads", async (req, res) => {
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  await logDeveloperAction(req, "developer.failed_uploads.read", { limit });
  const rows = await prisma.failedUploadLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  res.json({ items: rows });
});

developerRouter.get("/retention/status", async (req, res) => {
  await logDeveloperAction(req, "developer.retention.status", {});
  const [retention, flags] = await Promise.all([loadRetentionSettings(), getSystemFlags()]);
  res.json({ retention, flags });
});

developerRouter.post("/retention/run-once", async (req, res) => {
  await logDeveloperAction(req, "developer.retention.run_once", {});
  const summary = await runRetentionDeletionBatch();
  res.json({ ok: true, summary });
});

developerRouter.post("/tests/db", async (req, res) => {
  await logDeveloperAction(req, "developer.test.db", {});
  const t0 = Date.now();
  await prisma.$queryRaw`SELECT 1 as ok`;
  res.json({ ok: true, latencyMs: Date.now() - t0 });
});

developerRouter.post("/tests/storage", async (req, res) => {
  await logDeveloperAction(req, "developer.test.storage", {});
  const storage = createStorageProvider();
  if (!storage.listObjectKeys) {
    return res.status(501).json({ ok: false, error: "Storage provider does not support list" });
  }
  const listed = await storage.listObjectKeys({ prefix: "", maxKeys: 5 });
  res.json({ ok: true, sampleKeys: listed.keys, truncated: !!listed.nextContinuationToken });
});

developerRouter.post("/tests/upload-simulate", async (req, res) => {
  await logDeveloperAction(req, "developer.test.upload_simulate", { body: req.body });
  const parsed = uploadUrlRequestSchema.parse(req.body);
  res.json({
    ok: true,
    dryRun: true,
    message: "Validated upload-url payload; no presigned URL issued and nothing was stored.",
    parsed: { ...parsed, fileName: parsed.fileName, mimeType: parsed.mimeType, fileSize: parsed.fileSize },
  });
});

developerRouter.post("/tests/metadata-save", async (req, res) => {
  await logDeveloperAction(req, "developer.test.metadata_save", {});
  const parsed = completeUploadRequestSchema.parse(req.body);
  res.json({
    ok: true,
    dryRun: true,
    message: "Parsed complete-metadata payload; no database write.",
    parsedSummary: {
      storageKey: parsed.storageKey,
      mimeType: parsed.mimeType,
      fileSize: parsed.fileSize,
      captureType: parsed.captureType,
    },
  });
});

developerRouter.post("/tests/case-number", async (req, res) => {
  await logDeveloperAction(req, "developer.test.case_number", req.body as Record<string, unknown>);
  const body = z.object({ caseNumber: z.string().nullable().optional() }).parse(req.body);
  const cn = caseNumberSchema.parse({ caseNumber: body.caseNumber ?? null });
  const where: Prisma.EvidenceItemWhereInput = { isDeleted: false };
  if (cn.caseNumber === null || cn.caseNumber === "") {
    where.OR = [{ caseNumber: null }, { caseNumber: "" }];
  } else {
    where.caseNumber = cn.caseNumber;
  }
  const count = await prisma.evidenceItem.count({ where });
  res.json({ ok: true, caseNumber: cn.caseNumber, matchingEvidenceCount: count });
});

developerRouter.post("/maintenance/orphan-storage-scan", async (req, res) => {
  const maxList = Math.min(2000, Math.max(10, Number((req.body as { maxList?: number })?.maxList) || 500));
  await logDeveloperAction(req, "developer.maintenance.orphan_storage_scan", { maxList });
  const storage = createStorageProvider();
  if (!storage.listObjectKeys) {
    return res.status(501).json({ error: "Listing not supported" });
  }
  const listed = await storage.listObjectKeys({ prefix: "", maxKeys: maxList });
  const keys = listed.keys;
  const dbKeys = await prisma.evidenceItem.findMany({
    where: { isDeleted: false, storageKey: { in: keys } },
    select: { storageKey: true },
  });
  const have = new Set(dbKeys.map((r) => r.storageKey));
  const orphanKeys = keys.filter((k) => !have.has(k));
  res.json({
    ok: true,
    listedCount: keys.length,
    matchedInDb: dbKeys.length,
    orphanObjectCount: orphanKeys.length,
    sampleOrphanKeys: orphanKeys.slice(0, 25),
    note: "Orphan keys are in storage but not tied to active evidence rows in this sample.",
  });
});

developerRouter.post("/maintenance/orphan-db-scan", async (req, res) => {
  const sample = Math.min(300, Math.max(10, Number((req.body as { sample?: number })?.sample) || 120));
  await logDeveloperAction(req, "developer.maintenance.orphan_db_scan", { sample });
  const storage = createStorageProvider();
  const rows = await prisma.evidenceItem.findMany({
    where: { isDeleted: false },
    select: { id: true, storageKey: true },
    take: sample,
    orderBy: { createdAt: "desc" },
  });
  let missingInStorage = 0;
  const samples: string[] = [];
  for (const r of rows) {
    const ok = await storage.objectExists(r.storageKey);
    if (!ok) {
      missingInStorage++;
      if (samples.length < 20) samples.push(r.id);
    }
  }
  res.json({
    ok: true,
    scanned: rows.length,
    missingInStorage,
    sampleEvidenceIdsMissingObject: samples,
  });
});

developerRouter.post("/maintenance/repair-scheduling", async (req, res) => {
  const limit = Math.min(100, Math.max(1, Number((req.body as { limit?: number })?.limit) || 40));
  await logDeveloperAction(req, "developer.maintenance.repair_scheduling", { limit });
  const settings = await loadRetentionSettings();
  const rows = await prisma.evidenceItem.findMany({
    where: {
      isDeleted: false,
      legalHold: false,
      scheduledDeletionAt: null,
    },
    take: limit,
  });
  let repaired = 0;
  for (const e of rows) {
    const rc = computeRetentionClass(
      {
        caseNumber: e.caseNumber,
        legalHold: e.legalHold,
        isArchived: e.isArchived,
        archiveStatus: e.archiveStatus,
        videoTier: e.videoTier,
        retentionClass: e.retentionClass,
        tagCount: 0,
        noteCount: 0,
      },
      settings
    );
    const sched = computeEvidenceScheduledDeletion(e.timestampUtc, rc, settings, {
      evidenceType: e.type,
      caseNumber: e.caseNumber,
    });
    await prisma.evidenceItem.update({
      where: { id: e.id },
      data: { retentionClass: rc, scheduledDeletionAt: sched, retentionUntil: sched },
    });
    repaired++;
  }
  res.json({ ok: true, repaired });
});

developerRouter.post("/maintenance/rehash", async (req, res) => {
  const limit = Math.min(30, Math.max(1, Number((req.body as { limit?: number })?.limit) || 10));
  await logDeveloperAction(req, "developer.maintenance.rehash", { limit });
  const storage = createStorageProvider();
  if (!storage.computeObjectSha256) {
    return res.status(501).json({ error: "SHA-256 computation not available for this storage driver" });
  }
  const rows = await prisma.evidenceItem.findMany({
    where: { isDeleted: false },
    select: { id: true, storageKey: true, sha256: true },
    take: limit,
    orderBy: { createdAt: "desc" },
  });
  const results: { id: string; previous: string | null; next: string | null }[] = [];
  for (const r of rows) {
    try {
      const hex = await storage.computeObjectSha256!(r.storageKey);
      await prisma.evidenceItem.update({ where: { id: r.id }, data: { sha256: hex } });
      results.push({ id: r.id, previous: r.sha256 ?? null, next: hex });
    } catch (e) {
      results.push({ id: r.id, previous: r.sha256 ?? null, next: null });
    }
  }
  res.json({ ok: true, updated: results.length, results });
});

developerRouter.post("/maintenance/recompress", async (_req, res) => {
  res.status(501).json({
    ok: false,
    error: "not_implemented",
    message: "Server-side transcoding is not deployed on this API. Toggle ENABLE_COMPRESSION for future use.",
  });
});

developerRouter.post("/maintenance/rebuild-thumbnails", async (_req, res) => {
  res.status(501).json({ ok: false, error: "not_implemented", message: "No thumbnail pipeline in this schema." });
});

function buildBulkWhere(filters: z.infer<typeof bulkFiltersSchema>): Prisma.EvidenceItemWhereInput {
  const where: Prisma.EvidenceItemWhereInput = { isDeleted: false };
  if (filters.officerDiscordId) where.officerDiscordId = filters.officerDiscordId;
  if (filters.caseNumber) where.caseNumber = filters.caseNumber;
  if (filters.unassignedOnly) {
    where.AND = [
      { OR: [{ incidentBusinessId: null }, { incidentBusinessId: "" }] },
      { OR: [{ caseNumber: null }, { caseNumber: "" }] },
    ];
  }
  if (filters.videoOnly) {
    where.mimeType = { startsWith: "video/" };
  }
  if (filters.dateFrom || filters.dateTo) {
    const range: Prisma.DateTimeFilter = {};
    if (filters.dateFrom) range.gte = new Date(filters.dateFrom);
    if (filters.dateTo) range.lte = new Date(filters.dateTo);
    where.timestampUtc = range;
  }
  return where;
}

developerRouter.post("/evidence/bulk-delete-preview", async (req, res) => {
  const filters = bulkFiltersSchema.parse(req.body);
  await logDeveloperAction(req, "developer.bulk_delete.preview", filters as Record<string, unknown>);
  const where = buildBulkWhere(filters);
  const total = await prisma.evidenceItem.count({ where });
  const sample = await prisma.evidenceItem.findMany({
    where,
    select: { id: true, fileName: true, officerDiscordId: true, caseNumber: true, timestampUtc: true },
    take: 40,
    orderBy: { timestampUtc: "desc" },
  });
  res.json({ ok: true, dryRun: true, total, sample });
});

developerRouter.post("/evidence/bulk-delete-execute", async (req, res) => {
  const body = z
    .object({
      filters: bulkFiltersSchema,
      confirm: z.literal("CONFIRM"),
    })
    .parse(req.body);

  const where = buildBulkWhere(body.filters);
  const before = await prisma.evidenceItem.count({ where });
  await logDeveloperAction(req, "developer.bulk_delete.execute.before", {
    ...body.filters,
    matchedCount: before,
  } as Record<string, unknown>);

  if (before === 0) {
    return res.json({ ok: true, deleted: 0, message: "No rows matched." });
  }
  if (before > 500) {
    return res.status(400).json({
      error: "Refusing bulk delete over 500 rows in one request. Narrow filters or run multiple batches.",
      matched: before,
    });
  }

  const storage = createStorageProvider();
  const rows = await prisma.evidenceItem.findMany({ where, select: { id: true, storageKey: true } });
  const now = new Date();
  let deleted = 0;
  let storageDeleteFailures = 0;
  const storageDeleteErrorSamples: string[] = [];
  const pushSample = (line: string) => {
    if (storageDeleteErrorSamples.length < 8) storageDeleteErrorSamples.push(line);
  };
  const batchSize = 25;
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    for (const r of chunk) {
      try {
        await storage.deleteObject(r.storageKey);
      } catch (e) {
        storageDeleteFailures++;
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(
          `[developer.bulk_delete] R2/S3 deleteObject failed key=${JSON.stringify(r.storageKey)}: ${msg}`
        );
        pushSample(`${r.storageKey}: ${msg}`);
        /* still tombstone DB */
      }
      await prisma.evidenceItem.update({
        where: { id: r.id },
        data: {
          isDeleted: true,
          deletedAt: now,
          deletionReason: "developer_bulk",
        },
      });
      await prisma.chainOfCustodyEntry.create({
        data: {
          evidenceId: r.id,
          actorUserId: req.currentUser!.id,
          action: "developer_hard_deleted",
          details: JSON.stringify({ at: now.toISOString() }),
          ipAddress: req.ip ?? null,
        },
      });
      deleted++;
    }
  }

  await logDeveloperAction(req, "developer.bulk_delete.execute.after", {
    deleted,
    matchedBefore: before,
    filters: body.filters,
  } as Record<string, unknown>);

  res.json({
    ok: true,
    deleted,
    matchedBefore: before,
    storageDeleteFailures,
    storageDeleteErrorSamples,
    storageBucket: storage.getBucket(),
    storageKind: storage.kind,
  });
});
