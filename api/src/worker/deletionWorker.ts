import cron from "node-cron";
import { prisma } from "../lib/prisma";
import { createStorageProvider } from "../modules/storage/factory";
import { loadRetentionSettings } from "../modules/retention/loadSettings";

export function startDeletionWorker(): void {
  cron.schedule("*/2 * * * *", async () => {
    try {
      const settings = await loadRetentionSettings();
      if (!settings.deleteWorkerEnabled || !settings.autoDeleteEnabled) return;

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

      for (const e of batch) {
        if (e.manualRetainUntil && e.manualRetainUntil > now) continue;
        if (e.legalHold) continue;

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
      }
    } catch (e) {
      console.error("[deletionWorker]", e);
    }
  });
}
