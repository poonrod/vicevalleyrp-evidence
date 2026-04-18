import { Router } from "express";
import { fivemUploadUrlSchema, fivemCompleteSchema } from "@vicevalley/shared";
import { requireFivemSecret } from "../middleware/internal";
import { issueUploadUrlForFivem, completeEvidenceForFivem } from "../modules/evidence/service";
import { prisma } from "../lib/prisma";
import { z } from "zod";

async function logFivemUploadFailure(
  source: string,
  officerDiscordId: string | undefined,
  errorMessage: string,
  payload: unknown
): Promise<void> {
  try {
    await prisma.failedUploadLog.create({
      data: {
        source,
        officerDiscordId: officerDiscordId ?? null,
        errorMessage,
        payload: payload as object,
      },
    });
  } catch (e) {
    console.error("[internalFivem] failed_upload_logs insert", e);
  }
}

export const internalFivemRouter = Router();
internalFivemRouter.use(requireFivemSecret);

/** Used by the FiveM resource on start to confirm API URL + secret. */
internalFivemRouter.get("/ping", (_req, res) => {
  res.json({ ok: true });
});

internalFivemRouter.post("/evidence/upload-url", async (req, res) => {
  let body: z.infer<typeof fivemUploadUrlSchema>;
  try {
    body = fivemUploadUrlSchema.parse(req.body);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Bad request";
    const raw = req.body as { officerDiscordId?: string };
    await logFivemUploadFailure("fivem_upload_url", raw?.officerDiscordId, msg, req.body);
    return res.status(400).json({ error: msg });
  }
  try {
    const result = await issueUploadUrlForFivem(body);
    res.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Bad request";
    await logFivemUploadFailure("fivem_upload_url", body.officerDiscordId, msg, req.body);
    res.status(400).json({ error: msg });
  }
});

internalFivemRouter.post("/evidence/complete", async (req, res) => {
  let body: z.infer<typeof fivemCompleteSchema>;
  try {
    body = fivemCompleteSchema.parse(req.body);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Bad request";
    const raw = req.body as { officerDiscordId?: string };
    await logFivemUploadFailure("fivem_complete", raw?.officerDiscordId, msg, req.body);
    return res.status(400).json({ error: msg });
  }
  try {
    const ev = await completeEvidenceForFivem(body);
    res.json({ evidence: ev });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Bad request";
    await logFivemUploadFailure("fivem_complete", body.officerDiscordId, msg, req.body);
    res.status(400).json({ error: msg });
  }
});

internalFivemRouter.get("/bodycam-settings/:discordId", async (req, res) => {
  const discordId = req.params.discordId;
  const user = await prisma.user.findUnique({
    where: { discordId },
    include: { personalBodycam: true },
  });
  if (!user || !user.personalBodycam) {
    return res.json({
      sleepingMode: false,
      autoTaserEnabled: true,
      autoFirearmEnabled: true,
      soundEnabled: true,
      forceFirstPersonEnabled: true,
      lowStorageModeEnabled: false,
    });
  }
  res.json(user.personalBodycam);
});

internalFivemRouter.patch("/bodycam-settings/:discordId", async (req, res) => {
  const discordId = req.params.discordId;
  const body = z
    .object({
      sleepingMode: z.boolean().optional(),
      autoTaserEnabled: z.boolean().optional(),
      autoFirearmEnabled: z.boolean().optional(),
      soundEnabled: z.boolean().optional(),
      forceFirstPersonEnabled: z.boolean().optional(),
      lowStorageModeEnabled: z.boolean().optional(),
    })
    .parse(req.body);

  let user = await prisma.user.findUnique({ where: { discordId } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        discordId,
        username: `discord_${discordId}`,
        globalRole: "officer",
        officerProfile: { create: {} },
        personalBodycam: { create: {} },
      },
    });
  }

  const updated = await prisma.personalBodycamSetting.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      ...body,
    },
    update: body,
  });
  res.json(updated);
});
