import fs from "fs";
import { randomUUID } from "crypto";
import { pendingUploadsPath, ensureDirs } from "./paths";
import { logLine } from "./logger";
import type { CompleteEvidenceInput } from "./evidenceClient";
import {
  requestUploadUrl,
  putFileToPresignedUrl,
  completeEvidence,
  sha256File,
} from "./evidenceClient";

export interface PendingUploadItem {
  id: string;
  filePath: string;
  /** ISO time of last failure */
  lastErrorAt?: string;
  lastError?: string;
  attempts: number;
  /** ms epoch */
  nextRetryAt: number;
  /** Stored so we can re-run upload-url with same logical file */
  uploadUrlPayload: Record<string, unknown>;
  completePayload: CompleteEvidenceInput;
}

function readQueue(): PendingUploadItem[] {
  try {
    const p = pendingUploadsPath();
    if (!fs.existsSync(p)) return [];
    const raw = JSON.parse(fs.readFileSync(p, "utf8")) as unknown;
    if (!Array.isArray(raw)) return [];
    return raw as PendingUploadItem[];
  } catch (e) {
    logLine("warn", "pending-uploads read failed", { err: String(e) });
    return [];
  }
}

function writeQueue(items: PendingUploadItem[]): void {
  ensureDirs();
  fs.writeFileSync(pendingUploadsPath(), JSON.stringify(items, null, 2), "utf8");
}

export function enqueuePending(item: Omit<PendingUploadItem, "id" | "attempts" | "nextRetryAt">): void {
  const q = readQueue();
  q.push({
    ...item,
    id: randomUUID(),
    attempts: 0,
    nextRetryAt: Date.now(),
  });
  writeQueue(q);
}

function backoffMs(attempt: number): number {
  const base = Math.min(60 * 60 * 1000, 2000 * 2 ** Math.min(attempt, 16));
  const jitter = Math.floor(Math.random() * 800);
  return base + jitter;
}

export async function processUploadQueueOnce(apiBase: string, apiSecret: string): Promise<void> {
  const q = readQueue();
  if (!q.length) return;
  const now = Date.now();
  const remaining: PendingUploadItem[] = [];

  for (const item of q) {
    if (item.nextRetryAt > now) {
      remaining.push(item);
      continue;
    }
    if (!fs.existsSync(item.filePath)) {
      logLine("warn", "Pending upload file missing, dropping", { id: item.id });
      continue;
    }
    try {
      const presign = await requestUploadUrl(apiBase, apiSecret, item.uploadUrlPayload);
      await putFileToPresignedUrl(presign.url, item.filePath, item.completePayload.mimeType);
      const sha = await sha256File(item.filePath);
      const complete: CompleteEvidenceInput = {
        ...item.completePayload,
        storageKey: presign.storageKey,
        evidenceId: presign.evidenceId,
        fileSize: fs.statSync(item.filePath).size,
        sha256: sha,
      };
      await completeEvidence(apiBase, apiSecret, complete);
      fs.unlinkSync(item.filePath);
      logLine("info", "Queued upload completed", { id: item.id });
    } catch (e) {
      const msg = String((e as Error)?.message || e);
      const attempts = item.attempts + 1;
      const nextRetryAt = Date.now() + backoffMs(attempts);
      logLine("warn", "Queued upload retry scheduled", { id: item.id, attempts, msg });
      remaining.push({
        ...item,
        attempts,
        nextRetryAt,
        lastErrorAt: new Date().toISOString(),
        lastError: msg,
      });
    }
  }

  writeQueue(remaining);
}

export function startUploadQueueWorker(
  getApiBase: () => string,
  getSecret: () => string,
  intervalMs = 30_000
): () => void {
  const tick = () => {
    const apiBase = getApiBase();
    const secret = getSecret();
    if (!secret || !apiBase) return;
    void processUploadQueueOnce(apiBase, secret).catch((e) =>
      logLine("error", "upload queue tick failed", { err: String(e) })
    );
  };
  tick();
  const id = setInterval(tick, intervalMs);
  return () => clearInterval(id);
}
