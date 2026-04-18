import cron from "node-cron";
import { runRetentionDeletionBatch } from "./retentionBatch";

export function startDeletionWorker(): void {
  cron.schedule("*/2 * * * *", async () => {
    try {
      await runRetentionDeletionBatch();
    } catch (e) {
      console.error("[deletionWorker]", e);
    }
  });
}
