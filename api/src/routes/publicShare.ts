import { Router } from "express";
import { prisma } from "../lib/prisma";
import { createStorageProvider } from "../modules/storage/factory";
import { env } from "../config/env";

/** Unauthenticated: resolve a share token to a short-lived media URL. */
export const publicShareRouter = Router();

publicShareRouter.get("/share/:token", async (req, res) => {
  const token = String(req.params.token || "").trim();
  if (token.length < 16) return res.status(400).json({ error: "Invalid token" });

  const share = await prisma.evidenceShare.findFirst({
    where: { token, revokedAt: null },
    include: { evidence: true },
  });
  if (!share || share.evidence.isDeleted) {
    return res.status(404).json({ error: "Not found" });
  }
  if (share.expiresAt && share.expiresAt.getTime() < Date.now()) {
    return res.status(410).json({ error: "This link has expired" });
  }

  const storage = createStorageProvider();
  const ttl = Math.min(3600, Math.max(60, env.PRESIGNED_URL_EXPIRES_SECONDS));
  const signed = await storage.createPresignedDownloadUrl({
    key: share.evidence.storageKey,
    expiresSeconds: ttl,
  });

  res.json({
    fileName: share.evidence.fileName,
    mimeType: share.evidence.mimeType,
    streamUrl: signed.url,
    expiresInSeconds: signed.expiresInSeconds,
    linkExpiresAt: share.expiresAt,
  });
});
