import { prisma } from "../lib/prisma";
import { createStorageProvider } from "../modules/storage/factory";
import { loadRetentionSettings } from "../modules/retention/loadSettings";
import { isRetentionGloballyEnabled } from "../lib/systemFlags";

/**
 * One cron tick of retention deletion (storage + DB). Used by the scheduled worker
 * and the Developer Panel “run retention now” action.
 */
export async function runRetentionDeletionBatch(): Promise<{
  processed: number;
  softDeleted: number;
  hardDeleted: number;
  skipped: number;
}> {
  const settings = await loadRetentionSettings();
  const retentionOn = await isRetentionGloballyEnabled();
  if (!retentionOn || !settings.deleteWorkerEnabled || !settings.autoDeleteEnabled) {
    return { processed: 0, softDeleted: 0, hardDeleted: 0, skipped: 0 };
  }

  const now = new Date();
  const batch = await prisma.evidenceItem.findMany({
    where: {
      isDeleted: false,
      legalHold: false,
      scheduledDeletionAt: { lte: now },
    },
    take: 50,
    include: { tags: true, notes: true },
  });

  const storage = createStorageProvider();
  let softDeleted = 0;
  let hardDeleted = 0;
  let skipped = 0;

  for (const e of batch) {
    if (e.manualRetainUntil && e.manualRetainUntil > now) {
      skipped++;
      continue;
    }
    if (e.legalHold) {
      skipped++;
      continue;
    }

    if (settings.useSoftDeleteBeforeHardDelete && !e.softDeletedAt) {
      const grace = new Date(now);
      grace.setUTCDate(grace.getUTCDate() + settings.softDeleteGraceDays);
      await prisma.evidenceItem.update({
        where: { id: e.id },
        data: {
          softDeletedAt: now,
          scheduledDeletionAt: grace,
          deletionReason: "retention_soft",
        },
      });
      await prisma.chainOfCustodyEntry.create({
        data: {
          evidenceId: e.id,
          action: "soft_delete_scheduled",
          details: JSON.stringify({ at: now.toISOString() }),
        },
      });
      softDeleted++;
      continue;
    }

    try {
      await storage.deleteObject(e.storageKey);
    } catch (err) {
      await prisma.adminAuditLog.create({
        data: {
          category: "deletion",
          action: "storage_delete_failed",
          details: { evidenceId: e.id, error: String(err) } as object,
        },
      });
      skipped++;
      continue;
    }

    await prisma.evidenceItem.update({
      where: { id: e.id },
      data: {
        isDeleted: true,
        deletedAt: now,
        deletionReason: "retention",
        retentionClass: "deleted_tombstone",
      },
    });
    await prisma.chainOfCustodyEntry.create({
      data: {
        evidenceId: e.id,
        action: "hard_deleted",
        details: JSON.stringify({ at: now.toISOString() }),
      },
    });
    hardDeleted++;
  }

  return {
    processed: batch.length,
    softDeleted,
    hardDeleted,
    skipped,
  };
}
